import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  History,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  ScriptFormat,
  ScriptLanguage,
  ScriptRecord,
  ScriptRuntimeTarget,
  ScriptSection,
  ScriptSectionType,
  ScriptStatus,
  ScriptTone,
  StoryCluster,
} from '../types/desk';
import {
  checkScriptUnsourcedClaims,
  estimateSpokenDuration,
  unifyScriptIntoSingleSegment,
} from '../utils/deskEngine';

interface ScriptStudioViewProps {
  activeScript: ScriptRecord;
  allScripts: ScriptRecord[];
  stories: StoryCluster[];
  deskStoryIds: string[];
  defaultWpm: number;
  doNotJokeAbout: string;
  isGenerating: boolean;
  onSelectScript: (script: ScriptRecord) => void;
  onUpdateScript: (updated: ScriptRecord) => void;
  onGenerateNewScript: (params: {
    stories: StoryCluster[];
    language: ScriptLanguage;
    runtimeTarget: ScriptRuntimeTarget;
    tone: ScriptTone;
    format: ScriptFormat;
    isNeutralBriefing: boolean;
  }) => void;
}

const SECTION_LABELS: Record<ScriptSectionType, string> = {
  'COLD OPEN': 'Cold open',
  SETUP: 'Setup (facts)',
  TURN: 'Turn',
  PUNCHLINE: 'Punchline',
  BRIDGE: 'Bridge',
  OUTRO: 'Outro',
};

