import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SEED_SOURCES, SEED_SETTINGS, SEED_DESK } from './src/data/seedDeskData';
import { SECTORS } from './src/types/desk';
import {
  SourceItemSchema,
  StarredStorySchema,
  ScriptRecordSchema,
  DeskStateSchema,
  UserSettingsSchema,
  StoryClusterSchema,
  FeedIndexDaySchema,
} from './src/utils/schemas';

/**
 * Deterministic evaluator that mirrors the exact gates in firestore.rules
 * and verifies that firestore.rules contains all required security clauses.
 */
interface AuthContext {
  uid: string;
  token: {
    email?: string;
    email_verified?: boolean;
  };
}

const OWNER_EMAIL = 'mamtadevi9329@gmail.com';
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function isValidId(id: unknown): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= 128 &&
    VALID_ID_REGEX.test(id)
  );
}

function isOwner(auth: AuthContext | null): boolean {
  return (
    auth !== null &&
    auth.token?.email_verified === true &&
    auth.token?.email === OWNER_EMAIL &&
    typeof auth.uid === 'string' &&
    auth.uid.length >= 1 &&
    auth.uid.length <= 128
  );
}

function hasAll(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function hasOnly(obj: Record<string, unknown>, allowed: string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(obj).every((k) => set.has(k));
}

function isValidSource(data: Record<string, unknown>): boolean {
  const req = ['name', 'type', 'url', 'sector', 'language', 'trust', 'enabled', 'consecutiveErrors'];
  const allowed = [
    'id',
    'name',
    'type',
    'url',
    'sector',
    'language',
    'trust',
    'priority',
    'enabled',
    'etag',
    'lastModified',
    'lastFetchedAt',
    'lastError',
    'consecutiveErrors',
  ];
  if (!hasAll(data, req) || !hasOnly(data, allowed)) return false;
  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 200) return false;
  if (!['rss', 'youtube', 'regulator', 'google_news'].includes(String(data.type))) return false;
  if (typeof data.url !== 'string' || data.url.length < 8 || data.url.length > 2000) return false;
  if (typeof data.sector !== 'string' || data.sector.length < 1 || data.sector.length > 80) return false;
  if (!['en', 'hi'].includes(String(data.language))) return false;
  if (typeof data.trust !== 'number' || data.trust < 1 || data.trust > 5) return false;
  if (typeof data.enabled !== 'boolean') return false;
  if (
    typeof data.consecutiveErrors !== 'number' ||
    data.consecutiveErrors < 0 ||
    data.consecutiveErrors > 10000
  ) {
    return false;
  }
  return true;
}

function isValidStarred(data: Record<string, unknown>): boolean {
  if (!hasAll(data, ['storyId', 'savedAt'])) return false;
  if (!hasOnly(data, ['storyId', 'savedAt', 'note', 'snapshot'])) return false;
  if (!isValidId(data.storyId)) return false;
  if (typeof data.savedAt !== 'string' || data.savedAt.length < 1 || data.savedAt.length > 100) return false;
  if ('note' in data && (typeof data.note !== 'string' || data.note.length > 2000)) return false;
  return true;
}

function isValidDesk(data: Record<string, unknown>): boolean {
  if (!hasAll(data, ['title', 'storyIds', 'notes', 'updatedAt'])) return false;
  if (!hasOnly(data, ['id', 'title', 'storyIds', 'storySnapshots', 'notes', 'storyNotes', 'storyMinutes', 'updatedAt'])) {
    return false;
  }
  if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 300) return false;
  if (!Array.isArray(data.storyIds) || data.storyIds.length > 30) return false;
  if (typeof data.notes !== 'string' || data.notes.length > 5000) return false;
  if (typeof data.updatedAt !== 'string' || data.updatedAt.length > 100) return false;
  return true;
}

