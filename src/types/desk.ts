export const SECTORS = [
  'Top stories',
  'Politics',
  'Business and economy',
  'Markets and finance',
  'Startups and tech',
  'AI',
  'Sports',
  'Entertainment',
  'Crime and law',
  'Cities',
  'Environment and climate',
  'Health',
  'Education and jobs',
  'World',
  'Auto',
  'Science',
  'Viral and social',
] as const;

export type Sector = (typeof SECTORS)[number] | string;

export type SensitivityLevel = 'normal' | 'handle-with-care' | 'no-joke';

export type VerificationStatus = 'verified' | 'developing' | 'single-source';

export type ComedyTarget = 'power' | 'absurdity' | 'hypocrisy';

export type ScriptLanguage = 'Hinglish' | 'Hindi' | 'English';
export type ScriptRuntimeTarget = '60s Short' | '3 min' | '8 min' | '12 min';
export type ScriptTone = 'Mild' | 'Medium' | 'Savage';
export type ScriptFormat =
  | 'News-desk monologue'
  | 'Rapid-fire headlines'
  | 'Deep-dive explainer';

export type DensityMode = 'comfortable' | 'compact';

export interface SourceItem {
  id: string;
  name: string;
  type: 'rss' | 'youtube' | 'regulator' | 'google_news';
  url: string;
  sector: Sector;
  language: 'en' | 'hi';
  trust: number; // 1 to 5
  priority?: 'high' | 'normal';
  enabled: boolean;
  etag?: string;
  lastModified?: string;
  lastFetchedAt: string;
  lastError: string;
  consecutiveErrors: number;
}

export interface SourceRuntimeState {
  etag?: string;
  lastModified?: string;
  lastFetchedAt: string;
  consecutiveErrors: number;
  lastError: string;
}

export interface SourceStateMeta {
  updatedAt: string;
  cursorIndex?: number;
  sources: Record<string, SourceRuntimeState>;
}

export interface ArticleItem {
  id: string; // hash(canonicalUrl)
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  canonicalUrl: string;
  publishedAt: string;
  fetchedAt: string;
  sector: Sector;
  snippet: string;
  imageUrl?: string;
  entities: string[];
  keywords: string[];
  storyId: string;
  isVideo?: boolean;
  videoId?: string;
  duration?: string;
}

export interface StorySourceRef {
  index: number; // 1-based [S1], [S2]...
  sourceId: string;
  outlet: string;
  title: string;
  url: string;
  publishedAt: string;
  trust: number;
}

export interface StoryKeyFact {
  fact: string;
  sourceIndex: number; // 1-based index into sources
}

export interface StoryKeyNumber {
  label: string;
  value: string;
  sourceIndex: number;
}

export interface StoryTimelineItem {
  date: string;
  event: string;
  sourceIndex?: number;
}

export interface StoryStakeholder {
  name: string;
  role: string;
  stance?: string;
}

export interface ComedyAngle {
  angle: string;
  target: ComedyTarget;
  punchlineHint: string;
}

export interface VideoIdeas {
  titles: string[]; // 5 title ideas
  thumbnails: string[]; // 5 thumbnail text ideas
  onScreenCards: string[]; // suggested on-screen text cards
  description: string; // with timestamps and hashtags
}

export interface RelatedVideo {
  id: string;
  title: string;
  channelName: string;
  publishedAt: string;
  duration: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  sector: Sector;
  viewsLabel?: string;
}

export interface GovRelease {
  id: string;
  agency: 'PIB' | 'RBI' | 'SEBI' | 'MeitY' | 'ECI';
  title: string;
  publishedAt: string;
  url: string;
  referenceCode: string;
}

export interface StoryCluster {
  id: string;
  headline: string;
  sector: Sector;
  dayKey?: string; // YYYY-MM-DD in APP_TZ
  expiresAt?: string; // firstSeen + RETENTION_DAYS ISO string
  subtags: string[];
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
  articleIds: string[];
  sources: StorySourceRef[];
  importanceScore: number; // 0 to 100
  heatScore?: number; // 0 to 100
  heatSignalsUsed?: number; // 1 to 5
  satirePotential: number; // 0 to 10
  verification?: VerificationStatus;
  sensitivity: SensitivityLevel;
  summarised: boolean;
  whatHappened: string;
  whyItMatters: string;
  keyFacts: StoryKeyFact[];
  keyNumbers: StoryKeyNumber[];
  timeline: StoryTimelineItem[];
  stakeholders: StoryStakeholder[];
  framingNotes: string;
  openQuestions: string[];
  comedyAngles: ComedyAngle[];
  videoIdeas: VideoIdeas;
  relatedVideos: RelatedVideo[];
  govReleases: GovRelease[];
  thumbnailUrl?: string;
  whyRising?: string;
}

export interface FeedIndexCard {
  id: string;
  headline: string;
  blurb: string; // up to 140 characters
  sector: Sector;
  keywords: string[]; // up to 8 keywords
  importanceScore: number;
  heatScore: number;
  satirePotential: number;
  sourceCount: number;
  updatedAt: string;
  verification: VerificationStatus;
  sensitivity: SensitivityLevel;
  thumbnailUrl?: string;
}