export const ScriptStudioView: React.FC<ScriptStudioViewProps> = ({
  activeScript,
  allScripts,
  stories,
  deskStoryIds,
  defaultWpm,
  doNotJokeAbout,
  isGenerating,
  onSelectScript,
  onUpdateScript,
  onGenerateNewScript,
}) => {
  const [sourceMode, setSourceMode] = useState<'single' | 'desk'>('desk');
  const [selectedStoryId, setSelectedStoryId] = useState<string>(
    stories[0]?.id || ''
  );
  const [language, setLanguage] = useState<ScriptLanguage>(
    activeScript.language || 'Hinglish'
  );
  const [runtimeTarget, setRuntimeTarget] = useState<ScriptRuntimeTarget>(
    activeScript.runtimeTarget || '8 min'
  );
  const [tone, setTone] = useState<ScriptTone>(activeScript.tone || 'Savage');
  const [format, setFormat] = useState<ScriptFormat>(
    activeScript.format || 'News-desk monologue'
  );
  const [wpm, setWpm] = useState<number>(defaultWpm || 150);

  const [undoStack, setUndoStack] = useState<ScriptSection[][]>([]);
  const [redoStack, setRedoStack] = useState<ScriptSection[][]>([]);

  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [teleprompterPlaying, setTeleprompterPlaying] = useState(false);
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(2);
  const [teleprompterFontSize, setTeleprompterFontSize] = useState(34);
  const [teleprompterMirror, setTeleprompterMirror] = useState(false);
  const teleprompterRef = useRef<HTMLDivElement | null>(null);

  const [dictatingSectionId, setDictatingSectionId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const [copiedExport, setCopiedExport] = useState(false);
  const [busySectionId, setBusySectionId] = useState<string | null>(null);
  const [busySectionMode, setBusySectionMode] = useState<string>('');
  const [editorMode, setEditorMode] = useState<'edit' | 'formatted'>('edit');

  const targetStories =
    sourceMode === 'single'
      ? stories.filter((s) => s.id === selectedStoryId)
      : stories.filter((s) => deskStoryIds.includes(s.id));

  const effectiveStories =
    targetStories.length > 0 ? targetStories : stories.slice(0, 1);

  const hasNoJokeStory = effectiveStories.some(
    (s) => s.sensitivity === 'no-joke'
  );

  const activeScriptStories = stories.filter((s) =>
    activeScript.storyIds.includes(s.id)
  );

  // Always present the script as ONE single unified segment containing all subheadings (Intro, Setup, Turn, Punchline, Outro)
  const unifiedSections = React.useMemo(
    () =>
      unifyScriptIntoSingleSegment(
        activeScript.sections,
        activeScriptStories[0]?.id || stories[0]?.id || '',
        activeScriptStories.map((s) => s.headline).join(' · ') || activeScript.title
      ),
    [activeScript.sections, activeScript.title, activeScriptStories, stories]
  );
  const unifiedSegment = unifiedSections[0];

  // Auto-unify multi-section legacy scripts into a single segment on load
  useEffect(() => {
    if (activeScript.sections.length > 1) {
      onUpdateScript({
        ...activeScript,
        sections: unifiedSections,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [activeScript.id]);

  // Extract subheadings (### ...) from the single unified segment for the outline panel
  const parsedSubheadings = React.useMemo(() => {
    const content = unifiedSegment?.content || '';
    const parts = content.split(/(?=^#{2,3}\s+)/m).filter((p) => p.trim().length > 0);
    if (parts.length === 0) {
      return [
        {
          heading: 'Full Script Segment',
          body: content,
        },
      ];
    }
    return parts.map((block, idx) => {
      const lines = block.trim().split('\n');
      const firstLine = lines[0] || '';
      if (/^#{2,3}\s+/.test(firstLine)) {
        return {
          heading: firstLine.replace(/^#{2,3}\s+/, '').trim(),
          body: lines.slice(1).join('\n').trim(),
        };
      }
      return {
        heading: idx === 0 ? 'INTRO (COLD OPEN)' : `SUBHEADING ${idx + 1}`,
        body: block.trim(),
      };
    });
  }, [unifiedSegment?.content]);

  const totalStorySources = activeScriptStories.reduce(
    (sum, s) => sum + (s.sources?.length || 0),
    0
  );
  const factBoxMaxIdx = (activeScript.factBox || []).reduce((max, fb) => {
    const m = fb.sourceTag?.match(/\[S(\d+)\]/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const maxSourceIndex = Math.max(
    10,
    totalStorySources,
    activeScript.factBox?.length || 0,
    factBoxMaxIdx,
    ...activeScriptStories.map((s) => s.sources.length)
  );

  const claimCheck = checkScriptUnsourcedClaims(
    unifiedSections,
    maxSourceIndex
  );

  const fullSpokenText = unifiedSections
    .map((sec) => sec.content)
    .join('\n\n');
  const durationStats = estimateSpokenDuration(fullSpokenText, wpm);

  useEffect(() => {
    if (!teleprompterOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setTeleprompterPlaying((prev) => !prev);
      } else if (e.code === 'Escape') {
        setTeleprompterOpen(false);
        setTeleprompterPlaying(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [teleprompterOpen]);

  useEffect(() => {
    if (!teleprompterOpen || !teleprompterPlaying) return;
    const interval = setInterval(() => {
      if (teleprompterRef.current) {
        teleprompterRef.current.scrollTop += teleprompterSpeed;
      }
    }, 35);
    return () => clearInterval(interval);
  }, [teleprompterOpen, teleprompterPlaying, teleprompterSpeed]);

  const pushSectionsChange = (
    nextSections: ScriptSection[],
    versionLabel?: string
  ) => {
    setUndoStack((prev) => [...prev.slice(-15), activeScript.sections]);
    setRedoStack([]);
    const nextVersions = versionLabel
      ? [
          {
            id: `ver_${Date.now()}`,
            savedAt: new Date().toISOString(),
            label: versionLabel,
            sections: activeScript.sections,
          },
          ...(activeScript.versions || []).slice(0, 4),
        ]
      : activeScript.versions;

    onUpdateScript({
      ...activeScript,
      sections: nextSections,
      versions: nextVersions,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, activeScript.sections]);
    setUndoStack((prev) => prev.slice(0, -1));
    onUpdateScript({
      ...activeScript,
      sections: previous,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, activeScript.sections]);
    setRedoStack((prev) => prev.slice(0, -1));
    onUpdateScript({
      ...activeScript,
      sections: next,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleBlockAction = async (
    section: ScriptSection,
    mode: 'youtuber_improvise' | 'regenerate_block' | 'punch_up' | 'tone_down'
  ) => {
    setBusySectionId(section.id);
    setBusySectionMode(
      mode === 'youtuber_improvise'
        ? 'Improvising into conversational YouTuber creator flow with Gemini...'
        : mode === 'punch_up'
          ? 'Punching up YouTuber roasts & analogies with Gemini...'
          : mode === 'tone_down'
            ? 'Softening into chill YouTuber explainer while keeping [S#] facts...'
            : 'Rewriting script in YouTuber creator voice with Gemini...'
    );
    try {
      const resp = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          targetSection: section,
          language,
          tone,
        }),
      });
      const data = await resp.json();
      if (data.ok && data.section) {
        const nextSections = activeScript.sections.map((s) =>
          s.id === section.id ? data.section : s
        );
        pushSectionsChange(
          nextSections,
          mode === 'youtuber_improvise'
            ? 'Improvised as YouTuber'
            : `Block ${mode.replace('_', ' ')}`
        );
      }
    } catch {
      // No-op if offline
    } finally {
      setBusySectionId(null);
      setBusySectionMode('');
    }
  };

  const handleAutoFixUnsourcedClaims = () => {
    const fixed = unifiedSections.map((sec) => {
      const clamped = sec.content.replace(/\[S(\d+)\]/g, (_m, d) => {
        const n = Math.max(1, Math.min(maxSourceIndex, parseInt(d, 10) || 1));
        return `[S${n}]`;
      });
      const fixedLines = clamped
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
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
            return line;
          }
          return trimmed
            .split(/(?<=[.?!])\s+(?!\[S\d+\])/)
            .map((sentence) =>
              /\[S\d+\]/.test(sentence)
                ? sentence
                : `${sentence.replace(/[.?!]+$/, '')} [S1].`
            )
            .join(' ');
        })
        .join('\n');
      return {
        ...sec,
        content: fixedLines,
      };
    });
    pushSectionsChange(fixed, 'Attached [S1] source tags');
  };

  const insertSnippetIntoUnifiedScript = (snippet: string) => {
    if (!unifiedSegment) return;
    const nextContent = `${unifiedSegment.content.trim()}\n\n${snippet}`;
    pushSectionsChange(
      [
        {
          ...unifiedSegment,
          content: nextContent,
        },
      ],
      'Inserted subheading'
    );
  };

  const toggleDictation = (sectionId: string) => {
    if (dictatingSectionId === sectionId) {
      recognitionRef.current?.stop();
      setDictatingSectionId(null);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'Hindi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        const nextSections = activeScript.sections.map((s) =>
          s.id === sectionId
            ? { ...s, content: `${s.content} ${transcript}` }
            : s
        );
        pushSectionsChange(nextSections, 'Voice dictation');
      }
      setDictatingSectionId(null);
    };
    recognition.onerror = () => setDictatingSectionId(null);
    recognition.onend = () => setDictatingSectionId(null);
    recognitionRef.current = recognition;
    setDictatingSectionId(sectionId);
    recognition.start();
  };

  const formatExportContent = (ext: 'txt' | 'md') => {
    const header =
      ext === 'md'
        ? `# ${activeScript.title}\n\n**Format:** ${activeScript.format} | **Language:** ${activeScript.language} | **Tone:** ${activeScript.tone} | **Estimated duration:** ${durationStats.formatted} (${durationStats.wordCount} words @ ${wpm} wpm)\n\n> **Reminder:** Verify facts at the linked sources before publishing.\n\n---\n\n`
        : `${activeScript.title}\nFormat: ${activeScript.format} | Language: ${activeScript.language} | Tone: ${activeScript.tone} | Duration: ${durationStats.formatted}\nReminder: Verify facts at the linked sources before publishing.\n================================================================\n\n`;

    const body = activeScript.sections
      .map((sec) => {
        const cuesStr = sec.cues.join('\n');
        return ext === 'md'
          ? `### ${SECTION_LABELS[sec.type] || sec.type} ${sec.storyHeadline ? `— ${sec.storyHeadline}` : ''}\n${cuesStr ? `\`\`\`\n${cuesStr}\n\`\`\`\n` : ''}${sec.content}\n`
          : `${SECTION_LABELS[sec.type] || sec.type} ${sec.storyHeadline || ''}\n${cuesStr}\n${sec.content}\n`;
      })
      .join('\n');

    const facts =
      ext === 'md'
        ? `\n---\n## Fact box (verified source claims)\n` +
          activeScript.factBox
            .map((f) => `- **${f.sourceTag}** ${f.claim} — [${f.outlet}](${f.url})`)
            .join('\n')
        : `\n================================================================\nFact box:\n` +
          activeScript.factBox
            .map((f) => `${f.sourceTag} ${f.claim} (${f.outlet}: ${f.url})`)
            .join('\n');

    return header + body + facts;
  };

  const handleDownloadFile = (ext: 'txt' | 'md') => {
    const content = formatExportContent(ext);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeScript.id || 'satire_script'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Mandatory Reminder Banner (Section 10.4) */}
      <div className="desk-card p-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[#3D5AFE] text-white font-medium">
            Editorial rule
          </span>
          <span>Verify facts at the linked sources before publishing.</span>
          {activeScript.draftByAgent && (
            <span className="text-xs px-2 py-0.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              Draft by agent
            </span>
          )}
        </div>
        <span className="font-mono-label text-xs text-[var(--text-secondary)]">
          {durationStats.wordCount} spoken words · Est. {durationStats.formatted} @ {wpm} wpm
        </span>
      </div>

      {/* Script Generation Controls */}
      <section className="desk-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
          <h1 className="font-serif-headline text-xl font-semibold text-[var(--text-primary)]">
            Script studio
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Script status"
              value={activeScript.status || 'Draft'}
              onChange={(e) =>
                onUpdateScript({
                  ...activeScript,
                  status: e.target.value as ScriptStatus,
                  updatedAt: new Date().toISOString(),
                })
              }
              className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
            >
              <option value="Draft">Status: Draft</option>
              <option value="Final">Status: Final</option>
              <option value="Recorded">Status: Recorded</option>
              <option value="Published">Status: Published</option>
            </select>

            <select
              aria-label="Active script"
              value={activeScript.id}
              onChange={(e) => {
                const found = allScripts.find((sc) => sc.id === e.target.value);
                if (found) onSelectScript(found);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
            >
              {allScripts.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.title.slice(0, 52)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Source scope
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSourceMode('desk')}
                className={`flex-1 min-h-[40px] px-2.5 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                  sourceMode === 'desk'
                    ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
                }`}
              >
                Episode desk ({deskStoryIds.length})
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('single')}
                className={`flex-1 min-h-[40px] px-2.5 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                  sourceMode === 'single'
                    ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)]'
                }`}
              >
                Single story
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as ScriptLanguage)}
              className="w-full min-h-[40px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
            >
              <option value="Hinglish">Hinglish (default)</option>
              <option value="Hindi">Hindi</option>
              <option value="English">English</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Runtime target
            </label>
            <select
              value={runtimeTarget}
              onChange={(e) => setRuntimeTarget(e.target.value as ScriptRuntimeTarget)}
              className="w-full min-h-[40px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
            >
              <option value="60s Short">60s Short</option>
              <option value="3 min">3 min</option>
              <option value="8 min">8 min</option>
              <option value="12 min">12 min</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Tone
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as ScriptTone)}
              className="w-full min-h-[40px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
            >
              <option value="Mild">Mild</option>
              <option value="Medium">Medium</option>
              <option value="Savage">Savage</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ScriptFormat)}
              className="w-full min-h-[40px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
            >
              <option value="News-desk monologue">News-desk monologue</option>
              <option value="Rapid-fire headlines">Rapid-fire headlines</option>
              <option value="Deep-dive explainer">Deep-dive explainer</option>
            </select>
          </div>
        </div>

        {sourceMode === 'single' && (
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Select story
            </label>
            <select
              value={selectedStoryId}
              onChange={(e) => setSelectedStoryId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-primary)]"
            >
              {stories.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.sector} · {st.headline}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="text-xs text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">Never joke about:</span>{' '}
            {doNotJokeAbout}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasNoJokeStory ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  title="Disabled because a selected story is marked no-joke"
                  className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[var(--bg-raised)] border border-[#C75450]/40 text-[#C75450] text-xs font-medium cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-4 h-4" strokeWidth={1.5} />
                  Satire disabled (no-joke)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onGenerateNewScript({
                      stories: effectiveStories,
                      language,
                      runtimeTarget,
                      tone,
                      format,
                      isNeutralBriefing: true,
                    })
                  }
                  disabled={isGenerating}
                  className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                  {isGenerating ? 'Generating briefing...' : 'Generate neutral briefing'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onGenerateNewScript({
                    stories: effectiveStories,
                    language,
                    runtimeTarget,
                    tone,
                    format,
                    isNeutralBriefing: false,
                  })
                }
                disabled={isGenerating}
                className="min-h-[44px] px-5 py-2 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                {isGenerating
                  ? 'Generating script...'
                  : `Generate satire script (${effectiveStories.length} ${
                      effectiveStories.length === 1 ? 'story' : 'stories'
                    })`}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar: Undo, Redo, WPM, Versions, Teleprompter, Export */}
      <div className="desk-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} /> Undo
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Redo
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs">
            <span className="text-[var(--text-secondary)]">Speed (wpm):</span>
            <input
              type="number"
              min={80}
              max={240}
              value={wpm}
              onChange={(e) => setWpm(Number(e.target.value) || 150)}
              className="w-12 bg-transparent text-[var(--text-primary)] font-mono-label font-medium focus:outline-none"
            />
          </div>

          {activeScript.versions && activeScript.versions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[var(--text-secondary)]" strokeWidth={1.5} />
              <select
                aria-label="Restore script version"
                defaultValue=""
                onChange={(e) => {
                  const ver = activeScript.versions.find((v) => v.id === e.target.value);
                  if (ver && ver.sections.length > 0) {
                    pushSectionsChange(ver.sections, `Restored ${ver.label}`);
                  }
                }}
                className="min-h-[38px] px-2.5 py-1 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-xs text-[var(--text-secondary)]"
              >
                <option value="" disabled>
                  Versions ({activeScript.versions.length})
                </option>
                {activeScript.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} ({new Date(v.savedAt).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTeleprompterOpen(true);
              setTeleprompterPlaying(false);
            }}
            className="min-h-[38px] px-3.5 py-1.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            Teleprompter
          </button>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(formatExportContent('txt'));
              setCopiedExport(true);
              setTimeout(() => setCopiedExport(false), 1800);
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copiedExport ? <Check className="w-3.5 h-3.5 text-[#3F9E6B]" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedExport ? 'Copied' : 'Copy'}
          </button>

          <button
            type="button"
            onClick={() => handleDownloadFile('txt')}
            className="min-h-[38px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> .txt
          </button>

          <button
            type="button"
            onClick={() => handleDownloadFile('md')}
            className="min-h-[38px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> .md
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[38px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" strokeWidth={1.5} /> Print
          </button>
        </div>
      </div>

      {/* Three-Column Studio Layout (Section 10.4: Outline | Editor | Sources & Fact-check) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Column 1: Single-Segment Subheading Outline & Saved Scripts (3 cols) */}
        <aside className="lg:col-span-3 desk-card p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-[var(--text-secondary)]">
                Single-segment subheadings ({parsedSubheadings.length})
              </h2>
              <span className="text-[10px] font-mono-label px-1.5 py-0.5 rounded bg-[#3D5AFE]/15 text-[#3D5AFE]">
                1 Segment
              </span>
            </div>
            <ol className="space-y-1.5">
              {parsedSubheadings.map((sub, idx) => {
                const dur = estimateSpokenDuration(sub.body, wpm);
                return (
                  <li
                    key={idx}
                    className="p-2 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {idx + 1}. {sub.heading}
                    </span>
                    <span className="font-mono-label text-[var(--text-secondary)] shrink-0 ml-2">
                      {dur.formatted}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="pt-3 border-t border-[var(--border-subtle)]">
            <h2 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
              Saved scripts ({allScripts.length})
            </h2>
            <div className="space-y-1.5">
              {allScripts.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => onSelectScript(sc)}
                  className={`w-full text-left p-2.5 rounded-[8px] border text-xs cursor-pointer transition-colors duration-150 ${
                    sc.id === activeScript.id
                      ? 'border-[#3D5AFE] bg-[#3D5AFE]/10 text-[var(--text-primary)] font-medium'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="truncate">{sc.title}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {sc.language} · {sc.runtimeTarget} · {sc.status || 'Draft'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Column 2: Unified Single-Segment Script Editor (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {unifiedSections.map((section) => {
            const secDuration = estimateSpokenDuration(section.content, wpm);
            const isUnsourced = claimCheck.unsourcedLines.some(
              (u) => u.sectionId === section.id
            );

            return (
              <div
                key={section.id}
                className={`desk-card p-4 sm:p-5 relative space-y-3 ${
                  isUnsourced ? 'border-[#C9922E]' : ''
                }`}
              >
                {busySectionId === section.id && (
                  <div className="mb-3 p-3 rounded-[10px] bg-[#3D5AFE]/15 border border-[#3D5AFE]/40 flex items-center gap-2.5 text-xs text-[var(--text-primary)]">
                    <RefreshCw
                      className="w-4 h-4 text-[#3D5AFE] animate-spin shrink-0"
                      strokeWidth={1.5}
                    />
                    <div>
                      <span className="font-semibold">
                        {busySectionMode || 'Gemini is rewriting this script segment...'}
                      </span>
                      <span className="text-[var(--text-secondary)] ml-2">
                        Preserving Intro, Subheadings, Outro &amp; verified [S#] citations
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[#3D5AFE] text-white font-medium">
                      YouTuber Creator Script · Single Segment (Intro · Story · Satire Turn · Roast · Outro)
                    </span>
                    <span className="font-mono-label text-xs text-[var(--text-muted)]">
                      {secDuration.wordCount}w · {secDuration.formatted}
                    </span>
                    {isUnsourced && (
                      <span className="text-xs px-2 py-0.5 rounded-[8px] bg-[#C9922E]/15 text-[#C9922E] border border-[#C9922E]/40 font-medium">
                        Unsourced claim
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBlockAction(section, 'youtuber_improvise')}
                      disabled={busySectionId === section.id}
                      className="px-2.5 py-1 rounded-[8px] bg-[#3D5AFE] hover:bg-[#3D5AFE]/90 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Improvise this script into a conversational YouTuber creator voice"
                    >
                      <Sparkles className="w-3 h-3" strokeWidth={1.5} /> Improvise as YouTuber
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditorMode((m) => (m === 'edit' ? 'formatted' : 'edit'))
                      }
                      className={`px-2.5 py-1 rounded-[8px] border text-xs font-medium cursor-pointer ${
                        editorMode === 'formatted'
                          ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-primary)] hover:border-[#3D5AFE]'
                      }`}
                    >
                      {editorMode === 'formatted' ? 'Edit Text' : 'Formatted View'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlockAction(section, 'punch_up')}
                      disabled={busySectionId === section.id}
                      className="px-2.5 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      Punch up
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlockAction(section, 'tone_down')}
                      disabled={busySectionId === section.id}
                      className="px-2.5 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Wand2 className="w-3 h-3 text-[#3F9E6B]" strokeWidth={1.5} /> Tone down
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlockAction(section, 'regenerate_block')}
                      disabled={busySectionId === section.id}
                      className="px-2.5 py-1 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${busySectionId === section.id ? 'animate-spin' : ''}`}
                        strokeWidth={1.5}
                      />{' '}
                      Rewrite
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleDictation(section.id)}
                      className={`px-2.5 py-1 rounded-[8px] border text-xs inline-flex items-center gap-1 cursor-pointer ${
                        dictatingSectionId === section.id
                          ? 'border-[#C75450] bg-[#C75450] text-white'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-primary)] hover:border-[#3D5AFE]'
                      }`}
                    >
                      {dictatingSectionId === section.id ? (
                        <>
                          <MicOff className="w-3 h-3" strokeWidth={1.5} /> Stop mic
                        </>
                      ) : (
                        <>
                          <Mic className="w-3 h-3" strokeWidth={1.5} /> Dictate
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick Subheading & Creator Cue Insertion Bar */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-[var(--text-secondary)] mr-1">
                    Insert YouTuber subheading / cue:
                  </span>
                  {(
                    [
                      {
                        label: '+ Intro Hook',
                        text: '### INTRO (YOUTUBER HOOK & COLD OPEN)\n',
                      },
                      {
                        label: '+ Real Story',
                        text: '### SUBHEADING: KYA SCENE HAI? (THE REAL STORY & VERIFIED FACTS)\n',
                      },
                      {
                        label: '+ Satire Turn',
                        text: '### SUBHEADING: WAIT, IT GETS CRAZIER (THE SATIRE TURN & BREAKDOWN)\n',
                      },
                      {
                        label: '+ Final Roast',
                        text: '### SUBHEADING: FINAL ROAST, PUNCHLINES & REAL TALK\n',
                      },
                      {
                        label: '+ Outro & CTA',
                        text: '### OUTRO (COMMENT BAIT & YOUTUBER SIGN-OFF)\n',
                      },
                      { label: '+ [ZOOM IN]', text: '[ZOOM IN ON FACE]' },
                      {
                        label: '+ [SCREENSHOT]',
                        text: '[SCREENSHOT POPUP: Official report headline]',
                      },
                      { label: '+ [MEME CUT]', text: '[MEME CUT: Reaction clip]' },
                      { label: '+ [B-ROLL]', text: '[B-ROLL: News footage overlay]' },
                      { label: '+ [GRAPHIC]', text: '[GRAPHIC: Key stat callout card]' },
                    ] as const
                  ).map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => insertSnippetIntoUnifiedScript(btn.text)}
                      className="px-2 py-0.5 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {section.cues.length > 0 && (
                  <div className="space-y-1.5">
                    {section.cues.map((cue, cIdx) => (
                      <div
                        key={cIdx}
                        className="font-mono-label text-xs px-3 py-1.5 rounded-[8px] bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                      >
                        {cue}
                      </div>
                    ))}
                  </div>
                )}

                {editorMode === 'formatted' ? (
                  <div className="p-4 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] space-y-4">
                    {parsedSubheadings.map((sub, sIdx) => (
                      <div key={sIdx} className="space-y-1.5">
                        <h3 className="text-xs font-mono-label font-semibold uppercase tracking-wide text-[#3D5AFE] border-b border-[var(--border-subtle)] pb-1">
                          {sub.heading}
                        </h3>
                        <p className="text-[15px] leading-[1.7] text-[var(--text-primary)] whitespace-pre-wrap">
                          {sub.body}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={section.content}
                    onChange={(e) => {
                      pushSectionsChange([
                        {
                          ...section,
                          content: e.target.value,
                        },
                      ]);
                    }}
                    rows={22}
                    className="w-full p-3.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[15px] leading-[1.68] text-[var(--text-primary)] focus:border-[#3D5AFE] focus:outline-none"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Column 3: Fact-Check Status & Fact Box (3 cols) */}
        <aside className="lg:col-span-3 space-y-4">
          <section
            aria-label="Claim tag verification status"
            className={`desk-card p-4 ${
              claimCheck.isClean ? 'border-[#3F9E6B]/50' : 'border-[#C9922E]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {claimCheck.isClean ? (
                <Check className="w-4 h-4 text-[#3F9E6B] shrink-0 mt-0.5" strokeWidth={1.5} />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#C9922E] shrink-0 mt-0.5" strokeWidth={1.5} />
              )}
              <div>
                <h2 className="text-xs font-semibold text-[var(--text-primary)]">
                  {claimCheck.isClean
                    ? `All factual lines sourced (${claimCheck.sourcedClaimsCount} citations)`
                    : `${claimCheck.unsourcedLines.length} unsourced line(s) flagged`}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {claimCheck.isClean
                    ? 'Every setup sentence carries a source tag linked to the Fact box.'
                    : 'Every factual claim in Setup must carry a source tag like [S1].'}
                </p>
              </div>
            </div>

            {!claimCheck.isClean && (
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-2">
                <button
                  type="button"
                  onClick={handleAutoFixUnsourcedClaims}
                  className="w-full min-h-[36px] px-3 py-1.5 rounded-[8px] bg-[#C9922E] text-white text-xs font-medium cursor-pointer"
                >
                  Attach [S1] to unsourced lines
                </button>
                <ul className="space-y-1 text-xs text-[#C9922E]">
                  {claimCheck.unsourcedLines.map((item, idx) => (
                    <li key={idx}>
                      • {item.sectionLabel}: “{item.line.slice(0, 70)}...”
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="desk-card p-4 space-y-3">
            <h2 className="text-xs font-semibold text-[var(--text-secondary)]">
              Fact box ({activeScript.factBox.length})
            </h2>
            {activeScript.factBox.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">
                No source claims attached yet.
              </p>
            ) : (
              <div className="space-y-2">
                {activeScript.factBox.map((fb, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-label text-xs px-1.5 py-0.5 rounded-[6px] bg-[#3D5AFE] text-white font-medium">
                        {fb.sourceTag}
                      </span>
                      <a
                        href={fb.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#3D5AFE] hover:underline inline-flex items-center gap-1"
                      >
                        {fb.outlet}
                        <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                      </a>
                    </div>
                    <p className="text-xs text-[var(--text-primary)]">{fb.claim}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Full-Screen Teleprompter Modal */}
      {teleprompterOpen && (
        <div
          role="dialog"
          aria-label="Full-screen teleprompter"
          className="fixed inset-0 z-50 bg-[#0F1014] text-[#ECEDEF] flex flex-col"
        >
          <div className="px-6 py-4 border-b border-[#2A2D36] bg-[#16181D] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs px-2.5 py-1 rounded-[8px] bg-[#3D5AFE] text-white font-medium">
                Studio teleprompter
              </span>
              <span className="text-xs text-[#A0A4AF]">
                Cues and source tags hidden · Press Space to pause or play
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTeleprompterPlaying((p) => !p)}
                className="min-h-[40px] px-4 py-1.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                {teleprompterPlaying ? (
                  <>
                    <Pause className="w-4 h-4" strokeWidth={1.5} /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" strokeWidth={1.5} /> Auto-scroll
                  </>
                )}
              </button>

              <label className="flex items-center gap-2 text-xs text-[#A0A4AF]">
                Speed
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={teleprompterSpeed}
                  onChange={(e) => setTeleprompterSpeed(Number(e.target.value))}
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-[#A0A4AF]">
                Text size
                <input
                  type="range"
                  min={24}
                  max={56}
                  value={teleprompterFontSize}
                  onChange={(e) => setTeleprompterFontSize(Number(e.target.value))}
                />
              </label>

              <button
                type="button"
                onClick={() => setTeleprompterMirror((m) => !m)}
                className={`min-h-[40px] px-3 py-1.5 rounded-[10px] border text-xs font-medium cursor-pointer ${
                  teleprompterMirror
                    ? 'border-[#3D5AFE] bg-[#3D5AFE] text-white'
                    : 'border-[#2A2D36] bg-[#1C1F26] text-[#A0A4AF]'
                }`}
              >
                Mirror: {teleprompterMirror ? 'On' : 'Off'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTeleprompterOpen(false);
                  setTeleprompterPlaying(false);
                }}
                className="min-h-[40px] px-3.5 py-1.5 rounded-[10px] border border-[#2A2D36] bg-[#1C1F26] hover:border-[#C75450] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" strokeWidth={1.5} /> Exit
              </button>
            </div>
          </div>

          <div
            ref={teleprompterRef}
            className={`flex-1 overflow-y-auto px-8 sm:px-24 py-16 max-w-5xl mx-auto space-y-10 ${
              teleprompterMirror ? 'scale-x-[-1]' : ''
            }`}
          >
            {parsedSubheadings.map((sub, idx) => {
              const cleanSpoken = sub.body
                .replace(/\[S\d+\]/g, '')
                .replace(/\[(B-ROLL|GRAPHIC|SFX):[^\]]*\]/gi, '')
                .trim();

              return (
                <div key={idx} className="space-y-2">
                  <div className="text-sm font-medium text-[#3D5AFE]">
                    {sub.heading}
                  </div>
                  <p
                    style={{ fontSize: `${teleprompterFontSize}px`, lineHeight: 1.5 }}
                    className="font-serif-headline font-semibold text-[#ECEDEF] whitespace-pre-wrap"
                  >
                    {cleanSpoken}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
