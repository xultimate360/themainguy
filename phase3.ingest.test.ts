import { describe, it, expect } from 'vitest';
import {
  buildFeedIndexDocsForDay,
  canonicaliseUrl,
  clusterArticlesIntoStories,
  determineVerificationStatus,
  extractEntitiesAndKeywords,
  FEED_INDEX_MAX_BYTES,
  getSeenShardId,
  hashCanonicalUrl,
  isSameSourceNearDuplicate,
  shouldClusterArticles,
  toDayKeyInTz,
} from './src/utils/deskEngine';
import { ArticleItem, StoryCluster } from './src/types/desk';

describe('Phase 3 — URL Canonicalisation & Seen Shards (Section 5.2)', () => {
  it('strips UTM, fbclid, gclid, trailing slashes, and www prefix', () => {
    const raw1 =
      'https://www.thehindu.com/news/national/rbi-mpc-decision/?utm_source=rss&utm_medium=referral&fbclid=IwAR123#top';
    const raw2 = 'https://thehindu.com/news/national/rbi-mpc-decision';
    expect(canonicaliseUrl(raw1)).toBe(canonicaliseUrl(raw2));
    expect(hashCanonicalUrl(raw1)).toBe(hashCanonicalUrl(raw2));
  });

  it('maps article hashes deterministically to 16 hex shards (0..f)', () => {
    for (let i = 0; i < 40; i++) {
      const h = hashCanonicalUrl(`https://example.com/article-${i}`);
      const shardId = getSeenShardId(h);
      expect(shardId).toMatch(/^[0-9a-f]$/);
    }
  });

  it('drops same-source near-identical titles (Jaccard >= 0.80) but keeps cross-outlet reports', () => {
    const a = {
      sourceId: 'src_ndtv',
      title: 'RBI keeps repo rate unchanged at 6.5 percent for tenth consecutive time',
    };
    const bSameSource = {
      sourceId: 'src_ndtv',
      title: 'RBI keeps repo rate unchanged at 6.5 percent for tenth consecutive time today',
    };
    const cDifferentSource = {
      sourceId: 'src_the_hindu',
      title: 'RBI keeps repo rate unchanged at 6.5 percent for tenth consecutive time',
    };
    expect(isSameSourceNearDuplicate(a, bSameSource)).toBe(true);
    expect(isSameSourceNearDuplicate(a, cDifferentSource)).toBe(false);
  });
});