export interface FeedIndexDay {
  dayKey: string; // YYYY-MM-DD in APP_TZ
  part?: number;
  updatedAt: string;
  cards: FeedIndexCard[];
}

export interface SeenShard {
  shardId: string; // '0' .. 'f'
  updatedAt: string;
  entries: Record<string, string>; // articleHash -> dayKey (YYYY-MM-DD)
}

export interface StatsDay {
  dayKey: string;
  updatedAt: string;
  topEntities: { name: string; count: number; sector: Sector }[];
  topKeywords: { keyword: string; count: number; sector: Sector }[];
  sectorCounts: Record<string, number>;
}

export type ScriptSectionType =
  | 'COLD OPEN'
  | 'SETUP'
  | 'TURN'
  | 'PUNCHLINE'
  | 'BRIDGE'
  | 'OUTRO';

export interface ScriptSection {
  id: string;
  type: ScriptSectionType;
  storyId?: string;
  storyHeadline?: string;
  content: string; // includes [S1] tags on factual lines
  cues: string[];
}

export interface ScriptFactItem {
  claim: string;
  sourceTag: string; // e.g. "[S1]"
  outlet: string;
  url: string;
}

export interface ScriptVersion {
  id: string;
  savedAt: string;
  label: string;
  sections: ScriptSection[];
}

export type ScriptStatus = 'Draft' | 'Final' | 'Recorded' | 'Published';

export interface ScriptRecord {
  id: string;
  title: string;
  storyIds: string[];
  format: ScriptFormat;
  language: ScriptLanguage;
  tone: ScriptTone;
  runtimeTarget: ScriptRuntimeTarget;
  runtimeTargetSec: number;
  status?: ScriptStatus;
  draftByAgent?: boolean;
  isNeutralBriefing?: boolean;
  tags?: string[];
  sections: ScriptSection[];
  factBox: ScriptFactItem[];
  versions: ScriptVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface DeskState {
  id: string; // owner UID or "current"
  title: string;
  storyIds: string[]; // max 30
  storySnapshots?: Record<string, StoryCluster>;
  notes: string;
  storyNotes: Record<string, string>;
  storyMinutes: Record<string, number>;
  updatedAt: string;
}

export interface SavedStory {
  storyId: string;
  savedAt: string;
  note?: string;
  snapshot?: StoryCluster; // Full story snapshot so starred items survive 25-day cleanup
}

export interface UserSettings {
  theme: 'dark' | 'light';
  density: DensityMode;
  showThumbnails: boolean;
  defaultLanguage: ScriptLanguage;
  defaultTone: ScriptTone;
  defaultRuntime: ScriptRuntimeTarget;
  defaultFormat: ScriptFormat;
  wpm: number;
  aiDailyLimit: number;
  retentionDays: number;
  keepScripts?: boolean; // Default true: never delete scripts in Janitor
  doNotJokeAbout: string;
  sectorBoosts: Record<string, number>;
  updatedAt: string;
}

export interface JanitorRunReport {
  ok: boolean;
  dryRun: boolean;
  inInitialThreeDayWindow: boolean;
  refusedReason?: string;
  ranAt: string;
  retentionDays: number;
  cutoffDayKey: string;
  totalDeletedOrListed: number;
  cappedAt5000: boolean;
  wouldDelete: {
    storyIds: string[];
    feedIndexDayKeys: string[];
    seenShardEntries: { shardId: string; articleHash: string; dayKey: string }[];
    statsDayKeys: string[];
    agentRunIds: string[];
  };
  protectedCounts: {
    starredStories: number;
    deskSnapshots: number;
    keptScripts: number;
  };
}

export interface SyncMeta {
  lastSyncedAt: string;
  lastStatus: 'ok' | 'partial' | 'error';
  articlesAdded: number;
  storiesUpdated: number;
  estimatedReadsToday: number;
  estimatedWritesToday: number;
  aiCallsToday?: number;
  installedAt?: string;
  lastJanitorReport?: JanitorRunReport;
}

export interface AiUsageMeta {
  dayKeyPacific: string; // YYYY-MM-DD in America/Los_Angeles
  callsToday: number;
  groundingCallsToday: number;
  byAgent: Record<string, number>;
  updatedAt: string;
}

export interface AgentRunRecord {
  id: string;
  startedAt: string;
  completedAt: string;
  status: 'ok' | 'partial' | 'error';
  aiCallsUsed: number;
  agents: {
    name: string;
    itemsProcessed: number;
    errors: string[];
    durationMs: number;
  }[];
}

export interface TickLock {
  lockedBy: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface FirestoreUsageEstimate {
  readsToday: number;
  readsLimit: number;
  readsPercent: number;
  writesToday: number;
  writesLimit: number;
  writesPercent: number;
  storageBytes: number;
  storageLimitBytes: number;
  storagePercent: number;
  isWarning: boolean;
  warningReasons: string[];
}