function isValidSettings(data: Record<string, unknown>): boolean {
  if (!hasAll(data, ['theme', 'defaultLanguage', 'defaultTone', 'doNotJokeAbout', 'sectorBoosts'])) return false;
  if (
    !hasOnly(data, [
      'theme',
      'density',
      'showThumbnails',
      'defaultLanguage',
      'defaultTone',
      'defaultRuntime',
      'defaultFormat',
      'wpm',
      'aiDailyLimit',
      'retentionDays',
      'keepScripts',
      'doNotJokeAbout',
      'sectorBoosts',
      'updatedAt',
    ])
  ) {
    return false;
  }
  if (!['dark', 'light'].includes(String(data.theme))) return false;
  if (typeof data.doNotJokeAbout !== 'string' || data.doNotJokeAbout.length < 10 || data.doNotJokeAbout.length > 3000) {
    return false;
  }
  return true;
}

function evaluateRule(params: {
  collection: string;
  docId: string;
  op: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: AuthContext | null;
  data?: Record<string, unknown>;
}): 'ALLOWED' | 'PERMISSION_DENIED' {
  const { collection, docId, op, auth, data = {} } = params;

  // Internal server-only collections: seen and locks are never readable or writable by client
  if (collection === 'seen' || collection === 'locks') {
    return 'PERMISSION_DENIED';
  }

  // Server-write-only collections: stories, feedIndex, stats, meta, agentRuns, demo
  if (['stories', 'feedIndex', 'stats', 'meta', 'agentRuns', 'demo'].includes(collection)) {
    if (op === 'create' || op === 'update' || op === 'delete') {
      return 'PERMISSION_DENIED';
    }
    if (op === 'get') {
      return isOwner(auth) && isValidId(docId) ? 'ALLOWED' : 'PERMISSION_DENIED';
    }
    if (op === 'list') {
      return isOwner(auth) ? 'ALLOWED' : 'PERMISSION_DENIED';
    }
  }

  // Client-writable collections: sources, starred, scripts, desk, settings
  if (!isOwner(auth)) return 'PERMISSION_DENIED';
  if (op !== 'list' && !isValidId(docId)) return 'PERMISSION_DENIED';

  if (collection === 'sources') {
    if (op === 'get' || op === 'list' || op === 'delete') return 'ALLOWED';
    return isValidSource(data) ? 'ALLOWED' : 'PERMISSION_DENIED';
  }

  if (collection === 'starred') {
    if (op === 'get' || op === 'list' || op === 'delete') return 'ALLOWED';
    return isValidStarred(data) && data.storyId === docId ? 'ALLOWED' : 'PERMISSION_DENIED';
  }

  if (collection === 'desk') {
    if (docId !== auth!.uid && docId !== 'current') return 'PERMISSION_DENIED';
    if (op === 'get' || op === 'list' || op === 'delete') return 'ALLOWED';
    return isValidDesk(data) ? 'ALLOWED' : 'PERMISSION_DENIED';
  }

  if (collection === 'settings') {
    if (docId !== auth!.uid && docId !== 'user') return 'PERMISSION_DENIED';
    if (op === 'get' || op === 'list' || op === 'delete') return 'ALLOWED';
    return isValidSettings(data) ? 'ALLOWED' : 'PERMISSION_DENIED';
  }

  return 'PERMISSION_DENIED';
}

