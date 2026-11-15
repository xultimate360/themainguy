import { describe, expect, it } from 'vitest';
import {
  computeExpiresAt,
  createStarredStorySnapshot,
  getExpiringSoonStories,
  isStoryExpired,
  resolveStoryAcrossArchiveAndSnapshots,
  runJanitorPass,
  toDayKeyInTz,
} from './src/utils/deskEngine';
import { FeedIndexDay, SeenShard, StoryCluster } from './src/types/desk';

function makeMockStory(overrides: Partial<StoryCluster> & { id: string; createdAt: string }): StoryCluster {
  const retentionDays = 25;
  const createdAt = overrides.createdAt;
  return {
    id: overrides.id,
    headline: overrides.headline || `Story ${overrides.id}`,
    sector: overrides.sector || 'Politics',
    dayKey: overrides.dayKey || toDayKeyInTz(createdAt, 'Asia/Kolkata'),
    expiresAt: overrides.expiresAt ?? computeExpiresAt(createdAt, retentionDays),
    subtags: overrides.subtags || ['parliament', 'budget'],
    createdAt,
    updatedAt: overrides.updatedAt || createdAt,
    sourceCount: overrides.sourceCount ?? 3,
    articleIds: overrides.articleIds || ['art_1', 'art_2', 'art_3'],
    sources: overrides.sources || [
      {
        index: 1,
        sourceId: 'src_the_hindu_top',
        outlet: 'The Hindu',
        title: 'Lead headline from The Hindu',
        url: 'https://www.thehindu.com/news/national/story-1',
        publishedAt: createdAt,
        trust: 5,
      },
    ],
    importanceScore: overrides.importanceScore ?? 78,
    heatScore: overrides.heatScore ?? 68,
    heatSignalsUsed: 4,
    satirePotential: overrides.satirePotential ?? 8,
    verification: overrides.verification || 'verified',
    sensitivity: overrides.sensitivity || 'normal',
    summarised: overrides.summarised ?? true,
    whatHappened:
      overrides.whatHappened ||
      'Full verified multi-source summary of what happened on day 1.',
    whyItMatters:
      overrides.whyItMatters ||
      'Why it matters for citizens and accountability.',
    keyFacts: overrides.keyFacts || [
      { fact: 'Verified fact one from official filing', sourceIndex: 1 },
    ],
    keyNumbers: overrides.keyNumbers || [
      { label: 'Allocation', value: 'Rs 1,200 crore', sourceIndex: 1 },
    ],
    timeline: overrides.timeline || [
      { date: '2026-11-01', event: 'Initial announcement', sourceIndex: 1 },
    ],
    stakeholders: overrides.stakeholders || [],
    framingNotes: overrides.framingNotes || 'Consistent across outlets.',
    openQuestions: overrides.openQuestions || [],
    comedyAngles: overrides.comedyAngles || [
      {
        angle: 'Deadline extended for the fourth time',
        target: 'absurdity',
        punchlineHint: 'Even the calendar asked for an extension.',
      },
    ],
    videoIdeas: overrides.videoIdeas || {
      titles: ['Why This Policy Keeps Getting Delayed'],
      thumbnails: ['FOURTH EXTENSION?!'],
      onScreenCards: ['Rs 1,200 Cr'],
      description: 'Sources cited below.',
    },
    relatedVideos: [],
    govReleases: [],
  };
}

