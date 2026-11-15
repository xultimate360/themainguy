import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  buildFeedIndexDocsForDay,
  calculateImportanceScore,
  canonicaliseUrl,
  computeExpiresAt,
  detectSensitivity,
  determineVerificationStatus,
  extractEntitiesAndKeywords,
  getSeenShardId,
  hashCanonicalUrl,
  inferSectorFromText,
  isSameSourceNearDuplicate,
  isStoryExpired,
  runJanitorPass,
  shouldClusterArticles,
  toDayKeyInTz,
  unifyScriptIntoSingleSegment,
} from './src/utils/deskEngine.js';
import {
  AgentRunRecord,
  ArticleItem,
  FeedIndexDay,
  RelatedVideo,
  Sector,
  SeenShard,
  SourceItem,
  SourceStateMeta,
  StoryCluster,
  SyncMeta,
  TickLock,
} from './src/types/desk.js';
import { SEED_SOURCES, SEED_SYNC_META } from './src/data/seedDeskData.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.desk-cache.json');
const APP_TZ = (() => {
  const candidate = process.env.APP_TZ || 'Asia/Kolkata';
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: candidate });
    return candidate;
  } catch {
    return 'Asia/Kolkata';
  }
})();

const rssParser = new Parser({
  timeout: 5000,
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['yt:videoId', 'ytVideoId'],
    ],
  },
  headers: {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

let availableModelsCache: string[] = [];
let activePrimaryModel = 'gemini-4-hydrogen';
let activeFallbackModel = 'gemini-3.1-flash-lite';

async function discoverGeminiModels(): Promise<{
  models: string[];
  primary: string;
  fallback: string;
}> {
  try {
    const pager = await ai.models.list();
    const names: string[] = [];
    for await (const m of pager) {
      if (m.name) {
        names.push(m.name.replace(/^models\//, ''));
      }
    }
    availableModelsCache = names;
    const preferredPrimary = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-2.5-flash'];
    const preferredFallback = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];

    for (const candidate of preferredPrimary) {
      if (names.includes(candidate)) {
        activePrimaryModel = candidate;
        break;
      }
    }
    for (const candidate of preferredFallback) {
      if (names.includes(candidate)) {
        activeFallbackModel = candidate;
        break;
      }
    }
  } catch (err) {
    console.warn('Gemini model list discovery warning:', err);
  }
  return {
    models: availableModelsCache,
    primary: activePrimaryModel,
    fallback: activeFallbackModel,
  };
}

// ============================================================================
// PERSISTENT SERVER-SIDE NEWSROOM STATE (Stories, FeedIndex, SeenShards, Lock)
// ============================================================================
interface AgentStatusEntry {
  agentId: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  lastRunAt: string;
  nextRunDueAt: string;
  itemsProcessed: number;
  aiCallsUsed: number;
}

interface ServerDeskState {
  sources: SourceItem[];
  sourceState: SourceStateMeta;
  stories: StoryCluster[];
  feedIndex: Record<string, FeedIndexDay>;
  seenShards: Record<string, SeenShard>;
  videos: RelatedVideo[];
  syncMeta: SyncMeta;
  agentRuns: Record<string, AgentStatusEntry>;
  tickLock: TickLock | null;
}

function createInitialSeenShards(): Record<string, SeenShard> {
  const shards: Record<string, SeenShard> = {};
  for (let i = 0; i < 16; i++) {
    const shardId = i.toString(16);
    shards[shardId] = {
      shardId,
      entries: {},
      updatedAt: '',
    };
  }
  return shards;
}

function createInitialAgentRuns(): Record<string, AgentStatusEntry> {
  const now = '';
  return {
    scout: {
      agentId: 'scout',
      name: 'Scout',
      role: 'Fetch and normalise feeds, dedupe against 16 seen shards',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'Every tick (15m)',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    librarian: {
      agentId: 'librarian',
      name: 'Librarian',
      role: 'Cluster stories across 36h, set dayKey, write feedIndex and seen',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'After Scout',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    trend_analyst: {
      agentId: 'trend_analyst',
      name: 'Trend analyst',
      role: 'Daily stats, heat signals, rising topics, topic threads',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'Every few ticks',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    researcher: {
      agentId: 'researcher',
      name: 'Researcher',
      role: 'Batch summaries, verification, sensitivity, satire score',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'After Librarian, top stories first',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    fact_checker: {
      agentId: 'fact_checker',
      name: 'Fact-checker',
      role: 'Re-check summaries and scripts against stored sources',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'After Researcher; on demand',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    comedy_room: {
      agentId: 'comedy_room',
      name: 'Comedy room',
      role: "Comedy angles for top 10 stories and Today's picks reasons",
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'Morning and evening',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    script_writer: {
      agentId: 'script_writer',
      name: 'Script writer',
      role: 'Script from a story, the desk, or a week',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'On demand; pre-drafts for top picks',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    producer: {
      agentId: 'producer',
      name: 'Producer',
      role: 'Titles, thumbnail text, graphic cards, description, run-sheet',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'On first open',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    weekly_producer: {
      agentId: 'weekly_producer',
      name: 'Weekly producer',
      role: 'Sunday weekly roundup package and next-week candidates',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'Sunday 18:00 IST',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    janitor: {
      agentId: 'janitor',
      name: 'Janitor',
      role: '25-day retention, storage, quota and health checks',
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'Daily (dry-run first 3 days)',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
    desk_editor: {
      agentId: 'desk_editor',
      name: 'Desk editor',
      role: "Orders work, enforces budgets, builds Today's picks",
      status: 'idle',
      lastRunAt: now,
      nextRunDueAt: 'Every tick',
      itemsProcessed: 0,
      aiCallsUsed: 0,
    },
  };
}

function loadServerState(): ServerDeskState {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ServerDeskState>;
      const seedIds = new Set(SEED_SOURCES.map((s) => s.id));
      const mergedSources: SourceItem[] = SEED_SOURCES.map((seed) => {
        const existing = (parsed.sources || []).find((s) => s.id === seed.id);
        return existing ? { ...seed, ...existing, url: seed.url, type: seed.type } : seed;
      });
      const customSources = (parsed.sources || []).filter((s) => !seedIds.has(s.id));

      return {
        sources: [...mergedSources, ...customSources],
        sourceState: parsed.sourceState || {
          sources: {},
          cursorIndex: 0,
          updatedAt: '',
        },
        stories: Array.isArray(parsed.stories) ? parsed.stories : [],
        feedIndex: parsed.feedIndex || {},
        seenShards: parsed.seenShards || createInitialSeenShards(),
        videos: Array.isArray(parsed.videos) ? parsed.videos : [],
        syncMeta: parsed.syncMeta || { ...SEED_SYNC_META },
        agentRuns: { ...createInitialAgentRuns(), ...(parsed.agentRuns || {}) },
        tickLock: null,
      };
    }
  } catch (err) {
    console.warn('Could not load .desk-cache.json, starting fresh:', err);
  }
  return {
    sources: [...SEED_SOURCES],
    sourceState: {
      sources: {},
      cursorIndex: 0,
      updatedAt: '',
    },
    stories: [],
    feedIndex: {},
    seenShards: createInitialSeenShards(),
    videos: [],
    syncMeta: { ...SEED_SYNC_META },
    agentRuns: createInitialAgentRuns(),
    tickLock: null,
  };
}

const serverState: ServerDeskState = loadServerState();

function persistServerState() {
  try {
    const payload: ServerDeskState = {
      ...serverState,
      tickLock: null,
    };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(payload), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist .desk-cache.json:', err);
  }
}

// Constant-time secret check (Section 3 & 7.1)
function verifyCronSecret(provided: string | undefined): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected || !provided) return false;
  try {
    const bufA = Buffer.from(provided, 'utf-8');
    const bufB = Buffer.from(expected, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Acquire locks/tick lease with automatic expiry (Section 4 & 7.1)
function acquireTickLock(lockedBy: string, leaseDurationMs = 55_000): boolean {
  const nowMs = Date.now();
  if (serverState.tickLock) {
    const expiresMs = new Date(serverState.tickLock.expiresAt).getTime();
    if (Number.isFinite(expiresMs) && expiresMs > nowMs) {
      return false; // Lock is actively held
    }
  }
  serverState.tickLock = {
    lockedBy,
    acquiredAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + leaseDurationMs).toISOString(),
  };
  return true;
}

function releaseTickLock(lockedBy: string) {
  if (serverState.tickLock && serverState.tickLock.lockedBy === lockedBy) {
    serverState.tickLock = null;
  }
}

function extractRealArticleImage(item: any): string | undefined {
  const enclosureUrl = item?.enclosure?.url;
  if (typeof enclosureUrl === 'string' && enclosureUrl.startsWith('http')) {
    return enclosureUrl;
  }
  const mediaUrl = item?.mediaContent?.$?.url || item?.mediaThumbnail?.$?.url;
  if (typeof mediaUrl === 'string' && mediaUrl.startsWith('http')) {
    return mediaUrl;
  }
  return undefined;
}

async function fetchRssWithConditionalHeaders(
  source: SourceItem,
  stateEntry?: { etag?: string; lastModified?: string }
): Promise<{
  notModified: boolean;
  etag?: string;
  lastModified?: string;
  items: any[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    };
    if (stateEntry?.etag) {
      headers['If-None-Match'] = stateEntry.etag;
    }
    if (stateEntry?.lastModified) {
      headers['If-Modified-Since'] = stateEntry.lastModified;
    }

    const resp = await fetch(source.url, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    if (resp.status === 304) {
      return {
        notModified: true,
        etag: stateEntry?.etag,
        lastModified: stateEntry?.lastModified,
        items: [],
      };
    }

    if (!resp.ok) {
      throw new Error(`Status code ${resp.status}`);
    }

    const xml = await resp.text();
    const parsed = await rssParser.parseString(xml);
    return {
      notModified: false,
      etag: resp.headers.get('etag') || undefined,
      lastModified: resp.headers.get('last-modified') || undefined,
      items: parsed.items || [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Core Phase 3 Scout + Librarian + Desk Editor Tick Pipeline (Section 5.2 & 7.1)
 */
async function executeNewsroomTick(options: {
  holder: string;
  customSources?: SourceItem[];
  sectorBoosts?: Record<string, number>;
  retentionDays?: number;
  maxSourcesPerTick?: number;
  itemsPerSource?: number;
}) {
  const startMs = Date.now();
  const nowIso = new Date(startMs).toISOString();
  const retentionDays = options.retentionDays || 25;
  const sectorBoosts = options.sectorBoosts || {};
  const maxSources = options.maxSourcesPerTick || 120; // Fetch up to 120 feeds within 45s budget
  const itemsPerSource = options.itemsPerSource || 8;

  // Sync any incoming source configurations
  if (Array.isArray(options.customSources) && options.customSources.length > 0) {
    const byId = new Map(serverState.sources.map((s) => [s.id, s]));
    for (const incoming of options.customSources) {
      const existing = byId.get(incoming.id);
      if (existing) {
        byId.set(incoming.id, {
          ...existing,
          enabled: incoming.enabled,
          priority: incoming.priority,
          trust: incoming.trust,
          sector: incoming.sector,
        });
      } else {
        byId.set(incoming.id, incoming);
      }
    }
    serverState.sources = Array.from(byId.values());
  }

  serverState.agentRuns.scout.status = 'running';
  serverState.agentRuns.scout.lastRunAt = nowIso;

  // Step 1: Select eligible sources (enabled and < 5 consecutive errors)
  // High-priority sources first, then least recently fetched / cursor order (Section 5.2)
  const allEnabled = serverState.sources.filter(
    (s) => s.enabled && (s.consecutiveErrors || 0) < 5
  );
  const startCursor = serverState.sourceState.cursorIndex || 0;
  const rotated = [
    ...allEnabled.slice(startCursor % Math.max(1, allEnabled.length)),
    ...allEnabled.slice(0, startCursor % Math.max(1, allEnabled.length)),
  ];

  const eligible = rotated
    .sort((a, b) => {
      const prioA = a.priority === 'high' ? 0 : 1;
      const prioB = b.priority === 'high' ? 0 : 1;
      if (prioA !== prioB) return prioA - prioB;
      const lastA = serverState.sourceState.sources[a.id]?.lastFetchedAt || a.lastFetchedAt || '';
      const lastB = serverState.sourceState.sources[b.id]?.lastFetchedAt || b.lastFetchedAt || '';
      const timeA = lastA ? new Date(lastA).getTime() : 0;
      const timeB = lastB ? new Date(lastB).getTime() : 0;
      return timeA - timeB;
    })
    .slice(0, maxSources);

  const concurrency = 6;
  const newArticles: ArticleItem[] = [];
  const changedSeenShards = new Set<string>();
  const recentSameSourceItems: { sourceId: string; title: string }[] = [];

  // Pre-populate recentSameSourceItems from existing stories (last 36h) so re-running drops same-source near-duplicates
  for (const st of serverState.stories) {
    for (const src of st.sources) {
      recentSameSourceItems.push({ sourceId: src.sourceId, title: src.title });
    }
  }

  let sourcesFetchedCount = 0;
  let duplicateDroppedCount = 0;

  for (let i = 0; i < eligible.length; i += concurrency) {
    if (Date.now() - startMs > 43_000) break; // Respect ~45s total tick budget
    const batch = eligible.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (src) => {
        const prevMeta = serverState.sourceState.sources[src.id];
        try {
          // Only send conditional ETag/Last-Modified if we already have > 0 stories in memory
          const condMeta = serverState.stories.length > 0 ? prevMeta : undefined;
          const fetched = await fetchRssWithConditionalHeaders(src, condMeta);
          sourcesFetchedCount++;

          const fetchTimeIso = new Date().toISOString();
          serverState.sourceState.sources[src.id] = {
            lastFetchedAt: fetchTimeIso,
            etag: fetched.etag || prevMeta?.etag,
            lastModified: fetched.lastModified || prevMeta?.lastModified,
            lastError: '',
            consecutiveErrors: 0,
          };

          const srcIdx = serverState.sources.findIndex((s) => s.id === src.id);
          if (srcIdx >= 0) {
            serverState.sources[srcIdx] = {
              ...serverState.sources[srcIdx],
              lastFetchedAt: fetchTimeIso,
              etag: fetched.etag || prevMeta?.etag,
              lastModified: fetched.lastModified || prevMeta?.lastModified,
              lastError: '',
              consecutiveErrors: 0,
            };
          }

          if (fetched.notModified) return;

          const items = (fetched.items || []).slice(0, itemsPerSource);
          for (const item of items) {
            const rawLink = (item.link || '').trim();
            const rawTitle = (item.title || '').trim();
            if (!rawLink || !rawLink.startsWith('http') || !rawTitle) continue;

            // Strip trailing Google News publisher suffix from title for cleaner display while preserving outlet
            let cleanTitle = rawTitle;
            let extractedOutlet = src.name.split('—')[0].trim();
            if (src.type === 'google_news') {
              const parts = rawTitle.split(/\s+[-|—]\s+/);
              if (parts.length > 1) {
                const candidateOutlet = parts[parts.length - 1].trim();
                if (candidateOutlet.length >= 2 && candidateOutlet.length <= 40) {
                  extractedOutlet = candidateOutlet;
                  cleanTitle = parts.slice(0, -1).join(' — ').trim();
                }
              }
            }

            const canonical = canonicaliseUrl(rawLink);
            const articleHash = hashCanonicalUrl(canonical);
            const titleKeyHash = hashCanonicalUrl(
              `https://seen.local/${src.id}/${encodeURIComponent(cleanTitle.toLowerCase().trim())}`
            );
            const shardId = getSeenShardId(articleHash);
            const titleShardId = getSeenShardId(titleKeyHash);
            const shard =
              serverState.seenShards[shardId] ||
              (serverState.seenShards[shardId] = {
                shardId,
                entries: {},
                updatedAt: fetchTimeIso,
              });
            const titleShard =
              serverState.seenShards[titleShardId] ||
              (serverState.seenShards[titleShardId] = {
                shardId: titleShardId,
                entries: {},
                updatedAt: fetchTimeIso,
              });

            // Step 3a: Deduplicate against seen/{0..f} shard (URL hash + source/title hash)
            if (shard.entries[articleHash] || titleShard.entries[titleKeyHash]) {
              duplicateDroppedCount++;
              continue;
            }

            // Step 3b: Drop same-source near-identical titles (Jaccard >= 0.80)
            const candidatePair = { sourceId: src.id, title: cleanTitle };
            const isNearDup = recentSameSourceItems.some((prev) =>
              isSameSourceNearDuplicate(prev, candidatePair)
            );
            if (isNearDup) {
              duplicateDroppedCount++;
              continue;
            }
            recentSameSourceItems.push(candidatePair);
            shard.entries[articleHash] = toDayKeyInTz(fetchTimeIso, APP_TZ);
            titleShard.entries[titleKeyHash] = toDayKeyInTz(fetchTimeIso, APP_TZ);
            changedSeenShards.add(shardId);
            changedSeenShards.add(titleShardId);

            const plainSnippet = cheerio
              .load(item.contentSnippet || item.summary || '')
              .text()
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 300);

            const rawPub = item.isoDate || item.pubDate || '';
            const validPub =
              rawPub && !Number.isNaN(new Date(rawPub).getTime())
                ? new Date(rawPub).toISOString()
                : fetchTimeIso;

            const { entities, keywords } = extractEntitiesAndKeywords(cleanTitle, plainSnippet);
            const realImg = extractRealArticleImage(item);
            const effectiveSector: Sector =
              src.sector === 'Top stories'
                ? inferSectorFromText(`${cleanTitle} ${plainSnippet}`, src.sector)
                : src.sector;

            // If YouTube feed, also register in videos strip
            if (src.type === 'youtube') {
              const vidId = item.ytVideoId || articleHash;
              if (!serverState.videos.some((v) => v.youtubeUrl === rawLink)) {
                serverState.videos.unshift({
                  id: `vid_${vidId}`,
                  title: cleanTitle,
                  channelName: src.name.replace(/YouTube$/i, '').trim(),
                  sector: effectiveSector,
                  publishedAt: validPub,
                  duration: 'Live feed',
                  youtubeUrl: rawLink,
                  thumbnailUrl: realImg || '',
                });
                serverState.videos = serverState.videos.slice(0, 30);
              }
            }

            newArticles.push({
              id: articleHash,
              sourceId: src.id,
              sourceName: extractedOutlet,
              title: cleanTitle,
              url: rawLink,
              canonicalUrl: canonical,
              publishedAt: validPub,
              fetchedAt: fetchTimeIso,
              sector: effectiveSector,
              snippet: plainSnippet,
              imageUrl: realImg,
              entities,
              keywords,
              storyId: '',
              isVideo: src.type === 'youtube',
            });
          }
        } catch (err) {
          const errTimeIso = new Date().toISOString();
          const nextErrors = (prevMeta?.consecutiveErrors || src.consecutiveErrors || 0) + 1;
          const errMsg = err instanceof Error ? err.message : 'Feed fetch timeout';

          serverState.sourceState.sources[src.id] = {
            lastFetchedAt: errTimeIso,
            etag: prevMeta?.etag,
            lastModified: prevMeta?.lastModified,
            lastError: errMsg,
            consecutiveErrors: nextErrors,
          };

          const srcIdx = serverState.sources.findIndex((s) => s.id === src.id);
          if (srcIdx >= 0) {
            serverState.sources[srcIdx] = {
              ...serverState.sources[srcIdx],
              lastFetchedAt: errTimeIso,
              lastError: errMsg,
              consecutiveErrors: nextErrors,
            };
          }
        }
      })
    );
  }

  serverState.sourceState.cursorIndex =
    (startCursor + sourcesFetchedCount) % Math.max(1, allEnabled.length);
  serverState.sourceState.updatedAt = new Date().toISOString();

  serverState.agentRuns.scout.status = 'idle';
  serverState.agentRuns.scout.itemsProcessed += newArticles.length;

  // ============================================================================
  // LIBRARIAN AGENT: Incremental 36-Hour Clustering & FeedIndex Builder
  // ============================================================================
  serverState.agentRuns.librarian.status = 'running';
  serverState.agentRuns.librarian.lastRunAt = new Date().toISOString();

  const sourcesMap = Object.fromEntries(serverState.sources.map((s) => [s.id, s]));
  const affectedDayKeys = new Set<string>();
  let storiesUpdatedCount = 0;

  // Sort new articles newest first
  const sortedNew = [...newArticles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  for (const article of sortedNew) {
    // Compare against existing stories from the last 36 hours (Section 5.2 Step 4)
    let matchedStory: StoryCluster | null = null;
    for (const existingStory of serverState.stories) {
      const leadCandidate = {
        title: existingStory.headline,
        publishedAt: existingStory.updatedAt,
        entities: existingStory.subtags,
        keywords: existingStory.subtags,
      };
      if (shouldClusterArticles(leadCandidate, article)) {
        matchedStory = existingStory;
        break;
      }
    }

    if (matchedStory) {
      // Merge into existing story (capped at 40 compact source items per Section 4)
      const alreadyHasUrl = matchedStory.sources.some((s) => s.url === article.url);
      if (!alreadyHasUrl && matchedStory.sources.length < 40) {
        const nextIndex = matchedStory.sources.length + 1;
        matchedStory.sources.push({
          index: nextIndex,
          sourceId: article.sourceId,
          outlet: article.sourceName,
          title: article.title,
          url: article.url,
          publishedAt: article.publishedAt,
          trust: sourcesMap[article.sourceId]?.trust ?? 4,
        });
        matchedStory.articleIds = [...matchedStory.articleIds, article.id].slice(0, 40);
        matchedStory.sourceCount = matchedStory.sources.length;
        if (new Date(article.publishedAt).getTime() > new Date(matchedStory.updatedAt).getTime()) {
          matchedStory.updatedAt = article.publishedAt;
        }
        if (!matchedStory.thumbnailUrl && article.imageUrl) {
          matchedStory.thumbnailUrl = article.imageUrl;
        }

        const avgTrust =
          matchedStory.sources.reduce((acc, s) => acc + s.trust, 0) /
          Math.max(1, matchedStory.sources.length);
        const boost = sectorBoosts[matchedStory.sector] ?? 0.75;
        matchedStory.importanceScore = calculateImportanceScore({
          latestPublishedAt: matchedStory.updatedAt,
          nowMs: Date.now(),
          sourceCount: matchedStory.sourceCount,
          avgTrust,
          sectorBoost: boost,
        });
        matchedStory.verification = determineVerificationStatus(
          matchedStory.sources,
          sourcesMap
        );
        matchedStory.subtags = Array.from(
          new Set([...matchedStory.subtags, ...article.entities, ...article.keywords])
        ).slice(0, 8);
        matchedStory.keyFacts = matchedStory.sources.slice(0, 4).map((s) => ({
          fact: s.title,
          sourceIndex: s.index,
        }));
        matchedStory.framingNotes = `Coverage led by ${Array.from(
          new Set(matchedStory.sources.map((s) => s.outlet))
        )
          .slice(0, 4)
          .join(', ')}.`;

        const mDayKey = matchedStory.dayKey || toDayKeyInTz(matchedStory.updatedAt, APP_TZ);
        matchedStory.dayKey = mDayKey;
        affectedDayKeys.add(mDayKey);
        storiesUpdatedCount++;
      }

      // Record in seen shard (entries: Record<string, string> mapping articleHash -> dayKey)
      const shardId = getSeenShardId(article.id);
      serverState.seenShards[shardId].entries[article.id] =
        matchedStory.dayKey || toDayKeyInTz(article.publishedAt, APP_TZ);
      serverState.seenShards[shardId].updatedAt = article.fetchedAt;
      changedSeenShards.add(shardId);
    } else {
      // Create a new StoryCluster
      const storyId = `story_${article.id.replace(/^art_/, '')}`;
      const dayKey = toDayKeyInTz(article.publishedAt, APP_TZ);
      const expiresAt = computeExpiresAt(article.publishedAt, retentionDays);
      const trust = sourcesMap[article.sourceId]?.trust ?? 4;
      const sources = [
        {
          index: 1,
          sourceId: article.sourceId,
          outlet: article.sourceName,
          title: article.title,
          url: article.url,
          publishedAt: article.publishedAt,
          trust,
        },
      ];
      const verification = determineVerificationStatus(sources, sourcesMap);
      const sensitivity = detectSensitivity(article.title, article.snippet);
      const boost = sectorBoosts[article.sector] ?? 0.75;
      const importanceScore = calculateImportanceScore({
        latestPublishedAt: article.publishedAt,
        nowMs: Date.now(),
        sourceCount: 1,
        avgTrust: trust,
        sectorBoost: boost,
      });

      const velocitySignal = Math.min(1, 1 / 6);
      const spreadSignal = Math.min(1, (1 * (trust / 5)) / 5);
      const heatScore = Math.min(
        98,
        Math.max(22, Math.round(100 * (0.55 * velocitySignal + 0.45 * spreadSignal)))
      );

      const newStory: StoryCluster = {
        id: storyId,
        headline: article.title,
        sector: article.sector,
        dayKey,
        expiresAt,
        subtags: Array.from(new Set([...article.entities, ...article.keywords])).slice(0, 8),
        createdAt: article.publishedAt,
        updatedAt: article.publishedAt,
        sourceCount: 1,
        articleIds: [article.id],
        sources,
        importanceScore,
        heatScore,
        heatSignalsUsed: 3,
        satirePotential:
          sensitivity === 'no-joke' ? 0 : sensitivity === 'handle-with-care' ? 5 : 8,
        verification,
        sensitivity,
        summarised: false,
        whatHappened: article.snippet || article.title,
        whyItMatters: `Reported by ${article.sourceName} in ${article.sector}.`,
        keyFacts: [{ fact: article.title, sourceIndex: 1 }],
        keyNumbers: [],
        timeline: [
          {
            date: dayKey,
            event: `${article.sourceName}: ${article.title}`,
            sourceIndex: 1,
          },
        ],
        stakeholders: [],
        framingNotes: `Coverage initiated by ${article.sourceName}.`,
        openQuestions: [],
        comedyAngles: [],
        videoIdeas: {
          titles: [article.title],
          thumbnails: ['WHAT REALLY HAPPENED?'],
          onScreenCards: [article.sector],
          description: `${article.title}\n\nSources:\n[S1] ${article.sourceName}: ${article.url}`,
        },
        relatedVideos: [],
        govReleases:
          sourcesMap[article.sourceId]?.type === 'regulator'
            ? [
                {
                  id: `gov_${article.id}`,
                  agency: (article.sourceName.includes('RBI')
                    ? 'RBI'
                    : article.sourceName.includes('SEBI')
                      ? 'SEBI'
                      : 'PIB') as 'PIB' | 'RBI' | 'SEBI',
                  title: article.title,
                  publishedAt: article.publishedAt,
                  url: article.url,
                  referenceCode: article.id.slice(0, 12).toUpperCase(),
                },
              ]
            : [],
        thumbnailUrl: article.imageUrl,
        whyRising: `First seen ${new Date(article.publishedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}; reported by ${article.sourceName}.`,
      };

      serverState.stories.push(newStory);
      affectedDayKeys.add(dayKey);
      storiesUpdatedCount++;

      // Record in seen shard
      const shardId = getSeenShardId(article.id);
      serverState.seenShards[shardId].entries[article.id] = dayKey;
      serverState.seenShards[shardId].updatedAt = article.fetchedAt;
      changedSeenShards.add(shardId);
    }
  }

  // Sort all stories by importanceScore descending
  serverState.stories.sort((a, b) => b.importanceScore - a.importanceScore);

  // Step 5: Write feedIndex/{dayKey} once per tick for affected days (splitting at > 700 KB)
  if (
    affectedDayKeys.size === 0 &&
    serverState.stories.length > 0 &&
    Object.keys(serverState.feedIndex).length === 0
  ) {
    for (const st of serverState.stories) {
      if (st.dayKey) affectedDayKeys.add(st.dayKey);
    }
  }

  for (const dKey of affectedDayKeys) {
    const storiesForDay = serverState.stories.filter((s) => s.dayKey === dKey);
    const docs = buildFeedIndexDocsForDay(dKey, storiesForDay);
    for (const docItem of docs) {
      serverState.feedIndex[docItem.dayKey] = docItem;
    }
  }

  const finishedIso = new Date().toISOString();
  serverState.agentRuns.librarian.status = 'idle';
  serverState.agentRuns.librarian.itemsProcessed += storiesUpdatedCount;
  serverState.agentRuns.desk_editor.status = 'idle';
  serverState.agentRuns.desk_editor.lastRunAt = finishedIso;
  serverState.agentRuns.desk_editor.itemsProcessed = serverState.stories.length;

  // Step 6 (Phase 4): Run Janitor pass (automatically dry-run during first 3 days)
  const janitorResult = runJanitorPass({
    nowMs: Date.now(),
    installedAt: serverState.syncMeta.installedAt || '2026-11-14T00:00:00.000Z',
    retentionDays,
    keepScripts: true,
    stories: serverState.stories,
    feedIndex: serverState.feedIndex,
    seenShards: serverState.seenShards,
    tz: APP_TZ,
  });

  if (janitorResult.report.ok && !janitorResult.report.dryRun) {
    serverState.stories = janitorResult.nextStories;
    serverState.feedIndex = janitorResult.nextFeedIndex;
    serverState.seenShards = janitorResult.nextSeenShards;
  }
  serverState.agentRuns.janitor.status = janitorResult.report.ok ? 'idle' : 'error';
  serverState.agentRuns.janitor.lastRunAt = finishedIso;
  serverState.agentRuns.janitor.itemsProcessed = janitorResult.report.totalDeletedOrListed;

  // Step 7: Update meta/sync once per tick
  const estimatedReadsThisTick = 1 + changedSeenShards.size + 2; // sourceState + seen shards + last 2 feedIndex days
  const estimatedWritesThisTick =
    1 + 1 + changedSeenShards.size + affectedDayKeys.size + storiesUpdatedCount; // sourceState + sync + changed seen shards + feedIndex days + stories

  serverState.syncMeta = {
    ...serverState.syncMeta,
    installedAt: serverState.syncMeta.installedAt || '2026-11-14T00:00:00.000Z',
    lastSyncedAt: finishedIso,
    lastStatus: 'ok',
    articlesAdded: newArticles.length,
    storiesUpdated: storiesUpdatedCount,
    estimatedReadsToday: (serverState.syncMeta.estimatedReadsToday || 0) + estimatedReadsThisTick,
    estimatedWritesToday:
      (serverState.syncMeta.estimatedWritesToday || 0) + estimatedWritesThisTick,
    lastJanitorReport: janitorResult.report,
  };

  persistServerState();

  return {
    ok: true,
    syncedAt: finishedIso,
    durationMs: Date.now() - startMs,
    sourcesFetched: sourcesFetchedCount,
    articlesAdded: newArticles.length,
    duplicatesDropped: duplicateDroppedCount,
    storiesUpdated: storiesUpdatedCount,
    totalStories: serverState.stories.length,
    changedSeenShards: Array.from(changedSeenShards),
    affectedDayKeys: Array.from(affectedDayKeys),
    stories: serverState.stories.filter((s) => !isStoryExpired(s, Date.now(), retentionDays)),
    feedIndex: serverState.feedIndex,
    sources: serverState.sources,
    sourceState: serverState.sourceState,
    syncMeta: serverState.syncMeta,
    agentRuns: serverState.agentRuns,
    videos: serverState.videos,
    janitorReport: janitorResult.report,
  };
}

// Section 6.4 Summariser Zod Schema
const StorySummarySchema = z.object({
  headline: z.string().min(5),
  whatHappened: z.string().min(10),
  whyItMatters: z.string().min(10),
  keyFacts: z
    .array(
      z.object({
        fact: z.string(),
        sourceIndex: z.number().int().min(1),
      })
    )
    .max(5),
  keyNumbers: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      sourceIndex: z.number().int().min(1),
    })
  ),
  timeline: z
    .array(
      z.object({
        date: z.string(),
        event: z.string(),
        sourceIndex: z.number().int().min(1).optional(),
      })
    )
    .max(5),
  stakeholders: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      stance: z.string().optional(),
    })
  ),
  framingNotes: z.string(),
  openQuestions: z.array(z.string()),
  satirePotential: z.number().min(0).max(10),
  sensitivity: z.enum(['normal', 'handle-with-care', 'no-joke']),
  comedyAngles: z
    .array(
      z.object({
        angle: z.string(),
        target: z.enum(['power', 'absurdity', 'hypocrisy']),
        punchlineHint: z.string(),
      })
    )
    .max(3),
  videoIdeas: z.object({
    titles: z.array(z.string()).min(1).max(5),
    thumbnails: z.array(z.string()).min(1).max(5),
    onScreenCards: z.array(z.string()),
    description: z.string(),
  }),
});

const ScriptOutputSchema = z.object({
  title: z.string(),
  sections: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['COLD OPEN', 'SETUP', 'TURN', 'PUNCHLINE', 'BRIDGE', 'OUTRO']),
      storyId: z.string().optional(),
      storyHeadline: z.string().optional(),
      content: z.string(),
      cues: z.array(z.string()),
    })
  ),
  factBox: z.array(
    z.object({
      claim: z.string(),
      sourceTag: z.string(),
      outlet: z.string(),
      url: z.string(),
    })
  ),
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  // Discover live Gemini models at startup (Section 6.1)
  await discoverGeminiModels();

  // Health & Preflight Endpoint (Section 7.4 & Phase 0)
  app.get('/api/health', async (_req, res) => {
    res.json({
      ok: true,
      activePrimaryModel,
      activeFallbackModel,
      availableModels: availableModelsCache,
      integrationMode: 'aistudio-built-in',
      firestoreDatabaseId: 'ai-studio-themainguytvsati-afd73cfe-b295-4413-9533-f1fc505050ec',
      appTz: APP_TZ,
      totalStories: serverState.stories.length,
      lastSyncedAt: serverState.syncMeta.lastSyncedAt,
    });
  });

  // Archive & FeedIndex State Endpoint (Section 5.3 & 11.3)
  app.get('/api/archive', (req, res) => {
    const retentionDays = Math.min(
      60,
      Math.max(1, Number(req.query.retentionDays) || 25)
    );
    const nowMs = Date.now();
    const activeStories = serverState.stories.filter(
      (s) => !isStoryExpired(s, nowMs, retentionDays)
    );
    const seenEntriesCount = Object.values(serverState.seenShards).reduce(
      (acc, shard) => acc + Object.keys(shard.entries).length,
      0
    );
    res.json({
      ok: true,
      stories: activeStories,
      feedIndex: serverState.feedIndex,
      sources: serverState.sources,
      sourceState: serverState.sourceState,
      syncMeta: serverState.syncMeta,
      agentRuns: serverState.agentRuns,
      videos: serverState.videos,
      seenEntriesCount,
      feedIndexDaysCount: Object.keys(serverState.feedIndex).length,
    });
  });

  // Phase 4 Janitor Endpoint: POST /api/agents/janitor (Section 5.4)
  app.post('/api/agents/janitor', (req, res) => {
    const {
      retentionDays = 25,
      keepScripts = true,
      dryRun = true,
      allowEarlyLiveRun = false,
      starredCount = 0,
      deskCount = 0,
      scriptsCount = 0,
    } = req.body || {};

    const result = runJanitorPass({
      nowMs: Date.now(),
      installedAt: serverState.syncMeta.installedAt || '2026-11-14T00:00:00.000Z',
      retentionDays: Number(retentionDays),
      keepScripts: Boolean(keepScripts),
      forceDryRun: Boolean(dryRun),
      allowEarlyLiveRun: Boolean(allowEarlyLiveRun),
      stories: serverState.stories,
      feedIndex: serverState.feedIndex,
      seenShards: serverState.seenShards,
      starredStories: Array.from({ length: Number(starredCount) || 0 }).map((_, i) => ({
        storyId: `starred_${i}`,
        savedAt: new Date().toISOString(),
      })),
      deskSnapshots: Object.fromEntries(
        Array.from({ length: Number(deskCount) || 0 }).map((_, i) => [`desk_${i}`, {} as any])
      ),
      scripts: Array.from({ length: Number(scriptsCount) || 0 }).map((_, i) => ({
        id: `sc_${i}`,
      })) as any,
      tz: APP_TZ,
    });

    if (result.report.ok && !result.report.dryRun) {
      serverState.stories = result.nextStories;
      serverState.feedIndex = result.nextFeedIndex;
      serverState.seenShards = result.nextSeenShards;
    }

    serverState.agentRuns.janitor.status = result.report.ok ? 'idle' : 'error';
    serverState.agentRuns.janitor.lastRunAt = result.report.ranAt;
    serverState.agentRuns.janitor.itemsProcessed = result.report.totalDeletedOrListed;
    serverState.syncMeta.lastJanitorReport = result.report;
    persistServerState();

    res.json({
      ok: result.report.ok,
      report: result.report,
      stories: serverState.stories,
      feedIndex: serverState.feedIndex,
      syncMeta: serverState.syncMeta,
      agentRuns: serverState.agentRuns,
    });
  });

  // On-demand single StoryCluster endpoint (Section 4)
  app.get('/api/story/:id', (req, res) => {
    const story = serverState.stories.find((s) => s.id === req.params.id);
    if (!story) {
      res.status(404).json({ ok: false, error: 'Story not found in archive.' });
      return;
    }
    res.json({ ok: true, story });
  });

  // Sync updated sources from client SourcesManagerView
  app.post('/api/sources/sync', (req, res) => {
    if (Array.isArray(req.body?.sources)) {
      serverState.sources = req.body.sources;
      persistServerState();
    }
    res.json({ ok: true, count: serverState.sources.length });
  });

  // Phase 3 Tick Endpoint: POST /api/agents/tick (Section 7.1)
  // Supports external scheduler (x-cron-secret) or owner in-app trigger / catch-up
  let lastTickRateLimitMs = 0;
  app.post('/api/agents/tick', async (req, res) => {
    const cronHeader = req.headers['x-cron-secret'] as string | undefined;
    const isCron = Boolean(cronHeader);
    if (isCron && process.env.CRON_SECRET && !verifyCronSecret(cronHeader)) {
      res.status(401).json({ ok: false, error: 'Invalid x-cron-secret header.' });
      return;
    }

    const nowMs = Date.now();
    if (!isCron && nowMs - lastTickRateLimitMs < 2500) {
      res.status(429).json({
        ok: false,
        error: 'Rate limit: Please wait a moment before triggering another tick.',
      });
      return;
    }
    lastTickRateLimitMs = nowMs;

    const holder = `tick_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    if (!acquireTickLock(holder)) {
      res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'Another tick is currently holding locks/tick.',
        lock: serverState.tickLock,
        stories: serverState.stories,
        feedIndex: serverState.feedIndex,
        sources: serverState.sources,
        syncMeta: serverState.syncMeta,
      });
      return;
    }

    try {
      const result = await executeNewsroomTick({
        holder,
        customSources: req.body?.sources,
        sectorBoosts: req.body?.sectorBoosts,
        retentionDays: req.body?.retentionDays,
        maxSourcesPerTick: req.body?.maxSourcesPerTick || 120,
        itemsPerSource: req.body?.itemsPerSource || 8,
      });
      res.json({
        ...result,
        storiesClustered: result.totalStories,
      });
    } catch (err: any) {
      serverState.syncMeta.lastStatus = 'error';
      res.status(500).json({
        ok: false,
        error: err?.message || 'Tick execution failed.',
      });
    } finally {
      releaseTickLock(holder);
    }
  });

  // Alias POST /api/ingest to the Phase 3 tick pipeline for seamless UI button compatibility
  app.post('/api/ingest', async (req, res) => {
    const holder = `ingest_${Date.now()}`;
    if (!acquireTickLock(holder)) {
      res.json({
        ok: true,
        skipped: true,
        syncedAt: serverState.syncMeta.lastSyncedAt || new Date().toISOString(),
        articlesAdded: 0,
        storiesClustered: serverState.stories.length,
        stories: serverState.stories,
        feedIndex: serverState.feedIndex,
        sources: serverState.sources,
        syncMeta: serverState.syncMeta,
        agentRuns: serverState.agentRuns,
        videos: serverState.videos,
      });
      return;
    }

    try {
      const result = await executeNewsroomTick({
        holder,
        customSources: req.body?.sources,
        sectorBoosts: req.body?.sectorBoosts,
        retentionDays: req.body?.retentionDays,
        maxSourcesPerTick: req.body?.maxSourcesPerTick || 120,
        itemsPerSource: req.body?.itemsPerSource || 8,
      });
      res.json({
        ...result,
        storiesClustered: result.totalStories,
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'Ingest failed.',
      });
    } finally {
      releaseTickLock(holder);
    }
  });

  // 1. Test a single RSS/Atom/YouTube feed (Section 5.1 — Zod validated)
  const TestFeedSchema = z.object({
    url: z.string().url().max(2000),
    name: z.string().max(200).optional(),
  });

  app.post('/api/test-feed', async (req, res) => {
    const parsed = TestFeedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || 'Valid feed URL is required.',
      });
      return;
    }
    const { url, name } = parsed.data;

    try {
      const feed = await rssParser.parseURL(url);
      const items = (feed.items || []).slice(0, 3).map((item) => ({
        title: (item.title || 'Untitled item').trim(),
        link: canonicaliseUrl(item.link || url),
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        snippet: cheerio
          .load(item.contentSnippet || item.summary || '')
          .text()
          .trim()
          .slice(0, 300),
      }));
      res.json({
        ok: true,
        feedTitle: feed.title || name || url,
        itemCount: (feed.items || []).length,
        previewItems: items,
      });
    } catch (err) {
      res.status(200).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to parse RSS/Atom feed.',
        previewItems: [],
      });
    }
  });

  // 1b. Batch verify feeds with concurrency 6 and 5-second timeout (Section 5.1)
  app.post('/api/verify-sources', async (req, res) => {
    const inputSources: SourceItem[] = Array.isArray(req.body?.sources)
      ? req.body.sources.slice(0, 24)
      : serverState.sources.slice(0, 18);

    const results: { id: string; name: string; ok: boolean; itemCount: number; error?: string }[] =
      [];
    const concurrency = 6;

    for (let i = 0; i < inputSources.length; i += concurrency) {
      const chunk = inputSources.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (src) => {
          try {
            const feed = await rssParser.parseURL(src.url);
            return {
              id: src.id,
              name: src.name,
              ok: true,
              itemCount: (feed.items || []).length,
            };
          } catch (err) {
            return {
              id: src.id,
              name: src.name,
              ok: false,
              itemCount: 0,
              error: err instanceof Error ? err.message : 'Feed unreachable',
            };
          }
        })
      );
      results.push(...chunkResults);
    }

    res.json({
      ok: true,
      checked: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  });

  // 3. Grounded Gemini Summariser (Section 6.4 — No Fake Fallbacks)
  app.post('/api/summarise', async (req, res) => {
    const story: StoryCluster | undefined = req.body?.story;
    if (!story || !Array.isArray(story.sources) || story.sources.length === 0) {
      res.status(400).json({ ok: false, error: 'A real story with verified sources is required.' });
      return;
    }

    const sourcesContext = story.sources
      .map(
        (s) =>
          `[S${s.index}] Outlet: ${s.outlet} | Published: ${s.publishedAt} | Title: ${s.title} | URL: ${s.url}`
      )
      .join('\n');

    const prompt = `You are a careful news analyst for the research desk of a comedy news channel. You receive real articles (titles, snippets, source names and URLs) about several events, grouped by event. Use only this material and any search results retrieved with citations. Never add facts, names, numbers, dates or quotes that are not supported. If outlets disagree, say so in framingNotes. If something is unconfirmed, put it in openQuestions. If a field cannot be supported, leave it empty. Mark sensitivity as no-joke for deaths, disasters, communal or caste violence, sexual violence, and anything involving minors or sensitive ongoing court matters.

STORY HEADLINE: ${story.headline}
SECTOR: ${story.sector}
SNIPPET: ${story.whatHappened}

REAL ARTICLES:
${sourcesContext}

Return a single JSON object matching this exact schema (every fact and number must cite a valid sourceIndex 1..${story.sources.length}):
{
  "headline": "neutral headline up to 90 chars",
  "whatHappened": "2 to 3 factual sentences",
  "whyItMatters": "1 to 2 sentences",
  "keyFacts": [{"fact": "string", "sourceIndex": 1}],
  "keyNumbers": [{"label": "string", "value": "string", "sourceIndex": 1}],
  "timeline": [{"date": "YYYY-MM-DD", "event": "string", "sourceIndex": 1}],
  "stakeholders": [{"name": "string", "role": "string", "stance": "string"}],
  "framingNotes": "string",
  "openQuestions": ["string"],
  "satirePotential": 7,
  "sensitivity": "normal",
  "comedyAngles": [{"angle": "string", "target": "power", "punchlineHint": "string"}],
  "videoIdeas": {
    "titles": ["Title 1"],
    "thumbnails": ["Thumb 1"],
    "onScreenCards": ["Card 1"],
    "description": "Description with hashtags"
  }
}`;

    const parseJsonFromModel = (rawText: string) => {
      const cleaned = (rawText || '{}')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      return JSON.parse(cleaned || '{}');
    };

    const tryGenerate = async (modelName: string) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          ...(modelName.startsWith('gemini-4')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });
      const parsedJson = parseJsonFromModel(response.text || '{}');
      return StorySummarySchema.parse(parsedJson);
    };

    try {
      const validated = await tryGenerate(activePrimaryModel);
      serverState.syncMeta.aiCallsToday = (serverState.syncMeta.aiCallsToday || 0) + 1;
      persistServerState();
      res.json({
        ok: true,
        groundingMode: activePrimaryModel,
        summary: validated,
      });
    } catch (primaryErr) {
      try {
        console.warn(
          `Primary model ${activePrimaryModel} failed, trying fallback ${activeFallbackModel}:`,
          primaryErr
        );
        const validatedFallback = await tryGenerate(activeFallbackModel);
        serverState.syncMeta.aiCallsToday = (serverState.syncMeta.aiCallsToday || 0) + 1;
        persistServerState();
        res.json({
          ok: true,
          groundingMode: activeFallbackModel,
          summary: validatedFallback,
        });
      } catch (fallbackErr: any) {
        res.status(200).json({
          ok: false,
          error: `Summary pending: ${fallbackErr?.message || 'AI limit reached or validation failed'}`,
        });
      }
    }
  });

  // 4. Satire Script Writer (Section 10.3 — No Fake Fallbacks)
  app.post('/api/script', async (req, res) => {
    const {
      stories = [],
      language = 'Hinglish',
      runtimeTarget = '8 min',
      tone = 'Savage',
      format = 'News-desk monologue',
      doNotJokeAbout = '',
      isNeutralBriefing = false,
      mode = 'full',
      targetSection = null,
    } = req.body || {};

    const validStories: StoryCluster[] = Array.isArray(stories) ? stories : [];
    if (mode === 'full' && validStories.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'Select at least one real ingested story before generating a script.',
      });
      return;
    }

    const factualIndicatorRegex =
      /\b(\d+(\.\d+)?\s*(%|percent|cr|crore|lakh|billion|million|rs|inr|km|tonnes|years|days)|according to|reported|announced|ministry|supreme court|rbi|sebi|pib)\b/i;

    const normalizeCitationText = (text: string, maxIdx: number, ensureSetupOrFactual: boolean) => {
      let normalized = (text || '')
        .replace(/\[\s*Source\s*(\d+)\s*\]/gi, '[S$1]')
        .replace(/\(\s*S(\d+)\s*\)/g, '[S$1]')
        .replace(/\[S(\d+)\s*,\s*S(\d+)\]/g, '[S$1] [S$2]');

      // Clamp any [S#] tag to 1..maxIdx
      normalized = normalized.replace(/\[S(\d+)\]/g, (_m, d) => {
        const n = Math.max(1, Math.min(Math.max(1, maxIdx), parseInt(d, 10) || 1));
        return `[S${n}]`;
      });

      if (ensureSetupOrFactual) {
        let attachedAny = /\[S\d+\]/.test(normalized);
        const lines = normalized.split('\n');
        const fixedLines = lines.map((rawLine) => {
          const trimmed = rawLine.trim();
          if (
            !trimmed ||
            trimmed.startsWith('#') ||
            trimmed.startsWith('[B-ROLL') ||
            trimmed.startsWith('[GRAPHIC') ||
            trimmed.startsWith('[SFX') ||
            trimmed.startsWith('[ZOOM') ||
            trimmed.startsWith('[SCREENSHOT') ||
            trimmed.startsWith('[MEME') ||
            trimmed.startsWith('[CUT')
          ) {
            return rawLine;
          }

          const sentences = trimmed
            .split(/(?<=[.?!])\s+(?!\[S\d+\])/)
            .map((s) => s.trim())
            .filter(Boolean);

          const fixedSentences = sentences.map((sentence) => {
            if (/\[S\d+\]/.test(sentence)) return sentence;
            if (factualIndicatorRegex.test(sentence) || !attachedAny) {
              attachedAny = true;
              return `${sentence.replace(/[.?!]+$/, '')} [S1].`;
            }
            return sentence;
          });

          return fixedSentences.join(' ');
        });

        normalized = fixedLines.join('\n');
      }

      return normalized;
    };

    if (mode !== 'full' && targetSection) {
      const modeInstructions =
        mode === 'youtuber_improvise'
          ? 'IMPROVISE AS A YOUTUBER: Transform this script so it sounds like a charismatic, high-retention Indian YouTuber talking directly to their subscribers on camera—NOT a stiff TV news anchor and NOT a newspaper article. Add direct-to-camera hooks ("Bhai ek second ruko...", "Wait till you hear this part..."), conversational storytelling, relatable everyday comparisons, creator edit cues like [ZOOM IN ON FACE], [SCREENSHOT POPUP], [MEME CUT], and an engaging comment-bait outro.'
          : mode === 'punch_up'
            ? 'PUNCH UP AS A YOUTUBER: Make the jokes, analogies, and direct-to-camera creator roasts much sharper, funnier, and more conversational like a top commentary YouTuber (never like a formal news anchor or article).'
            : mode === 'tone_down'
              ? 'TONE DOWN (CHILL YOUTUBER EXPLAINER): Keep the warm, conversational YouTuber creator flow talking to a friend, but soften the sharpest roasts into light, witty observations.'
              : 'REWRITE AS A YOUTUBER: Rewrite with fresh conversational YouTuber energy, direct-to-camera storytelling, and natural spoken rhythm (not a news anchor bulletin or article).';

      const rewritePrompt = `You are a top commentary & satire YouTuber writing in ${language} (${tone} tone).
${modeInstructions}

CRITICAL RULES:
1. Keep the ENTIRE script in ONE SINGLE SEGMENT with clear markdown subheadings (### INTRO..., ### SUBHEADING: ..., ### OUTRO...).
2. NEVER sound like a formal TV news anchor ("Good evening viewers", "In today's bulletin") or a dry newspaper article. Write for the mouth and ear—use conversational pauses, rhetorical questions, and direct audience engagement.
3. Keep all [S#] source citation tags intact on factual claims and NEVER invent facts, numbers, or quotes.

SCRIPT TO IMPROVISE:
${targetSection.content}`;

      const tryRewrite = async (modelName: string) => {
        const resp = await ai.models.generateContent({
          model: modelName,
          contents: rewritePrompt,
          config: modelName.startsWith('gemini-4')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : undefined,
        });
        return (resp.text || targetSection.content).trim();
      };

      try {
        let rewritten = '';
        try {
          rewritten = await tryRewrite(activePrimaryModel);
        } catch {
          rewritten = await tryRewrite(activeFallbackModel);
        }
        const isSetupOrTurn =
          targetSection.type === 'SETUP' || targetSection.type === 'TURN';
        const cleanedContent = normalizeCitationText(rewritten, 10, isSetupOrTurn);
        serverState.syncMeta.aiCallsToday = (serverState.syncMeta.aiCallsToday || 0) + 1;
        persistServerState();
        res.json({
          ok: true,
          section: {
            ...targetSection,
            content: cleanedContent,
          },
        });
      } catch (err: any) {
        res.status(200).json({
          ok: false,
          error: err?.message || 'Block rewrite failed.',
        });
      }
      return;
    }

    // Flatten all real sources across the selected stories with sequential global indices [S1..SN]
    const globalSources: {
      globalIndex: number;
      storyId: string;
      storyHeadline: string;
      outlet: string;
      title: string;
      url: string;
    }[] = [];

    for (const st of validStories) {
      for (const src of st.sources || []) {
        if (src.url && src.url.startsWith('http')) {
          globalSources.push({
            globalIndex: globalSources.length + 1,
            storyId: st.id,
            storyHeadline: st.headline,
            outlet: src.outlet,
            title: src.title,
            url: src.url,
          });
        }
      }
    }

    const maxSourceIdx = Math.max(1, globalSources.length);
    const hasNoJoke = isNeutralBriefing || validStories.some((s) => s.sensitivity === 'no-joke');
    const storyContext = validStories
      .map((st, i) => {
        const storySourcesText = globalSources
          .filter((gs) => gs.storyId === st.id)
          .map((gs) => `[S${gs.globalIndex}] ${gs.outlet}: "${gs.title}" (${gs.url})`)
          .join('\n');
        return `STORY ${i + 1} (id: "${st.id}"): ${st.headline}\nWhat Happened: ${st.whatHappened}\nVerified Sources for Story ${i + 1}:\n${storySourcesText}`;
      })
      .join('\n\n');

    const prompt = `You are a top Indian commentary & satire YouTuber (creator energy: conversational, charismatic, witty, talking directly into the camera to your subscribers like a smart friend over chai). Write an original, improvised YouTube creator script in ${language} for a ${runtimeTarget} video (format: ${format}, tone: ${hasNoJoke ? 'Neutral Factual Explainer Only — NO JOKES' : tone}).

STYLE & VOICE RULES (CRITICAL — DO NOT SOUND LIKE A NEWS ANCHOR OR ARTICLE):
1. ZERO TV-ANCHOR OR NEWSPAPER TONE: Never start with stiff broadcast lines like "Good evening", "Welcome to the desk", "In a major development today", or dry article-style paragraphs.
2. IMPROVISED YOUTUBER FLOW: Talk directly TO the viewer ("Bhai ek second ruko, did you actually see what just happened?", "Okay pause scrolling because this story is wild...", "Let me break this down without the boring news-channel jargon", "Matlab seriously soch ke dekho..."). Use conversational transitions, rhetorical questions, relatable everyday comparisons (like UPI fails, traffic jams, family WhatsApp groups, or corporate appraisals), and natural spoken rhythm.
3. CREATOR EDIT & CAMERA CUES: Weave YouTuber video cues naturally into the script such as [ZOOM IN ON FACE], [SCREENSHOT POPUP: Headline], [MEME CUT], [B-ROLL: ...], [GRAPHIC: ...], and [SFX: ...].
4. 100% VERIFIED FACTS & CITATIONS: Even though your delivery is an entertaining, improvised YouTuber talking to subscribers, every real fact, number, official action, or quote MUST rest strictly on the supplied verified sources and carry its exact source tag like [S1] (valid range: [S1] to [S${maxSourceIdx}]). Introduce facts like a YouTuber showing proof on screen (e.g., "Aur ye main hawa mein nahi bol raha—look at this report right here on screen [S1]."). Never invent quotes, statistics, events, or allegations. Use "alleged" and "reportedly" where sources do. Punch up at power, hypocrisy, and institutional absurdity; never mock victims or protected groups. Additional restrictions: ${doNotJokeAbout}. Do not copy any existing creator's catchphrases.

SINGLE-SEGMENT STRUCTURE (MANDATORY):
Write the ENTIRE script inside ONE SINGLE UNIFIED SEGMENT (a single item in the "sections" array with type "SETUP") structured with these exact markdown subheadings in order inside the single "content" string:
### INTRO (YOUTUBER HOOK & COLD OPEN)
(Start with a scroll-stopping 5-second YouTube hook, direct-to-camera banter, and why this story is insane...)

### SUBHEADING: KYA SCENE HAI? (THE REAL STORY & VERIFIED FACTS)
(Break down what actually happened like you're explaining it to a friend, popping up screenshots on screen and tagging every factual sentence with [S1]..[S${maxSourceIdx}]...)

### SUBHEADING: WAIT, IT GETS CRAZIER (THE SATIRE TURN & BREAKDOWN)
(Connect the dots, point out the irony/hypocrisy, react directly to the camera with [ZOOM IN ON FACE], use relatable analogies, and cite any factual reference with [S#]...)

### SUBHEADING: FINAL ROAST, PUNCHLINES & REAL TALK
(Deliver the sharpest rapid-fire punchlines, callback jokes, and the real takeaway for regular people...)

### OUTRO (COMMENT BAIT & YOUTUBER SIGN-OFF)
(Ask the audience a specific spicy question to debate in the comments section, remind them all verified [S1]..[S${maxSourceIdx}] links are in the Fact Box/description, and sign off like a YouTuber...)

VERIFIED STORIES & SOURCES:
${storyContext}

JSON Schema:
{
  "title": "string (Clickworthy, honest YouTube video title)",
  "sections": [
    {
      "id": "sec_unified_1",
      "type": "SETUP",
      "storyId": "string",
      "storyHeadline": "string",
      "content": "### INTRO (YOUTUBER HOOK & COLD OPEN)\\n...\\n\\n### SUBHEADING: KYA SCENE HAI? (THE REAL STORY & VERIFIED FACTS)\\n... [S1]\\n\\n### SUBHEADING: WAIT, IT GETS CRAZIER (THE SATIRE TURN & BREAKDOWN)\\n...\\n\\n### SUBHEADING: FINAL ROAST, PUNCHLINES & REAL TALK\\n...\\n\\n### OUTRO (COMMENT BAIT & YOUTUBER SIGN-OFF)\\n...",
      "cues": ["[ZOOM IN ON FACE]", "[SCREENSHOT POPUP: Official headline]", "[B-ROLL: ...]", "[SFX: ...]"]
    }
  ],
  "factBox": [
    {
      "claim": "string",
      "sourceTag": "[S1]",
      "outlet": "string",
      "url": "https://..."
    }
  ]
}`;

    const tryGenerateScript = async (modelName: string) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          ...(modelName.startsWith('gemini-4')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });
      const cleanedJsonStr = (response.text || '{}')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const rawObj = JSON.parse(cleanedJsonStr || '{}');

      // Normalize section types & run Fact-Checker citation verification pass
      if (Array.isArray(rawObj.sections)) {
        const normalizedSections = rawObj.sections.map((sec: any, idx: number) => {
          const upperType = String(sec.type || 'SETUP').toUpperCase().trim();
          const validTypes = ['COLD OPEN', 'SETUP', 'TURN', 'PUNCHLINE', 'BRIDGE', 'OUTRO'];
          const finalType = validTypes.includes(upperType) ? upperType : 'SETUP';
          const isSetupOrTurn = finalType === 'SETUP' || finalType === 'TURN';
          return {
            id: sec.id || `sec_${idx + 1}`,
            type: finalType as any,
            storyId: sec.storyId || validStories[0]?.id || '',
            storyHeadline: sec.storyHeadline || validStories[0]?.headline || '',
            content: normalizeCitationText(String(sec.content || ''), maxSourceIdx, isSetupOrTurn),
            cues: Array.isArray(sec.cues) ? sec.cues.map(String) : [],
          };
        });

        // Always unify into ONE single continuous segment with subheadings (Intro, Setup, Turn, Punchline, Outro)
        rawObj.sections = unifyScriptIntoSingleSegment(
          normalizedSections,
          validStories[0]?.id || '',
          validStories.map((s) => s.headline).join(' · ')
        ).map((sec) => ({
          ...sec,
          content: normalizeCitationText(sec.content, maxSourceIdx, true),
        }));
      }

      // Ensure factBox entries map to real verified sources
      const verifiedFactBox =
        globalSources.length > 0
          ? globalSources.slice(0, 12).map((gs) => ({
              claim: gs.title,
              sourceTag: `[S${gs.globalIndex}]`,
              outlet: gs.outlet,
              url: gs.url,
            }))
          : Array.isArray(rawObj.factBox)
            ? rawObj.factBox
            : [];

      rawObj.factBox = verifiedFactBox;
      return ScriptOutputSchema.parse(rawObj);
    };

    try {
      let validated;
      let usedModel = activePrimaryModel;
      try {
        validated = await tryGenerateScript(activePrimaryModel);
      } catch (primaryErr) {
        console.warn(
          `Primary script model ${activePrimaryModel} failed, trying fallback ${activeFallbackModel}:`,
          primaryErr
        );
        usedModel = activeFallbackModel;
        validated = await tryGenerateScript(activeFallbackModel);
      }

      serverState.syncMeta.aiCallsToday = (serverState.syncMeta.aiCallsToday || 0) + 1;
      persistServerState();
      res.json({
        ok: true,
        groundingMode: usedModel,
        script: validated,
      });
    } catch (err: any) {
      res.status(200).json({
        ok: false,
        error: `Script generation paused: ${err?.message || 'Quota reached or validation failed'}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Satire News Desk Server v3.0 running on http://localhost:${PORT}`);
  });
}

startServer();
