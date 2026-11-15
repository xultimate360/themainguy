import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  Keyboard,
  LayoutDashboard,
  ListFilter,
  LogIn,
  LogOut,
  Moon,
  Newspaper,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  Rss,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  DensityMode,
  DeskState,
  RelatedVideo,
  SavedStory,
  ScriptFormat,
  ScriptLanguage,
  ScriptRecord,
  ScriptRuntimeTarget,
  ScriptTone,
  SECTORS,
  Sector,
  SensitivityLevel,
  SourceItem,
  StoryCluster,
  SyncMeta,
  UserSettings,
  VerificationStatus,
} from './types/desk';
import {
  SEED_DESK,
  SEED_SCRIPTS,
  SEED_SETTINGS,
  SEED_SOURCES,
  SEED_STORIES,
  SEED_SYNC_META,
  SEED_VIDEOS,
} from './data/seedDeskData';
import {
  createStarredStorySnapshot,
  estimateFirestoreUsage,
  formatDayGroupHeader,
  getExpiringSoonStories,
  isStoryExpired,
  resolveStoryAcrossArchiveAndSnapshots,
  toDayKeyInTz,
} from './utils/deskEngine';
import { VideoResourcesStrip } from './components/VideoResourcesStrip';
import { StoryPageView } from './components/StoryPageView';
import { ScriptStudioView } from './components/ScriptStudioView';
import {
  EpisodeBoardView,
  SavedStoriesView,
  SettingsView,
  SourcesManagerView,
} from './components/SourcesAndSettingsViews';
import {
  ALLOWED_OWNER_EMAIL,
  auth,
  db,
  deleteDoc,
  doc,
  firebaseSignOut,
  googleProvider,
  handleFirestoreError,
  onAuthStateChanged,
  OperationType,
  setDoc,
  signInWithPopup,
  User,
} from './firebase';

type NavScreen =
  | 'today'
  | 'feed'
  | 'trends'
  | 'script'
  | 'desk'
  | 'saved'
  | 'newsroom'
  | 'sources'
  | 'settings'
  | 'story';

type SortOption =
  | 'importance'
  | 'latest'
  | 'sources'
  | 'heat'
  | 'satire'
  | 'opportunity';

type TimeWindow =
  | 'all'
  | 'today'
  | 'yesterday'
  | '24h'
  | '3d'
  | '7d'
  | 'last_week'
  | '15d'
  | '25d'
  | 'custom';

const LEGACY_MOCK_KEYS = [
  'tmg_cb_stories_v2',
  'tmg_cb_sources_v2',
  'tmg_cb_scripts_v2',
  'tmg_cb_desk_v2',
  'tmg_cb_saved_v2',
  'tmg_cb_settings_v2',
  'tmg_cb_sync_v2',
];

const STORAGE_KEYS = {
  stories: 'tmg_v3_clean_stories',
  sources: 'tmg_v3_clean_sources',
  scripts: 'tmg_v3_clean_scripts',
  desk: 'tmg_v3_clean_desk',
  saved: 'tmg_v3_clean_saved',
  settings: 'tmg_v3_clean_settings',
  sync: 'tmg_v3_clean_sync',
};

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ============================================================================
 * REUSABLE PHASE 1 COMPONENTS: STORY ROW, SKELETON, EMPTY & ERROR STATES
 * ==========================================================================*/
interface StoryRowProps {
  story: StoryCluster;
  isFocused: boolean;
  isSaved: boolean;
  isOnDesk: boolean;
  density: DensityMode;
  showThumbnails: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onToggleSave: () => void;
  onToggleDesk: () => void;
  onGenerateScript: () => void;
}

