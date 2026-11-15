import React, { useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  PlusCircle,
  Youtube,
  Building2,
  HelpCircle,
  Users,
  Clock,
  Scale,
  TrendingUp,
} from 'lucide-react';
import { StoryCluster } from '../types/desk';
import { formatPlainTextBrief } from '../utils/deskEngine';

interface StoryPageViewProps {
  story: StoryCluster;
  isSaved: boolean;
  isOnDesk: boolean;
  isSummarising: boolean;
  onBack: () => void;
  onToggleSave: (storyId: string) => void;
  onToggleDesk: (storyId: string) => void;
  onGenerateScript: (story: StoryCluster) => void;
  onRefreshSummary: (story: StoryCluster) => void;
}

type ResourceTab = 'titles' | 'thumbnails' | 'cards' | 'description' | 'releases';

export const StoryPageView: React.FC<StoryPageViewProps> = ({
  story,
  isSaved,
  isOnDesk,
  isSummarising,
  onBack,
  onToggleSave,
  onToggleDesk,
  onGenerateScript,
  onRefreshSummary,
}) => {
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [highlightedSourceIndex, setHighlightedSourceIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ResourceTab>('titles');

  const handleCopyBrief = () => {
    const text = formatPlainTextBrief(story);
    navigator.clipboard.writeText(text);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
  };

  const handleCopyText = (label: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const jumpToSource = (sourceIndex: number) => {
    setHighlightedSourceIndex(sourceIndex);
    const el = document.getElementById(`story-source-${sourceIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => setHighlightedSourceIndex(null), 2600);
  };

  const verificationStatus =
    story.verification || (story.sourceCount >= 2 ? 'verified' : 'single-source');

  const heatValue =
    typeof story.heatScore === 'number'
      ? story.heatScore
      : Math.min(95, Math.max(18, story.sourceCount * 16 + Math.round(story.importanceScore * 0.4)));
  const heatLabel =
    heatValue >= 75 ? 'Surging' : heatValue >= 50 ? 'Hot' : heatValue >= 25 ? 'Warm' : 'Cold';
  const filledSegments = Math.max(1, Math.min(5, Math.ceil(heatValue / 20)));

  const renderThirdBadge = () => {
    if (story.sensitivity === 'no-joke') {
      return (
        <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[#C75450]/15 text-[#C75450] border border-[#C75450]/40 inline-flex items-center gap-1.5 font-medium">
          <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.5} />
          No-joke
        </span>
      );
    }
    if (story.sensitivity === 'handle-with-care') {
      return (
        <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[#C9922E]/15 text-[#C9922E] border border-[#C9922E]/40 inline-flex items-center gap-1.5 font-medium">
          <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
          Handle with care
        </span>
      );
    }
    if (verificationStatus === 'verified') {
      return (
        <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[#3F9E6B]/15 text-[#3F9E6B] border border-[#3F9E6B]/40 inline-flex items-center gap-1.5 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          Verified
        </span>
      );
    }
    if (verificationStatus === 'developing') {
      return (
        <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[#C9922E]/15 text-[#C9922E] border border-[#C9922E]/40 inline-flex items-center gap-1.5 font-medium">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
          Developing
        </span>
      );
    }
    return (
      <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[var(--bg-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] inline-flex items-center gap-1.5">
        Single-source
      </span>
    );
  };

  return (
    <article className="pb-16">
      {/* Top Back & Summarise Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3.5 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#3D5AFE] text-sm font-medium text-[var(--text-primary)] inline-flex items-center gap-2 transition-colors duration-150 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to stories
        </button>

        <button
          type="button"
          onClick={() => onRefreshSummary(story)}
          disabled={isSummarising}
          className="min-h-[44px] px-3.5 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-2 transition-colors duration-150 cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 text-[#3D5AFE]" strokeWidth={1.5} />
          {isSummarising ? 'Summarising with Gemini...' : 'Refresh summary with Gemini'}
        </button>
      </div>

      {/* Two-Column Story Brief Layout (Section 11.3: Left ~65%, Right sticky ~35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (~65% -> 8 cols) */}
        <div className="lg:col-span-8 space-y-5 min-w-0">
          {/* Header: Max 3 badges + 32-40px Serif Headline + Plain Meta Line */}
          <header className="desk-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">
                {story.sector}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                {story.sourceCount} {story.sourceCount === 1 ? 'source' : 'sources'}
              </span>
              {renderThirdBadge()}
            </div>

            <h1 className="font-serif-headline text-[28px] sm:text-[36px] font-semibold leading-[1.2] text-[var(--text-primary)] mb-3">
              {story.headline}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
              <span
                title={`Importance score: ${story.importanceScore}/100`}
                className="inline-flex items-center gap-2"
              >
                <span>
                  {heatLabel} {heatValue}
                </span>
                <span className="inline-flex items-center gap-0.5" aria-label={`Heat ${heatValue}`}>
                  {[1, 2, 3, 4, 5].map((seg) => (
                    <span
                      key={seg}
                      className={`w-2.5 h-1.5 rounded-[2px] ${
                        seg <= filledSegments ? 'bg-[#C9922E]' : 'bg-[var(--border-subtle)]'
                      }`}
                    />
                  ))}
                </span>
              </span>
              <span>·</span>
              <span>Satire {story.satirePotential}/10</span>
              <span>·</span>
              <span className="font-mono-label text-[var(--text-muted)]">
                Updated {new Date(story.updatedAt).toLocaleString()}
              </span>
            </div>
          </header>

          {/* Sensitivity Notice */}
          {story.sensitivity !== 'normal' && (
            <div
              className={`p-4 rounded-[10px] border ${
                story.sensitivity === 'no-joke'
                  ? 'bg-[#C75450]/10 border-[#C75450]/40 text-[#C75450]'
                  : 'bg-[#C9922E]/10 border-[#C9922E]/40 text-[#C9922E]'
              }`}
            >
              <p className="text-sm font-medium">
                {story.sensitivity === 'no-joke'
                  ? 'No-joke guardrail active: This story involves fatalities, tragedy, or protected categories. Satirical script generation and comedy angles are disabled; only a neutral factual briefing is permitted.'
                  : 'Handle with care: This story involves ongoing court matters or sensitive social tension. Keep commentary focused strictly on verified institutional actions.'}
              </p>
            </div>
          )}

          {/* Skeleton State while Summarising */}
          {isSummarising ? (
            <div className="desk-card p-5 space-y-4 animate-pulse" aria-label="Loading story summary">
              <div className="h-4 w-36 rounded bg-[var(--bg-raised)]" />
              <div className="h-3.5 w-full rounded bg-[var(--bg-raised)]" />
              <div className="h-3.5 w-5/6 rounded bg-[var(--bg-raised)]" />
              <div className="h-4 w-44 rounded bg-[var(--bg-raised)] mt-4" />
              <div className="h-3.5 w-4/5 rounded bg-[var(--bg-raised)]" />
            </div>
          ) : (
            <>
              {/* What happened & Why it matters */}
              <section className="desk-card p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                    What happened
                  </h2>
                  <p className="text-[15px] leading-[1.65] text-[var(--text-primary)]">
                    {story.whatHappened || 'Summary pending. Click Refresh summary with Gemini to generate a grounded brief from the linked articles.'}
                  </p>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                    Why it matters
                  </h2>
                  <p className="text-[15px] leading-[1.65] text-[var(--text-secondary)]">
                    {story.whyItMatters || 'Context pending grounded summary.'}
                  </p>
                </div>
              </section>

              {/* Key facts & Key numbers */}
              <section className="desk-card p-5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                  Key facts and verified numbers
                </h2>

                {story.keyFacts.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    No extracted key facts yet. Refresh summary to extract sourced facts with citations.
                  </p>
                ) : (
                  <ul className="space-y-2.5 mb-4">
                    {story.keyFacts.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start justify-between gap-3 p-3 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)]"
                      >
                        <span className="text-sm text-[var(--text-primary)]">
                          {item.fact}
                        </span>
                        <button
                          type="button"
                          onClick={() => jumpToSource(item.sourceIndex)}
                          title={`Jump to source [S${item.sourceIndex}]`}
                          className="shrink-0 font-mono-label text-xs px-2 py-0.5 rounded-[6px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white font-medium cursor-pointer transition-colors duration-150"
                        >
                          [S{item.sourceIndex}]
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {story.keyNumbers.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                    {story.keyNumbers.map((num, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-base)] flex flex-col justify-between"
                      >
                        <span className="text-xs text-[var(--text-secondary)]">{num.label}</span>
                        <div className="mt-1.5 flex items-baseline justify-between gap-2">
                          <span className="font-mono-label text-lg font-semibold text-[var(--text-primary)]">
                            {num.value}
                          </span>
                          <button
                            type="button"
                            onClick={() => jumpToSource(num.sourceIndex)}
                            className="font-mono-label text-xs px-1.5 py-0.5 rounded-[6px] bg-[var(--bg-raised)] text-[#3D5AFE] border border-[var(--border-subtle)] hover:border-[#3D5AFE] cursor-pointer"
                          >
                            [S{num.sourceIndex}]
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Timeline & Who is involved */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <section className="desk-card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
                    Timeline
                  </h2>
                  {story.timeline.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                      No timeline events extracted yet.
                    </p>
                  ) : (
                    <ol className="space-y-3 border-l border-[var(--border-subtle)] ml-2 pl-4">
                      {story.timeline.map((tl, idx) => (
                        <li key={idx} className="relative">
                          <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#3D5AFE]" />
                          <div className="font-mono-label text-xs text-[var(--text-secondary)]">
                            {tl.date}
                            {tl.sourceIndex ? (
                              <button
                                type="button"
                                onClick={() => jumpToSource(tl.sourceIndex!)}
                                className="text-[#3D5AFE] hover:underline ml-1.5 cursor-pointer"
                              >
                                [S{tl.sourceIndex}]
                              </button>
                            ) : null}
                          </div>
                          <p className="text-sm text-[var(--text-primary)] mt-0.5">{tl.event}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className="desk-card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
                    Who is involved
                  </h2>
                  {story.stakeholders.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                      No named stakeholders extracted yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {story.stakeholders.map((sh, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-[var(--text-primary)]">
                              {sh.name}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-[6px] bg-[var(--bg-base)] text-[var(--text-secondary)]">
                              {sh.role}
                            </span>
                          </div>
                          {sh.stance && (
                            <p className="text-xs text-[var(--text-secondary)] mt-1">{sh.stance}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* How outlets framed it & Open questions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <section className="desk-card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
                    How outlets framed it
                  </h2>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {story.framingNotes || 'No framing differences noted across current sources.'}
                  </p>
                </section>

                <section className="desk-card p-5">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
                    Open questions
                  </h2>
                  {story.openQuestions.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                      No unconfirmed claims flagged.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                      {story.openQuestions.map((q, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#C9922E] font-medium">•</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Comedy angles */}
              <section className="desk-card p-5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                  Comedy angles (punching up at power, absurdity, and hypocrisy)
                </h2>

                {story.sensitivity === 'no-joke' ? (
                  <p className="text-sm text-[#C75450]">
                    Comedy angles are disabled for no-joke stories.
                  </p>
                ) : story.comedyAngles.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    No comedy angles generated yet. Refresh summary to generate angles grounded in verified facts.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {story.comedyAngles.map((ca, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] flex flex-col justify-between"
                      >
                        <div>
                          <span className="text-xs px-2 py-0.5 rounded-[6px] bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium capitalize">
                            Target: {ca.target}
                          </span>
                          <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-2">
                            {ca.angle}
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                            “{ca.punchlineHint}”
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* Creator Resources in Tabs Below (Section 11.3) */}
          <section className="desk-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Creator packaging and resources
              </h2>
              <button
                type="button"
                onClick={handleCopyBrief}
                className="min-h-[38px] px-3 py-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedBrief ? <Check className="w-3.5 h-3.5 text-[#3F9E6B]" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedBrief ? 'Copied brief' : 'Copy plain-text brief'}
              </button>
            </div>

            {/* Resource Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              {(
                [
                  { id: 'titles', label: 'Title ideas' },
                  { id: 'thumbnails', label: 'Thumbnail text' },
                  { id: 'cards', label: 'On-screen cards' },
                  { id: 'description', label: 'Description & tags' },
                  { id: 'releases', label: 'Official releases & video' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-[10px] text-xs font-medium transition-colors duration-150 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-[#3D5AFE] text-white'
                      : 'bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'titles' && (
              <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    5 YouTube title ideas
                  </span>
                  {story.videoIdeas.titles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleCopyText('titles', story.videoIdeas.titles.join('\n'))}
                      className="text-xs text-[#3D5AFE] hover:underline cursor-pointer"
                    >
                      {copiedField === 'titles' ? 'Copied' : 'Copy all'}
                    </button>
                  )}
                </div>
                {story.videoIdeas.titles.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Refresh summary to generate 5 title ideas.
                  </p>
                ) : (
                  <ol className="space-y-2 text-sm text-[var(--text-primary)] list-decimal list-inside">
                    {story.videoIdeas.titles.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {activeTab === 'thumbnails' && (
              <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)]">
                <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2.5">
                  5 thumbnail text ideas
                </span>
                {story.videoIdeas.thumbnails.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Refresh summary to generate thumbnail text ideas.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {story.videoIdeas.thumbnails.map((th, i) => (
                      <span
                        key={i}
                        className="text-xs px-3 py-1.5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium"
                      >
                        {th}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'cards' && (
              <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)]">
                <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2.5">
                  On-screen graphic cards from verified key numbers
                </span>
                {story.videoIdeas.onScreenCards.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    No on-screen cards generated yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {story.videoIdeas.onScreenCards.map((card, i) => (
                      <span
                        key={i}
                        className="text-xs px-3 py-1.5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                      >
                        {card}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'description' && (
              <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    Description with timestamps and hashtags
                  </span>
                  {story.videoIdeas.description && (
                    <button
                      type="button"
                      onClick={() => handleCopyText('desc', story.videoIdeas.description)}
                      className="text-xs text-[#3D5AFE] hover:underline cursor-pointer"
                    >
                      {copiedField === 'desc' ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <pre className="text-xs font-mono-label whitespace-pre-wrap p-3 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  {story.videoIdeas.description || 'Description pending summary.'}
                </pre>
              </div>
            )}

            {activeTab === 'releases' && (
              <div className="p-4 rounded-[10px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] space-y-4">
                <div>
                  <span className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5 mb-2">
                    <Building2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Official releases (PIB, RBI, SEBI)
                  </span>
                  {story.govReleases.length === 0 ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      No separate regulator release attached; primary news sources are listed in the right panel.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {story.govReleases.map((rel) => (
                        <a
                          key={rel.id}
                          href={rel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[#3D5AFE]"
                        >
                          <div className="flex items-center justify-between text-xs text-[#3D5AFE] font-medium">
                            <span>
                              {rel.agency} · {rel.referenceCode}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </div>
                          <div className="text-xs text-[var(--text-primary)] mt-1">{rel.title}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {story.relatedVideos.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5 mb-2">
                      <Youtube className="w-3.5 h-3.5 text-[#C75450]" strokeWidth={1.5} />
                      Related YouTube coverage
                    </span>
                    <div className="space-y-1.5">
                      {story.relatedVideos.map((rv) => (
                        <a
                          key={rv.id}
                          href={rv.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 text-xs p-2.5 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[#3D5AFE]"
                        >
                          <span className="truncate text-[var(--text-primary)]">
                            {rv.channelName}: {rv.title}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" strokeWidth={1.5} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right Sticky Column (~35% -> 4 cols — Section 11.3: Actions, Sources, Verification, Why this is rising) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          {/* Quick Actions Card */}
          <div className="desk-card p-4 space-y-2.5">
            <h2 className="text-xs font-semibold text-[var(--text-secondary)]">
              Story actions
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onToggleSave(story.id)}
                className={`min-h-[44px] px-3 py-2 rounded-[10px] border text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                  isSaved
                    ? 'border-[#3F9E6B] bg-[#3F9E6B]/15 text-[#3F9E6B]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-primary)] hover:border-[#3D5AFE]'
                }`}
              >
                <Bookmark className="w-4 h-4" strokeWidth={1.5} />
                {isSaved ? 'Starred' : 'Star (s)'}
              </button>

              <button
                type="button"
                onClick={() => onToggleDesk(story.id)}
                className={`min-h-[44px] px-3 py-2 rounded-[10px] border text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                  isOnDesk
                    ? 'border-[#3D5AFE] bg-[#3D5AFE]/15 text-[#3D5AFE]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[var(--text-primary)] hover:border-[#3D5AFE]'
                }`}
              >
                <PlusCircle className="w-4 h-4" strokeWidth={1.5} />
                {isOnDesk ? 'On desk' : 'Add to desk (d)'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => onGenerateScript(story)}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-[10px] bg-[#3D5AFE] hover:bg-[#304FFE] text-white text-xs font-medium inline-flex items-center justify-center gap-2 cursor-pointer transition-colors duration-150"
            >
              <FileText className="w-4 h-4" strokeWidth={1.5} />
              {story.sensitivity === 'no-joke'
                ? 'Generate neutral briefing (g)'
                : 'Generate script (g)'}
            </button>

            <button
              type="button"
              onClick={handleCopyBrief}
              className="w-full min-h-[40px] px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[#3D5AFE] text-xs font-medium text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
              {copiedBrief ? 'Copied brief to clipboard' : 'Copy brief'}
            </button>
          </div>

          {/* Verification & Why this is rising (Section 8.3 & 11.3) */}
          <div className="desk-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Verification
              </span>
              <span className="text-xs font-medium capitalize text-[var(--text-primary)]">
                {verificationStatus} ({story.sourceCount} {story.sourceCount === 1 ? 'outlet' : 'outlets'})
              </span>
            </div>

            <div className="pt-3 border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#C9922E]" strokeWidth={1.5} />
                <span>Why this is rising</span>
              </div>
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                {story.whyRising ||
                  `First seen ${new Date(story.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}; covered by ${story.sourceCount} ${
                    story.sourceCount === 1 ? 'outlet' : 'outlets'
                  }${story.subtags.length > 0 ? ` · Keywords: ${story.subtags.slice(0, 4).join(', ')}` : ''}.`}
              </p>
            </div>
          </div>

          {/* Linked Real Sources (Section 11.3) */}
          <div className="desk-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--text-secondary)]">
                Sources ({story.sources.length})
              </h2>
              <span className="text-[11px] text-[var(--text-muted)]">
                Opens original article
              </span>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {story.sources.map((src) => {
                const isHighlighted = highlightedSourceIndex === src.index;
                return (
                  <div
                    key={src.index}
                    id={`story-source-${src.index}`}
                    className={`p-3 rounded-[10px] border transition-colors duration-150 ${
                      isHighlighted
                        ? 'border-[#3D5AFE] bg-[#3D5AFE]/10'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-raised)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono-label text-xs px-1.5 py-0.5 rounded-[6px] bg-[#3D5AFE] text-white font-medium shrink-0">
                        [S{src.index}]
                      </span>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#3D5AFE] hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        Read
                        <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                      </a>
                    </div>
                    <div className="text-xs font-medium text-[var(--text-primary)] mt-1.5 line-clamp-2">
                      {src.title}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-1 flex items-center justify-between">
                      <span>{src.outlet}</span>
                      <span className="font-mono-label">
                        {new Date(src.publishedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
};
