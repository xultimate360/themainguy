import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  canonicaliseUrl,
  hashCanonicalUrl,
  tokeniseHeadline,
  jaccardSimilarity,
  shouldClusterArticles,
  calculateImportanceScore,
  detectSensitivity,
  checkScriptUnsourcedClaims,
  estimateSpokenDuration,
  estimateFirestoreUsage,
  unifyScriptIntoSingleSegment,
} from './deskEngine';
import { ScriptSection } from '../types/desk';

describe('Code Book Section 9 Unit Tests — Satire News Desk Engine', () => {
  it('canonicaliseUrl strips tracking params (utm_*, fbclid, gclid) and normalises host', () => {
    const raw =
      'https://www.IndianExpress.com/article/india/parliament-session-99123/?utm_source=twitter&utm_medium=social&fbclid=IwAR12345&page=2#comments';
    const canonical = canonicaliseUrl(raw);
    assert.equal(
      canonical,
      'https://indianexpress.com/article/india/parliament-session-99123/?page=2'
    );
    // Identical hash for tracked vs clean URL
    assert.equal(
      hashCanonicalUrl(raw),
      hashCanonicalUrl('https://indianexpress.com/article/india/parliament-session-99123/?page=2')
    );
  });

  it('jaccardSimilarity computes |A ∩ B| / |A ∪ B| accurately on headline tokens', () => {
    const t1 = tokeniseHeadline('RBI keeps repo rate unchanged at 6.5 percent amid inflation concerns');
    const t2 = tokeniseHeadline('RBI holds repo rate steady at 6.5 percent citing inflation concerns');
    const sim = jaccardSimilarity(t1, t2);
    assert.ok(sim >= 0.45, `Expected similarity >= 0.45, got ${sim}`);

    const t3 = tokeniseHeadline('BCCI announces squad for Australia Border Gavaskar Trophy');
    assert.equal(jaccardSimilarity(t1, t3), 0);
  });

  it('shouldClusterArticles groups articles within 36h sharing Jaccard >= 0.35 or 2+ entities + 1 keyword', () => {
    const a = {
      title: 'SEBI tightens F&O derivatives rules for retail traders from November',
      publishedAt: '2026-11-13T10:00:00Z',
      entities: ['SEBI', 'NSE'],
      keywords: ['derivatives', 'retail', 'traders', 'rules'],
    };
    const b = {
      title: 'NSE and SEBI issue strict retail derivatives norms to curb F&O frenzy',
      publishedAt: '2026-11-13T18:00:00Z',
      entities: ['SEBI', 'NSE'],
      keywords: ['derivatives', 'norms', 'frenzy'],
    };
    const tooOld = {
      ...b,
      publishedAt: '2026-11-10T01:00:00Z', // > 36 hours apart
    };

    assert.equal(shouldClusterArticles(a, b), true);
    assert.equal(shouldClusterArticles(a, tooOld), false);
  });

  it('calculateImportanceScore implements 0.35*recency + 0.30*sourceCount + 0.20*avgTrust + 0.15*sectorBoost', () => {
    const nowMs = new Date('2026-11-13T12:00:00Z').getTime();
    const highScore = calculateImportanceScore({
      latestPublishedAt: '2026-11-13T11:30:00Z',
      nowMs,
      sourceCount: 12,
      avgTrust: 5,
      sectorBoost: 1.0,
    });
    const lowScore = calculateImportanceScore({
      latestPublishedAt: '2026-11-11T11:30:00Z',
      nowMs,
      sourceCount: 1,
      avgTrust: 2,
      sectorBoost: 0.2,
    });
    assert.ok(highScore > 95, `Expected highScore > 95, got ${highScore}`);
    assert.ok(lowScore < 35, `Expected lowScore < 35, got ${lowScore}`);
    assert.ok(highScore > lowScore);
  });

  it('detectSensitivity classifies normal, handle-with-care, and no-joke stories accurately', () => {
    assert.equal(
      detectSensitivity('24 passengers killed in crash after express train derailment'),
      'no-joke'
    );
    assert.equal(
      detectSensitivity('Curfew imposed after communal clash in district, matter sub-judice'),
      'handle-with-care'
    );
    assert.equal(
      detectSensitivity('Municipal corporation inaugurates bridge with no approach road on either side'),
      'normal'
    );
  });

  it('checkScriptUnsourcedClaims flags SETUP or factual lines missing [S#] source tags', () => {
    const cleanSections: ScriptSection[] = [
      {
        id: 'sec-1',
        type: 'SETUP',
        content: 'According to RBI data, retail UPI volume crossed Rs 20 lakh crore this month [S1].',
        cues: ['[GRAPHIC: UPI 20L Cr chart]'],
      },
      {
        id: 'sec-2',
        type: 'PUNCHLINE',
        content: 'Aur mera bank balance abhi bhi OTP aane se pehle sharma jaata hai!',
        cues: ['[SFX: Rimshot]'],
      },
    ];
    const checkClean = checkScriptUnsourcedClaims(cleanSections, 3);
    assert.equal(checkClean.isClean, true);
    assert.equal(checkClean.sourcedClaimsCount, 1);

    const dirtySections: ScriptSection[] = [
      {
        id: 'sec-1',
        type: 'SETUP',
        content: 'Ministry announced a Rs 4,500 crore highway repair tender without any audit.',
        cues: [],
      },
    ];
    const checkDirty = checkScriptUnsourcedClaims(dirtySections, 3);
    assert.equal(checkDirty.isClean, false);
    assert.equal(checkDirty.unsourcedLines.length, 1);
  });

  it('estimateSpokenDuration ignores [B-ROLL] cues and [S#] tags when calculating WPM duration', () => {
    // 30 spoken words at 150 WPM = 12 seconds (0:12)
    const words30 = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(' ');
    const scriptWithCues = `[B-ROLL: Parliament exterior shot] [GRAPHIC: Lower third] ${words30} [S1] [S2] [SFX: Whoosh]`;
    const result = estimateSpokenDuration(scriptWithCues, 150);
    assert.equal(result.wordCount, 30);
    assert.equal(result.durationSec, 12);
    assert.equal(result.formatted, '0:12');
  });

  it('estimateFirestoreUsage warns at 80% of free-tier reads, writes, or storage', () => {
    const safe = estimateFirestoreUsage({
      sources: 25,
      articles: 200,
      stories: 40,
      scripts: 10,
      saved: 12,
      readsToday: 4200,
      writesToday: 850,
    });
    assert.equal(safe.isWarning, false);

    const overloaded = estimateFirestoreUsage({
      sources: 25,
      articles: 200,
      stories: 40,
      scripts: 10,
      saved: 12,
      readsToday: 42000, // 84% of 50,000
      writesToday: 17000, // 85% of 20,000
    });
    assert.equal(overloaded.isWarning, true);
    assert.equal(overloaded.warningReasons.length, 2);
  });

  it('unifyScriptIntoSingleSegment merges multiple sections into 1 unified segment with YouTuber Intro, Subheadings, and Outro', () => {
    const multi: ScriptSection[] = [
      {
        id: 's1',
        type: 'COLD OPEN',
        content: 'Bhai ek second ruko, did you actually see what RBI just dropped?! [S1].',
        cues: ['[ZOOM IN ON FACE]'],
      },
      {
        id: 's2',
        type: 'SETUP',
        content: 'Look at this official circular right here on screen—inflation stood at 5.4% this quarter [S1].',
        cues: ['[SCREENSHOT POPUP: RBI Circular]'],
      },
      {
        id: 's3',
        type: 'OUTRO',
        content: 'Drop your take in the comments and check all verified links in the Fact Box [S1].',
        cues: [],
      },
    ];

    const unified = unifyScriptIntoSingleSegment(multi, 'story_1', 'RBI Update');
    assert.equal(unified.length, 1);
    assert.equal(unified[0].content.includes('### INTRO (YOUTUBER HOOK & COLD OPEN)'), true);
    assert.equal(
      unified[0].content.includes('### SUBHEADING: KYA SCENE HAI? (THE REAL STORY & VERIFIED FACTS)'),
      true
    );
    assert.equal(unified[0].content.includes('### OUTRO (COMMENT BAIT & YOUTUBER SIGN-OFF)'), true);

    const claimCheck = checkScriptUnsourcedClaims(unified, 5);
    assert.equal(claimCheck.isClean, true);
  });
});

