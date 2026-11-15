import { z } from 'zod';
import { SECTORS } from '../types/desk';

export const ValidIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, 'ID must contain only alphanumeric characters, underscores, or hyphens');

export const SectorSchema = z.enum(SECTORS);

export const SourceItemSchema = z.object({
  id: ValidIdSchema,
  name: z.string().min(1).max(200),
  type: z.enum(['rss', 'youtube', 'regulator', 'google_news']),
  url: z.string().url().max(2000),
  sector: z.string().min(1).max(80),
  language: z.enum(['en', 'hi']),
  trust: z.number().int().min(1).max(5),
  priority: z.enum(['high', 'normal']).optional().default('normal'),
  enabled: z.boolean(),
  etag: z.string().max(400).optional(),
  lastModified: z.string().max(200).optional(),
  lastFetchedAt: z.string().max(100),
  lastError: z.string().max(500),
  consecutiveErrors: z.number().int().min(0).max(10000),
});

export const StorySourceRefSchema = z.object({
  index: z.number().int().min(1).max(40),
  sourceId: z.string().min(1).max(128),
  outlet: z.string().min(1).max(200),
  title: z.string().min(1).max(600),
  url: z.string().url().max(2000),
  publishedAt: z.string().max(100),
  trust: z.number().min(1).max(5),
});

export const StoryClusterSchema = z.object({
  id: ValidIdSchema,
  headline: z.string().min(1).max(600),
  sector: z.string().min(1).max(80),
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().max(100).optional(),
  subtags: z.array(z.string().max(80)).max(20),
  createdAt: z.string().max(100),
  updatedAt: z.string().max(100),
  sourceCount: z.number().int().min(1).max(500),
  articleIds: z.array(z.string().max(128)).max(40),
  sources: z.array(StorySourceRefSchema).min(1).max(40),
  importanceScore: z.number().min(0).max(100),
  heatScore: z.number().min(0).max(100).optional(),
  heatSignalsUsed: z.number().int().min(1).max(5).optional(),
  satirePotential: z.number().min(0).max(10),
  verification: z.enum(['verified', 'developing', 'single-source']).optional(),
  sensitivity: z.enum(['normal', 'handle-with-care', 'no-joke']),
  summarised: z.boolean(),
  whatHappened: z.string().max(3000),
  whyItMatters: z.string().max(2000),
  keyFacts: z
    .array(
      z.object({
        fact: z.string().max(600),
        sourceIndex: z.number().int().min(1).max(40),
      })
    )
    .max(10),
  keyNumbers: z
    .array(
      z.object({
        label: z.string().max(200),
        value: z.string().max(200),
        sourceIndex: z.number().int().min(1).max(40),
      })
    )
    .max(10),
  timeline: z
    .array(
      z.object({
        date: z.string().max(100),
        event: z.string().max(600),
        sourceIndex: z.number().int().min(1).max(40).optional(),
      })
    )
    .max(10),
  stakeholders: z
    .array(
      z.object({
        name: z.string().max(200),
        role: z.string().max(200),
        stance: z.string().max(400).optional(),
      })
    )
    .max(15),
  framingNotes: z.string().max(2000),
  openQuestions: z.array(z.string().max(500)).max(10),
  comedyAngles: z
    .array(
      z.object({
        angle: z.string().max(600),
        target: z.enum(['power', 'absurdity', 'hypocrisy']),
        punchlineHint: z.string().max(600),
      })
    )
    .max(5),
  videoIdeas: z.object({
    titles: z.array(z.string().max(200)).max(5),
    thumbnails: z.array(z.string().max(120)).max(5),
    onScreenCards: z.array(z.string().max(200)).max(10),
    description: z.string().max(5000),
  }),
  relatedVideos: z.array(z.any()).max(10),
  govReleases: z.array(z.any()).max(10),
  thumbnailUrl: z.string().url().max(2000).optional(),
  whyRising: z.string().max(500).optional(),
});

