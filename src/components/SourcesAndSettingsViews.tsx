import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Database,
  Download,
  Edit3,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  DensityMode,
  DeskState,
  FirestoreUsageEstimate,
  JanitorRunReport,
  SavedStory,
  ScriptFormat,
  ScriptRecord,
  ScriptRuntimeTarget,
  SECTORS,
  Sector,
  SourceItem,
  StoryCluster,
  UserSettings,
} from '../types/desk';
import { getExpiringSoonStories } from '../utils/deskEngine';

/* ============================================================================
 * 1. EPISODE DESK & RUN-SHEET VIEW (Section 10.5 & 11.3)
 * ==========================================================================*/
interface EpisodeBoardViewProps {
  desk: DeskState;
  stories: StoryCluster[];
  onUpdateDesk: (nextDesk: DeskState) => void;
  onOpenStory: (story: StoryCluster) => void;
  onGenerateEpisodeScript: () => void;
}

export const EpisodeBoardView: React.FC<EpisodeBoardViewProps> = ({
  desk,
  stories,
  onUpdateDesk,
  onOpenStory,
  onGenerateEpisodeScript,
}) => {
  const [viewMode, setViewMode] = useState<'board' | 'runsheet'>('board');

  const queuedStories = desk.storyIds
    .map((id) => stories.find((s) => s.id === id) || desk.storySnapshots?.[id])
    .filter((s): s is StoryCluster => Boolean(s));

  const moveStory = (index: number, direction: -1 | 1) => {
    const nextIds = [...desk.storyIds];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= nextIds.length) return;
    const [removed] = nextIds.splice(index, 1);
    nextIds.splice(targetIndex, 0, removed);
    onUpdateDesk({
      ...desk,
      storyIds: nextIds,
      updatedAt: new Date().toISOString(),
    });
  };

  const removeStoryFromDesk = (storyId: string) => {
    const nextSnapshots = { ...(desk.storySnapshots || {}) };
    delete nextSnapshots[storyId];
    onUpdateDesk({
      ...desk,
      storyIds: desk.storyIds.filter((id) => id !== storyId),
      storySnapshots: nextSnapshots,
      updatedAt: new Date().toISOString(),
    });
  };

  let runningMinutesTotal = 0;

  return (
    <div className="space-y-6 pb-16">
      <div className="desk-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border-subtle)]">
          <div>
            <span className="text-xs text-[var(--text-secondary)]">
              Episode desk · {queuedStories.length} of 30 stories
            </span>
            <h1 className="font-serif-headline text-2xl font-semibold text-[var(--text-primary)] mt-0.5">
              Episode board and run-sheet
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                viewMode === 'board'
                  ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
              }`}
            >
              Board view
            </button>
            <button
              type="button"
              onClick={() => setViewMode('runsheet')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                viewMode === 'runsheet'
                  ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
              }`}
            >
              Run-sheet
            </button>
            <button
              type="button"
              onClick={onGenerateEpisodeScript}
              disabled={queuedStories.length === 0}
              className="min-h-[40px] px-4 py-1.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <FileText className="w-4 h-4" strokeWidth={1.5} />
              Generate full episode script
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Episode working title
            </label>
            <input
              type="text"
              value={desk.title}
              onChange={(e) =>
                onUpdateDesk({
                  ...desk,
                  title: e.target.value.slice(0, 300),
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)] font-medium"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Producer notes and transitions
            </label>
            <input
              type="text"
              value={desk.notes}
              onChange={(e) =>
                onUpdateDesk({
                  ...desk,
                  notes: e.target.value.slice(0, 5000),
                  updatedAt: new Date().toISOString(),
                })
              }
              placeholder="Cold open hook, callbacks between segments..."
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            />
          </div>
        </div>

        {queuedStories.length === 0 ? (
          <div className="p-8 text-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-secondary)]">
            No stories on the episode desk yet. Press{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)] font-mono-label text-xs">
              d
            </kbd>{' '}
            or click <strong>Desk</strong> on any story row to queue it for your next video.
          </div>
        ) : viewMode === 'board' ? (
          <div className="space-y-3">
            {queuedStories.map((story, idx) => {
              const estMins = desk.storyMinutes?.[story.id] ?? 2.5;
              const note = desk.storyNotes?.[story.id] ?? '';

              return (
                <div
                  key={story.id}
                  className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <span className="font-mono-label text-xs px-2.5 py-1 rounded-[8px] bg-[#3D5AFE] text-white font-medium">
                        {idx + 1}
                      </span>
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenStory(story)}
                          className="font-serif-headline text-lg font-semibold text-left text-[var(--text-primary)] hover:text-[#3D5AFE] cursor-pointer"
                        >
                          {story.headline}
                        </button>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[var(--text-secondary)]">
                          <span>{story.sector}</span>
                          <span>·</span>
                          <span>{story.sourceCount} sources</span>
                          <span>·</span>
                          <span>Satire {story.satirePotential}/10</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => moveStory(idx, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        className="min-h-[38px] min-w-[38px] p-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-30 cursor-pointer flex items-center justify-center"
                      >
                        <ArrowUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStory(idx, 1)}
                        disabled={idx === queuedStories.length - 1}
                        title="Move down"
                        className="min-h-[38px] min-w-[38px] p-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-30 cursor-pointer flex items-center justify-center"
                      >
                        <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStoryFromDesk(story.id)}
                        title="Remove from desk"
                        className="min-h-[38px] min-w-[38px] p-2 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#C75450] text-[#C75450] cursor-pointer flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)]">
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        placeholder="Segment angle or B-roll cue..."
                        value={note}
                        onChange={(e) =>
                          onUpdateDesk({
                            ...desk,
                            storyNotes: {
                              ...desk.storyNotes,
                              [story.id]: e.target.value.slice(0, 1000),
                            },
                            updatedAt: new Date().toISOString(),
                          })
                        }
                        className="w-full px-3 py-1.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">
                        Est. min:
                      </span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="15"
                        value={estMins}
                        onChange={(e) =>
                          onUpdateDesk({
                            ...desk,
                            storyMinutes: {
                              ...desk.storyMinutes,
                              [story.id]: parseFloat(e.target.value) || 2.0,
                            },
                            updatedAt: new Date().toISOString(),
                          })
                        }
                        className="w-20 px-2 py-1.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-mono-label text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-[var(--border-subtle)]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-secondary)]">
                  <th className="p-3 font-medium">Order</th>
                  <th className="p-3 font-medium">Segment headline</th>
                  <th className="p-3 font-medium">Sector</th>
                  <th className="p-3 font-medium">Producer note</th>
                  <th className="p-3 font-medium">Segment mins</th>
                  <th className="p-3 font-medium">Running total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {queuedStories.map((story, idx) => {
                  const segMins = desk.storyMinutes?.[story.id] ?? 2.5;
                  runningMinutesTotal += segMins;
                  return (
                    <tr key={story.id} className="hover:bg-[var(--bg-raised)]/60">
                      <td className="p-3 font-mono-label text-xs text-[#3D5AFE] font-medium">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-serif-headline font-semibold text-[var(--text-primary)]">
                        {story.headline}
                      </td>
                      <td className="p-3 text-xs text-[var(--text-secondary)]">
                        {story.sector}
                      </td>
                      <td className="p-3 text-xs text-[var(--text-secondary)]">
                        {desk.storyNotes?.[story.id] || '—'}
                      </td>
                      <td className="p-3 font-mono-label text-xs text-[var(--text-primary)]">
                        {segMins.toFixed(1)} min
                      </td>
                      <td className="p-3 font-mono-label text-xs text-[#3F9E6B] font-medium">
                        {runningMinutesTotal.toFixed(1)} min
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. STARRED STORIES & EXPIRING SOON VIEW (Section 4 & 5.4 — Snapshot Persistence)
 * ==========================================================================*/
interface SavedStoriesViewProps {
  savedList: SavedStory[];
  stories: StoryCluster[];
  scripts?: ScriptRecord[];
  retentionDays?: number;
  initialTab?: 'starred' | 'expiring';
  onOpenStory: (story: StoryCluster) => void;
  onRemoveSaved: (storyId: string) => void;
  onStarStory?: (story: StoryCluster) => void;
  onUpdateSavedNote?: (storyId: string, note: string) => void;
  onAddToDesk: (storyId: string) => void;
}

export const SavedStoriesView: React.FC<SavedStoriesViewProps> = ({
  savedList,
  stories,
  scripts = [],
  retentionDays = 25,
  initialTab = 'starred',
  onOpenStory,
  onRemoveSaved,
  onStarStory,
  onUpdateSavedNote,
  onAddToDesk,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'starred' | 'expiring'>(initialTab);
  const [confirmUnstarId, setConfirmUnstarId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

  const savedStories = savedList
    .map((item) => ({
      meta: item,
      story: item.snapshot || stories.find((s) => s.id === item.storyId),
    }))
    .filter((x): x is { meta: SavedStory; story: StoryCluster } => Boolean(x.story));

  const expiringSoon = useMemo(
    () =>
      getExpiringSoonStories({
        stories,
        savedList,
        scripts,
        retentionDays,
      }),
    [stories, savedList, scripts, retentionDays]
  );

  return (
    <div className="space-y-4 pb-16">
      <div className="desk-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <span className="text-xs text-[var(--text-secondary)]">
              Permanent archive · Full snapshot stored in starred/&#123;storyId&#125; (never touched by TTL or Janitor)
            </span>
            <h1 className="font-serif-headline text-2xl font-semibold text-[var(--text-primary)] mt-0.5">
              Starred stories & expiring soon
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('starred')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                activeSubTab === 'starred'
                  ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
              }`}
            >
              Starred archive ({savedStories.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('expiring')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                activeSubTab === 'expiring'
                  ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
              }`}
            >
              Expiring soon ({expiringSoon.length})
            </button>
          </div>
        </div>

        {activeSubTab === 'starred' ? (
          savedStories.length === 0 ? (
            <div className="p-8 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-center text-sm text-[var(--text-secondary)]">
              No starred stories yet. Press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)] font-mono-label text-xs">
                s
              </kbd>{' '}
              or click <strong>Star</strong> on any story row to keep its full snapshot permanently.
            </div>
          ) : (
            <div className="space-y-3">
              {savedStories.map(({ meta, story }) => {
                const isConfirming = confirmUnstarId === story.id;
                const isEditingNote = editingNoteId === story.id;
                const archiveCopyExists = stories.some((s) => s.id === story.id);

                return (
                  <div
                    key={story.id}
                    className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="font-medium text-[var(--text-primary)]">
                            {story.sector}
                          </span>
                          <span>·</span>
                          <span>{story.sourceCount} sources</span>
                          <span>·</span>
                          <span className="font-mono-label">
                            Starred {new Date(meta.savedAt).toLocaleDateString()}
                          </span>
                          <span>·</span>
                          <span className="px-2 py-0.5 rounded bg-[#3F9E6B]/15 text-[#3F9E6B] text-[11px] font-medium">
                            {archiveCopyExists
                              ? 'Permanent snapshot (no expiresAt)'
                              : 'Preserved via Starred snapshot after 25d TTL'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenStory(story)}
                          className="font-serif-headline text-lg font-semibold text-left text-[var(--text-primary)] hover:text-[#3D5AFE] cursor-pointer"
                        >
                          {story.headline}
                        </button>
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                          {story.whatHappened}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(isEditingNote ? null : story.id);
                            setNoteDraft(meta.note || '');
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          {meta.note ? 'Edit note' : 'Add note'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddToDesk(story.id)}
                          className="min-h-[38px] px-3 py-1.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium cursor-pointer"
                        >
                          Add to desk
                        </button>

                        {!isConfirming ? (
                          <button
                            type="button"
                            onClick={() => setConfirmUnstarId(story.id)}
                            className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] hover:border-[#C75450] text-xs font-medium text-[#C75450] cursor-pointer"
                          >
                            Unstar
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onRemoveSaved(story.id);
                                setConfirmUnstarId(null);
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-[10px] bg-[#C75450] text-white text-xs font-medium cursor-pointer"
                            >
                              Confirm unstar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmUnstarId(null)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {meta.note && !isEditingNote && (
                      <div className="p-2.5 rounded-[8px] bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-primary)] mr-1.5">
                          Note:
                        </span>
                        {meta.note}
                      </div>
                    )}

                    {isEditingNote && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value.slice(0, 1500))}
                          placeholder="Add a permanent producer or research note to this starred snapshot..."
                          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)]"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateSavedNote?.(story.id, noteDraft.trim());
                              setEditingNoteId(null);
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-[8px] bg-[#3D5AFE] text-white text-xs font-medium cursor-pointer"
                          >
                            Save note
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-[8px] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Expiring Soon View (Section 5.4: Unstarred stories within 3 days of expiry that had high Heat, high Opportunity, or a script) */
          <div className="space-y-3">
            <div className="p-3.5 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-2">
              <span>
                Lists unstarred stories leaving the {retentionDays}-day archive within 3 days that have high Heat (&ge; 50), high Opportunity (&ge; 55), or a linked script.
              </span>
              <span className="font-mono-label text-[var(--text-primary)]">
                {expiringSoon.length} expiring within 72h
              </span>
            </div>

            {expiringSoon.length === 0 ? (
              <div className="p-8 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-center text-sm text-[var(--text-secondary)]">
                No high-Heat, high-Opportunity, or scripted stories are within 3 days of their {retentionDays}-day expiration right now.
              </div>
            ) : (
              expiringSoon.map(({ story, daysRemaining, hoursRemaining, reason }) => (
                <div
                  key={story.id}
                  className="p-4 rounded-[10px] border border-[#C9922E]/40 bg-[var(--bg-raised)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-[#C9922E]/15 text-[#C9922E] font-mono-label font-medium">
                        Expires in {daysRemaining > 1 ? `${daysRemaining}d` : `${hoursRemaining}h`}
                      </span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {story.sector}
                      </span>
                      <span>·</span>
                      <span className="text-[var(--text-secondary)]">{reason}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenStory(story)}
                      className="font-serif-headline text-lg font-semibold text-left text-[var(--text-primary)] hover:text-[#3D5AFE] cursor-pointer"
                    >
                      {story.headline}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStarStory?.(story)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-[10px] bg-[#3F9E6B] hover:bg-[#34875B] text-white text-xs font-medium cursor-pointer"
                    >
                      Star to keep forever
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStory(story)}
                      className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] cursor-pointer"
                    >
                      Open brief
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. SOURCES MANAGER VIEW (Section 5.1 & Phase 2 — Add, Edit, Disable, Test, Verify)
 * ==========================================================================*/
interface SourcesManagerViewProps {
  sources: SourceItem[];
  onUpdateSources: (next: SourceItem[]) => void;
  onTriggerIngest: () => void;
  isIngesting: boolean;
}

export const SourcesManagerView: React.FC<SourcesManagerViewProps> = ({
  sources,
  onUpdateSources,
  onTriggerIngest,
  isIngesting,
}) => {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newSector, setNewSector] = useState<Sector>('Politics');
  const [newLanguage, setNewLanguage] = useState<'en' | 'hi'>('en');
  const [newType, setNewType] = useState<SourceItem['type']>('rss');
  const [newPriority, setNewPriority] = useState<'high' | 'normal'>('normal');
  const [newTrust, setNewTrust] = useState<number>(4);

  // Filters & search over 120+ feeds
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'failing' | 'high' | 'hi'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Inline Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SourceItem | null>(null);

  // Test feed state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    sourceName: string;
    ok: boolean;
    error?: string;
    items: { title: string; link: string; pubDate: string; snippet: string }[];
  } | null>(null);

  // Batch verify state
  const [isVerifyingBatch, setIsVerifyingBatch] = useState(false);
  const [batchVerifySummary, setBatchVerifySummary] = useState<{
    checked: number;
    passed: number;
    failed: number;
  } | null>(null);

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    const created: SourceItem = {
      id: `src_custom_${Date.now()}`,
      name: newName.trim().slice(0, 200),
      type: newType,
      url: newUrl.trim().slice(0, 2000),
      sector: newSector,
      language: newLanguage,
      trust: newTrust,
      priority: newPriority,
      enabled: true,
      lastFetchedAt: '',
      lastError: '',
      consecutiveErrors: 0,
    };
    onUpdateSources([created, ...sources]);
    setNewName('');
    setNewUrl('');
  };

  const handleSaveEdit = () => {
    if (!editDraft || !editDraft.name.trim() || !editDraft.url.trim()) return;
    onUpdateSources(
      sources.map((s) =>
        s.id === editDraft.id
          ? {
              ...editDraft,
              name: editDraft.name.trim().slice(0, 200),
              url: editDraft.url.trim().slice(0, 2000),
            }
          : s
      )
    );
    setEditingId(null);
    setEditDraft(null);
  };

  const handleTestFeed = async (src: SourceItem) => {
    setTestingId(src.id);
    setTestResult(null);
    try {
      const resp = await fetch('/api/test-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: src.url, name: src.name }),
      });
      const data = await resp.json();
      const ok = Boolean(data.ok);
      setTestResult({
        sourceName: src.name,
        ok,
        error: data.error,
        items: data.previewItems || [],
      });

      // Update source fetch status locally
      onUpdateSources(
        sources.map((s) =>
          s.id === src.id
            ? {
                ...s,
                lastFetchedAt: new Date().toISOString(),
                lastError: ok ? '' : data.error || 'Failed to parse feed',
                consecutiveErrors: ok ? 0 : (s.consecutiveErrors || 0) + 1,
              }
            : s
        )
      );
    } catch (err) {
      setTestResult({
        sourceName: src.name,
        ok: false,
        error: err instanceof Error ? err.message : 'Network error testing feed',
        items: [],
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleBatchVerify = async () => {
    setIsVerifyingBatch(true);
    setBatchVerifySummary(null);
    try {
      const targetBatch = filteredSources.slice(0, 18);
      const resp = await fetch('/api/verify-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: targetBatch }),
      });
      const data = await resp.json();
      if (data.ok && Array.isArray(data.results)) {
        const resultMap = new Map<
          string,
          { ok: boolean; error?: string; itemCount?: number }
        >(data.results.map((r: any) => [r.id, r]));

        let passed = 0;
        let failed = 0;
        const nextSources = sources.map((s) => {
          const res = resultMap.get(s.id);
          if (!res) return s;
          if (res.ok) {
            passed++;
            return {
              ...s,
              lastFetchedAt: new Date().toISOString(),
              lastError: '',
              consecutiveErrors: 0,
            };
          } else {
            failed++;
            return {
              ...s,
              lastFetchedAt: new Date().toISOString(),
              lastError: res.error || 'Feed unreachable',
              consecutiveErrors: (s.consecutiveErrors || 0) + 1,
            };
          }
        });
        onUpdateSources(nextSources);
        setBatchVerifySummary({
          checked: targetBatch.length,
          passed,
          failed,
        });
      }
    } catch {
      // ignore network error
    } finally {
      setIsVerifyingBatch(false);
    }
  };

  const filteredSources = useMemo(() => {
    return sources.filter((src) => {
      if (sectorFilter !== 'ALL' && src.sector !== sectorFilter) return false;
      if (statusFilter === 'enabled' && !src.enabled) return false;
      if (statusFilter === 'disabled' && src.enabled) return false;
      if (statusFilter === 'failing' && (src.consecutiveErrors || 0) < 5) return false;
      if (statusFilter === 'high' && src.priority !== 'high') return false;
      if (statusFilter === 'hi' && src.language !== 'hi') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${src.name} ${src.url} ${src.sector} ${src.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sources, sectorFilter, statusFilter, searchQuery]);

  const enabledCount = sources.filter((s) => s.enabled).length;
  const failingCount = sources.filter((s) => (s.consecutiveErrors || 0) >= 5).length;
  const highPriorityCount = sources.filter((s) => s.priority === 'high').length;

  return (
    <div className="space-y-6 pb-16">
      <div className="desk-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border-subtle)]">
          <div>
            <span className="text-xs text-[var(--text-secondary)]">
              Sources manager · {sources.length} total feeds ({enabledCount} enabled · {highPriorityCount} high priority · {failingCount} failing)
            </span>
            <h1 className="font-serif-headline text-2xl font-semibold text-[var(--text-primary)] mt-0.5">
              RSS, Google News queries, regulators, and YouTube feeds
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBatchVerify}
              disabled={isVerifyingBatch}
              className="min-h-[44px] px-3.5 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4 text-[#3F9E6B]" strokeWidth={1.5} />
              {isVerifyingBatch ? 'Verifying feeds...' : 'Verify current view'}
            </button>
            <button
              type="button"
              onClick={onTriggerIngest}
              disabled={isIngesting}
              className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isIngesting ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              {isIngesting ? 'Ingesting feeds...' : 'Run live ingest now'}
            </button>
          </div>
        </div>

        {/* Add Feed Form */}
        <form
          onSubmit={handleAddSource}
          className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] mb-5 space-y-3"
        >
          <div className="text-xs font-medium text-[var(--text-secondary)]">
            Add custom RSS, Atom, Google News, regulator, or YouTube feed
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
            <input
              type="text"
              placeholder="Outlet or feed name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="lg:col-span-2 min-h-[40px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            />
            <input
              type="url"
              placeholder="https://.../feed.xml"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="lg:col-span-3 min-h-[40px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            />
            <select
              value={newSector}
              onChange={(e) => setNewSector(e.target.value as Sector)}
              aria-label="New feed sector"
              className="lg:col-span-2 min-h-[40px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            >
              {SECTORS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
            <select
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value as 'en' | 'hi')}
              aria-label="New feed language"
              className="lg:col-span-1 min-h-[40px] px-2 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            >
              <option value="en">EN</option>
              <option value="hi">HI</option>
            </select>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as SourceItem['type'])}
              aria-label="New feed type"
              className="lg:col-span-1 min-h-[40px] px-2 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            >
              <option value="rss">RSS</option>
              <option value="google_news">Google News</option>
              <option value="regulator">Regulator</option>
              <option value="youtube">YouTube</option>
            </select>
            <select
              value={newTrust}
              onChange={(e) => setNewTrust(Number(e.target.value))}
              aria-label="New feed trust"
              className="lg:col-span-1 min-h-[40px] px-2 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            >
              {[5, 4, 3, 2, 1].map((t) => (
                <option key={t} value={t}>
                  Trust {t}/5
                </option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as 'high' | 'normal')}
              aria-label="New feed priority"
              className="lg:col-span-1 min-h-[40px] px-2 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
            <button
              type="submit"
              className="lg:col-span-1 min-h-[40px] px-3 py-1.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Add
            </button>
          </div>
        </form>

        {/* Batch Verify Banner */}
        {batchVerifySummary && (
          <div className="mb-5 p-3.5 rounded-[10px] border border-[#3F9E6B]/40 bg-[#3F9E6B]/10 flex items-center justify-between text-xs text-[var(--text-primary)]">
            <span>
              Verified {batchVerifySummary.checked} feeds: <strong>{batchVerifySummary.passed} healthy</strong>,{' '}
              <strong>{batchVerifySummary.failed} failed</strong>.
            </span>
            <button
              type="button"
              onClick={() => setBatchVerifySummary(null)}
              className="underline text-[var(--text-secondary)] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Test Feed Result */}
        {testResult && (
          <div
            className={`mb-5 p-4 rounded-[10px] border ${
              testResult.ok
                ? 'border-[#3F9E6B] bg-[#3F9E6B]/10'
                : 'border-[#C75450] bg-[#C75450]/10'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Test feed result: {testResult.sourceName} —{' '}
                {testResult.ok ? 'Parsed first 3 items' : 'Failed'}
              </span>
              <button
                type="button"
                onClick={() => setTestResult(null)}
                className="text-xs underline cursor-pointer text-[var(--text-secondary)]"
              >
                Close
              </button>
            </div>
            {testResult.error && (
              <p className="text-xs text-[#C75450]">{testResult.error}</p>
            )}
            {testResult.items.length > 0 && (
              <ul className="space-y-2 mt-2">
                {testResult.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="p-2.5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                  >
                    <div className="font-medium text-[var(--text-primary)]">
                      {idx + 1}. {item.title}
                    </div>
                    <div className="text-[var(--text-secondary)] mt-0.5">{item.snippet}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Filter & Search Bar for 120+ Sources */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4 p-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)]">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2"
              strokeWidth={1.5}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 120+ feeds by outlet, URL, or sector..."
              className="w-full min-h-[36px] pl-8 pr-3 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              aria-label="Filter sources by sector"
              className="min-h-[36px] px-2.5 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            >
              <option value="ALL">Sector: All ({sources.length})</option>
              {SECTORS.map((sec) => {
                const count = sources.filter((s) => s.sector === sec).length;
                return (
                  <option key={sec} value={sec}>
                    {sec} ({count})
                  </option>
                );
              })}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              aria-label="Filter sources by status"
              className="min-h-[36px] px-2.5 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
            >
              <option value="all">Status: All</option>
              <option value="enabled">Enabled ({enabledCount})</option>
              <option value="disabled">Disabled ({sources.length - enabledCount})</option>
              <option value="high">High priority ({highPriorityCount})</option>
              <option value="hi">Hindi feeds ({sources.filter((s) => s.language === 'hi').length})</option>
              <option value="failing">Failing 5+ errors ({failingCount})</option>
            </select>
          </div>
        </div>

        {/* Sources List */}
        <div className="space-y-2.5">
          {filteredSources.map((src) => {
            const isFailing = (src.consecutiveErrors || 0) >= 5;
            const isEditing = editingId === src.id && editDraft;

            if (isEditing && editDraft) {
              return (
                <div
                  key={src.id}
                  className="p-4 rounded-[10px] border border-[#3D5AFE] bg-[var(--bg-raised)] space-y-3"
                >
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Editing feed: {src.name}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      className="min-h-[38px] px-3 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    />
                    <input
                      type="url"
                      value={editDraft.url}
                      onChange={(e) => setEditDraft({ ...editDraft, url: e.target.value })}
                      className="lg:col-span-2 min-h-[38px] px-3 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    />
                    <select
                      value={editDraft.sector}
                      onChange={(e) => setEditDraft({ ...editDraft, sector: e.target.value as Sector })}
                      className="min-h-[38px] px-2.5 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      {SECTORS.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <select
                        value={editDraft.language}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, language: e.target.value as 'en' | 'hi' })
                        }
                        className="flex-1 min-h-[38px] px-2 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="en">EN</option>
                        <option value="hi">HI</option>
                      </select>
                      <select
                        value={editDraft.trust}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, trust: Number(e.target.value) })
                        }
                        className="flex-1 min-h-[38px] px-2 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      >
                        {[5, 4, 3, 2, 1].map((t) => (
                          <option key={t} value={t}>
                            Trust {t}/5
                          </option>
                        ))}
                      </select>
                      <select
                        value={editDraft.priority || 'normal'}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            priority: e.target.value as 'high' | 'normal',
                          })
                        }
                        className="flex-1 min-h-[38px] px-2 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      >
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        className="min-h-[38px] px-3 py-1 rounded-[8px] bg-[#3D5AFE] text-white text-xs font-medium cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft(null);
                        }}
                        className="min-h-[38px] px-3 py-1 rounded-[8px] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={src.id}
                className={`p-3.5 rounded-[10px] border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  isFailing
                    ? 'border-[#C75450] bg-[#C75450]/10'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-raised)]'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm text-[var(--text-primary)]">
                      {src.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-[6px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {src.sector} · {src.language.toUpperCase()} · Trust {src.trust}/5 · {src.priority || 'normal'} priority
                    </span>
                    {isFailing ? (
                      <span className="text-xs px-2 py-0.5 rounded-[6px] bg-[#C75450] text-white font-medium inline-flex items-center gap-1">
                        <XCircle className="w-3 h-3" strokeWidth={1.5} />
                        Failing ({src.consecutiveErrors} errors)
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-[6px] bg-[#3F9E6B]/15 text-[#3F9E6B] inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                        Healthy
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono-label text-[var(--text-muted)] truncate">
                    {src.url}
                  </div>
                  {src.lastError && (
                    <div className="text-xs text-[#C75450]">
                      Last error: {src.lastError}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestFeed(src)}
                    disabled={testingId === src.id}
                    className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                  >
                    {testingId === src.id ? 'Testing...' : 'Test feed'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(src.id);
                      setEditDraft({ ...src });
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSources(
                        sources.map((s) =>
                          s.id === src.id ? { ...s, enabled: !s.enabled } : s
                        )
                      )
                    }
                    className={`min-h-[38px] px-3 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                      src.enabled
                        ? 'border-[#3F9E6B]/50 bg-[#3F9E6B]/15 text-[#3F9E6B]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {src.enabled ? 'Enabled' : 'Disabled'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSources(sources.filter((s) => s.id !== src.id))
                    }
                    className="min-h-[38px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] hover:border-[#C75450] text-[#C75450] text-xs cursor-pointer"
                    aria-label={`Delete ${src.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. SETTINGS, STORAGE, RETENTION & JANITOR PANELS (Section 4, 5.4, 7.2, 11.3 & 12)
 * ==========================================================================*/
interface SettingsViewProps {
  settings: UserSettings;
  usage: FirestoreUsageEstimate;
  aiCallsToday?: number;
  activePrimaryModel?: string;
  collectionCounts?: {
    stories: number;
    feedIndexDays: number;
    seenEntries: number;
    starred: number;
    scripts: number;
    deskSnapshots: number;
  };
  lastJanitorReport?: JanitorRunReport;
  onRunJanitor?: (options: { dryRun: boolean; allowEarlyLiveRun?: boolean }) => Promise<void>;
  onUpdateSettings: (next: UserSettings) => void;
  onExportAllJson: () => void;
  onDeleteAllData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  usage,
  aiCallsToday = 0,
  activePrimaryModel = 'gemini-4-hydrogen',
  collectionCounts = {
    stories: 0,
    feedIndexDays: 0,
    seenEntries: 0,
    starred: 0,
    scripts: 0,
    deskSnapshots: 0,
  },
  lastJanitorReport,
  onRunJanitor,
  onUpdateSettings,
  onExportAllJson,
  onDeleteAllData,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRunningJanitor, setIsRunningJanitor] = useState(false);

  const aiLimit = settings.aiDailyLimit || 20;
  const aiPercent = Math.min(100, Math.round((aiCallsToday / aiLimit) * 100));
  const productionLevel =
    aiLimit < 10 ? 0 : aiLimit < 40 ? 1 : aiLimit < 100 ? 2 : 3;

  // 25-day storage projection (Section 4.3: ~39 MB at 25 days = ~3.8% of 1 GiB)
  const retentionDays = settings.retentionDays || 25;
  const projected25dBytes =
    Math.max(collectionCounts.stories, 80 * retentionDays) * 12 * 1024 +
    retentionDays * 250 * 1024 +
    16 * 350 * 1024 +
    collectionCounts.starred * 12 * 1024 +
    collectionCounts.scripts * 15 * 1024;
  const projected25dMb = (projected25dBytes / (1024 * 1024)).toFixed(1);
  const projected25dPct = Math.min(
    100,
    Math.round((projected25dBytes / (1024 * 1024 * 1024)) * 1000) / 10
  );

  const handleTriggerJanitor = async (dryRun: boolean, allowEarlyLiveRun = false) => {
    if (!onRunJanitor) return;
    setIsRunningJanitor(true);
    try {
      await onRunJanitor({ dryRun, allowEarlyLiveRun });
    } finally {
      setIsRunningJanitor(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* AI Budget, Firestore Free-Tier Storage & Performance Panels */}
      <section className="desk-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#3D5AFE]" strokeWidth={1.5} />
            <h1 className="font-serif-headline text-xl font-semibold text-[var(--text-primary)]">
              Storage, quota, and performance monitor
            </h1>
          </div>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-[8px] font-medium ${
              usage.isWarning || aiPercent >= 80
                ? 'bg-[#C9922E]/15 text-[#C9922E] border border-[#C9922E]/40'
                : 'bg-[#3F9E6B]/15 text-[#3F9E6B] border border-[#3F9E6B]/40'
            }`}
          >
            {usage.isWarning || aiPercent >= 80
              ? 'Approaching daily limit (>= 80%)'
              : `All budgets healthy · Production Level ${productionLevel}`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* AI Calls Today */}
          <div className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>AI calls today</span>
              <span className="font-mono-label text-[var(--text-primary)] font-medium">
                {aiPercent}%
              </span>
            </div>
            <div className="mt-1.5 font-mono-label text-xl font-semibold text-[var(--text-primary)]">
              {aiCallsToday} of {aiLimit}
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
              <div
                className={`h-full ${aiPercent >= 80 ? 'bg-[#C9922E]' : 'bg-[#3D5AFE]'}`}
                style={{ width: `${Math.max(4, aiPercent)}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
              Active model: <span className="font-mono-label">{activePrimaryModel}</span>
            </div>
          </div>

          {/* Daily Reads */}
          <div className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Daily reads (50k cap)</span>
              <span className="font-mono-label text-[var(--text-primary)] font-medium">
                {usage.readsPercent}%
              </span>
            </div>
            <div className="mt-1.5 font-mono-label text-xl font-semibold text-[var(--text-primary)]">
              {usage.readsToday.toLocaleString()} / {usage.readsLimit.toLocaleString()}
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
              <div
                className={`h-full ${usage.readsPercent >= 80 ? 'bg-[#C9922E]' : 'bg-[#3D5AFE]'}`}
                style={{ width: `${Math.max(4, usage.readsPercent)}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
              Target: under 15,000 reads/day
            </div>
          </div>

          {/* Daily Writes */}
          <div className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Daily writes (20k cap)</span>
              <span className="font-mono-label text-[var(--text-primary)] font-medium">
                {usage.writesPercent}%
              </span>
            </div>
            <div className="mt-1.5 font-mono-label text-xl font-semibold text-[var(--text-primary)]">
              {usage.writesToday.toLocaleString()} / {usage.writesLimit.toLocaleString()}
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
              <div
                className={`h-full ${usage.writesPercent >= 80 ? 'bg-[#C9922E]' : 'bg-[#3F9E6B]'}`}
                style={{ width: `${Math.max(4, usage.writesPercent)}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
              Target: under 5,000 writes/day
            </div>
          </div>

          {/* Document Storage */}
          <div className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Storage (1 GiB cap)</span>
              <span className="font-mono-label text-[var(--text-primary)] font-medium">
                {usage.storagePercent}%
              </span>
            </div>
            <div className="mt-1.5 font-mono-label text-xl font-semibold text-[var(--text-primary)]">
              {(usage.storageBytes / (1024 * 1024)).toFixed(2)} MB / 1,024 MB
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
              <div
                className="h-full bg-[#3D5AFE]"
                style={{ width: `${Math.max(4, usage.storagePercent)}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[var(--text-muted)]">
              {retentionDays}d projection: ~{projected25dMb} MB ({projected25dPct}% &lt; 30% cap)
            </div>
          </div>
        </div>

        {/* Collection Document Breakdown (Section 4.3 & 5.4) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
          <div className="p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-xs">
            <div className="text-[var(--text-secondary)]">stories (25d TTL)</div>
            <div className="font-mono-label font-semibold text-sm text-[var(--text-primary)] mt-0.5">
              {collectionCounts.stories} docs
            </div>
          </div>
          <div className="p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-xs">
            <div className="text-[var(--text-secondary)]">feedIndex days</div>
            <div className="font-mono-label font-semibold text-sm text-[var(--text-primary)] mt-0.5">
              {collectionCounts.feedIndexDays} docs
            </div>
          </div>
          <div className="p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-xs">
            <div className="text-[var(--text-secondary)]">seen/&#123;0..f&#125; hashes</div>
            <div className="font-mono-label font-semibold text-sm text-[var(--text-primary)] mt-0.5">
              {collectionCounts.seenEntries} entries
            </div>
          </div>
          <div className="p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-xs">
            <div className="text-[var(--text-secondary)]">starred (forever)</div>
            <div className="font-mono-label font-semibold text-sm text-[#3F9E6B] mt-0.5">
              {collectionCounts.starred} snapshots
            </div>
          </div>
          <div className="p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-xs">
            <div className="text-[var(--text-secondary)]">scripts (protected)</div>
            <div className="font-mono-label font-semibold text-sm text-[#3F9E6B] mt-0.5">
              {collectionCounts.scripts} scripts
            </div>
          </div>
          <div className="p-2.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-xs">
            <div className="text-[var(--text-secondary)]">desk (protected)</div>
            <div className="font-mono-label font-semibold text-sm text-[#3F9E6B] mt-0.5">
              {collectionCounts.deskSnapshots} snapshots
            </div>
          </div>
        </div>
      </section>

      {/* Phase 4: Retention, Firestore TTL & Janitor Agent Panel (Section 5.4) */}
      <section className="desk-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <span className="text-xs text-[var(--text-secondary)]">
              Two-layer 25-day cleanup · Firestore TTL on stories.expiresAt + Daily Janitor Agent
            </span>
            <h2 className="font-serif-headline text-xl font-semibold text-[var(--text-primary)] mt-0.5">
              Retention policy & Janitor agent (dry-run first)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isRunningJanitor}
              onClick={() => handleTriggerJanitor(true, false)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] cursor-pointer disabled:opacity-40"
            >
              {isRunningJanitor ? 'Running...' : 'Run Janitor dry-run preview'}
            </button>
            <button
              type="button"
              disabled={isRunningJanitor}
              onClick={() => handleTriggerJanitor(false, true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium cursor-pointer disabled:opacity-40"
            >
              Run Janitor cleanup now
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          <div className="p-3.5 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-1">
            <div className="font-semibold text-[var(--text-primary)]">
              Layer 1: Firestore TTL + Query Filter
            </div>
            <p className="text-[var(--text-secondary)]">
              Every story has <code className="font-mono-label">expiresAt = firstSeen + {retentionDays}d</code>. Queries and UI views filter out expired items immediately on day {retentionDays + 1}.
            </p>
          </div>
          <div className="p-3.5 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-1">
            <div className="font-semibold text-[var(--text-primary)]">
              Layer 2: Janitor Safety Guardrails
            </div>
            <p className="text-[var(--text-secondary)]">
              Runs in dry-run mode for the first 3 days, caps deletions at 5,000 docs/run, and refuses to run if settings or system clock are invalid.
            </p>
          </div>
          <div className="p-3.5 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-1">
            <div className="font-semibold text-[#3F9E6B]">
              Never Deleted (Protected Forever)
            </div>
            <p className="text-[var(--text-secondary)]">
              <code className="font-mono-label">starred/&#123;storyId&#125;</code> snapshots, <code className="font-mono-label">desk/&#123;uid&#125;</code> snapshots, and <code className="font-mono-label">scripts</code> have no <code className="font-mono-label">expiresAt</code> and are never touched.
            </p>
          </div>
        </div>

        {lastJanitorReport && (
          <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded font-mono-label font-medium ${
                    !lastJanitorReport.ok
                      ? 'bg-[#C75450]/15 text-[#C75450]'
                      : lastJanitorReport.dryRun
                        ? 'bg-[#C9922E]/15 text-[#C9922E]'
                        : 'bg-[#3F9E6B]/15 text-[#3F9E6B]'
                  }`}
                >
                  {!lastJanitorReport.ok
                    ? 'REFUSED'
                    : lastJanitorReport.dryRun
                      ? 'DRY-RUN PREVIEW (0 DELETED)'
                      : 'LIVE CLEANUP EXECUTED'}
                </span>
                <span className="text-[var(--text-secondary)]">
                  Cutoff dayKey: <strong className="font-mono-label text-[var(--text-primary)]">{lastJanitorReport.cutoffDayKey || '—'}</strong> ({lastJanitorReport.retentionDays}d retention)
                </span>
              </div>
              <span className="font-mono-label text-[var(--text-muted)]">
                Ran {new Date(lastJanitorReport.ranAt).toLocaleTimeString()}
              </span>
            </div>

            {lastJanitorReport.refusedReason ? (
              <div className="text-[#C75450] font-medium">
                {lastJanitorReport.refusedReason}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                  <div className="font-medium text-[var(--text-primary)] mb-1">
                    {lastJanitorReport.dryRun ? 'Would prune (expired):' : 'Pruned (expired):'}
                  </div>
                  <div className="font-mono-label text-[11px] text-[var(--text-secondary)] space-y-0.5">
                    <div>
                      • Expired stories: {lastJanitorReport.wouldDelete.storyIds.length}
                    </div>
                    <div>
                      • Old feedIndex days: {lastJanitorReport.wouldDelete.feedIndexDayKeys.length}
                    </div>
                    <div>
                      • Old seen/&#123;0..f&#125; shard entries: {lastJanitorReport.wouldDelete.seenShardEntries.length}
                    </div>
                    <div>
                      • Old stats days (&gt;{lastJanitorReport.retentionDays}d) &amp; agentRuns (&gt;7d):{' '}
                      {lastJanitorReport.wouldDelete.statsDayKeys.length +
                        lastJanitorReport.wouldDelete.agentRunIds.length}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                  <div className="font-medium text-[#3F9E6B] mb-1">
                    Protected (0 touched by Janitor or TTL):
                  </div>
                  <div className="font-mono-label text-[11px] text-[var(--text-secondary)] space-y-0.5">
                    <div>
                      • Starred snapshots preserved: {collectionCounts.starred} (0 listed for deletion)
                    </div>
                    <div>
                      • Episode desk snapshots preserved: {collectionCounts.deskSnapshots} (0 listed for deletion)
                    </div>
                    <div>
                      • Scripts preserved: {settings.keepScripts !== false ? collectionCounts.scripts : 0} (0 listed for deletion)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Appearance, Density, Thumbnails, Defaults & Guardrails */}
      <section className="desk-card p-5 space-y-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Appearance, density, and editorial defaults
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Theme */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Theme mode
            </label>
            <select
              value={settings.theme}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  theme: e.target.value as 'dark' | 'light',
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="dark">Dark (#0F1014)</option>
              <option value="light">Light (#F5F6F8)</option>
            </select>
          </div>

          {/* Density */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Row density
            </label>
            <select
              value={settings.density || 'comfortable'}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  density: e.target.value as DensityMode,
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="comfortable">Comfortable (default)</option>
              <option value="compact">Compact</option>
            </select>
          </div>

          {/* Thumbnails */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Article thumbnails (4:3)
            </label>
            <select
              value={settings.showThumbnails ? 'on' : 'off'}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  showThumbnails: e.target.value === 'on',
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="off">Off (text-first default)</option>
              <option value="on">On (real og:image or neutral tile)</option>
            </select>
          </div>

          {/* Default Language */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Default script language
            </label>
            <select
              value={settings.defaultLanguage}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultLanguage: e.target.value as UserSettings['defaultLanguage'],
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="Hinglish">Hinglish</option>
              <option value="Hindi">Hindi</option>
              <option value="English">English</option>
            </select>
          </div>

          {/* Default Tone */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Default satire tone
            </label>
            <select
              value={settings.defaultTone}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultTone: e.target.value as UserSettings['defaultTone'],
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="Mild">Mild</option>
              <option value="Medium">Medium</option>
              <option value="Savage">Savage</option>
            </select>
          </div>

          {/* Default Runtime */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Default script length
            </label>
            <select
              value={settings.defaultRuntime || '8 min'}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultRuntime: e.target.value as ScriptRuntimeTarget,
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="60s Short">60s Short</option>
              <option value="3 min">3 min</option>
              <option value="8 min">8 min</option>
              <option value="12 min">12 min</option>
            </select>
          </div>

          {/* Default Format */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Default script format
            </label>
            <select
              value={settings.defaultFormat || 'News-desk monologue'}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultFormat: e.target.value as ScriptFormat,
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="News-desk monologue">News-desk monologue</option>
              <option value="Rapid-fire headlines">Rapid-fire headlines</option>
              <option value="Deep-dive explainer">Deep-dive explainer</option>
            </select>
          </div>

          {/* AI Daily Limit */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Daily AI request limit (25% reserved for owner clicks)
            </label>
            <input
              type="number"
              min={1}
              max={1500}
              value={settings.aiDailyLimit || 20}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  aiDailyLimit: Math.min(1500, Math.max(1, Number(e.target.value) || 20)),
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm font-mono-label text-[var(--text-primary)]"
            />
          </div>

          {/* Retention Days */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Archive retention (days, default 25, max 60)
            </label>
            <input
              type="number"
              min={7}
              max={60}
              value={settings.retentionDays || 25}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  retentionDays: Math.min(60, Math.max(7, Number(e.target.value) || 25)),
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm font-mono-label text-[var(--text-primary)]"
            />
          </div>

          {/* Script Retention Policy (Section 5.4: Never deleted: scripts, configurable default keep) */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Script retention policy
            </label>
            <select
              value={settings.keepScripts !== false ? 'keep' : 'prune'}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  keepScripts: e.target.value === 'keep',
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
            >
              <option value="keep">Keep all scripts permanently (default)</option>
              <option value="prune">Allow Janitor to prune old draft scripts</option>
            </select>
          </div>
        </div>

        {/* Persistent Never-Joke List */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Persistent never-joke list (enforced across all scripts)
          </label>
          <textarea
            rows={2}
            value={settings.doNotJokeAbout}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                doNotJokeAbout: e.target.value.slice(0, 3000),
                updatedAt: new Date().toISOString(),
              })
            }
            className="w-full p-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-sm text-[var(--text-primary)]"
          />
        </div>

        {/* Sector Boosts (0.0 to 1.0) */}
        <div className="pt-3 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Sector priority boosts (0.0 to 1.0 — weights Importance score)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {SECTORS.map((sec) => {
              const boost = settings.sectorBoosts?.[sec] ?? 0.7;
              return (
                <div
                  key={sec}
                  className="p-2.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-[var(--text-primary)] truncate">{sec}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={boost}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          sectorBoosts: {
                            ...settings.sectorBoosts,
                            [sec]: parseFloat(e.target.value),
                          },
                          updatedAt: new Date().toISOString(),
                        })
                      }
                      className="w-20 accent-[#3D5AFE]"
                    />
                    <span className="font-mono-label w-8 text-right text-[var(--text-secondary)]">
                      {boost.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Export & Delete All Data */}
        <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExportAllJson}
            className="min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" strokeWidth={1.5} />
            Export desk backup (JSON)
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[44px] px-4 py-2 rounded-[10px] border border-[#C75450]/40 bg-[#C75450]/10 hover:bg-[#C75450] hover:text-white text-xs font-medium text-[#C75450] inline-flex items-center gap-2 cursor-pointer transition-colors duration-150"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              Delete all my data
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#C75450] font-medium">
                Confirm permanent wipe?
              </span>
              <button
                type="button"
                onClick={() => {
                  onDeleteAllData();
                  setConfirmDelete(false);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-[8px] bg-[#C75450] text-white text-xs font-medium cursor-pointer"
              >
                Yes, delete everything
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[38px] px-3 py-1.5 rounded-[8px] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