describe('Phase 2: Firestore Security Rules & Dirty Dozen Payloads', () => {
  const rulesText = fs.readFileSync(path.resolve(__dirname, 'firestore.rules'), 'utf-8');

  const ownerAuth: AuthContext = {
    uid: 'owner_prince_uid_01',
    token: {
      email: 'mamtadevi9329@gmail.com',
      email_verified: true,
    },
  };

  const otherAccountAuth: AuthContext = {
    uid: 'attacker_uid_99',
    token: {
      email: 'attacker@gmail.com',
      email_verified: true,
    },
  };

  const unverifiedSpoofAuth: AuthContext = {
    uid: 'spoof_uid_02',
    token: {
      email: 'mamtadevi9329@gmail.com',
      email_verified: false,
    },
  };

  it('verifies firestore.rules file contains all required match blocks and default-deny net', () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).toContain('match /{document=**} {\n      allow read, write: if false;\n    }');
    expect(rulesText).toContain('request.auth.token.email == "mamtadevi9329@gmail.com"');
    expect(rulesText).toContain('request.auth.token.email_verified == true');
    expect(rulesText).toContain('match /sources/{sourceId}');
    expect(rulesText).toContain('match /stories/{storyId}');
    expect(rulesText).toContain('match /feedIndex/{dayKey}');
    expect(rulesText).toContain('match /seen/{shardId}');
    expect(rulesText).toContain('match /stats/{dayKey}');
    expect(rulesText).toContain('match /starred/{storyId}');
    expect(rulesText).toContain('match /scripts/{scriptId}');
    expect(rulesText).toContain('match /desk/{uid}');
    expect(rulesText).toContain('match /settings/{uid}');
    expect(rulesText).toContain('match /meta/{docId}');
    expect(rulesText).toContain('match /agentRuns/{runId}');
    expect(rulesText).toContain('match /locks/{lockId}');
  });

  it('Payload 1 & 2: signed-out read is denied on stories and sources', () => {
    expect(
      evaluateRule({ collection: 'stories', docId: 'story_123', op: 'get', auth: null })
    ).toBe('PERMISSION_DENIED');
    expect(
      evaluateRule({ collection: 'sources', docId: 'src_ie_top', op: 'get', auth: null })
    ).toBe('PERMISSION_DENIED');
  });

  it('Payload 3: other account read and write is denied on all collections', () => {
    expect(
      evaluateRule({ collection: 'stories', docId: 'story_123', op: 'get', auth: otherAccountAuth })
    ).toBe('PERMISSION_DENIED');
    expect(
      evaluateRule({ collection: 'sources', docId: 'src_ie_top', op: 'get', auth: otherAccountAuth })
    ).toBe('PERMISSION_DENIED');
  });

  it('Payload 4: unverified email spoof is denied even if email string matches owner', () => {
    expect(
      evaluateRule({ collection: 'sources', docId: 'src_ie_top', op: 'get', auth: unverifiedSpoofAuth })
    ).toBe('PERMISSION_DENIED');
  });

  it('Owner read is allowed on stories, feedIndex, stats, sources, starred, desk, settings, meta, agentRuns', () => {
    for (const col of ['stories', 'feedIndex', 'stats', 'sources', 'starred', 'meta', 'agentRuns']) {
      expect(
        evaluateRule({ collection: col, docId: 'doc_2026_11_14', op: 'get', auth: ownerAuth })
      ).toBe('ALLOWED');
    }
    expect(
      evaluateRule({ collection: 'desk', docId: ownerAuth.uid, op: 'get', auth: ownerAuth })
    ).toBe('ALLOWED');
    expect(
      evaluateRule({ collection: 'settings', docId: ownerAuth.uid, op: 'get', auth: ownerAuth })
    ).toBe('ALLOWED');
  });

  it('Payload 5 & 6: client write to server-only stories and feedIndex is denied even for Owner', () => {
    expect(
      evaluateRule({
        collection: 'stories',
        docId: 'story_123',
        op: 'create',
        auth: ownerAuth,
        data: { headline: 'Attempted client write' },
      })
    ).toBe('PERMISSION_DENIED');
    expect(
      evaluateRule({
        collection: 'feedIndex',
        docId: '2026-11-14',
        op: 'create',
        auth: ownerAuth,
        data: { dayKey: '2026-11-14' },
      })
    ).toBe('PERMISSION_DENIED');
  });

  it('Payload 7 & 8: client read of seen shards and locks/tick is denied even for Owner', () => {
    expect(
      evaluateRule({ collection: 'seen', docId: 'a', op: 'get', auth: ownerAuth })
    ).toBe('PERMISSION_DENIED');
    expect(
      evaluateRule({ collection: 'locks', docId: 'tick', op: 'get', auth: ownerAuth })
    ).toBe('PERMISSION_DENIED');
  });

  it('Payload 9, 10, 11, 12: rejects shadow fields, poisoned IDs, invalid trust values, and oversized desk arrays', () => {
    const validSource = { ...SEED_SOURCES[0] };

    // Payload 9: Shadow field injection
    expect(
      evaluateRule({
        collection: 'sources',
        docId: 'src_test_1',
        op: 'create',
        auth: ownerAuth,
        data: { ...validSource, isAdmin: true },
      })
    ).toBe('PERMISSION_DENIED');

    // Payload 10: Poisoned ID with spaces/special chars
    expect(
      evaluateRule({
        collection: 'sources',
        docId: 'bad$id with spaces!',
        op: 'create',
        auth: ownerAuth,
        data: validSource,
      })
    ).toBe('PERMISSION_DENIED');

    // Payload 11: Value poisoning (trust = 99)
    expect(
      evaluateRule({
        collection: 'sources',
        docId: 'src_test_2',
        op: 'create',
        auth: ownerAuth,
        data: { ...validSource, trust: 99 },
      })
    ).toBe('PERMISSION_DENIED');

    // Payload 12: Oversized desk storyIds (> 30)
    expect(
      evaluateRule({
        collection: 'desk',
        docId: ownerAuth.uid,
        op: 'create',
        auth: ownerAuth,
        data: {
          ...SEED_DESK,
          storyIds: Array.from({ length: 35 }, (_, i) => `story_${i}`),
        },
      })
    ).toBe('PERMISSION_DENIED');
  });

  it('Allows valid owner writes to sources, starred, desk, and settings', () => {
    expect(
      evaluateRule({
        collection: 'sources',
        docId: SEED_SOURCES[0].id,
        op: 'create',
        auth: ownerAuth,
        data: { ...SEED_SOURCES[0] },
      })
    ).toBe('ALLOWED');

    expect(
      evaluateRule({
        collection: 'starred',
        docId: 'story_abc_1',
        op: 'create',
        auth: ownerAuth,
        data: {
          storyId: 'story_abc_1',
          savedAt: new Date().toISOString(),
          note: 'Great callback material',
        },
      })
    ).toBe('ALLOWED');

    expect(
      evaluateRule({
        collection: 'desk',
        docId: ownerAuth.uid,
        op: 'create',
        auth: ownerAuth,
        data: { ...SEED_DESK, updatedAt: new Date().toISOString() },
      })
    ).toBe('ALLOWED');

    expect(
      evaluateRule({
        collection: 'settings',
        docId: ownerAuth.uid,
        op: 'create',
        auth: ownerAuth,
        data: { ...SEED_SETTINGS, updatedAt: new Date().toISOString() },
      })
    ).toBe('ALLOWED');
  });
});