export const FeedIndexCardSchema = z.object({
  id: ValidIdSchema,
  headline: z.string().min(1).max(600),
  blurb: z.string().max(140),
  sector: z.string().min(1).max(80),
  keywords: z.array(z.string().max(60)).max(8),
  importanceScore: z.number().min(0).max(100),
  heatScore: z.number().min(0).max(100),
  satirePotential: z.number().min(0).max(10),
  sourceCount: z.number().int().min(1).max(500),
  updatedAt: z.string().max(100),
  verification: z.enum(['verified', 'developing', 'single-source']),
  sensitivity: z.enum(['normal', 'handle-with-care', 'no-joke']),
  thumbnailUrl: z.string().url().max(2000).optional(),
});

export const FeedIndexDaySchema = z.object({
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}(_\d+)?$/),
  part: z.number().int().min(1).optional(),
  updatedAt: z.string().max(100),
  cards: z.array(FeedIndexCardSchema).max(600),
});

export const StarredStorySchema = z.object({
  storyId: ValidIdSchema,
  savedAt: z.string().min(1).max(100),
  note: z.string().max(2000).optional(),
  snapshot: StoryClusterSchema.optional(),
});

export const ScriptSectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(['COLD OPEN', 'SETUP', 'TURN', 'PUNCHLINE', 'BRIDGE', 'OUTRO']),
  storyId: z.string().max(128).optional(),
  storyHeadline: z.string().max(600).optional(),
  content: z.string().max(10000),
  cues: z.array(z.string().max(400)).max(20),
});

export const ScriptRecordSchema = z.object({
  id: ValidIdSchema,
  title: z.string().min(1).max(400),
  storyIds: z.array(z.string().max(128)).max(30),
  format: z.enum(['News-desk monologue', 'Rapid-fire headlines', 'Deep-dive explainer']),
  language: z.enum(['Hinglish', 'Hindi', 'English']),
  tone: z.enum(['Mild', 'Medium', 'Savage']),
  runtimeTarget: z.enum(['60s Short', '3 min', '8 min', '12 min']),
  runtimeTargetSec: z.number().int().min(30).max(3600),
  status: z.enum(['Draft', 'Final', 'Recorded', 'Published']).optional(),
  draftByAgent: z.boolean().optional(),
  isNeutralBriefing: z.boolean().optional(),
  tags: z.array(z.string().max(60)).max(10).optional(),
  sections: z.array(ScriptSectionSchema).max(50),
  factBox: z
    .array(
      z.object({
        claim: z.string().max(800),
        sourceTag: z.string().max(20),
        outlet: z.string().max(200),
        url: z.string().url().max(2000),
      })
    )
    .max(60),
  versions: z
    .array(
      z.object({
        id: z.string().max(128),
        savedAt: z.string().max(100),
        label: z.string().max(200),
        sections: z.array(ScriptSectionSchema).max(50),
      })
    )
    .max(5),
  createdAt: z.string().max(100),
  updatedAt: z.string().max(100),
});

export const DeskStateSchema = z.object({
  id: ValidIdSchema,
  title: z.string().min(1).max(300),
  storyIds: z.array(z.string().max(128)).max(30),
  storySnapshots: z.record(z.string(), StoryClusterSchema).optional(),
  notes: z.string().max(5000),
  storyNotes: z.record(z.string(), z.string().max(1000)),
  storyMinutes: z.record(z.string(), z.number().min(0.5).max(30)),
  updatedAt: z.string().max(100),
});

export const UserSettingsSchema = z.object({
  theme: z.enum(['dark', 'light']),
  density: z.enum(['comfortable', 'compact']),
  showThumbnails: z.boolean(),
  defaultLanguage: z.enum(['Hinglish', 'Hindi', 'English']),
  defaultTone: z.enum(['Mild', 'Medium', 'Savage']),
  defaultRuntime: z.enum(['60s Short', '3 min', '8 min', '12 min']),
  defaultFormat: z.enum(['News-desk monologue', 'Rapid-fire headlines', 'Deep-dive explainer']),
  wpm: z.number().int().min(60).max(300),
  aiDailyLimit: z.number().int().min(1).max(5000),
  retentionDays: z.number().int().min(7).max(60),
  doNotJokeAbout: z.string().min(10).max(3000),
  sectorBoosts: z.record(z.string(), z.number().min(0).max(1)),
  updatedAt: z.string().max(100),
});

export const TestFeedRequestSchema = z.object({
  url: z.string().url().max(2000),
  name: z.string().max(200).optional(),
});