describe('Phase 4: Retention, Starred Snapshots, Expiring Soon & Janitor Agent (Section 5.4 & 13)', () => {
  const day1Iso = '2026-11-01T06:00:00.000Z';
  const day1Ms = new Date(day1Iso).getTime();
  const day26Ms = day1Ms + 25 * 24 * 60 * 60 * 1000 + 60_000; // Day 26 (past 25-day retention)
  const day40Ms = day1Ms + 39 * 24 * 60 * 60 * 1000; // Day 40

  it('keeps a story starred on day 1 accessible with its full summary on day 40 while unstarred day-1 story is gone on day 26 even before TTL runs', () => {
    const starredStoryDay1 = makeMockStory({
      id: 'story_starred_day1',
      headline: 'Day 1 Starred Investigation With Full Summary',
      createdAt: day1Iso,
    });
    const unstarredStoryDay1 = makeMockStory({
      id: 'story_unstarred_day1',
      headline: 'Day 1 Unstarred Routine Brief',
      createdAt: day1Iso,
    });

    // Owner stars story_starred_day1 on day 1
    const starredDoc = createStarredStorySnapshot(
      starredStoryDay1,
      'Keep for year-end monologue callback',
      day1Iso
    );

    // Starred snapshot must have NO expiresAt field so Firestore TTL never touches it
    expect(starredDoc.snapshot).toBeDefined();
    expect(starredDoc.snapshot?.expiresAt).toBeUndefined();
    expect(starredDoc.note).toBe('Keep for year-end monologue callback');

    // On day 26, even if Firestore TTL has NOT deleted the documents from `stories` yet:
    const rawArchiveOnDay26 = [starredStoryDay1, unstarredStoryDay1];
    const visibleInFeedOnDay26 = rawArchiveOnDay26.filter(
      (st) => !isStoryExpired(st, day26Ms, 25)
    );
    expect(visibleInFeedOnDay26).toHaveLength(0);

    // On day 40, after Janitor/TTL has completely removed both from `stories`:
    const resolvedUnstarredDay40 = resolveStoryAcrossArchiveAndSnapshots(
      'story_unstarred_day1',
      [],
      [starredDoc],
      {},
      day40Ms,
      25
    );
    expect(resolvedUnstarredDay40).toBeNull();

    const resolvedStarredDay40 = resolveStoryAcrossArchiveAndSnapshots(
      'story_starred_day1',
      [],
      [starredDoc],
      {},
      day40Ms,
      25
    );
    expect(resolvedStarredDay40).not.toBeNull();
    expect(resolvedStarredDay40?.headline).toBe(
      'Day 1 Starred Investigation With Full Summary'
    );
    expect(resolvedStarredDay40?.whatHappened).toContain(
      'Full verified multi-source summary'
    );
    expect(resolvedStarredDay40?.keyFacts).toHaveLength(1);
    expect(resolvedStarredDay40?.comedyAngles).toHaveLength(1);
    expect(resolvedStarredDay40?.sources[0].url).toBe(
      'https://www.thehindu.com/news/national/story-1'
    );
  });

  it('runs Janitor in dry-run mode during the first 3 days or when forceDryRun=true, listing expired items and never touching starred, desk, or scripts', () => {
    const expiredStory = makeMockStory({
      id: 'story_expired_old',
      createdAt: day1Iso,
    });
    const freshStory = makeMockStory({
      id: 'story_fresh_today',
      createdAt: new Date(day26Ms - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const starredDoc = createStarredStorySnapshot(expiredStory, 'Permanent star', day1Iso);

    const feedIndex: Record<string, FeedIndexDay> = {
      '2026-10-31': {
        dayKey: '2026-10-31',
        updatedAt: day1Iso,
        cards: [],
      },
      '2026-11-25': {
        dayKey: '2026-11-25',
        updatedAt: new Date(day26Ms).toISOString(),
        cards: [],
      },
    };

    const seenShards: Record<string, SeenShard> = {
      '0': {
        shardId: '0',
        updatedAt: day1Iso,
        entries: {
          hash_old_oct31: '2026-10-31',
          hash_fresh_nov25: '2026-11-25',
        },
      },
    };

    // Installed 1 day ago -> within initial 3-day window -> must automatically run in dry-run mode
    const installedAtOneDayAgo = new Date(day26Ms - 24 * 60 * 60 * 1000).toISOString();

    const dryRunResult = runJanitorPass({
      nowMs: day26Ms,
      installedAt: installedAtOneDayAgo,
      retentionDays: 25,
      keepScripts: true,
      stories: [expiredStory, freshStory],
      feedIndex,
      seenShards,
      statsDays: {
        '2026-10-31': { dayKey: '2026-10-31', updatedAt: day1Iso },
        '2026-11-25': { dayKey: '2026-11-25', updatedAt: new Date(day26Ms).toISOString() },
      },
      agentRunRecords: [
        { id: 'run_old_10d', startedAt: new Date(day26Ms - 10 * 86400000).toISOString() },
        { id: 'run_recent_1d', startedAt: new Date(day26Ms - 1 * 86400000).toISOString() },
      ],
      starredStories: [starredDoc],
      deskSnapshots: { [expiredStory.id]: expiredStory },
      scripts: [{ id: 'script_1' } as any],
      tz: 'Asia/Kolkata',
    });

    expect(dryRunResult.report.ok).toBe(true);
    expect(dryRunResult.report.inInitialThreeDayWindow).toBe(true);
    expect(dryRunResult.report.dryRun).toBe(true);

    // Lists exact expired items that would be deleted
    expect(dryRunResult.report.wouldDelete.storyIds).toEqual(['story_expired_old']);
    expect(dryRunResult.report.wouldDelete.feedIndexDayKeys).toEqual(['2026-10-31']);
    expect(dryRunResult.report.wouldDelete.seenShardEntries).toEqual([
      { shardId: '0', articleHash: 'hash_old_oct31', dayKey: '2026-10-31' },
    ]);
    expect(dryRunResult.report.wouldDelete.statsDayKeys).toEqual(['2026-10-31']);
    expect(dryRunResult.report.wouldDelete.agentRunIds).toEqual(['run_old_10d']);

    // Dry-run does not mutate collections
    expect(dryRunResult.nextStories).toHaveLength(2);
    expect(Object.keys(dryRunResult.nextFeedIndex)).toHaveLength(2);

    // Protected collections are never listed for deletion
    expect(dryRunResult.report.protectedCounts).toEqual({
      starredStories: 1,
      deskSnapshots: 1,
      keptScripts: 1,
    });

    // Now test live Janitor run after 3-day window (installedAt = day 1)
    const liveRunResult = runJanitorPass({
      nowMs: day26Ms,
      installedAt: day1Iso,
      retentionDays: 25,
      keepScripts: true,
      forceDryRun: false,
      stories: [expiredStory, freshStory],
      feedIndex,
      seenShards,
      starredStories: [starredDoc],
      deskSnapshots: { [expiredStory.id]: expiredStory },
      scripts: [{ id: 'script_1' } as any],
      tz: 'Asia/Kolkata',
    });

    expect(liveRunResult.report.dryRun).toBe(false);
    expect(liveRunResult.nextStories.map((s) => s.id)).toEqual(['story_fresh_today']);
    expect(Object.keys(liveRunResult.nextFeedIndex)).toEqual(['2026-11-25']);
    expect(Object.keys(liveRunResult.nextSeenShards['0'].entries)).toEqual([
      'hash_fresh_nov25',
    ]);
  });

  it('refuses to run Janitor if settings are invalid or clock is wrong, and caps deletions at 5,000 per run', () => {
    const badClockResult = runJanitorPass({
      nowMs: new Date('2020-01-01T00:00:00Z').getTime(),
      retentionDays: 25,
      stories: [],
      feedIndex: {},
      seenShards: {},
    });
    expect(badClockResult.report.ok).toBe(false);
    expect(badClockResult.report.refusedReason).toContain('clock');

    const badSettingsResult = runJanitorPass({
      nowMs: day26Ms,
      retentionDays: 0,
      stories: [],
      feedIndex: {},
      seenShards: {},
    });
    expect(badSettingsResult.report.ok).toBe(false);
    expect(badSettingsResult.report.refusedReason).toContain('retentionDays');

    // Verify 5,000 deletion cap per run
    const manyEntries: Record<string, string> = {};
    for (let i = 0; i < 5200; i++) {
      manyEntries[`hash_${i}`] = '2026-10-01';
    }
    const cappedResult = runJanitorPass({
      nowMs: day26Ms,
      installedAt: day1Iso,
      retentionDays: 25,
      forceDryRun: true,
      stories: [],
      feedIndex: {},
      seenShards: {
        '0': { shardId: '0', updatedAt: day1Iso, entries: manyEntries },
      },
    });
    expect(cappedResult.report.ok).toBe(true);
    expect(cappedResult.report.totalDeletedOrListed).toBe(5000);
    expect(cappedResult.report.cappedAt5000).toBe(true);
  });

  it('lists unstarred high-Heat, high-Opportunity, or scripted stories expiring within 3 days in getExpiringSoonStories', () => {
    const expiringIn2Days = makeMockStory({
      id: 'story_expiring_2d',
      headline: 'High Heat Story Leaving Archive In 48 Hours',
      createdAt: new Date(day26Ms - 23 * 24 * 60 * 60 * 1000).toISOString(),
      heatScore: 78,
      satirePotential: 9,
    });
    const alreadyStarredExpiring = makeMockStory({
      id: 'story_already_starred',
      headline: 'Already Starred Story Leaving In 24 Hours',
      createdAt: new Date(day26Ms - 24 * 24 * 60 * 60 * 1000).toISOString(),
      heatScore: 85,
    });
    const freshStory = makeMockStory({
      id: 'story_fresh_20d_left',
      headline: 'Fresh Story With 20 Days Left',
      createdAt: new Date(day26Ms - 5 * 24 * 60 * 60 * 1000).toISOString(),
      heatScore: 80,
    });

    const expiringList = getExpiringSoonStories({
      stories: [expiringIn2Days, alreadyStarredExpiring, freshStory],
      savedList: [createStarredStorySnapshot(alreadyStarredExpiring)],
      scripts: [],
      nowMs: day26Ms,
      retentionDays: 25,
    });

    expect(expiringList).toHaveLength(1);
    expect(expiringList[0].story.id).toBe('story_expiring_2d');
    expect(expiringList[0].daysRemaining).toBeLessThanOrEqual(3);
  });
});