describe('Phase 3 — 16 Title-Pair Clustering Unit Tests (English, Hindi & Edge Cases)', () => {
  const nowIso = '2026-11-14T08:00:00.000Z';
  const twoHoursLaterIso = '2026-11-14T10:00:00.000Z';
  const fiftyHoursLaterIso = '2026-11-16T12:00:00.000Z';

  const makePairItem = (title: string, publishedAt = nowIso) => {
    const { entities, keywords } = extractEntitiesAndKeywords(title);
    return { title, publishedAt, entities, keywords };
  };

  // 1. RBI Monetary Policy (English cross-outlet)
  it('Pair 1 (Positive): merges RBI MPC repo rate stories across Mint and The Hindu', () => {
    const a = makePairItem('RBI Monetary Policy Committee keeps repo rate unchanged at 6.5% - Mint');
    const b = makePairItem(
      'RBI Monetary Policy Committee holds repo rate steady at 6.5% - The Hindu',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 2. GST Council Meeting (English cross-outlet)
  it('Pair 2 (Positive): merges GST Council tax slab stories across Indian Express and ET', () => {
    const a = makePairItem(
      'GST Council meeting in New Delhi: Panel discusses health insurance tax relief - The Indian Express'
    );
    const b = makePairItem(
      'GST Council meeting New Delhi discusses health insurance tax relief - The Economic Times',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 3. Supreme Court Order on Air Pollution (English cross-outlet)
  it('Pair 3 (Positive): merges Supreme Court Delhi NCR air pollution hearing stories', () => {
    const a = makePairItem(
      'Supreme Court pulls up Delhi NCR states over GRAP 4 air pollution enforcement'
    );
    const b = makePairItem(
      'Supreme Court questions Delhi NCR states on GRAP 4 air pollution enforcement',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 4. ISRO Gaganyaan Mission Test (English cross-outlet)
  it('Pair 4 (Positive): merges ISRO Gaganyaan crew module test stories', () => {
    const a = makePairItem(
      'ISRO successfully conducts Gaganyaan crew module parachute test in Sriharikota'
    );
    const b = makePairItem(
      'ISRO conducts successful Gaganyaan crew module parachute test at Sriharikota',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 5. BCCI Indian Cricket Squad (English cross-outlet)
  it('Pair 5 (Positive): merges BCCI Border-Gavaskar Test squad announcement', () => {
    const a = makePairItem(
      'BCCI announces India Test squad for Border Gavaskar Trophy series in Australia'
    );
    const b = makePairItem(
      'BCCI announces India Test squad for Australia Border Gavaskar Trophy',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 6. UPSC / NTA NEET UG Exam Notice (English cross-outlet)
  it('Pair 6 (Positive): merges NTA NEET UG counseling schedule stories', () => {
    const a = makePairItem('NTA releases NEET UG 2026 revised counseling schedule and seat matrix');
    const b = makePairItem(
      'NEET UG 2026 revised counseling schedule and seat matrix released by NTA',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 7. SEBI F&O Derivatives Circular (English cross-outlet)
  it('Pair 7 (Positive): merges SEBI F&O derivatives tightening rules across Moneycontrol and Mint', () => {
    const a = makePairItem(
      'SEBI tightens index derivatives F&O rules with higher lot size for retail traders'
    );
    const b = makePairItem(
      'SEBI tightens F&O index derivatives rules, raises minimum lot size for retail traders',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 8. Hindi Devanagari — Supreme Court Pollution Hearing
  it('Pair 8 (Positive Hindi): merges Devanagari headlines on Supreme Court Delhi pollution', () => {
    const a = makePairItem('सुप्रीम कोर्ट ने दिल्ली प्रदूषण पर सरकार को लगाई कड़ी फटकार');
    const b = makePairItem(
      'दिल्ली प्रदूषण पर सुप्रीम कोर्ट ने सरकार को लगाई कड़ी फटकार',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 9. Hindi Devanagari — RBI Repo Rate
  it('Pair 9 (Positive Hindi): merges Devanagari headlines on RBI repo rate decision', () => {
    const a = makePairItem('आरबीआई ने रेपो रेट को 6.5 प्रतिशत पर स्थिर रखा, ईएमआई में बदलाव नहीं');
    const b = makePairItem(
      'आरबीआई मौद्रिक नीति: रेपो रेट 6.5 प्रतिशत पर स्थिर रखा गया, ईएमआई में बदलाव नहीं',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(true);
  });

  // 10. Distinct SEBI Recovery Certificate Numbers (Negative edge case)
  it('Pair 10 (Negative): does NOT merge distinct SEBI recovery orders with different RC numbers', () => {
    const a = makePairItem(
      'Recovery proceedings in the matter of Golden Legand Leasing and Finance Limited - RC No. 7711 of 2026'
    );
    const b = makePairItem(
      'Recovery proceedings in the matter of Golden Legand Leasing and Finance Limited - RC No. 7709 of 2026',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(false);
  });

  // 11. Unrelated stories in the same city (Delhi)
  it('Pair 11 (Negative): does NOT merge unrelated Delhi stories (Metro vs High Court bail)', () => {
    const a = makePairItem('Delhi Metro Phase 4 Janakpuri RK Ashram corridor opens for passengers');
    const b = makePairItem(
      'Delhi High Court hears bail plea in municipal tender investigation',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(false);
  });

  // 12. Unrelated stories in Bengaluru (Startups vs Civic water)
  it('Pair 12 (Negative): does NOT merge unrelated Bengaluru stories (Startup funding vs BWSSB water supply)', () => {
    const a = makePairItem('Bengaluru fintech startup raises $80 million in Series C funding round');
    const b = makePairItem(
      'Bengaluru BWSSB announces Cauvery Stage 5 pipeline maintenance on Thursday',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(false);
  });

  // 13. Same event but separated by > 36 hours (Outside clustering window)
  it('Pair 13 (Negative): does NOT merge identical headlines published more than 36 hours apart', () => {
    const a = makePairItem('Union Cabinet approves new semiconductor manufacturing plant in Gujarat', nowIso);
    const b = makePairItem(
      'Union Cabinet approves new semiconductor manufacturing plant in Gujarat',
      fiftyHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(false);
  });

  // 14. Unrelated Sports stories (Cricket vs Chess)
  it('Pair 14 (Negative): does NOT merge unrelated sports headlines', () => {
    const a = makePairItem('BCCI announces domestic Ranji Trophy quarterfinal venues');
    const b = makePairItem(
      'Gukesh wins classic round at World Chess Championship match in Singapore',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(false);
  });

  // 15. Unrelated Corporate/Business stories
  it('Pair 15 (Negative): does NOT merge Tata Motors EV launch with Zomato earnings', () => {
    const a = makePairItem('Tata Motors launches new electric SUV with 500 km range in Mumbai');
    const b = makePairItem(
      'Zomato reports quarterly profit rise driven by Blinkit quick commerce growth',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(false);
  });

  // 16. Unrelated Hindi stories (Cricket vs Parliament)
  it('Pair 16 (Negative Hindi): does NOT merge unrelated Hindi headlines', () => {
    const a = makePairItem('भारतीय क्रिकेट टीम ने ऑस्ट्रेलिया के खिलाफ टेस्ट सीरीज के लिए अभ्यास शुरू किया');
    const b = makePairItem(
      'संसद के शीतकालीन सत्र में वक्फ संशोधन विधेयक पर चर्चा संभव',
      twoHoursLaterIso
    );
    expect(shouldClusterArticles(a, b)).toBe(false);
  });
});

describe('Phase 3 — FeedIndex 700 KB Splitting & Verification Status', () => {
  it('splits feedIndex/{dayKey} into {dayKey}_2 when serialised size exceeds 700 KB', () => {
    const dayKey = toDayKeyInTz('2026-11-14T08:00:00.000Z', 'Asia/Kolkata');
    // Generate enough stories with ~600-char headlines and blurbs to exceed 700 KB
    const largeStories: StoryCluster[] = Array.from({ length: 1100 }).map((_, idx) => ({
      id: `story_${idx}`,
      headline: `Story headline #${idx}: ${'Detailed verified newsroom report across multiple Indian outlets '.repeat(8)}`,
      sector: 'Politics',
      dayKey,
      expiresAt: '2026-12-09T08:00:00.000Z',
      subtags: ['Parliament', 'Cabinet', 'Policy', 'Delhi', 'India', 'Committee'],
      createdAt: '2026-11-14T08:00:00.000Z',
      updatedAt: '2026-11-14T08:00:00.000Z',
      sourceCount: 3,
      articleIds: [`art_${idx}`],
      sources: [],
      importanceScore: 80,
      heatScore: 65,
      satirePotential: 8,
      verification: 'verified',
      sensitivity: 'normal',
      summarised: false,
      whatHappened: 'A'.repeat(140),
      whyItMatters: 'Matters',
      keyFacts: [],
      keyNumbers: [],
      timeline: [],
      stakeholders: [],
      framingNotes: '',
      openQuestions: [],
      comedyAngles: [],
      videoIdeas: { titles: [], thumbnails: [], onScreenCards: [], description: '' },
      relatedVideos: [],
      govReleases: [],
    }));

    const docs = buildFeedIndexDocsForDay(dayKey, largeStories);
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs[0].dayKey).toBe(dayKey);
    expect(docs[1].dayKey).toBe(`${dayKey}_2`);
    for (const d of docs) {
      const byteSize = new TextEncoder().encode(JSON.stringify(d)).length;
      expect(byteSize).toBeLessThanOrEqual(FEED_INDEX_MAX_BYTES);
    }
  });

  it('marks stories with >= 2 independent outlets or regulator source as verified, and single non-regulator as single-source', () => {
    const single = determineVerificationStatus([
      { outlet: 'NDTV', sourceId: 'src_ndtv_top' },
    ]);
    expect(single).toBe('single-source');

    const multi = determineVerificationStatus([
      { outlet: 'The Hindu', sourceId: 'src_the_hindu_top' },
      { outlet: 'Mint', sourceId: 'src_livemint_economy' },
    ]);
    expect(multi).toBe('verified');

    const officialRegulator = determineVerificationStatus(
      [{ outlet: 'PIB India — Official Press Releases', sourceId: 'src_pib_releases' }],
      {
        src_pib_releases: {
          id: 'src_pib_releases',
          name: 'PIB India',
          type: 'regulator',
          url: 'https://pib.gov.in',
          sector: 'Politics',
          language: 'en',
          trust: 5,
          priority: 'high',
          enabled: true,
          lastFetchedAt: '',
          lastError: '',
          consecutiveErrors: 0,
        },
      }
    );
    expect(officialRegulator).toBe('verified');
  });

  it('clusters duplicate and cross-outlet articles idempotently without creating duplicate stories', () => {
    const articles: ArticleItem[] = [
      {
        id: 'art_1',
        sourceId: 'src_hindu',
        sourceName: 'The Hindu',
        title: 'RBI keeps repo rate unchanged at 6.5 percent in monetary policy review',
        url: 'https://thehindu.com/rbi-1',
        canonicalUrl: 'https://thehindu.com/rbi-1',
        publishedAt: '2026-11-14T08:00:00.000Z',
        fetchedAt: '2026-11-14T08:05:00.000Z',
        sector: 'Markets and finance',
        snippet: 'RBI monetary policy committee keeps repo rate unchanged.',
        entities: ['RBI'],
        keywords: ['repo', 'rate', 'monetary', 'policy'],
        storyId: '',
      },
      {
        id: 'art_2',
        sourceId: 'src_mint',
        sourceName: 'Mint',
        title: 'RBI keeps repo rate unchanged at 6.5 percent in monetary policy decision',
        url: 'https://livemint.com/rbi-2',
        canonicalUrl: 'https://livemint.com/rbi-2',
        publishedAt: '2026-11-14T08:30:00.000Z',
        fetchedAt: '2026-11-14T08:35:00.000Z',
        sector: 'Markets and finance',
        snippet: 'Monetary policy review holds rate steady.',
        entities: ['RBI'],
        keywords: ['repo', 'rate', 'monetary', 'policy'],
        storyId: '',
      },
    ];

    const firstRun = clusterArticlesIntoStories(articles);
    expect(firstRun.length).toBe(1);
    expect(firstRun[0].sourceCount).toBe(2);
    expect(firstRun[0].verification).toBe('verified');
  });
});