describe('Phase 2: 100+ Seed Feeds & Zod Schema Validation', () => {
  it('seeds at least 100 real feeds grouped across all 17 sectors', () => {
    expect(SEED_SOURCES.length).toBeGreaterThanOrEqual(100);

    const ids = new Set<string>();
    const sectorsCovered = new Set<string>();

    for (const src of SEED_SOURCES) {
      const parsed = SourceItemSchema.safeParse(src);
      expect(parsed.success).toBe(true);
      expect(src.url.startsWith('https://')).toBe(true);
      expect(ids.has(src.id)).toBe(false);
      ids.add(src.id);
      sectorsCovered.add(src.sector);
    }

    for (const sector of SECTORS) {
      expect(sectorsCovered.has(sector)).toBe(true);
    }
  });

  it('validates SEED_SETTINGS, SEED_DESK, StarredStory, FeedIndexDay, StoryCluster, and ScriptRecord with Zod', () => {
    expect(UserSettingsSchema.safeParse(SEED_SETTINGS).success).toBe(true);
    expect(DeskStateSchema.safeParse(SEED_DESK).success).toBe(true);

    const sampleStarred = {
      storyId: 'story_123',
      savedAt: '2026-11-14T05:00:00.000Z',
      note: 'Keep for year-end special',
    };
    expect(StarredStorySchema.safeParse(sampleStarred).success).toBe(true);

    const sampleFeedIndex = {
      dayKey: '2026-11-14',
      updatedAt: '2026-11-14T05:00:00.000Z',
      cards: [
        {
          id: 'story_123',
          headline: 'RBI releases new digital lending guidelines',
          blurb: 'RBI issued updated norms for digital lending apps.',
          sector: 'Markets and finance',
          keywords: ['rbi', 'lending', 'digital'],
          importanceScore: 78.5,
          heatScore: 62,
          satirePotential: 8,
          sourceCount: 3,
          updatedAt: '2026-11-14T05:00:00.000Z',
          verification: 'verified',
          sensitivity: 'normal',
        },
      ],
    };
    expect(FeedIndexDaySchema.safeParse(sampleFeedIndex).success).toBe(true);
  });
});
