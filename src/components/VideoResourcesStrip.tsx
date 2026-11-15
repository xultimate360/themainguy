import React from 'react';
import { Play, ExternalLink, Tv } from 'lucide-react';
import { RelatedVideo } from '../types/desk';

interface VideoResourcesStripProps {
  videos: RelatedVideo[];
  activeSector?: string;
  showThumbnails?: boolean;
}

export const VideoResourcesStrip: React.FC<VideoResourcesStripProps> = ({
  videos,
  activeSector,
  showThumbnails = false,
}) => {
  if (!videos || videos.length === 0) return null;

  const lead = videos[0];
  const gridVideos = videos.slice(1, 5);

  return (
    <section
      aria-label="Video resources strip"
      className="my-6 desk-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Tv className="w-4 h-4 text-[var(--text-secondary)]" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Tracked YouTube channels
          </h2>
        </div>
        <span className="text-xs text-[var(--text-secondary)]">
          {activeSector && activeSector !== 'Top stories' ? activeSector : 'All channels'} · {videos.length} videos
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Lead Video */}
        <a
          href={lead.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="lg:col-span-6 group flex flex-col justify-between rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] overflow-hidden hover:border-[#3D5AFE] transition-colors duration-150"
        >
          {showThumbnails && lead.thumbnailUrl ? (
            <div className="relative aspect-[4/3] w-full bg-[var(--bg-base)] overflow-hidden border-b border-[var(--border-subtle)]">
              <img
                src={lead.thumbnailUrl}
                alt={lead.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                <Play className="w-3.5 h-3.5 text-[#3D5AFE]" strokeWidth={1.5} />
                Lead video · {lead.sector}
              </span>
              <span className="font-mono-label">{lead.duration}</span>
            </div>
          )}

          <div className="p-4 flex-1 flex flex-col justify-between">
            <h3 className="font-serif-headline text-[20px] font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[#3D5AFE] transition-colors duration-150 line-clamp-2">
              {lead.title}
            </h3>
            <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">{lead.channelName}</span>
              <span className="inline-flex items-center gap-1">
                {lead.viewsLabel || 'Open video'}
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
              </span>
            </div>
          </div>
        </a>

        {/* Secondary Videos */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {gridVideos.map((vid) => (
            <a
              key={vid.id}
              href={vid.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col justify-between rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3.5 hover:border-[#3D5AFE] transition-colors duration-150"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                  <span>{vid.channelName}</span>
                  <span className="font-mono-label">{vid.duration}</span>
                </div>
                <h4 className="font-serif-headline text-base font-semibold leading-snug text-[var(--text-primary)] group-hover:text-[#3D5AFE] transition-colors duration-150 line-clamp-2">
                  {vid.title}
                </h4>
              </div>
              <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>{vid.sector}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