const StoryRow: React.FC<StoryRowProps> = ({
  story,
  isFocused,
  isSaved,
  isOnDesk,
  density,
  showThumbnails,
  onFocus,
  onOpen,
  onToggleSave,
  onToggleDesk,
  onGenerateScript,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const verification: VerificationStatus =
    story.verification || (story.sourceCount >= 2 ? 'verified' : 'single-source');

  const heatValue =
    typeof story.heatScore === 'number'
      ? story.heatScore
      : Math.min(
          95,
          Math.max(18, story.sourceCount * 16 + Math.round(story.importanceScore * 0.4))
        );
  const heatLabel =
    heatValue >= 75
      ? 'Surging'
      : heatValue >= 50
        ? 'Hot'
        : heatValue >= 25
          ? 'Warm'
          : 'Cold';
  const filledSegments = Math.max(1, Math.min(5, Math.ceil(heatValue / 20)));

  // Section 11.2: A story row shows at most three badges: sector, source count ('14 sources'),
  // and a small verification or sensitivity icon.
  const renderThirdBadge = () => {
    if (story.sensitivity === 'no-joke') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#C75450]/15 text-[#C75450] border border-[#C75450]/30 text-xs font-medium">
          <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.5} />
          No-joke
        </span>
      );
    }
    if (story.sensitivity === 'handle-with-care') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#C9922E]/15 text-[#C9922E] border border-[#C9922E]/30 text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
          Handle with care
        </span>
      );
    }
    if (verification === 'verified') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#3F9E6B]/15 text-[#3F9E6B] border border-[#3F9E6B]/30 text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          Verified
        </span>
      );
    }
    if (verification === 'developing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#C9922E]/15 text-[#C9922E] border border-[#C9922E]/30 text-xs font-medium">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
          Developing
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[var(--bg-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs">
        Single-source
      </span>
    );
  };

  return (
    <article
      onClick={onFocus}
      className={`${
        density === 'compact' ? 'p-3 sm:p-3.5' : 'p-4 sm:p-5'
      } transition-colors duration-150 ${
        isFocused
          ? 'bg-[var(--bg-raised)] outline-1 outline-[#3D5AFE]'
          : 'hover:bg-[var(--bg-raised)]/60'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* At most 3 badges (Section 11.2) */}
          <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs">
            <span className="px-2 py-0.5 rounded-[6px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">
              {story.sector}
            </span>
            <span className="px-2 py-0.5 rounded-[6px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              {story.sourceCount} {story.sourceCount === 1 ? 'source' : 'sources'}
            </span>
            {renderThirdBadge()}
          </div>

          {/* Serif Headline (20 to 22 px in lists — Section 11.2) */}
          <h2
            onClick={onOpen}
            className={`font-serif-headline ${
              density === 'compact' ? 'text-[19px]' : 'text-[20px] sm:text-[22px]'
            } font-semibold leading-snug text-[var(--text-primary)] hover:text-[#3D5AFE] cursor-pointer line-clamp-2 mb-1.5`}
          >
            {story.headline}
          </h2>

          {/* Summary (2 lines in Comfortable mode) */}
          {density === 'comfortable' && (
            <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-3">
              {story.whatHappened}
            </p>
          )}

          {/* Meta Line: Heat with 5-segment grey/amber bar, Satire potential, Outlets & Time, Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                title={`Importance score: ${story.importanceScore}/100 · Based on ${
                  story.heatSignalsUsed || 3
                } of 5 heat signals`}
                className="inline-flex items-center gap-1.5"
              >
                <span>
                  {heatLabel} {heatValue}
                </span>
                <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((seg) => (
                    <span
                      key={seg}
                      className={`w-2 h-1.5 rounded-[2px] ${
                        seg <= filledSegments ? 'bg-[#C9922E]' : 'bg-[var(--border-subtle)]'
                      }`}
                    />
                  ))}
                </span>
              </span>
              <span>·</span>
              <span>Satire {story.satirePotential}/10</span>
              <span>·</span>
              <span className="truncate max-w-[220px] sm:max-w-[300px]">
                {story.sources.map((s) => s.outlet).join(', ')}
              </span>
              <span>·</span>
              <span className="font-mono-label text-[var(--text-muted)]">
                {!Number.isNaN(new Date(story.updatedAt).getTime())
                  ? new Date(story.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recent'}
              </span>
            </div>

            {/* Quick Actions (44px touch target friendly) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave();
                }}
                className={`min-h-[34px] px-2.5 py-1 rounded-[8px] border text-xs font-medium cursor-pointer transition-colors duration-150 ${
                  isSaved
                    ? 'border-[#3F9E6B] bg-[#3F9E6B]/15 text-[#3F9E6B]'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#3D5AFE]'
                }`}
              >
                {isSaved ? 'Starred' : 'Star'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDesk();
                }}
                className={`min-h-[34px] px-2.5 py-1 rounded-[8px] border text-xs font-medium cursor-pointer transition-colors duration-150 ${
                  isOnDesk
                    ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#3D5AFE]'
                }`}
              >
                {isOnDesk ? 'On desk' : 'Desk'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateScript();
                }}
                className="min-h-[34px] px-2.5 py-1 rounded-[8px] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[#3D5AFE] text-xs font-medium cursor-pointer transition-colors duration-150"
              >
                Script
              </button>
            </div>
          </div>
        </div>

        {/* Optional 4:3 Thumbnail with Neutral Fallback Tile (Section 11.2) */}
        {showThumbnails && (
          <div className="w-24 sm:w-28 aspect-[4/3] rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden shrink-0 flex items-center justify-center">
            {story.thumbnailUrl && !imgFailed ? (
              <img
                src={story.thumbnailUrl}
                alt={story.headline}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-[var(--text-muted)] p-2 text-center">
                <ImageIcon className="w-4 h-4 mb-1" strokeWidth={1.5} />
                <span className="text-[10px] leading-tight line-clamp-1">
                  {story.sector}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export const StorySkeletonList: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div
    aria-label="Loading stories skeleton"
    className="desk-card divide-y divide-[var(--border-subtle)] overflow-hidden"
  >
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="p-4 sm:p-5 space-y-3 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 rounded-[6px] bg-[var(--bg-raised)]" />
          <div className="h-5 w-16 rounded-[6px] bg-[var(--bg-raised)]" />
          <div className="h-5 w-20 rounded-[6px] bg-[var(--bg-raised)]" />
        </div>
        <div className="h-6 w-4/5 rounded bg-[var(--bg-raised)]" />
        <div className="h-4 w-full rounded bg-[var(--bg-raised)]" />
        <div className="flex items-center justify-between pt-1">
          <div className="h-3.5 w-48 rounded bg-[var(--bg-raised)]" />
          <div className="flex gap-1.5">
            <div className="h-7 w-14 rounded-[8px] bg-[var(--bg-raised)]" />
            <div className="h-7 w-14 rounded-[8px] bg-[var(--bg-raised)]" />
            <div className="h-7 w-14 rounded-[8px] bg-[var(--bg-raised)]" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const ErrorStateCard: React.FC<{
  whatHappened: string;
  whatToDo: string;
  onRetry: () => void;
}> = ({ whatHappened, whatToDo, onRetry }) => (
  <div
    role="alert"
    className="desk-card p-6 border-[#C75450]/50 space-y-3"
  >
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[#C75450] shrink-0 mt-0.5" strokeWidth={1.5} />
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {whatHappened}
        </h3>
        <p className="text-xs text-[var(--text-secondary)]">{whatToDo}</p>
      </div>
    </div>
    <div>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[40px] px-4 py-2 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        Retry now
      </button>
    </div>
  </div>
);

export default function App() {
  useEffect(() => {
    LEGACY_MOCK_KEYS.forEach((k) => localStorage.removeItem(k));
  }, []);

  const [activeScreen, setActiveScreen] = useState<NavScreen>('today');
  const [previousFeedScreen, setPreviousFeedScreen] = useState<'today' | 'feed'>('today');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightRailOpen, setRightRailOpen] = useState(true);

  const [activeSector, setActiveSector] = useState<Sector>('Top stories');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('importance');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedSparklineDayKey, setSelectedSparklineDayKey] = useState<string | null>(null);
  const [feedVisibleCount, setFeedVisibleCount] = useState<number>(30);
  const [sensitivityFilter, setSensitivityFilter] = useState<'all' | SensitivityLevel>('all');
  const [verificationFilter, setVerificationFilter] = useState<'all' | VerificationStatus>('all');
  const [bestForVideoOnly, setBestForVideoOnly] = useState(false);

  const [stories, setStories] = useState<StoryCluster[]>(() =>
    loadLocal(STORAGE_KEYS.stories, SEED_STORIES)
  );
  const [videos, setVideos] = useState<RelatedVideo[]>(SEED_VIDEOS);
  const [sources, setSources] = useState<SourceItem[]>(() => {
    const cached = loadLocal<SourceItem[]>(STORAGE_KEYS.sources, SEED_SOURCES);
    if (!Array.isArray(cached) || cached.length < 100) {
      const existingIds = new Set((cached || []).map((s) => s.id));
      const missingSeeds = SEED_SOURCES.filter((s) => !existingIds.has(s.id));
      return [...(cached || []), ...missingSeeds];
    }
    return cached;
  });
  const [scripts, setScripts] = useState<ScriptRecord[]>(() =>
    loadLocal(STORAGE_KEYS.scripts, SEED_SCRIPTS)
  );
  const [activeScriptId, setActiveScriptId] = useState<string>('');
  const [desk, setDesk] = useState<DeskState>(() =>
    loadLocal(STORAGE_KEYS.desk, SEED_DESK)
  );
  const [savedList, setSavedList] = useState<SavedStory[]>(() =>
    loadLocal(STORAGE_KEYS.saved, [])
  );
  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...SEED_SETTINGS,
    ...loadLocal(STORAGE_KEYS.settings, SEED_SETTINGS),
  }));
  const [syncMeta, setSyncMeta] = useState<SyncMeta>(() =>
    loadLocal(STORAGE_KEYS.sync, SEED_SYNC_META)
  );

  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [isSummarising, setIsSummarising] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [loadingOverlayInfo, setLoadingOverlayInfo] = useState<{
    title: string;
    subtitle: string;
    meta: string;
    steps: string[];
  } | null>(null);
  const [loadingElapsedSec, setLoadingElapsedSec] = useState(0);
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pausedAgents, setPausedAgents] = useState<Record<string, boolean>>({});
  const [savedSubTab, setSavedSubTab] = useState<'starred' | 'expiring'>('starred');
  const [expiringDrawerOpen, setExpiringDrawerOpen] = useState(false);
  const [seenEntriesCount, setSeenEntriesCount] = useState<number>(0);
  const [feedIndexDaysCount, setFeedIndexDaysCount] = useState<number>(0);

  const [user, setUser] = useState<User | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2600);
  };

  useEffect(() => {
    const html = document.documentElement;
    if (settings.theme === 'light') {
      html.classList.remove('dark');
      html.classList.add('light');
    } else {
      html.classList.remove('light');
      html.classList.add('dark');
    }
  }, [settings.theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.stories, JSON.stringify(stories));
  }, [stories]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sources, JSON.stringify(sources));
  }, [sources]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.scripts, JSON.stringify(scripts));
  }, [scripts]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.desk, JSON.stringify(desk));
  }, [desk]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(savedList));
  }, [savedList]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sync, JSON.stringify(syncMeta));
  }, [syncMeta]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  // Section 7.1: Hydrate from server archive on load & run catch-up tick if > 15m stale or empty
  useEffect(() => {
    let mounted = true;
    async function hydrateAndCatchUp() {
      try {
        const resp = await fetch('/api/archive');
        const data = await resp.json();
        if (!mounted || !data.ok) return;

        if (Array.isArray(data.sources) && data.sources.length > 0) {
          setSources(data.sources);
        }
        if (Array.isArray(data.videos) && data.videos.length > 0) {
          setVideos(data.videos);
        }
        if (data.syncMeta) {
          setSyncMeta(data.syncMeta);
        }
        if (typeof data.seenEntriesCount === 'number') {
          setSeenEntriesCount(data.seenEntriesCount);
        }
        if (typeof data.feedIndexDaysCount === 'number') {
          setFeedIndexDaysCount(data.feedIndexDaysCount);
        }

        const serverStories: StoryCluster[] = Array.isArray(data.stories) ? data.stories : [];
        if (serverStories.length > 0) {
          setStories(serverStories);
          setSelectedStoryId((prev) => prev || serverStories[0].id);
        }

        const lastSyncMs = data.syncMeta?.lastSyncedAt
          ? new Date(data.syncMeta.lastSyncedAt).getTime()
          : 0;
        const isStale = !lastSyncMs || Date.now() - lastSyncMs > 15 * 60 * 1000;
        if (serverStories.length < 50 || isStale) {
          setIsIngesting(true);
          const tickResp = await fetch('/api/agents/tick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sectorBoosts: settings.sectorBoosts,
              retentionDays: settings.retentionDays,
              maxSourcesPerTick: 120,
              itemsPerSource: 8,
            }),
          });
          const tickData = await tickResp.json();
          if (mounted && tickData.ok) {
            if (Array.isArray(tickData.stories) && tickData.stories.length > 0) {
              setStories(tickData.stories);
              setSelectedStoryId((prev) => prev || tickData.stories[0].id);
            }
            if (Array.isArray(tickData.sources) && tickData.sources.length > 0) {
              setSources(tickData.sources);
            }
            if (Array.isArray(tickData.videos) && tickData.videos.length > 0) {
              setVideos(tickData.videos);
            }
            if (tickData.syncMeta) {
              setSyncMeta(tickData.syncMeta);
            }
          }
          if (mounted) setIsIngesting(false);
        }
      } catch {
        if (mounted) setIsIngesting(false);
      }
    }
    hydrateAndCatchUp();
    return () => {
      mounted = false;
    };
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setFeedVisibleCount(30);
  }, [
    activeSector,
    searchQuery,
    selectedKeyword,
    timeWindow,
    customStartDate,
    customEndDate,
    selectedSparklineDayKey,
    sensitivityFilter,
    verificationFilter,
    bestForVideoOnly,
    sortBy,
  ]);

  // Infinite scroll listener for Feed screen (Section 11.3)
  useEffect(() => {
    if (activeScreen !== 'feed') return;
    const onScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 420
      ) {
        setFeedVisibleCount((prev) => prev + 25);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeScreen]);

  const todayDayKey = useMemo(() => toDayKeyInTz(new Date().toISOString()), []);
  const yesterdayDayKey = useMemo(
    () => toDayKeyInTz(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    []
  );

  const filteredStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();

    return stories
      .filter((st) => {
        // Phase 4 (Section 5.4): Every query and UI view filters by date so expired unstarred items
        // disappear from the UI immediately on day 26 even if Firestore TTL has not run yet.
        if (isStoryExpired(st, now, settings.retentionDays || 25)) {
          return false;
        }
        if (
          !st.sources ||
          st.sources.length === 0 ||
          !st.sources.some((s) => s.url && s.url.startsWith('http'))
        ) {
          return false;
        }
        if (
          activeSector !== 'Top stories' &&
          st.sector.toLowerCase() !== activeSector.toLowerCase()
        ) {
          return false;
        }
        if (sensitivityFilter !== 'all' && st.sensitivity !== sensitivityFilter) {
          return false;
        }
        const stVerification: VerificationStatus =
          st.verification || (st.sourceCount >= 2 ? 'verified' : 'single-source');
        if (verificationFilter !== 'all' && stVerification !== verificationFilter) {
          return false;
        }
        if (bestForVideoOnly && st.sensitivity === 'no-joke') {
          return false;
        }
        if (selectedKeyword) {
          const kwLower = selectedKeyword.toLowerCase();
          const hasKw =
            st.subtags.some((t) => t.toLowerCase() === kwLower) ||
            st.headline.toLowerCase().includes(kwLower);
          if (!hasKw) return false;
        }
        const stDayKey = st.dayKey || toDayKeyInTz(st.updatedAt);
        if (selectedSparklineDayKey && stDayKey !== selectedSparklineDayKey) {
          return false;
        }
        if (timeWindow !== 'all') {
          const pubMs = new Date(st.updatedAt).getTime();
          const ageHours = Math.max(0, (now - pubMs) / (1000 * 60 * 60));
          if (timeWindow === 'today' && stDayKey !== todayDayKey && ageHours > 24) return false;
          if (timeWindow === 'yesterday' && stDayKey !== yesterdayDayKey) return false;
          if (timeWindow === '24h' && ageHours > 24) return false;
          if (timeWindow === '3d' && ageHours > 72) return false;
          if (timeWindow === '7d' && ageHours > 168) return false;
          if (timeWindow === 'last_week') {
            // Previous Monday to Sunday window or 7..14 days
            if (ageHours > 14 * 24) return false;
          }
          if (timeWindow === '15d' && ageHours > 15 * 24) return false;
          if (timeWindow === '25d' && ageHours > 25 * 24) return false;
          if (timeWindow === 'custom') {
            if (customStartDate && stDayKey < customStartDate) return false;
            if (customEndDate && stDayKey > customEndDate) return false;
          }
        }
        if (q) {
          const haystack = `${st.headline} ${st.whatHappened} ${st.sector} ${st.subtags.join(' ')} ${st.sources.map((s) => s.outlet).join(' ')}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'latest') {
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        }
        if (sortBy === 'sources') {
          return b.sourceCount - a.sourceCount;
        }
        if (sortBy === 'satire') {
          return b.satirePotential - a.satirePotential;
        }
        if (sortBy === 'heat') {
          const heatA = a.heatScore ?? a.sourceCount * 16 + a.importanceScore * 0.4;
          const heatB = b.heatScore ?? b.sourceCount * 16 + b.importanceScore * 0.4;
          return heatB - heatA;
        }
        if (sortBy === 'opportunity') {
          const oppA = a.satirePotential * 6 + a.importanceScore * 0.4;
          const oppB = b.satirePotential * 6 + b.importanceScore * 0.4;
          return oppB - oppA;
        }
        return b.importanceScore - a.importanceScore;
      });
  }, [
    stories,
    activeSector,
    sensitivityFilter,
    verificationFilter,
    bestForVideoOnly,
    selectedKeyword,
    selectedSparklineDayKey,
    timeWindow,
    customStartDate,
    customEndDate,
    todayDayKey,
    yesterdayDayKey,
    searchQuery,
    sortBy,
    settings.retentionDays,
  ]);

  // Phase 4 (Section 5.4): Resolve active story across active archive, permanent Starred snapshots, and Desk snapshots
  const activeStory = useMemo(
    () =>
      resolveStoryAcrossArchiveAndSnapshots(
        selectedStoryId,
        stories,
        savedList,
        desk.storySnapshots,
        Date.now(),
        settings.retentionDays || 25
      ) ||
      filteredStories[0] ||
      null,
    [stories, selectedStoryId, savedList, desk.storySnapshots, settings.retentionDays, filteredStories]
  );

  // Phase 4 (Section 5.4): Expiring soon stories (unstarred stories leaving within 3 days with high Heat, high Opportunity, or a script)
  const expiringSoonStories = useMemo(
    () =>
      getExpiringSoonStories({
        stories,
        savedList,
        scripts,
        retentionDays: settings.retentionDays || 25,
      }),
    [stories, savedList, scripts, settings.retentionDays]
  );

  const activeScript = useMemo(
    () => scripts.find((sc) => sc.id === activeScriptId) || scripts[0] || null,
    [scripts, activeScriptId]
  );

  const trendingKeywords = useMemo(() => {
    const counts = new Map<string, number>();
    stories.forEach((st) => {
      st.subtags.forEach((tag) => {
        if (tag !== 'no-joke' && tag !== 'handle-with-care') {
          counts.set(tag, (counts.get(tag) || 0) + st.sourceCount);
        }
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, weight]) => ({ tag, weight }));
  }, [stories]);

  const sectorPulseCounts = useMemo(() => {
    return SECTORS.filter((s) => s !== 'Top stories').map((sector) => ({
      sector,
      count: stories.filter(
        (st) => st.sector.toLowerCase() === sector.toLowerCase()
      ).length,
    }));
  }, [stories]);

  const firestoreUsage = useMemo(
    () =>
      estimateFirestoreUsage({
        sources: sources.length,
        articles: stories.reduce((acc, s) => acc + s.sourceCount, 0),
        stories: stories.length,
        scripts: scripts.length,
        saved: savedList.length,
        readsToday: syncMeta.estimatedReadsToday,
        writesToday: syncMeta.estimatedWritesToday,
      }),
    [sources.length, stories, scripts.length, savedList.length, syncMeta]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutModalOpen((prev) => !prev);
      } else if (e.key === 'j') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          Math.min(Math.max(0, filteredStories.length - 1), prev + 1)
        );
      } else if (e.key === 'k') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 's') {
        e.preventDefault();
        const focusedStory = filteredStories[focusedIndex] || activeStory;
        if (focusedStory) {
          handleToggleSave(focusedStory.id);
        }
      } else if (e.key === 'd') {
        e.preventDefault();
        const focusedStory = filteredStories[focusedIndex] || activeStory;
        if (focusedStory) {
          handleToggleDesk(focusedStory.id);
        }
      } else if (e.key === 'g') {
        e.preventDefault();
        const focusedStory = filteredStories[focusedIndex] || activeStory;
        if (focusedStory) {
          handleOpenScriptForStory(focusedStory);
        }
      } else if (e.key === 'o') {
        e.preventDefault();
        const focusedStory = filteredStories[focusedIndex] || activeStory;
        if (focusedStory) {
          setSelectedStoryId(focusedStory.id);
          setActiveScreen('story');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredStories, focusedIndex, activeStory]);

  const handleToggleSave = (storyId: string) => {
    const exists = savedList.some((s) => s.storyId === storyId);
    if (exists) {
      setSavedList((prev) => prev.filter((s) => s.storyId !== storyId));
      if (user) {
        deleteDoc(doc(db, 'starred', storyId)).catch((e) =>
          handleFirestoreError(e, OperationType.DELETE, `starred/${storyId}`)
        );
      }
      showToast('Removed from Starred stories');
    } else {
      const storySnapshot =
        stories.find((s) => s.id === storyId) ||
        desk.storySnapshots?.[storyId] ||
        activeStory ||
        undefined;
      const nextStarred: SavedStory = storySnapshot
        ? createStarredStorySnapshot(storySnapshot)
        : {
            storyId,
            savedAt: new Date().toISOString(),
          };
      setSavedList((prev) => [nextStarred, ...prev]);
      if (user) {
        setDoc(doc(db, 'starred', storyId), nextStarred, { merge: true }).catch((e) =>
          handleFirestoreError(e, OperationType.WRITE, `starred/${storyId}`)
        );
      }
      showToast('Starred story (permanent snapshot saved with no expiresAt)');
    }
  };

  const handleUpdateSavedNote = (storyId: string, note: string) => {
    setSavedList((prev) =>
      prev.map((item) => {
        if (item.storyId !== storyId) return item;
        const updated: SavedStory = {
          ...item,
          note,
        };
        if (user) {
          setDoc(doc(db, 'starred', storyId), updated, { merge: true }).catch((e) =>
            handleFirestoreError(e, OperationType.WRITE, `starred/${storyId}`)
          );
        }
        return updated;
      })
    );
    showToast('Saved note on starred story');
  };

  const handleRunJanitor = async (options: {
    dryRun: boolean;
    allowEarlyLiveRun?: boolean;
  }) => {
    try {
      const resp = await fetch('/api/agents/janitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retentionDays: settings.retentionDays || 25,
          keepScripts: settings.keepScripts !== false,
          dryRun: options.dryRun,
          allowEarlyLiveRun: Boolean(options.allowEarlyLiveRun),
          starredCount: savedList.length,
          deskCount: desk.storyIds.length,
          scriptsCount: scripts.length,
        }),
      });
      const data = await resp.json();
      if (data.syncMeta) {
        setSyncMeta(data.syncMeta);
      }
      if (Array.isArray(data.stories)) {
        setStories(data.stories);
      }
      if (data.report?.refusedReason) {
        showToast(data.report.refusedReason);
      } else if (data.report?.dryRun) {
        showToast(
          `Janitor dry-run complete: ${data.report.totalDeletedOrListed} expired item(s) listed; 0 starred/desk/scripts touched`
        );
      } else {
        showToast(
          `Janitor cleanup complete: ${data.report?.totalDeletedOrListed || 0} expired item(s) pruned`
        );
      }
    } catch {
      showToast('Janitor request failed');
    }
  };

  const handleToggleDesk = (storyId: string) => {
    const exists = desk.storyIds.includes(storyId);
    const nextIds = exists
      ? desk.storyIds.filter((id) => id !== storyId)
      : [...desk.storyIds, storyId].slice(0, 30);
    const nextSnapshots = { ...(desk.storySnapshots || {}) };
    if (exists) {
      delete nextSnapshots[storyId];
    } else {
      const storyObj = stories.find((s) => s.id === storyId);
      if (storyObj) {
        nextSnapshots[storyId] = storyObj;
      }
    }
    const nextDesk: DeskState = {
      ...desk,
      storyIds: nextIds,
      storySnapshots: nextSnapshots,
      updatedAt: new Date().toISOString(),
    };
    setDesk(nextDesk);
    if (user) {
      setDoc(doc(db, 'desk', user.uid), nextDesk, { merge: true }).catch((e) =>
        handleFirestoreError(e, OperationType.WRITE, `desk/${user.uid}`)
      );
    }
    showToast(
      exists ? 'Removed from Episode desk' : `Added to Episode desk (${nextIds.length})`
    );
  };

  const handleUpdateSettings = (nextSettings: UserSettings) => {
    setSettings(nextSettings);
    if (user) {
      setDoc(doc(db, 'settings', user.uid), nextSettings, { merge: true }).catch((e) =>
        handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`)
      );
    }
  };

  const handleUpdateSources = (nextSources: SourceItem[]) => {
    setSources(nextSources);
    fetch('/api/sources/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: nextSources }),
    }).catch(() => {});
  };

  const handleTriggerIngest = async () => {
    setIsIngesting(true);
    setIngestError(null);
    setLoadingOverlayInfo({
      title: 'Scout & Librarian agents are syncing live feeds...',
      subtitle: `Polling ${sources.filter((s) => s.enabled).length} enabled Indian, global, regulator & YouTube RSS feeds`,
      meta: 'Concurrency 6 · 5s per-feed timeout · 16 seen-shard deduplication · 36h clustering',
      steps: [
        'Scout agent fetching RSS/Atom feeds with conditional ETag / Last-Modified headers',
        'Deduplicating URLs against 16 seen/{0..f} shards & dropping same-source near-duplicates',
        'Librarian agent clustering coverage across outlets & rebuilding feedIndex/{dayKey}',
      ],
    });
    try {
      const resp = await fetch('/api/agents/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources,
          sectorBoosts: settings.sectorBoosts,
          retentionDays: settings.retentionDays,
          maxSourcesPerTick: 120,
          itemsPerSource: 8,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        if (Array.isArray(data.sources) && data.sources.length > 0) {
          setSources(data.sources);
        }
        if (Array.isArray(data.videos) && data.videos.length > 0) {
          setVideos(data.videos);
        }
        if (Array.isArray(data.stories) && data.stories.length > 0) {
          setStories(data.stories);
          if (!selectedStoryId && data.stories[0]) {
            setSelectedStoryId(data.stories[0].id);
          }
        }
        if (data.syncMeta) {
          setSyncMeta(data.syncMeta);
        } else {
          setSyncMeta((prev) => ({
            ...prev,
            lastSyncedAt: data.syncedAt || new Date().toISOString(),
            lastStatus: 'ok',
            articlesAdded: data.articlesAdded || 0,
            storiesUpdated: data.storiesClustered || 0,
            estimatedReadsToday: prev.estimatedReadsToday + 1,
            estimatedWritesToday: prev.estimatedWritesToday + 1,
          }));
        }
        showToast(
          data.articlesAdded > 0
            ? `Ingested ${data.articlesAdded} new articles (${data.totalStories || data.storiesClustered || stories.length} total stories)`
            : `Feeds up to date (${data.totalStories || stories.length} verified stories; ${data.duplicatesDropped || 0} duplicates skipped)`
        );
      } else {
        setIngestError(data.error || 'RSS ingestion returned an error.');
      }
    } catch {
      setIngestError('Could not reach the ingestion endpoint.');
      showToast('Ingest request failed');
    } finally {
      setIsIngesting(false);
      setLoadingOverlayInfo(null);
    }
  };

  useEffect(() => {
    if (!loadingOverlayInfo) {
      setLoadingElapsedSec(0);
      return;
    }
    setLoadingElapsedSec(0);
    const timer = setInterval(() => {
      setLoadingElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [loadingOverlayInfo]);

  const handleRefreshSummary = async (story: StoryCluster) => {
    setIsSummarising(true);
    setLoadingOverlayInfo({
      title: 'Gemini is summarising & fact-checking this story...',
      subtitle: story.headline,
      meta: `${story.sector} · ${story.sources.length} verified ${
        story.sources.length === 1 ? 'source' : 'sources'
      }`,
      steps: [
        `Reading ${story.sources.length} clustered source article(s) and indexing [S1..S${story.sources.length}]`,
        'Extracting verified key facts, key numbers, timeline, and stakeholder stances',
        'Generating comedy angles & YouTube creator packaging with Gemini',
      ],
    });
    try {
      const resp = await fetch('/api/summarise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });
      const data = await resp.json();
      if (data.ok && data.summary) {
        const updatedStory: StoryCluster = {
          ...story,
          ...data.summary,
          summarised: true,
          updatedAt: new Date().toISOString(),
        };
        setStories((prev) =>
          prev.map((s) => (s.id === story.id ? updatedStory : s))
        );
        setSyncMeta((prev) => ({
          ...prev,
          aiCallsToday: (prev.aiCallsToday || 0) + 1,
        }));
        showToast(`Summary verified (${data.groundingMode})`);
      } else {
        showToast(data.error || 'Summary pending');
      }
    } catch {
      showToast('Summary request failed');
    } finally {
      setIsSummarising(false);
      setLoadingOverlayInfo(null);
    }
  };

  const handleGenerateNewScript = async (params: {
    stories: StoryCluster[];
    language: ScriptLanguage;
    runtimeTarget: ScriptRuntimeTarget;
    tone: ScriptTone;
    format: ScriptFormat;
    isNeutralBriefing: boolean;
  }) => {
    if (params.stories.length === 0) {
      showToast('Ingest and select at least one real story first');
      return;
    }
    const totalSourcesCount = params.stories.reduce(
      (sum, st) => sum + (st.sources?.length || 0),
      0
    );
    setIsGeneratingScript(true);
    setLoadingOverlayInfo({
      title: params.isNeutralBriefing
        ? 'Gemini is drafting a YouTuber-style factual explainer...'
        : 'Gemini is improvising your YouTuber satire script...',
      subtitle:
        params.stories.length === 1
          ? params.stories[0].headline
          : `${params.stories.length} stories from Episode Desk: ${params.stories
              .map((s) => s.headline.slice(0, 42))
              .join(' · ')}`,
      meta: `${params.language} · ${params.runtimeTarget} · ${
        params.isNeutralBriefing ? 'Neutral Explainer (No-Joke)' : `${params.tone} YouTuber tone`
      } · ${params.format} · ${totalSourcesCount} verified source(s)`,
      steps: [
        `Indexing ${totalSourcesCount} verified source article(s) as [S1]..[S${Math.max(1, totalSourcesCount)}]`,
        `Improvising direct-to-camera YouTuber Hook, Kya Scene Hai (Story Breakdown), Satire Turn & Comment-Bait Outro in ${params.language}`,
        'Running Fact-Checker pass to attach [S#] citations to every factual claim & build Fact Box',
      ],
    });
    try {
      const resp = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          doNotJokeAbout: settings.doNotJokeAbout,
          mode: 'full',
        }),
      });
      const data = await resp.json();
      if (data.ok && data.script) {
        const runtimeSecMap: Record<ScriptRuntimeTarget, number> = {
          '60s Short': 60,
          '3 min': 180,
          '8 min': 480,
          '12 min': 720,
        };
        const created: ScriptRecord = {
          id: `script_${Date.now()}`,
          title: data.script.title,
          storyIds: params.stories.map((s) => s.id),
          format: params.format,
          language: params.language,
          tone: params.tone,
          runtimeTarget: params.runtimeTarget,
          runtimeTargetSec: runtimeSecMap[params.runtimeTarget] || 480,
          status: 'Draft',
          isNeutralBriefing: params.isNeutralBriefing,
          sections: data.script.sections,
          factBox: data.script.factBox,
          versions: [
            {
              id: `ver_${Date.now()}`,
              savedAt: new Date().toISOString(),
              label: 'v1.0 — Grounded draft',
              sections: data.script.sections,
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setScripts((prev) => [created, ...prev]);
        setActiveScriptId(created.id);
        setSyncMeta((prev) => ({
          ...prev,
          aiCallsToday: (prev.aiCallsToday || 0) + 1,
        }));
        setActiveScreen('script');
        showToast('Generated grounded script with verified [S#] citations');
      } else {
        showToast(data.error || 'Script generation paused');
      }
    } catch {
      showToast('Script generation failed');
    } finally {
      setIsGeneratingScript(false);
      setLoadingOverlayInfo(null);
    }
  };

  const handleOpenScriptForStory = (story: StoryCluster) => {
    handleGenerateNewScript({
      stories: [story],
      language: settings.defaultLanguage,
      runtimeTarget: settings.defaultRuntime,
      tone: settings.defaultTone,
      format: settings.defaultFormat,
      isNeutralBriefing: story.sensitivity === 'no-joke',
    });
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in with Google');
    } catch {
      showToast('Sign-in cancelled');
    }
  };

  const handleExportAllJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      owner: ALLOWED_OWNER_EMAIL,
      stories,
      sources,
      scripts,
      desk,
      savedList,
      settings,
      syncMeta,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `satire_news_desk_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported desk JSON backup');
  };

  const handleDeleteAllData = () => {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    setStories([]);
    setSources(SEED_SOURCES);
    setScripts([]);
    setDesk(SEED_DESK);
    setSavedList([]);
    setSettings(SEED_SETTINGS);
    setSyncMeta(SEED_SYNC_META);
    showToast('All local desk data deleted');
  };

  const syncLabel = useMemo(() => {
    if (isIngesting) return 'Ingesting feeds...';
    if (!syncMeta.lastSyncedAt) return 'Not synced yet';
    const mins = Math.max(
      0,
      Math.round((Date.now() - new Date(syncMeta.lastSyncedAt).getTime()) / 60000)
    );
    return mins === 0 ? 'Synced just now' : `Synced ${mins}m ago`;
  }, [isIngesting, syncMeta.lastSyncedAt]);

  // Section 11.1 Left sidebar items (Sentence-case labels with icons; small counts only on Desk and Starred)
  const navItems: {
    id: Exclude<NavScreen, 'story'>;
    label: string;
    icon: React.FC<any>;
    count?: number;
  }[] = [
    { id: 'today', label: 'Today', icon: LayoutDashboard },
    { id: 'feed', label: 'Feed', icon: Newspaper },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'script', label: 'Script studio', icon: Sparkles },
    {
      id: 'desk',
      label: 'Episode desk',
      icon: ListFilter,
      count: desk.storyIds.length || undefined,
    },
    {
      id: 'saved',
      label: 'Starred',
      icon: Bookmark,
      count: savedList.length || undefined,
    },
    { id: 'newsroom', label: 'Newsroom', icon: Activity },
    { id: 'sources', label: 'Sources', icon: Rss },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const newsroomAgents = [
    {
      id: 'scout',
      name: 'Scout',
      role: 'Fetch and normalise feeds, dedupe',
      usesAi: 'No',
      cadence: 'Every tick (15m)',
      itemsProcessed: syncMeta.articlesAdded,
      aiCalls: 0,
    },
    {
      id: 'librarian',
      name: 'Librarian',
      role: 'Cluster stories, set dayKey, write feedIndex and seen',
      usesAi: 'No',
      cadence: 'After Scout',
      itemsProcessed: syncMeta.storiesUpdated,
      aiCalls: 0,
    },
    {
      id: 'trend_analyst',
      name: 'Trend analyst',
      role: 'Daily stats, heat signals, rising topics, topic threads',
      usesAi: 'No',
      cadence: 'Every few ticks',
      itemsProcessed: trendingKeywords.length,
      aiCalls: 0,
    },
    {
      id: 'researcher',
      name: 'Researcher',
      role: 'Batch summaries, verification, sensitivity, satire score',
      usesAi: 'Yes (35% budget)',
      cadence: 'After Librarian, top stories first',
      itemsProcessed: stories.filter((s) => s.summarised).length,
      aiCalls: syncMeta.aiCallsToday || 0,
    },
    {
      id: 'fact_checker',
      name: 'Fact-checker',
      role: 'Re-check summaries and scripts against stored sources',
      usesAi: 'Yes (10% budget)',
      cadence: 'After Researcher; on demand',
      itemsProcessed: scripts.length,
      aiCalls: 0,
    },
    {
      id: 'comedy_room',
      name: 'Comedy room',
      role: "Comedy angles for top 10 stories and Today's picks reasons",
      usesAi: 'Yes (15% budget)',
      cadence: 'Morning and evening',
      itemsProcessed: stories.filter((s) => s.comedyAngles.length > 0).length,
      aiCalls: 0,
    },
    {
      id: 'script_writer',
      name: 'Script writer',
      role: 'Script from a story, the desk, or a week',
      usesAi: 'Yes (on demand)',
      cadence: 'On demand; pre-drafts for top picks',
      itemsProcessed: scripts.length,
      aiCalls: 0,
    },
    {
      id: 'producer',
      name: 'Producer',
      role: 'Titles, thumbnail text, graphic cards, description, run-sheet',
      usesAi: 'Yes (lazy, cached)',
      cadence: 'On first open',
      itemsProcessed: stories.filter((s) => s.videoIdeas.titles.length > 0).length,
      aiCalls: 0,
    },
    {
      id: 'weekly_producer',
      name: 'Weekly producer',
      role: 'Sunday weekly roundup package and next-week candidates',
      usesAi: 'Yes (5% budget)',
      cadence: 'Sunday 18:00 IST',
      itemsProcessed: 0,
      aiCalls: 0,
    },
    {
      id: 'janitor',
      name: 'Janitor',
      role: '25-day retention, storage, quota and health checks',
      usesAi: 'No',
      cadence: 'Daily (dry-run first 3 days)',
      itemsProcessed: syncMeta.lastJanitorReport?.totalDeletedOrListed || 0,
      aiCalls: 0,
    },
    {
      id: 'desk_editor',
      name: 'Desk editor',
      role: "Orders work, enforces budgets, builds Today's picks",
      usesAi: 'No',
      cadence: 'Every tick',
      itemsProcessed: stories.length,
      aiCalls: 0,
    },
  ];

  const todaysPicks = useMemo(() => {
    return [...stories]
      .filter((s) => s.sensitivity !== 'no-joke')
      .sort((a, b) => {
        const oppA =
          0.35 * (a.heatScore ?? 45) +
          0.3 * (a.satirePotential * 10) +
          0.2 * a.importanceScore +
          0.15 * (a.verification === 'verified' ? 100 : 50);
        const oppB =
          0.35 * (b.heatScore ?? 45) +
          0.3 * (b.satirePotential * 10) +
          0.2 * b.importanceScore +
          0.15 * (b.verification === 'verified' ? 100 : 50);
        return oppB - oppA;
      })
      .slice(0, 6);
  }, [stories]);

  // Sparkline bars for the last 14 days in the archive (Section 9.1)
  const sparklineDays = useMemo(() => {
    const countsByDay = new Map<string, number>();
    for (const st of stories) {
      const dk = st.dayKey || toDayKeyInTz(st.updatedAt);
      countsByDay.set(dk, (countsByDay.get(dk) || 0) + 1);
    }
    const days: { dayKey: string; label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dk = toDayKeyInTz(dt.toISOString());
      const label = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      days.push({
        dayKey: dk,
        label,
        count: countsByDay.get(dk) || 0,
      });
    }
    return days;
  }, [stories]);

  // Day-grouped stories for the Feed screen (Section 9.1 & 11.3: 'Saturday, 14 Nov, 41 stories')
  const groupedFeedStories = useMemo(() => {
    const visibleSlice = filteredStories.slice(0, feedVisibleCount);
    const groups = new Map<string, { dayKey: string; totalInDay: number; stories: StoryCluster[] }>();
    const totalCounts = new Map<string, number>();

    for (const st of filteredStories) {
      const dk = st.dayKey || toDayKeyInTz(st.updatedAt);
      totalCounts.set(dk, (totalCounts.get(dk) || 0) + 1);
    }

    for (const st of visibleSlice) {
      const dk = st.dayKey || toDayKeyInTz(st.updatedAt);
      const existing = groups.get(dk);
      if (existing) {
        existing.stories.push(st);
      } else {
        groups.set(dk, {
          dayKey: dk,
          totalInDay: totalCounts.get(dk) || 1,
          stories: [st],
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  }, [filteredStories, feedVisibleCount]);

  // Three stories per sector for the Today screen (Section 11.3)
  const sectorDigests = useMemo(() => {
    return SECTORS.filter((sec) => sec !== 'Top stories')
      .map((sector) => {
        const sectorStories = stories
          .filter((st) => st.sector.toLowerCase() === sector.toLowerCase())
          .sort((a, b) => b.importanceScore - a.importanceScore);
        return {
          sector,
          totalCount: sectorStories.length,
          topThree: sectorStories.slice(0, 3),
        };
      })
      .filter((group) => group.totalCount > 0);
  }, [stories]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      {toastMessage && (
        <div className="fixed bottom-16 md:bottom-5 right-5 z-50 px-4 py-2.5 rounded-[10px] bg-[#3D5AFE] text-white text-xs font-medium shadow-md">
          {toastMessage}
        </div>
      )}

      {/* Full-Screen AI Task Loading Overlay */}
      {loadingOverlayInfo && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label={loadingOverlayInfo.title}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full desk-card p-6 space-y-5 shadow-2xl border-[#3D5AFE]/50">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[10px] bg-[#3D5AFE]/15 border border-[#3D5AFE]/40 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-[#3D5AFE] animate-pulse" strokeWidth={1.5} />
                </div>
                <div>
                  <span className="text-[11px] font-mono-label text-[#3D5AFE] font-semibold">
                    GEMINI NEWSROOM AGENT ACTIVE
                  </span>
                  <h2 className="font-serif-headline text-lg font-semibold text-[var(--text-primary)] leading-snug">
                    {loadingOverlayInfo.title}
                  </h2>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] font-mono-label text-xs text-[var(--text-secondary)] shrink-0">
                {loadingElapsedSec}s
              </span>
            </div>

            <div className="p-3.5 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-1">
              <div className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2">
                {loadingOverlayInfo.subtitle}
              </div>
              <div className="text-[11px] font-mono-label text-[var(--text-secondary)]">
                {loadingOverlayInfo.meta}
              </div>
            </div>

            <div className="space-y-2.5">
              {loadingOverlayInfo.steps.map((step, idx) => {
                const activeStepIdx =
                  loadingElapsedSec < 4
                    ? 0
                    : loadingElapsedSec < 25
                      ? 1
                      : Math.min(loadingOverlayInfo.steps.length - 1, 2);
                const isDone = idx < activeStepIdx;
                const isCurrent = idx === activeStepIdx;
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 p-2.5 rounded-[8px] border text-xs transition-colors ${
                      isCurrent
                        ? 'border-[#3D5AFE]/50 bg-[#3D5AFE]/10 text-[var(--text-primary)] font-medium'
                        : isDone
                          ? 'border-[#3F9E6B]/30 bg-[#3F9E6B]/5 text-[var(--text-secondary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-muted)]'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-[#3F9E6B] shrink-0 mt-0.5" strokeWidth={1.5} />
                    ) : isCurrent ? (
                      <RefreshCw className="w-4 h-4 text-[#3D5AFE] animate-spin shrink-0 mt-0.5" strokeWidth={1.5} />
                    ) : (
                      <Clock className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" strokeWidth={1.5} />
                    )}
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-[var(--bg-raised)] overflow-hidden">
                <div
                  className="h-full bg-[#3D5AFE] transition-all duration-500"
                  style={{
                    width: `${Math.min(96, 15 + Math.round(loadingElapsedSec * 1.8))}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] text-center">
                Gemini is writing all sections and attaching verified [S#] source citations (typically 25–45s)...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar (56 px — Section 11.1: logo, global search (/), sync and health pill, episode button, theme toggle, profile menu) */}
      <header className="sticky top-0 z-40 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setActiveScreen('today')}
          className="flex items-center gap-2.5 text-left cursor-pointer shrink-0"
        >
          <span className="w-7 h-7 rounded-[8px] bg-[#3D5AFE] text-white text-xs font-semibold flex items-center justify-center">
            SN
          </span>
          <span className="font-serif-headline text-base font-semibold text-[var(--text-primary)] hidden sm:inline whitespace-nowrap">
            Satire News Desk
          </span>
        </button>

        {/* Global Search (/) */}
        <div className="relative flex-1 max-w-md min-w-0">
          <Search
            className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.5}
          />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search stories, outlets, or type 'pichle hafte ki politics news' ( / )..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (activeScreen !== 'today' && activeScreen !== 'feed') {
                setActiveScreen('feed');
              }
            }}
            className="w-full h-9 pl-9 pr-8 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#3D5AFE] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Sync & Health Pill, Episode Button, Theme Toggle, Profile Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTriggerIngest}
            disabled={isIngesting}
            title="Fetch live RSS feeds now"
            className="h-9 px-2.5 sm:px-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-secondary)] inline-flex items-center gap-2 cursor-pointer transition-colors duration-150"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isIngesting
                  ? 'bg-[#C9922E]'
                  : syncMeta.lastSyncedAt
                    ? 'bg-[#3F9E6B]'
                    : 'bg-[var(--text-muted)]'
              }`}
            />
            <span className="hidden lg:inline whitespace-nowrap">{syncLabel}</span>
            <RefreshCw
              className={`w-3.5 h-3.5 ${isIngesting ? 'animate-spin' : ''}`}
              strokeWidth={1.5}
            />
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('desk')}
            className="h-9 px-2.5 sm:px-3 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-150"
          >
            <span className="hidden sm:inline">Desk</span>
            <span className="px-1.5 py-0.5 rounded bg-black/20 font-mono-label text-[11px]">
              {desk.storyIds.length}
            </span>
          </button>

          <button
            type="button"
            aria-label="Toggle theme"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                theme: prev.theme === 'dark' ? 'light' : 'dark',
                updatedAt: new Date().toISOString(),
              }))
            }
            className="h-9 w-9 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] flex items-center justify-center cursor-pointer transition-colors duration-150"
          >
            {settings.theme === 'dark' ? (
              <Sun className="w-4 h-4 text-[#C9922E]" strokeWidth={1.5} />
            ) : (
              <Moon className="w-4 h-4 text-[#3D5AFE]" strokeWidth={1.5} />
            )}
          </button>

          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutModalOpen(true)}
            className="h-9 w-9 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] hidden sm:flex items-center justify-center cursor-pointer transition-colors duration-150"
          >
            <Keyboard className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => firebaseSignOut(auth)}
              title={`Signed in as ${user.email}`}
              className="h-9 px-2.5 rounded-[10px] border border-[#3F9E6B]/50 bg-[#3F9E6B]/10 text-[#3F9E6B] text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span className="hidden xl:inline truncate max-w-[100px]">
                {user.email?.split('@')[0]}
              </span>
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="h-9 px-2.5 sm:px-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-150"
            >
              <LogIn className="w-3.5 h-3.5 text-[#3D5AFE]" strokeWidth={1.5} />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          )}
        </div>
      </header>

      {/* Body Layout: Left Sidebar (220px or 64px collapsed on md+) + Main Content */}
      <div className="flex-1 flex min-w-0">
        <aside
          aria-label="Primary sidebar navigation"
          className={`hidden md:flex flex-col justify-between shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 transition-all duration-150 ${
            sidebarCollapsed ? 'w-[64px]' : 'w-[220px]'
          }`}
        >
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeScreen === item.id ||
                (activeScreen === 'story' && item.id === previousFeedScreen);
              return (
                <button
                  key={item.id}
                  type="button"
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => {
                    if (item.id === 'today' || item.id === 'feed') {
                      setPreviousFeedScreen(item.id);
                    }
                    setActiveScreen(item.id);
                  }}
                  className={`w-full min-h-[42px] px-3 py-2 rounded-[10px] text-sm font-medium flex items-center ${
                    sidebarCollapsed ? 'justify-center' : 'justify-between'
                  } transition-colors duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-[#3D5AFE] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={1.5} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!sidebarCollapsed && item.count !== undefined && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-mono-label ${
                        isActive
                          ? 'bg-black/25 text-white'
                          : 'bg-[var(--bg-raised)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Collapse / Expand Sidebar Toggle (Section 11.1) */}
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-full min-h-[40px] px-3 py-2 rounded-[10px] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] flex items-center justify-center gap-2 cursor-pointer"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
                  <span>Collapse sidebar</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main Content Container (max 1,200 px, centred, 24 to 32 px padding — Section 11.1) */}
        <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10 min-w-0">
          {/* Sector Chip Row appears ONLY on Today and Feed (Section 11.1) */}
          {(activeScreen === 'today' || activeScreen === 'feed') && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-5 border-b border-[var(--border-subtle)]">
              {SECTORS.map((sector) => {
                const isSelected =
                  activeSector.toLowerCase() === sector.toLowerCase();
                const count =
                  sector === 'Top stories'
                    ? stories.length
                    : stories.filter(
                        (s) => s.sector.toLowerCase() === sector.toLowerCase()
                      ).length;
                return (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => {
                      setActiveSector(sector);
                      setSelectedKeyword(null);
                    }}
                    className={`min-h-[36px] px-3 py-1 rounded-[10px] text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-[#3D5AFE] text-white'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    {sector}
                    {count > 0 ? ` (${count})` : ''}
                  </button>
                );
              })}
            </div>
          )}

          {/* SCREEN ROUTING */}
          {activeScreen === 'story' ? (
            activeStory ? (
              <StoryPageView
                story={activeStory}
                isSaved={savedList.some((s) => s.storyId === activeStory.id)}
                isOnDesk={desk.storyIds.includes(activeStory.id)}
                isSummarising={isSummarising}
                onBack={() => setActiveScreen(previousFeedScreen)}
                onToggleSave={handleToggleSave}
                onToggleDesk={handleToggleDesk}
                onGenerateScript={handleOpenScriptForStory}
                onRefreshSummary={handleRefreshSummary}
              />
            ) : (
              <div className="desk-card p-8 text-center space-y-3">
                <h2 className="font-serif-headline text-xl font-semibold text-[var(--text-primary)]">
                  No story selected
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Run live RSS ingestion first, then click any story headline to open its two-column brief.
                </p>
                <button
                  type="button"
                  onClick={handleTriggerIngest}
                  disabled={isIngesting}
                  className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#3D5AFE] text-white text-xs font-medium cursor-pointer"
                >
                  {isIngesting ? 'Ingesting real feeds...' : 'Run live RSS ingest'}
                </button>
              </div>
            )
          ) : activeScreen === 'trends' ? (
            /* TRENDS PAGE (Section 8.3 & 11.3: Three calm panels: Rising topics, Topic threads, Sector pulse) */
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    25-day rolling signal analysis · Computed without AI
                  </span>
                  <h1 className="font-serif-headline text-2xl font-semibold text-[var(--text-primary)]">
                    Trends, rising topics, and sector pulse
                  </h1>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  Heat estimates topic velocity across news and search; it does not predict video views.
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Panel 1: Rising topics */}
                <section className="desk-card p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Rising topics today
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Entities and keywords with the highest mention velocity against the trailing baseline.
                  </p>
                  {trendingKeywords.length === 0 ? (
                    <div className="p-6 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-center text-xs text-[var(--text-secondary)]">
                      No rising topics yet. Run live RSS ingestion to extract Hindi and English entities.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {trendingKeywords.map((kw, i) => (
                        <button
                          key={kw.tag}
                          type="button"
                          onClick={() => {
                            setSelectedKeyword(kw.tag);
                            setActiveScreen('feed');
                          }}
                          className="w-full p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] hover:border-[#3D5AFE] flex items-center justify-between text-xs cursor-pointer"
                        >
                          <span className="font-medium text-[var(--text-primary)]">
                            {i + 1}. {kw.tag}
                          </span>
                          <span className="font-mono-label text-[var(--text-secondary)]">
                            {kw.weight} mentions
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {/* Panel 2: Topic threads */}
                <section className="desk-card p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Ongoing topic threads
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Multi-source stories linked across days for callbacks in scripts.
                  </p>
                  {stories.filter((s) => s.sourceCount >= 2).length === 0 ? (
                    <div className="p-6 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-center text-xs text-[var(--text-secondary)]">
                      Multi-outlet story sagas appear here once feeds are ingested.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {stories
                        .filter((s) => s.sourceCount >= 2)
                        .slice(0, 6)
                        .map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              setSelectedStoryId(st.id);
                              setActiveScreen('story');
                            }}
                            className="w-full text-left p-3 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] hover:border-[#3D5AFE] space-y-1 cursor-pointer"
                          >
                            <div className="text-xs font-medium text-[var(--text-primary)] line-clamp-1">
                              {st.headline}
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)]">
                              {st.sector} · {st.sourceCount} sources
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </section>

                {/* Panel 3: Sector pulse */}
                <section className="desk-card p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Sector pulse
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Active story distribution across all 16 newsroom beats.
                  </p>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {sectorPulseCounts.map((item) => {
                      const max = Math.max(1, ...sectorPulseCounts.map((x) => x.count));
                      const widthPct = Math.round((item.count / max) * 100);
                      return (
                        <div key={item.sector} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-primary)]">{item.sector}</span>
                            <span className="font-mono-label text-[var(--text-secondary)]">
                              {item.count}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[var(--bg-raised)] overflow-hidden">
                            <div
                              className="h-full bg-[#3D5AFE]"
                              style={{ width: `${item.count > 0 ? Math.max(6, widthPct) : 0}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          ) : activeScreen === 'newsroom' ? (
            /* NEWSROOM PAGE (Section 7.4: Quiet table of agents + budget bar at top) */
            <div className="space-y-6">
              <section className="desk-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <span className="text-xs text-[var(--text-secondary)]">
                      Deterministic background orchestrator · Level 1 production ({settings.aiDailyLimit || 20} daily AI limit, 25% owner reserve)
                    </span>
                    <h1 className="font-serif-headline text-2xl font-semibold text-[var(--text-primary)] mt-0.5">
                      Newsroom agents
                    </h1>
                  </div>

                  <button
                    type="button"
                    onClick={handleTriggerIngest}
                    disabled={isIngesting}
                    className="min-h-[42px] px-4 py-2 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
                    {isIngesting ? 'Running tick...' : 'Run tick now'}
                  </button>
                </div>

                {/* Budget Bar at the Top (Section 7.4) */}
                <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-primary)]">
                        Daily AI budget (resets midnight Pacific)
                      </span>
                      <span className="font-mono-label text-[var(--text-secondary)]">
                        {syncMeta.aiCallsToday || 0} of {settings.aiDailyLimit || 20} calls used (25% reserved for your clicks)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
                      <div
                        className="h-full bg-[#3D5AFE]"
                        style={{
                          width: `${Math.max(
                            4,
                            Math.min(
                              100,
                              Math.round(
                                ((syncMeta.aiCallsToday || 0) /
                                  (settings.aiDailyLimit || 20)) *
                                  100
                              )
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quiet Agent Table (Section 7.4) */}
                <div className="overflow-x-auto rounded-[10px] border border-[var(--border-subtle)]">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-secondary)]">
                        <th className="p-3 font-medium">Agent</th>
                        <th className="p-3 font-medium">Role</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium">Last run</th>
                        <th className="p-3 font-medium">Next due</th>
                        <th className="p-3 font-medium">Processed</th>
                        <th className="p-3 font-medium">AI calls</th>
                        <th className="p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {newsroomAgents.map((ag) => {
                        const isPaused = Boolean(pausedAgents[ag.id]);
                        const statusLabel = isPaused
                          ? 'paused'
                          : isIngesting && (ag.id === 'scout' || ag.id === 'librarian')
                            ? 'running'
                            : 'idle';
                        return (
                          <tr key={ag.id} className="hover:bg-[var(--bg-raised)]/50">
                            <td className="p-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                              {ag.name}
                            </td>
                            <td className="p-3 text-xs text-[var(--text-secondary)]">
                              {ag.role}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-[6px] text-xs font-medium ${
                                  statusLabel === 'running'
                                    ? 'bg-[#C9922E]/15 text-[#C9922E]'
                                    : statusLabel === 'paused'
                                      ? 'bg-[var(--bg-raised)] text-[var(--text-muted)]'
                                      : 'bg-[#3F9E6B]/15 text-[#3F9E6B]'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className="p-3 font-mono-label text-xs text-[var(--text-secondary)] whitespace-nowrap">
                              {syncMeta.lastSyncedAt
                                ? new Date(syncMeta.lastSyncedAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td className="p-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                              {ag.cadence}
                            </td>
                            <td className="p-3 font-mono-label text-xs text-[var(--text-primary)]">
                              {ag.itemsProcessed}
                            </td>
                            <td className="p-3 font-mono-label text-xs text-[var(--text-primary)]">
                              {ag.aiCalls}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleTriggerIngest}
                                  className="px-2.5 py-1 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-primary)] cursor-pointer"
                                >
                                  Run now
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPausedAgents((prev) => ({
                                      ...prev,
                                      [ag.id]: !prev[ag.id],
                                    }))
                                  }
                                  className="px-2.5 py-1 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-secondary)] cursor-pointer"
                                >
                                  {isPaused ? 'Resume' : 'Pause'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* External Scheduler Setup Guide (Section 7.1) */}
                <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        External scheduler setup (15-minute autonomous tick)
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Cloud Run scales to zero when idle. Use GitHub Actions or cron-job.org to POST to{' '}
                        <code className="font-mono-label text-[var(--text-primary)]">/api/agents/tick</code>{' '}
                        every 15 minutes with constant-time <code className="font-mono-label text-[var(--text-primary)]">x-cron-secret</code> verification.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          `curl -X POST "${window.location.origin}/api/agents/tick" -H "x-cron-secret: YOUR_CRON_SECRET" -H "Content-Type: application/json"`
                        );
                        showToast('Copied scheduler cURL command');
                      }}
                      className="px-3 py-1.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                    >
                      Copy cURL command
                    </button>
                  </div>

                  <pre className="p-3 rounded-[8px] bg-[var(--bg-base)] border border-[var(--border-subtle)] font-mono-label text-[11px] text-[var(--text-secondary)] overflow-x-auto">
{`# .github/workflows/newsroom-tick.yml
name: Satire News Desk 15m Tick
on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Scout & Librarian Tick
        run: |
          curl -fsS -X POST "${window.location.origin}/api/agents/tick" \\
            -H "x-cron-secret: \${{ secrets.CRON_SECRET }}" \\
            -H "Content-Type: application/json"`}
                  </pre>
                </div>
              </section>
            </div>
          ) : activeScreen === 'script' ? (
            activeScript ? (
              <ScriptStudioView
                activeScript={activeScript}
                allScripts={scripts}
                stories={stories}
                deskStoryIds={desk.storyIds}
                defaultWpm={settings.wpm}
                doNotJokeAbout={settings.doNotJokeAbout}
                isGenerating={isGeneratingScript}
                onSelectScript={(sc) => setActiveScriptId(sc.id)}
                onUpdateScript={(updated) =>
                  setScripts((prev) =>
                    prev.map((sc) => (sc.id === updated.id ? updated : sc))
                  )
                }
                onGenerateNewScript={handleGenerateNewScript}
              />
            ) : (
              <div className="desk-card p-8 text-center space-y-3">
                <h2 className="font-serif-headline text-xl font-semibold text-[var(--text-primary)]">
                  No scripts drafted yet
                </h2>
                <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
                  Ingest real stories from your feeds, then generate a grounded script from any story row or from the Episode desk.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveScreen('today')}
                    className="min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                  >
                    Go to Today
                  </button>
                  {stories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenScriptForStory(stories[0])}
                      disabled={isGeneratingScript}
                      className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#3D5AFE] text-white text-xs font-medium cursor-pointer"
                    >
                      {isGeneratingScript ? 'Generating...' : 'Draft script from top story'}
                    </button>
                  )}
                </div>
              </div>
            )
          ) : activeScreen === 'desk' ? (
            <EpisodeBoardView
              desk={desk}
              stories={stories}
              onUpdateDesk={setDesk}
              onOpenStory={(st) => {
                setSelectedStoryId(st.id);
                setActiveScreen('story');
              }}
              onGenerateEpisodeScript={() => {
                const deskStories = stories.filter((s) =>
                  desk.storyIds.includes(s.id)
                );
                handleGenerateNewScript({
                  stories: deskStories,
                  language: settings.defaultLanguage,
                  runtimeTarget: settings.defaultRuntime,
                  tone: settings.defaultTone,
                  format: settings.defaultFormat,
                  isNeutralBriefing: deskStories.some(
                    (s) => s.sensitivity === 'no-joke'
                  ),
                });
              }}
            />
          ) : activeScreen === 'saved' ? (
            <SavedStoriesView
              savedList={savedList}
              stories={stories}
              scripts={scripts}
              retentionDays={settings.retentionDays || 25}
              initialTab={savedSubTab}
              onOpenStory={(st) => {
                setSelectedStoryId(st.id);
                setActiveScreen('story');
              }}
              onRemoveSaved={handleToggleSave}
              onStarStory={(st) => handleToggleSave(st.id)}
              onUpdateSavedNote={handleUpdateSavedNote}
              onAddToDesk={handleToggleDesk}
            />
          ) : activeScreen === 'sources' ? (
            <SourcesManagerView
              sources={sources}
              onUpdateSources={handleUpdateSources}
              onTriggerIngest={handleTriggerIngest}
              isIngesting={isIngesting}
            />
          ) : activeScreen === 'settings' ? (
            <SettingsView
              settings={settings}
              usage={firestoreUsage}
              aiCallsToday={syncMeta.aiCallsToday || 0}
              collectionCounts={{
                stories: filteredStories.length,
                feedIndexDays: feedIndexDaysCount || sparklineDays.filter((d) => d.count > 0).length,
                seenEntries: seenEntriesCount || stories.reduce((acc, s) => acc + s.sourceCount, 0),
                starred: savedList.length,
                scripts: scripts.length,
                deskSnapshots: desk.storyIds.length,
              }}
              lastJanitorReport={syncMeta.lastJanitorReport}
              onRunJanitor={handleRunJanitor}
              onUpdateSettings={handleUpdateSettings}
              onExportAllJson={handleExportAllJson}
              onDeleteAllData={handleDeleteAllData}
            />
          ) : (
            /* TODAY & FEED VIEWS (Section 11.1 & 11.3) */
            <div className="flex flex-col xl:flex-row items-start gap-6">
              <div className="flex-1 w-full min-w-0 space-y-5">
                {/* Today Morning Greeting & Summary Header (Section 11.3: only on Today) */}
                {activeScreen === 'today' && (
                  <section className="desk-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <span className="text-xs text-[var(--text-secondary)]">
                        Morning desk briefing · {new Date().toLocaleDateString('en-IN', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <h1 className="font-serif-headline text-2xl font-semibold text-[var(--text-primary)]">
                        {filteredStories.length > 0
                          ? `${filteredStories.length} verified stories in the ${settings.retentionDays || 25}-day rolling archive`
                          : 'Ready for morning feed ingestion'}
                      </h1>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {todaysPicks.length > 0
                          ? `Top ${todaysPicks.length} picks ranked by Opportunity (Heat, Satire potential, freshness, and verification).`
                          : 'Fetch live RSS feeds to populate Today’s picks, sector digests, and comedy angles.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleTriggerIngest}
                        disabled={isIngesting}
                        className="min-h-[42px] px-4 py-2 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isIngesting ? 'animate-spin' : ''}`}
                          strokeWidth={1.5}
                        />
                        {isIngesting ? 'Fetching feeds...' : 'Run live ingest'}
                      </button>

                      {/* Toggle Right Panel on xl+ */}
                      <button
                        type="button"
                        onClick={() => setRightRailOpen((r) => !r)}
                        title={rightRailOpen ? 'Hide right panel' : 'Show right panel'}
                        className="hidden xl:inline-flex min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-secondary)] items-center gap-1.5 cursor-pointer"
                      >
                        {rightRailOpen ? (
                          <PanelRightClose className="w-4 h-4" strokeWidth={1.5} />
                        ) : (
                          <PanelRightOpen className="w-4 h-4" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                  </section>
                )}

                {/* Phase 4 (Section 5.4): Quiet Expiring Soon Banner on Today */}
                {activeScreen === 'today' && (
                  <section
                    aria-label="Expiring soon archive notice"
                    className="desk-card px-4 py-3 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Clock className="w-3.5 h-3.5 text-[#C9922E] shrink-0" strokeWidth={1.5} />
                        {expiringSoonStories.length > 0 ? (
                          <span>
                            <strong className="text-[var(--text-primary)]">
                              {expiringSoonStories.length} high-Heat or scripted{' '}
                              {expiringSoonStories.length === 1 ? 'story is' : 'stories are'} expiring within 3 days
                            </strong>{' '}
                            — Star to keep a permanent snapshot before {settings.retentionDays || 25}-day TTL cleanup.
                          </span>
                        ) : (
                          <span>
                            <strong className="text-[var(--text-primary)]">
                              Expiring soon (0 stories within 3 days)
                            </strong>{' '}
                            · {settings.retentionDays || 25}-day rolling retention active ·{' '}
                            {savedList.length} starred {savedList.length === 1 ? 'snapshot' : 'snapshots'} saved forever.
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {expiringSoonStories.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpiringDrawerOpen((o) => !o)}
                            className="px-2.5 py-1 rounded-[6px] border border-[#C9922E]/40 bg-[#C9922E]/10 text-[#C9922E] font-medium cursor-pointer"
                          >
                            {expiringDrawerOpen ? 'Hide list' : 'Review & Star'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSavedSubTab('expiring');
                            setActiveScreen('saved');
                          }}
                          className="text-[#3D5AFE] hover:underline font-medium cursor-pointer"
                        >
                          Open Expiring soon view →
                        </button>
                      </div>
                    </div>

                    {expiringDrawerOpen && expiringSoonStories.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                        {expiringSoonStories.slice(0, 5).map(({ story, daysRemaining, hoursRemaining, reason }) => (
                          <div
                            key={story.id}
                            className="p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStoryId(story.id);
                                  setActiveScreen('story');
                                }}
                                className="font-serif-headline font-semibold text-left text-[var(--text-primary)] hover:text-[#3D5AFE] truncate block w-full cursor-pointer"
                              >
                                {story.headline}
                              </button>
                              <div className="text-[11px] text-[var(--text-secondary)]">
                                Expires in {daysRemaining > 1 ? `${daysRemaining}d` : `${hoursRemaining}h`} · {reason}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleSave(story.id)}
                              className="px-3 py-1 rounded-[6px] bg-[#3F9E6B] hover:bg-[#34875B] text-white font-medium shrink-0 cursor-pointer"
                            >
                              Star
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Filter & Density Control Bar (Section 9.1, 11.2 & 11.3) */}
                <div className="desk-card p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)] px-1">
                        {activeSector} · {filteredStories.length}{' '}
                        {filteredStories.length === 1 ? 'story' : 'stories'}
                      </span>

                      {selectedKeyword && (
                        <button
                          type="button"
                          onClick={() => setSelectedKeyword(null)}
                          className="text-xs px-2.5 py-1 rounded-[8px] bg-[#3D5AFE] text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Keyword: {selectedKeyword}</span>
                          <X className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      )}

                      {selectedSparklineDayKey && (
                        <button
                          type="button"
                          onClick={() => setSelectedSparklineDayKey(null)}
                          className="text-xs px-2.5 py-1 rounded-[8px] bg-[#3D5AFE] text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Day: {formatDayGroupHeader(selectedSparklineDayKey)}</span>
                          <X className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setBestForVideoOnly((b) => !b)}
                        className={`h-8 px-2.5 rounded-[8px] border text-xs font-medium cursor-pointer transition-colors duration-150 ${
                          bestForVideoOnly
                            ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
                        }`}
                      >
                        Best for video
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Filter by date range"
                        value={timeWindow}
                        onChange={(e) => {
                          setTimeWindow(e.target.value as TimeWindow);
                          setSelectedSparklineDayKey(null);
                        }}
                        className="h-8 px-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="all">Date: All archive</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="3d">Last 3 days</option>
                        <option value="7d">Last 7 days</option>
                        <option value="last_week">Last week (Mon–Sun)</option>
                        <option value="15d">Last 15 days</option>
                        <option value="25d">Last 25 days</option>
                        <option value="custom">Custom range</option>
                      </select>

                      <select
                        aria-label="Filter by verification"
                        value={verificationFilter}
                        onChange={(e) =>
                          setVerificationFilter(
                            e.target.value as 'all' | VerificationStatus
                          )
                        }
                        className="h-8 px-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="all">Verification: All</option>
                        <option value="verified">Verified (2+ outlets)</option>
                        <option value="developing">Developing</option>
                        <option value="single-source">Single-source</option>
                      </select>

                      <select
                        aria-label="Filter by sensitivity"
                        value={sensitivityFilter}
                        onChange={(e) =>
                          setSensitivityFilter(
                            e.target.value as 'all' | SensitivityLevel
                          )
                        }
                        className="h-8 px-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="all">Sensitivity: All</option>
                        <option value="normal">Normal</option>
                        <option value="handle-with-care">Handle with care</option>
                        <option value="no-joke">No-joke</option>
                      </select>

                      <select
                        aria-label="Sort stories"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="h-8 px-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="importance">Sort: Importance</option>
                        <option value="latest">Sort: Newest</option>
                        <option value="sources">Sort: Most sources</option>
                        <option value="heat">Sort: Heat</option>
                        <option value="satire">Sort: Satire potential</option>
                        <option value="opportunity">Sort: Opportunity</option>
                      </select>

                      {/* Quick Density Toggle (Section 11.2: Comfortable vs Compact) */}
                      <button
                        type="button"
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            density:
                              prev.density === 'compact' ? 'comfortable' : 'compact',
                            updatedAt: new Date().toISOString(),
                          }))
                        }
                        className="h-8 px-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-secondary)] cursor-pointer"
                      >
                        {settings.density === 'compact' ? 'Compact' : 'Comfortable'}
                      </button>
                    </div>
                  </div>

                  {/* Custom Date Range Inputs when timeWindow === 'custom' */}
                  {timeWindow === 'custom' && (
                    <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-[var(--text-secondary)]">Custom archive range:</span>
                      <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span>From</span>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="h-8 px-2 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-primary)] font-mono-label"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span>To</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="h-8 px-2 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-primary)] font-mono-label"
                        />
                      </label>
                    </div>
                  )}

                  {/* Feed Date Bar & Slim Stories-Per-Day Sparkline (Section 9.1: on Feed) */}
                  {activeScreen === 'feed' && (
                    <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        {(
                          [
                            { id: 'all', label: 'All' },
                            { id: 'today', label: 'Today' },
                            { id: 'yesterday', label: 'Yesterday' },
                            { id: '3d', label: 'Last 3 days' },
                            { id: '7d', label: 'Last 7 days' },
                            { id: 'last_week', label: 'Last week (Mon–Sun)' },
                            { id: '15d', label: 'Last 15 days' },
                            { id: '25d', label: 'Last 25 days' },
                            { id: 'custom', label: 'Custom' },
                          ] as { id: TimeWindow; label: string }[]
                        ).map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => {
                              setTimeWindow(chip.id);
                              setSelectedSparklineDayKey(null);
                            }}
                            className={`px-2.5 py-1 rounded-[6px] text-xs whitespace-nowrap cursor-pointer transition-colors duration-150 ${
                              timeWindow === chip.id && !selectedSparklineDayKey
                                ? 'bg-[#3D5AFE] text-white font-medium'
                                : 'bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>

                      {/* Slim Stories-Per-Day Sparkline (Clicking a bar selects that day — Section 9.1) */}
                      <div
                        aria-label="Stories per day sparkline"
                        className="flex items-end gap-1 h-8 px-2 py-1 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] shrink-0"
                      >
                        <span className="text-[11px] text-[var(--text-muted)] mr-1.5 self-center">
                          14d pulse:
                        </span>
                        {sparklineDays.map((d) => {
                          const maxDayCount = Math.max(1, ...sparklineDays.map((x) => x.count));
                          const barHeightPx =
                            d.count > 0 ? Math.max(5, Math.round((d.count / maxDayCount) * 20)) : 3;
                          const isSelected = selectedSparklineDayKey === d.dayKey;
                          return (
                            <button
                              key={d.dayKey}
                              type="button"
                              title={`${d.label}: ${d.count} ${d.count === 1 ? 'story' : 'stories'}`}
                              onClick={() =>
                                setSelectedSparklineDayKey((prev) =>
                                  prev === d.dayKey ? null : d.dayKey
                                )
                              }
                              className="group flex flex-col items-center justify-end h-full px-0.5 cursor-pointer"
                            >
                              <span
                                style={{ height: `${barHeightPx}px` }}
                                className={`w-2 rounded-[2px] transition-colors ${
                                  isSelected
                                    ? 'bg-[#3D5AFE]'
                                    : d.count > 0
                                      ? 'bg-[#C9922E] group-hover:bg-[#3D5AFE]'
                                      : 'bg-[var(--border-subtle)]'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Error State if Ingest Failed */}
                {ingestError && (
                  <ErrorStateCard
                    whatHappened={ingestError}
                    whatToDo="Check your network connection or test individual RSS feeds in Sources, then try again."
                    onRetry={handleTriggerIngest}
                  />
                )}

                {/* Loading Skeletons vs Empty State vs Today / Feed Content */}
                {isIngesting && filteredStories.length === 0 ? (
                  <StorySkeletonList count={5} />
                ) : filteredStories.length === 0 ? (
                  <div className="desk-card p-10 text-center space-y-3">
                    <h2 className="font-serif-headline text-xl font-semibold text-[var(--text-primary)]">
                      No stories match current filter
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
                      {stories.length === 0
                        ? 'All mock and fabricated stories are removed. Click below to fetch live RSS feeds from your configured Indian and global outlets.'
                        : 'Try clearing the active date, sector, or keyword filter to see all verified stories in your archive.'}
                    </p>
                    <div className="flex justify-center gap-2">
                      {stories.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSector('Top stories');
                            setTimeWindow('all');
                            setSelectedKeyword(null);
                            setSelectedSparklineDayKey(null);
                            setVerificationFilter('all');
                            setSensitivityFilter('all');
                            setBestForVideoOnly(false);
                            setSearchQuery('');
                          }}
                          className="min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                        >
                          Reset filters
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleTriggerIngest}
                        disabled={isIngesting}
                        className="min-h-[44px] px-5 py-2.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${isIngesting ? 'animate-spin' : ''}`}
                          strokeWidth={1.5}
                        />
                        {isIngesting ? 'Fetching live feeds...' : 'Run live RSS ingest now'}
                      </button>
                    </div>
                  </div>
                ) : activeScreen === 'today' &&
                  activeSector === 'Top stories' &&
                  !searchQuery &&
                  !selectedKeyword ? (
                  /* TODAY SCREEN FULL LAYOUT (Section 11.3: Today's picks, Top 10 list, Three per sector with 'See all') */
                  <div className="space-y-6">
                    {/* 1. Today's Picks (5 to 8 stories ranked by Opportunity, excluding no-joke) */}
                    {todaysPicks.length > 0 && (
                      <section className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="font-serif-headline text-lg font-semibold text-[var(--text-primary)]">
                              Today’s picks for comedy & desk monologue
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)]">
                              Ranked by Opportunity (Heat, Satire potential, Importance, and multi-source verification; No-joke excluded).
                            </p>
                          </div>
                          <span className="text-xs font-mono-label text-[var(--text-secondary)]">
                            {todaysPicks.length} picks
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {todaysPicks.map((pick, idx) => (
                            <div
                              key={pick.id}
                              className="desk-card p-4 flex flex-col justify-between gap-3 hover:border-[#3D5AFE] transition-colors"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="px-2 py-0.5 rounded-[6px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">
                                    Pick #{idx + 1} · {pick.sector}
                                  </span>
                                  <span className="font-mono-label text-[var(--text-secondary)]">
                                    {pick.sourceCount} {pick.sourceCount === 1 ? 'source' : 'sources'} · Satire {pick.satirePotential}/10
                                  </span>
                                </div>
                                <h3
                                  onClick={() => {
                                    setSelectedStoryId(pick.id);
                                    setActiveScreen('story');
                                  }}
                                  className="font-serif-headline text-[18px] font-semibold leading-snug text-[var(--text-primary)] hover:text-[#3D5AFE] cursor-pointer line-clamp-2"
                                >
                                  {pick.headline}
                                </h3>
                                <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                  {pick.whatHappened}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs">
                                <span className="text-[var(--text-muted)] truncate max-w-[180px]">
                                  {pick.sources.map((s) => s.outlet).join(', ')}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDesk(pick.id)}
                                    className={`px-2.5 py-1 rounded-[6px] border text-xs font-medium cursor-pointer ${
                                      desk.storyIds.includes(pick.id)
                                        ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    }`}
                                  >
                                    {desk.storyIds.includes(pick.id) ? 'On desk' : 'Desk'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenScriptForStory(pick)}
                                    className="px-2.5 py-1 rounded-[6px] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[#3D5AFE] text-xs font-medium cursor-pointer"
                                  >
                                    Script
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* 2. Top 10 Stories Overall */}
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="font-serif-headline text-lg font-semibold text-[var(--text-primary)]">
                          Top 10 stories across all beats
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveScreen('feed')}
                          className="text-xs text-[#3D5AFE] hover:underline cursor-pointer"
                        >
                          Open full archive ({filteredStories.length}) →
                        </button>
                      </div>
                      <div className="desk-card divide-y divide-[var(--border-subtle)] overflow-hidden">
                        {filteredStories.slice(0, 10).map((story, idx) => (
                          <StoryRow
                            key={story.id}
                            story={story}
                            isFocused={focusedIndex === idx}
                            isSaved={savedList.some((s) => s.storyId === story.id)}
                            isOnDesk={desk.storyIds.includes(story.id)}
                            density={settings.density || 'comfortable'}
                            showThumbnails={Boolean(settings.showThumbnails)}
                            onFocus={() => setFocusedIndex(idx)}
                            onOpen={() => {
                              setSelectedStoryId(story.id);
                              setActiveScreen('story');
                            }}
                            onToggleSave={() => handleToggleSave(story.id)}
                            onToggleDesk={() => handleToggleDesk(story.id)}
                            onGenerateScript={() => handleOpenScriptForStory(story)}
                          />
                        ))}
                      </div>
                    </section>

                    {/* 3. Three Stories Per Sector with 'See all' (Section 11.3) */}
                    {sectorDigests.length > 0 && (
                      <section className="space-y-4">
                        <div>
                          <h2 className="font-serif-headline text-lg font-semibold text-[var(--text-primary)]">
                            Sector digests (3 stories per beat)
                          </h2>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Top stories in each newsroom sector. Click See all on any beat to inspect its full archive.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {sectorDigests.map((group) => (
                            <div
                              key={group.sector}
                              className="desk-card p-4 flex flex-col justify-between space-y-3"
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                    {group.sector}
                                  </h3>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveSector(group.sector);
                                      setActiveScreen('feed');
                                    }}
                                    className="text-xs text-[#3D5AFE] hover:underline cursor-pointer font-medium"
                                  >
                                    See all ({group.totalCount}) →
                                  </button>
                                </div>

                                <ul className="divide-y divide-[var(--border-subtle)]">
                                  {group.topThree.map((st) => (
                                    <li key={st.id} className="py-2 first:pt-0 last:pb-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedStoryId(st.id);
                                          setActiveScreen('story');
                                        }}
                                        className="w-full text-left group cursor-pointer"
                                      >
                                        <div className="font-serif-headline text-sm font-semibold text-[var(--text-primary)] group-hover:text-[#3D5AFE] line-clamp-2">
                                          {st.headline}
                                        </div>
                                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-2">
                                          <span>
                                            {st.sourceCount} {st.sourceCount === 1 ? 'source' : 'sources'}
                                          </span>
                                          <span>·</span>
                                          <span className="truncate max-w-[200px]">
                                            {st.sources.map((s) => s.outlet).join(', ')}
                                          </span>
                                        </div>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : activeScreen === 'feed' ? (
                  /* FEED SCREEN: Grouped by Day ('Saturday, 14 Nov, 41 stories') + Load More (Section 9.1 & 11.3) */
                  <div className="space-y-5">
                    {groupedFeedStories.map((group) => (
                      <section key={group.dayKey} className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <h2 className="text-xs font-semibold text-[var(--text-secondary)]">
                            {formatDayGroupHeader(group.dayKey)}, {group.totalInDay}{' '}
                            {group.totalInDay === 1 ? 'story' : 'stories'}
                          </h2>
                          <span className="font-mono-label text-[11px] text-[var(--text-muted)]">
                            {group.dayKey}
                          </span>
                        </div>
                        <div className="desk-card divide-y divide-[var(--border-subtle)] overflow-hidden">
                          {group.stories.map((story) => {
                            const globalIdx = filteredStories.findIndex((s) => s.id === story.id);
                            return (
                              <StoryRow
                                key={story.id}
                                story={story}
                                isFocused={focusedIndex === globalIdx}
                                isSaved={savedList.some((s) => s.storyId === story.id)}
                                isOnDesk={desk.storyIds.includes(story.id)}
                                density={settings.density || 'comfortable'}
                                showThumbnails={Boolean(settings.showThumbnails)}
                                onFocus={() => setFocusedIndex(globalIdx)}
                                onOpen={() => {
                                  setSelectedStoryId(story.id);
                                  setActiveScreen('story');
                                }}
                                onToggleSave={() => handleToggleSave(story.id)}
                                onToggleDesk={() => handleToggleDesk(story.id)}
                                onGenerateScript={() => handleOpenScriptForStory(story)}
                              />
                            );
                          })}
                        </div>
                      </section>
                    ))}

                    {feedVisibleCount < filteredStories.length && (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          onClick={() => setFeedVisibleCount((prev) => prev + 30)}
                          className="min-h-[42px] px-5 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                        >
                          Load more stories (showing {Math.min(feedVisibleCount, filteredStories.length)} of{' '}
                          {filteredStories.length})
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="desk-card divide-y divide-[var(--border-subtle)] overflow-hidden">
                    {filteredStories.map((story, idx) => (
                      <StoryRow
                        key={story.id}
                        story={story}
                        isFocused={focusedIndex === idx}
                        isSaved={savedList.some((s) => s.storyId === story.id)}
                        isOnDesk={desk.storyIds.includes(story.id)}
                        density={settings.density || 'comfortable'}
                        showThumbnails={Boolean(settings.showThumbnails)}
                        onFocus={() => setFocusedIndex(idx)}
                        onOpen={() => {
                          setSelectedStoryId(story.id);
                          setActiveScreen('story');
                        }}
                        onToggleSave={() => handleToggleSave(story.id)}
                        onToggleDesk={() => handleToggleDesk(story.id)}
                        onGenerateScript={() => handleOpenScriptForStory(story)}
                      />
                    ))}
                  </div>
                )}

                <VideoResourcesStrip
                  videos={videos}
                  activeSector={activeSector}
                  showThumbnails={Boolean(settings.showThumbnails)}
                />
              </div>

              {/* Right Panel: Appears ONLY on Today at >= 1,280 px (xl) and is collapsible (Section 11.1) */}
              {activeScreen === 'today' && rightRailOpen && (
                <aside
                  aria-label="Episode desk and trending topics"
                  className="hidden xl:flex flex-col w-[300px] shrink-0 space-y-4"
                >
                  {/* Episode Desk Card */}
                  <div className="desk-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        Episode desk ({desk.storyIds.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveScreen('desk')}
                        className="text-xs text-[#3D5AFE] hover:underline cursor-pointer"
                      >
                        Open board
                      </button>
                    </div>
                    {desk.storyIds.length === 0 ? (
                      <p className="text-xs text-[var(--text-secondary)]">
                        No stories queued yet. Click <strong>Desk</strong> or press{' '}
                        <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-raised)] border border-[var(--border-subtle)] font-mono-label">
                          d
                        </kbd>{' '}
                        on any story row.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 text-xs">
                        {desk.storyIds.slice(0, 6).map((id, i) => {
                          const st = stories.find((s) => s.id === id);
                          if (!st) return null;
                          return (
                            <li
                              key={id}
                              onClick={() => {
                                setSelectedStoryId(st.id);
                                setActiveScreen('story');
                              }}
                              className="p-2 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] hover:border-[#3D5AFE] truncate cursor-pointer text-[var(--text-primary)]"
                            >
                              {i + 1}. {st.headline}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Trending Keywords Card */}
                  <div className="desk-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                        <TrendingUp
                          className="w-3.5 h-3.5 text-[#3D5AFE]"
                          strokeWidth={1.5}
                        />
                        <span>Trending entities</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveScreen('trends')}
                        className="text-xs text-[#3D5AFE] hover:underline cursor-pointer"
                      >
                        All trends
                      </button>
                    </div>

                    {trendingKeywords.length === 0 ? (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Entity tags appear here as soon as live stories are ingested.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {trendingKeywords.map((item) => (
                          <button
                            key={item.tag}
                            type="button"
                            onClick={() =>
                              setSelectedKeyword((prev) =>
                                prev === item.tag ? null : item.tag
                              )
                            }
                            className={`text-xs px-2.5 py-1 rounded-[8px] border cursor-pointer transition-colors duration-150 ${
                              selectedKeyword === item.tag
                                ? 'bg-[#3D5AFE] text-white border-[#3D5AFE]'
                                : 'bg-[var(--bg-raised)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {item.tag} ({item.weight})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Bottom Tab Bar on Mobile Phones (< md — Section 11.1, works at 360px with zero horizontal overflow) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-1 grid grid-cols-5 gap-0.5"
      >
        {(
          [
            { id: 'today', label: 'Today', icon: LayoutDashboard },
            { id: 'feed', label: 'Feed', icon: Newspaper },
            { id: 'script', label: 'Script', icon: Sparkles },
            { id: 'desk', label: 'Desk', icon: ListFilter },
            { id: 'settings', label: 'Settings', icon: SettingsIcon },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveScreen(item.id)}
              className={`min-h-[44px] py-1 rounded-[8px] flex flex-col items-center justify-center text-[11px] cursor-pointer ${
                isActive
                  ? 'text-[#3D5AFE] font-semibold'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" strokeWidth={1.5} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Keyboard Shortcuts Modal (?) */}
      {shortcutModalOpen && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts help"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full desk-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Keyboard shortcuts
              </span>
              <button
                type="button"
                onClick={() => setShortcutModalOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-2 text-sm text-[var(--text-secondary)]">
              <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                <span>Next / Previous story</span>
                <kbd className="font-mono-label text-[var(--text-primary)]">j / k</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                <span>Star story</span>
                <kbd className="font-mono-label text-[var(--text-primary)]">s</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                <span>Add to desk</span>
                <kbd className="font-mono-label text-[var(--text-primary)]">d</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                <span>Generate script</span>
                <kbd className="font-mono-label text-[var(--text-primary)]">g</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                <span>Open story brief and sources</span>
                <kbd className="font-mono-label text-[var(--text-primary)]">o</kbd>
              </div>
              <div className="flex justify-between py-1">
                <span>Focus search</span>
                <kbd className="font-mono-label text-[var(--text-primary)]">/</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
