import {
  ArticleItem,
  FeedIndexCard,
  FeedIndexDay,
  FirestoreUsageEstimate,
  JanitorRunReport,
  SavedStory,
  ScriptRecord,
  ScriptSection,
  SECTORS,
  Sector,
  SeenShard,
  SensitivityLevel,
  SourceItem,
  StoryCluster,
  VerificationStatus,
} from '../types/desk';

export const CLUSTER_JACCARD_THRESHOLD = 0.45;
export const SAME_SOURCE_DUP_JACCARD_THRESHOLD = 0.8;
export const FEED_INDEX_MAX_BYTES = 700 * 1024; // 700 KB per document (Section 4)

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  's',
  'spm',
]);

const STOPWORDS = new Set([
  // English stopwords
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'by', 'with',
  'from', 'as', 'after', 'over', 'into', 'amid', 'says', 'said', 'new', 'india',
  'indian', 'how', 'why', 'what', 'when', 'who', 'will', 'can', 'may', 'out',
  'up', 'down', 'more', 'than', 'its', 'it', 'this', 'that', 'these', 'those',
  'news', 'report', 'reports', 'live', 'updates', 'update', 'today', 'latest',
  // Hinglish & Hindi (Roman + Devanagari) stopwords
  'ke', 'ka', 'ki', 'mein', 'se', 'ko', 'par', 'aur', 'hai', 'hain', 'ne', 'bhi',
  'के', 'का', 'की', 'में', 'से', 'को', 'पर', 'और', 'है', 'हैं', 'ने', 'भी', 'एक',
  'इस', 'उस', 'कि', 'जो', 'तो', 'ही', 'तक', 'साथ', 'बाद', 'लिए', 'कहा', 'भारत',
]);

const NO_JOKE_PATTERNS = [
  /\b(rape|sexual assault|gangrape|pocso|child abuse|molestation|suicide|massacre|terror attack|plane crash|stampede deaths|train crash|fatalities|killed in crash|dead bodies|बलात्कार|दुष्कर्म|आत्महत्या|आतंकी हमला)\b/i,
];

const HANDLE_WITH_CARE_PATTERNS = [
  /\b(communal|riot|lynching|sub-judice|contempt of court|war crimes|hostage|border skirmish|martyred|earthquake|cyclone|floods|epidemic|दंगा|भूकंप|बाढ़)\b/i,
];

/**
 * Formats an ISO timestamp into YYYY-MM-DD in APP_TZ (default Asia/Kolkata).
 */
export function toDayKeyInTz(isoDate: string, timeZone = 'Asia/Kolkata'): string {
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Formats a YYYY-MM-DD dayKey into a human-friendly heading like 'Saturday, 14 Nov'.
 */
export function formatDayGroupHeader(dayKey: string): string {
  try {
    const cleanKey = dayKey.split('_')[0];
    const [y, m, d] = cleanKey.split('-').map(Number);
    if (!y || !m || !d) return dayKey;
    const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
    return dt.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  } catch {
    return dayKey;
  }
}

/**
 * Computes expiresAt = firstSeen + retentionDays (Section 5.4).
 */
export function computeExpiresAt(firstSeenIso: string, retentionDays = 25): string {
  const safeDays = Math.min(60, Math.max(7, retentionDays || 25));
  const baseMs = new Date(firstSeenIso).getTime();
  const startMs = Number.isFinite(baseMs) ? baseMs : Date.now();
  return new Date(startMs + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Strips UTM, fbclid, gclid, and other tracking query parameters,
 * normalises hostname and trailing slash.
 */
export function canonicaliseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((k) => parsed.searchParams.delete(k));
    parsed.searchParams.sort();
    let result = parsed.toString();
    if (result.endsWith('/') && parsed.pathname === '/') {
      result = result.slice(0, -1);
    } else if (result.endsWith('/') && !parsed.search) {
      result = result.replace(/\/+$/, '');
    }
    return result;
  } catch {
    return trimmed.split('#')[0].split('?')[0].replace(/\/+$/, '');
  }
}

/**
 * Deterministic portable 64-bit hex hash for canonical URLs (works in browser and Node).
 */
export function hashCanonicalUrl(canonicalUrl: string): string {
  const norm = canonicaliseUrl(canonicalUrl);
  let h1 = 0xdeadbeef ^ norm.length;
  let h2 = 0x41c6ce57 ^ norm.length;
  for (let i = 0, ch; i < norm.length; i++) {
    ch = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `art_${hex1}${hex2}`;
}

/**
 * Maps an article hash (e.g. art_a4f9...) to one of the 16 seen/{0..f} shard IDs.
 */
export function getSeenShardId(articleHash: string): string {
  const clean = articleHash.replace(/^art_/, '').toLowerCase();
  const ch = clean.charAt(0);
  return /^[0-9a-f]$/.test(ch) ? ch : '0';
}

/**
 * Tokenises English and Hindi (Devanagari) headlines into lowercase meaningful words.
 * Strips trailing publisher attributions (e.g. " - The Hindu", " | Mint").
 */
export function tokeniseHeadline(text: string): string[] {
  if (!text) return [];
  const withoutPublisher = text.replace(/\s+[-|—–]\s+[A-Za-z0-9\s.&']+$/, '');
  return withoutPublisher
    .toLowerCase()
    .replace(/['’‘“”"]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

const HINDI_PROPER_ENTITIES = [
  'सुप्रीम कोर्ट',
  'हाई कोर्ट',
  'आरबीआई',
  'सेबी',
  'संसद',
  'लोकसभा',
  'राज्यसभा',
  'चुनाव आयोग',
  'ईडी',
  'सीबीआई',
  'बीसीसीआई',
  'इसरो',
  'जीएसटी',
  'दिल्ली',
  'मुंबई',
  'बेंगलुरु',
  'बिहार',
  'उत्तर प्रदेश',
  'महाराष्ट्र',
];

/**
 * Extracts named entities (English proper nouns, acronyms, numbers/amounts, and Hindi entities)
 * and top keywords from a title + snippet.
 */
export function extractEntitiesAndKeywords(
  title: string,
  snippet = ''
): { entities: string[]; keywords: string[] } {
  const cleanTitle = (title || '').replace(/\s+[-|—–]\s+[A-Za-z0-9\s.&']+$/, '');
  const combined = `${cleanTitle} ${snippet}`.trim();
  const entitiesSet = new Set<string>();

  // 1. Match uppercase acronyms (e.g., RBI, SEBI, ISRO, BCCI, ED, CBI, GDP, GST, AI, UPI, NEET, UPSC)
  const acronymMatches = combined.match(/\b[A-Z]{2,7}\b/g) || [];
  acronymMatches.forEach((acr) => {
    if (!['THE', 'AND', 'FOR', 'NEW', 'HOW', 'WHY', 'WHO', 'NOT', 'ALL', 'NOW', 'TOP'].includes(acr)) {
      entitiesSet.add(acr);
    }
  });

  // 2. Match Capitalised Proper Nouns (single or two-word phrases)
  const properMatches =
    cleanTitle.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) || [];
  properMatches.forEach((word) => {
    const lower = word.toLowerCase();
    if (!STOPWORDS.has(lower) && word.length > 2) {
      entitiesSet.add(word);
    }
  });

  // 3. Match Hindi known proper entities + significant Devanagari tokens in headline
  for (const hiEnt of HINDI_PROPER_ENTITIES) {
    if (combined.includes(hiEnt)) {
      entitiesSet.add(hiEnt);
    }
  }
  const devanagariTokens = cleanTitle.match(/[\u0900-\u097F]{3,}/g) || [];
  devanagariTokens.forEach((tok) => {
    if (!STOPWORDS.has(tok)) {
      entitiesSet.add(tok);
    }
  });

  const keywords = Array.from(new Set(tokeniseHeadline(combined))).slice(0, 8);
  return {
    entities: Array.from(entitiesSet).slice(0, 12),
    keywords,
  };
}

/**
 * Infers sector from title/snippet keywords if a feed uses a generic sector.
 */
export function inferSectorFromText(text: string, fallback: Sector = 'Top stories'): Sector {
  const lower = (text || '').toLowerCase();
  if (/\b(sensex|nifty|sebi|ipo|share price|mutual fund|stock market|bse|nse|forex|शेयर बाजार|सेंसेक्स|निफ्टी|सेबी)\b/i.test(lower)) {
    return 'Markets and finance';
  }
  if (/\b(rbi|gst|inflation|cpi|gdp|export|import|trade deficit|budget|tax|fiscal|महंगाई|जीएसटी|अर्थव्यवस्था)\b/i.test(lower)) {
    return 'Business and economy';
  }
  if (/\b(openai|gemini|llm|chatgpt|deepfake|artificial intelligence|generative ai|neural network|indiaai)\b/i.test(lower)) {
    return 'AI';
  }
  if (/\b(startup|unicorn|fintech|funding|layoffs|zepto|blinkit|zomato|swiggy|razorpay|upi|meity|trai)\b/i.test(lower)) {
    return 'Startups and tech';
  }
  if (/\b(supreme court|high court|ed raid|cbi|fir|chargesheet|bail|bench|verdict|cybercrime|arrest|सुप्रीम कोर्ट|हाई कोर्ट)\b/i.test(lower)) {
    return 'Crime and law';
  }
  if (/\b(bcci|cricket|ipl|test match|odi|olympics|badminton|chess|fifa|क्रिकेट|बीसीसीआई)\b/i.test(lower)) {
    return 'Sports';
  }
  if (/\b(bollywood|box office|ott|netflix|cbfc|film|movie|actor|cinema)\b/i.test(lower)) {
    return 'Entertainment';
  }
  if (/\b(aqi|air pollution|smog|monsoon|imd|heatwave|climate|forest|wildlife|solar|cyclone)\b/i.test(lower)) {
    return 'Environment and climate';
  }
  if (/\b(aiims|icmr|cdsco|fssai|hospital|dengue|vaccine|pharma|drug|health|doctor)\b/i.test(lower)) {
    return 'Health';
  }
  if (/\b(upsc|neet|jee|nta|ugc|iit|iim|ssc|exam|university|epfo|recruitment|यूपीएससी|नीट|परीक्षा)\b/i.test(lower)) {
    return 'Education and jobs';
  }
  if (/\b(isro|gaganyaan|satellite|quantum|astronomy|nasa|csir|iisc|space|telescope)\b/i.test(lower)) {
    return 'Science';
  }
  if (/\b(electric vehicle|ev|maruti|tata motors|mahindra|ola electric|fastag|suv|scooter|autocar)\b/i.test(lower)) {
    return 'Auto';
  }
  if (/\b(bmc|bbmp|mcd|dda|namma metro|delhi metro|local train|civic|waterlogging|pothole)\b/i.test(lower)) {
    return 'Cities';
  }
  if (/\b(viral|meme|netizens|instagram|reddit|x reacts|social media|influencer)\b/i.test(lower)) {
    return 'Viral and social';
  }
  if (/\b(parliament|lok sabha|rajya sabha|election commission|cabinet|chief minister|bjp|congress|मंत्री|संसद|चुनाव)\b/i.test(lower)) {
    return 'Politics';
  }
  if (SECTORS.includes(fallback as any)) return fallback;
  return 'Top stories';
}

/**
 * Computes Jaccard similarity |A ∩ B| / |A ∪ B| between two token arrays.
 */
export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA.map((t) => t.toLowerCase()));
  const setB = new Set(tokensB.map((t) => t.toLowerCase()));
  let intersection = 0;
  setA.forEach((item) => {
    if (setB.has(item)) intersection++;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Section 5.2 Step 3: Drops same-source near-identical titles.
 */
export function isSameSourceNearDuplicate(
  a: Pick<ArticleItem, 'sourceId' | 'title'>,
  b: Pick<ArticleItem, 'sourceId' | 'title'>,
  threshold = SAME_SOURCE_DUP_JACCARD_THRESHOLD
): boolean {
  if (a.sourceId !== b.sourceId) return false;
  const normA = a.title.trim().toLowerCase();
  const normB = b.title.trim().toLowerCase();
  if (normA === normB) return true;
  const tokensA = tokeniseHeadline(a.title);
  const tokensB = tokeniseHeadline(b.title);
  return jaccardSimilarity(tokensA, tokensB) >= threshold;
}

/**
 * Section 5.2 Step 4 Clustering rule:
 * Compare a new article with stories from the last 36 hours.
 * Same story when title token Jaccard similarity is >= 0.45 (tunable constant)
 * OR two or more named entities match (with at least 1 shared headline token/keyword so
 * distinct events from the same agency like SEBI RC 7711 vs RC 7709 don't falsely merge).
 */
export function shouldClusterArticles(
  a: Pick<ArticleItem, 'title' | 'publishedAt' | 'entities' | 'keywords'>,
  b: Pick<ArticleItem, 'title' | 'publishedAt' | 'entities' | 'keywords'>,
  jaccardThreshold = CLUSTER_JACCARD_THRESHOLD
): boolean {
  const timeA = new Date(a.publishedAt).getTime();
  const timeB = new Date(b.publishedAt).getTime();
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB)) return false;

  const diffHours = Math.abs(timeA - timeB) / (1000 * 60 * 60);
  if (diffHours > 36) return false;

  // Check if both titles have distinct docket/order/case numbers (e.g. RC No. 7711 vs RC No. 7709)
  const rcA = a.title.match(/\b(?:RC|Order|Case)\s*No\.?\s*(\d+)/i)?.[1];
  const rcB = b.title.match(/\b(?:RC|Order|Case)\s*No\.?\s*(\d+)/i)?.[1];
  if (rcA && rcB && rcA !== rcB) return false;

  const tokensA = tokeniseHeadline(a.title);
  const tokensB = tokeniseHeadline(b.title);
  const jaccard = jaccardSimilarity(tokensA, tokensB);
  if (jaccard >= jaccardThreshold) return true;

  const entA = new Set(
    (a.entities && a.entities.length > 0 ? a.entities : extractEntitiesAndKeywords(a.title).entities).map((e) =>
      e.toLowerCase()
    )
  );
  const entB = new Set(
    (b.entities && b.entities.length > 0 ? b.entities : extractEntitiesAndKeywords(b.title).entities).map((e) =>
      e.toLowerCase()
    )
  );
  let sharedEntities = 0;
  entA.forEach((e) => {
    if (entB.has(e)) sharedEntities++;
  });

  if (sharedEntities >= 2) {
    // Also require at least 1 shared non-entity token or >= 0.22 token Jaccard so unrelated stories in the same city don't merge
    if (jaccard >= 0.22 || sharedEntities >= 3) return true;
  }

  return false;
}

/**
 * Section 5.2 Step 6 Importance score formula:
 * score = 0.35 * recency + 0.30 * sourceCount + 0.20 * averageTrust + 0.15 * sectorBoost
 * Each normalised 0 to 1; returns 0 to 100 (rounded to 1 decimal place).
 */
export function calculateImportanceScore(params: {
  latestPublishedAt: string;
  nowMs?: number;
  sourceCount: number;
  avgTrust: number; // 1 to 5
  sectorBoost?: number; // 0 to 1 (default 0.6)
}): number {
  const now = params.nowMs ?? Date.now();
  const pubMs = new Date(params.latestPublishedAt).getTime();
  const ageHours = Number.isFinite(pubMs)
    ? Math.max(0, (now - pubMs) / (1000 * 60 * 60))
    : 24;

  const recencyNorm = Math.max(0.05, Math.min(1, Math.exp(-ageHours / 26)));
  const sourceCountNorm = Math.max(0.1, Math.min(1, params.sourceCount / 10));
  const avgTrustNorm = Math.max(0.2, Math.min(1, (params.avgTrust || 4) / 5));
  const sectorBoostNorm = Math.max(0, Math.min(1, params.sectorBoost ?? 0.65));

  const raw =
    0.35 * recencyNorm +
    0.30 * sourceCountNorm +
    0.20 * avgTrustNorm +
    0.15 * sectorBoostNorm;

  return Math.round(raw * 1000) / 10;
}

/**
 * Detects sensitivity level ('normal' | 'handle-with-care' | 'no-joke')
 * based on Section 5.5 and Section 8 of the Code Book.
 */
export function detectSensitivity(
  headline: string,
  summary = ''
): SensitivityLevel {
  const text = `${headline} ${summary}`;
  for (const pattern of NO_JOKE_PATTERNS) {
    if (pattern.test(text)) return 'no-joke';
  }
  for (const pattern of HANDLE_WITH_CARE_PATTERNS) {
    if (pattern.test(text)) return 'handle-with-care';
  }
  return 'normal';
}

/**
 * Determines verification status per Section 2 Rule 3:
 * verified: two or more independent outlets, OR an official source (government, regulator, court).
 * single-source: only one non-regulator outlet.
 */
export function determineVerificationStatus(
  sources: { outlet: string; sourceId: string }[],
  sourcesMap: Record<string, SourceItem> = {}
): VerificationStatus {
  const distinctOutlets = new Set(
    sources.map((s) => s.outlet.split('—')[0].trim().toLowerCase())
  );
  if (distinctOutlets.size >= 2) return 'verified';

  const hasOfficialSource = sources.some((s) => {
    const cfg = sourcesMap[s.sourceId];
    if (cfg?.type === 'regulator') return true;
    return /\b(pib|rbi|sebi|supreme court|election commission|official)\b/i.test(s.outlet);
  });
  if (hasOfficialSource) return 'verified';

  return 'single-source';
}

/**
 * Clusters a list of deduplicated articles into StoryCluster objects,
 * or merges new articles with existing recent StoryCluster objects from the last 36 hours.
 */
export function clusterArticlesIntoStories(
  articles: ArticleItem[],
  sourcesMap: Record<string, SourceItem> = {},
  sectorBoosts: Record<string, number> = {},
  nowMs: number = Date.now(),
  retentionDays = 25,
  timeZone = 'Asia/Kolkata'
): StoryCluster[] {
  const clusters: { articles: ArticleItem[] }[] = [];

  // Sort newest first, and drop same-source near-identical titles (Section 5.2 Step 3)
  const sorted = [...articles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const dedupedSameSource: ArticleItem[] = [];
  for (const art of sorted) {
    const isNearDup = dedupedSameSource.some((existing) =>
      isSameSourceNearDuplicate(existing, art)
    );
    if (!isNearDup) {
      dedupedSameSource.push(art);
    }
  }

  for (const article of dedupedSameSource) {
    let matchedCluster: { articles: ArticleItem[] } | null = null;
    for (const cluster of clusters) {
      if (cluster.articles.some((existing) => shouldClusterArticles(existing, article))) {
        matchedCluster = cluster;
        break;
      }
    }
    if (matchedCluster) {
      if (matchedCluster.articles.length < 40) {
        matchedCluster.articles.push(article);
      }
    } else {
      clusters.push({ articles: [article] });
    }
  }

  return clusters.map((cluster) => {
    const lead = cluster.articles[0];
    const oldest = cluster.articles[cluster.articles.length - 1];
    const sources = cluster.articles.slice(0, 40).map((art, i) => ({
      index: i + 1,
      sourceId: art.sourceId,
      outlet: art.sourceName,
      title: art.title,
      url: art.url,
      publishedAt: art.publishedAt,
      trust: sourcesMap[art.sourceId]?.trust ?? 4,
    }));

    const avgTrust =
      sources.reduce((acc, s) => acc + s.trust, 0) / Math.max(1, sources.length);
    const effectiveSector: Sector =
      lead.sector === 'Top stories'
        ? inferSectorFromText(`${lead.title} ${lead.snippet}`, lead.sector)
        : lead.sector;
    const boost = sectorBoosts[effectiveSector] ?? 0.7;

    const importanceScore = calculateImportanceScore({
      latestPublishedAt: lead.publishedAt,
      nowMs,
      sourceCount: sources.length,
      avgTrust,
      sectorBoost: boost,
    });

    const verification = determineVerificationStatus(sources, sourcesMap);
    const sensitivity = detectSensitivity(lead.title, lead.snippet);
    const storyId = lead.storyId || `story_${hashCanonicalUrl(lead.canonicalUrl).slice(4)}`;
    const dayKey = toDayKeyInTz(lead.publishedAt, timeZone);
    const expiresAt = computeExpiresAt(oldest.publishedAt, retentionDays);

    // Deterministic Heat estimate (Section 8.1)
    const velocitySignal = Math.min(1, sources.length / 6);
    const spreadSignal = Math.min(1, (sources.length * (avgTrust / 5)) / 5);
    const heatScore = Math.min(
      98,
      Math.max(20, Math.round(100 * (0.55 * velocitySignal + 0.45 * spreadSignal)))
    );

    const keywords = Array.from(
      new Set(cluster.articles.flatMap((a) => [...(a.entities || []), ...(a.keywords || [])]))
    ).slice(0, 8);

    return {
      id: storyId,
      headline: lead.title,
      sector: effectiveSector,
      dayKey,
      expiresAt,
      subtags: keywords.slice(0, 6),
      createdAt: oldest.publishedAt,
      updatedAt: lead.publishedAt,
      sourceCount: sources.length,
      articleIds: cluster.articles.slice(0, 40).map((a) => a.id),
      sources,
      importanceScore,
      heatScore,
      heatSignalsUsed: 3,
      satirePotential: sensitivity === 'no-joke' ? 0 : sensitivity === 'handle-with-care' ? 5 : 8,
      verification,
      sensitivity,
      summarised: false,
      whatHappened: lead.snippet || lead.title,
      whyItMatters: `Reported across ${sources.length} verified outlet${sources.length === 1 ? '' : 's'} in ${effectiveSector}.`,
      keyFacts: sources.slice(0, 4).map((s) => ({
        fact: s.title,
        sourceIndex: s.index,
      })),
      keyNumbers: [],
      timeline: sources.slice(0, 4).map((s) => ({
        date: toDayKeyInTz(s.publishedAt, timeZone),
        event: `${s.outlet}: ${s.title}`,
        sourceIndex: s.index,
      })),
      stakeholders: [],
      framingNotes: `Coverage led by ${Array.from(new Set(sources.map((s) => s.outlet))).slice(0, 4).join(', ')}.`,
      openQuestions: [],
      comedyAngles: [],
      videoIdeas: {
        titles: [lead.title],
        thumbnails: ['WHAT REALLY HAPPENED?'],
        onScreenCards: [effectiveSector],
        description: `${lead.title}\n\nSources:\n${sources.map((s) => `[S${s.index}] ${s.outlet}: ${s.url}`).join('\n')}`,
      },
      relatedVideos: [],
      govReleases: [],
      thumbnailUrl: cluster.articles.find((a) => a.imageUrl)?.imageUrl,
      whyRising: `First seen ${new Date(oldest.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}; ${sources.length} ${sources.length === 1 ? 'outlet' : 'outlets'} reporting.`,
    };
  });
}

/**
 * Builds compact FeedIndexDay documents for a given dayKey.
 * If serialised size exceeds 700 KB, splits into {dayKey}, {dayKey}_2, etc. (Section 4).
 */
export function buildFeedIndexDocsForDay(
  dayKey: string,
  dayStories: StoryCluster[]
): FeedIndexDay[] {
  const sorted = [...dayStories].sort((a, b) => b.importanceScore - a.importanceScore);
  const cards: FeedIndexCard[] = sorted.map((st) => ({
    id: st.id,
    headline: st.headline.slice(0, 600),
    blurb: (st.whatHappened || st.headline).slice(0, 140),
    sector: st.sector,
    keywords: (st.subtags || []).slice(0, 8),
    importanceScore: st.importanceScore,
    heatScore: st.heatScore ?? 40,
    satirePotential: st.satirePotential,
    sourceCount: st.sourceCount,
    updatedAt: st.updatedAt,
    verification: st.verification || (st.sourceCount >= 2 ? 'verified' : 'single-source'),
    sensitivity: st.sensitivity,
    ...(st.thumbnailUrl ? { thumbnailUrl: st.thumbnailUrl } : {}),
  }));

  const nowIso = new Date().toISOString();
  const docs: FeedIndexDay[] = [];
  let currentCards: FeedIndexCard[] = [];
  let part = 1;

  for (const card of cards) {
    const candidate = [...currentCards, card];
    const docKey = part === 1 ? dayKey : `${dayKey}_${part}`;
    const candidateDoc: FeedIndexDay = {
      dayKey: docKey,
      part,
      updatedAt: nowIso,
      cards: candidate,
    };
    const byteLen = new TextEncoder().encode(JSON.stringify(candidateDoc)).length;
    if (byteLen > FEED_INDEX_MAX_BYTES && currentCards.length > 0) {
      docs.push({
        dayKey: part === 1 ? dayKey : `${dayKey}_${part}`,
        part,
        updatedAt: nowIso,
        cards: currentCards,
      });
      part++;
      currentCards = [card];
    } else {
      currentCards = candidate;
    }
  }

  if (currentCards.length > 0 || docs.length === 0) {
    docs.push({
      dayKey: part === 1 ? dayKey : `${dayKey}_${part}`,
      part,
      updatedAt: nowIso,
      cards: currentCards,
    });
  }

  return docs;
}

/**
 * Section 7.4 Claim-Tag Checker
 */
export function checkScriptUnsourcedClaims(
  sections: ScriptSection[],
  validSourceMaxIndex: number
): {
  unsourcedLines: {
    sectionId: string;
    sectionLabel: string;
    line: string;
    reason: string;
  }[];
  sourcedClaimsCount: number;
  isClean: boolean;
} {
  const unsourcedLines: {
    sectionId: string;
    sectionLabel: string;
    line: string;
    reason: string;
  }[] = [];
  let sourcedClaimsCount = 0;

  const sourceTagRegex = /\[S(\d+)\]/g;
  const factualIndicatorRegex =
    /\b(\d+(\.\d+)?\s*(%|percent|cr|crore|lakh|billion|million|rs|inr|km|tonnes|years|days)|according to|reported|announced|ministry|supreme court|rbi|sebi|pib)\b/i;

  for (const section of sections) {
    const lines = section.content
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !l.startsWith('#') &&
          !l.startsWith('[B-ROLL') &&
          !l.startsWith('[GRAPHIC') &&
          !l.startsWith('[SFX') &&
          !l.startsWith('[ZOOM') &&
          !l.startsWith('[SCREENSHOT') &&
          !l.startsWith('[MEME') &&
          !l.startsWith('[CUT')
      )
      .flatMap((l) => l.split(/(?<=[.?!])\s+(?!\[S\d+\])/))
      .map((s) => s.trim())
      .filter(Boolean);

    const sectionHasAnyCitation = /\[S\d+\]/.test(section.content);

    for (const line of lines) {
      const matches = [...line.matchAll(sourceTagRegex)];
      if (matches.length > 0) {
        let invalidRef = false;
        for (const m of matches) {
          const idx = parseInt(m[1], 10);
          if (idx < 1 || idx > Math.max(1, validSourceMaxIndex)) {
            invalidRef = true;
            unsourcedLines.push({
              sectionId: section.id,
              sectionLabel: section.type,
              line,
              reason: `Source tag [S${idx}] exceeds available sources (1..${validSourceMaxIndex})`,
            });
          } else {
            sourcedClaimsCount++;
          }
        }
        if (!invalidRef) continue;
      } else if (
        (section.type === 'SETUP' &&
          (!sectionHasAnyCitation || factualIndicatorRegex.test(line))) ||
        (section.type === 'TURN' && factualIndicatorRegex.test(line))
      ) {
        unsourcedLines.push({
          sectionId: section.id,
          sectionLabel: section.type,
          line,
          reason:
            'Unsourced claim: factual statement or SETUP line is missing a [S#] source citation tag.',
        });
      }
    }
  }

  return {
    unsourcedLines,
    sourcedClaimsCount,
    isClean: unsourcedLines.length === 0,
  };
}

/**
 * Unifies multiple script sections into a single continuous script segment
 * with structured YouTuber creator subheadings (INTRO, SETUP, TURN, PUNCHLINE, OUTRO).
 */
export function unifyScriptIntoSingleSegment(
  sections: ScriptSection[],
  defaultStoryId = '',
  defaultHeadline = ''
): ScriptSection[] {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [
      {
        id: 'sec_unified_1',
        type: 'SETUP',
        storyId: defaultStoryId,
        storyHeadline: defaultHeadline,
        content:
          '### INTRO (YOUTUBER HOOK & COLD OPEN)\n\n### SUBHEADING: KYA SCENE HAI? (THE REAL STORY & VERIFIED FACTS)\n\n### SUBHEADING: WAIT, IT GETS CRAZIER (THE SATIRE TURN & BREAKDOWN)\n\n### SUBHEADING: FINAL ROAST, PUNCHLINES & REAL TALK\n\n### OUTRO (COMMENT BAIT & YOUTUBER SIGN-OFF)',
        cues: [],
      },
    ];
  }

  const subheadingForType: Record<string, string> = {
    'COLD OPEN': '### INTRO (YOUTUBER HOOK & COLD OPEN)',
    SETUP: '### SUBHEADING: KYA SCENE HAI? (THE REAL STORY & VERIFIED FACTS)',
    TURN: '### SUBHEADING: WAIT, IT GETS CRAZIER (THE SATIRE TURN & BREAKDOWN)',
    PUNCHLINE: '### SUBHEADING: FINAL ROAST, PUNCHLINES & REAL TALK',
    BRIDGE: '### SUBHEADING: NEXT UP — THE PLOT THICKENS',
    OUTRO: '### OUTRO (COMMENT BAIT & YOUTUBER SIGN-OFF)',
  };

  if (sections.length === 1) {
    const only = sections[0];
    const hasSubheadings = /^#{2,3}\s+/m.test(only.content || '');
    if (hasSubheadings) {
      return [only];
    }
    return [
      {
        ...only,
        id: only.id || 'sec_unified_1',
        type: 'SETUP',
        content: `### INTRO (YOUTUBER HOOK & COLD OPEN)\n${only.content.trim()}\n\n### OUTRO (COMMENT BAIT & YOUTUBER SIGN-OFF)\nDrop your take in the comments below, and check every verified source link in the Fact Box before sharing [S1].`,
      },
    ];
  }

  const allCues: string[] = [];
  const blocks: string[] = [];

  for (const sec of sections) {
    if (Array.isArray(sec.cues)) {
      for (const c of sec.cues) {
        if (c && !allCues.includes(c)) {
          allCues.push(c);
        }
      }
    }
    const rawContent = (sec.content || '').trim();
    if (!rawContent) continue;

    const alreadyHasHeader = /^#{2,3}\s+/.test(rawContent);
    const heading =
      subheadingForType[sec.type] || `### SUBHEADING: ${sec.type}`;
    const cueLines =
      Array.isArray(sec.cues) && sec.cues.length > 0
        ? `${sec.cues.join('\n')}\n`
        : '';

    blocks.push(
      alreadyHasHeader
        ? `${cueLines}${rawContent}`
        : `${heading}${sec.storyHeadline ? ` — ${sec.storyHeadline}` : ''}\n${cueLines}${rawContent}`
    );
  }

  return [
    {
      id: sections[0]?.id || 'sec_unified_1',
      type: 'SETUP',
      storyId: sections[0]?.storyId || defaultStoryId,
      storyHeadline: sections[0]?.storyHeadline || defaultHeadline,
      content: blocks.join('\n\n'),
      cues: allCues,
    },
  ];
}

/**
 * Section 7.4 Spoken Duration Estimator
 */
export function estimateSpokenDuration(
  text: string,
  wpm = 150
): { wordCount: number; durationSec: number; formatted: string } {
  const safeWpm = Math.max(60, Math.min(300, wpm || 150));
  const cleaned = (text || '')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/\[(B-ROLL|GRAPHIC|SFX|ZOOM|SCREENSHOT|MEME|CUT)[^\]]*\]/gi, ' ')
    .replace(/\[S\d+\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .trim();

  if (!cleaned) {
    return { wordCount: 0, durationSec: 0, formatted: '0:00' };
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const durationSec = Math.round((wordCount / safeWpm) * 60);
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  return {
    wordCount,
    durationSec,
    formatted: `${mins}:${secs.toString().padStart(2, '0')}`,
  };
}

/**
 * Section 6.4 Firestore Free-Tier Budget & Usage Monitor
 */
export function estimateFirestoreUsage(counts: {
  sources: number;
  articles: number;
  stories: number;
  scripts: number;
  saved: number;
  readsToday: number;
  writesToday: number;
}): FirestoreUsageEstimate {
  const readsLimit = 50_000;
  const writesLimit = 20_000;
  const storageLimitBytes = 1024 * 1024 * 1024; // 1 GiB

  // Section 4: No separate document per article; compact articles live inside stories + feedIndex
  const storageBytes =
    counts.sources * 650 +
    counts.stories * 5800 +
    counts.scripts * 6800 +
    counts.saved * 5200;

  const readsPercent = Math.min(100, Math.round((counts.readsToday / readsLimit) * 1000) / 10);
  const writesPercent = Math.min(100, Math.round((counts.writesToday / writesLimit) * 1000) / 10);
  const storagePercent = Math.min(
    100,
    Math.round((storageBytes / storageLimitBytes) * 10000) / 100
  );

  const warningReasons: string[] = [];
  if (readsPercent >= 80) {
    warningReasons.push(`Daily reads at ${readsPercent}% of 50,000 free-tier limit.`);
  }
  if (writesPercent >= 80) {
    warningReasons.push(`Daily writes at ${writesPercent}% of 20,000 free-tier limit.`);
  }
  if (storagePercent >= 80) {
    warningReasons.push(`Firestore storage at ${storagePercent}% of 1 GiB free-tier limit.`);
  }

  return {
    readsToday: counts.readsToday,
    readsLimit,
    readsPercent,
    writesToday: counts.writesToday,
    writesLimit,
    writesPercent,
    storageBytes,
    storageLimitBytes,
    storagePercent,
    isWarning: warningReasons.length > 0,
    warningReasons,
  };
}

/**
 * Formats a StoryCluster into a clean plain-text brief with [S#] citations for 'Copy brief'.
 */
export function formatPlainTextBrief(story: StoryCluster): string {
  const lines: string[] = [
    `${story.sector} — ${story.headline}`,
    `Sources: ${story.sourceCount} | Satire potential: ${story.satirePotential}/10 | Sensitivity: ${story.sensitivity}`,
    `Updated: ${new Date(story.updatedAt).toLocaleString()}`,
    '',
    'What happened:',
    story.whatHappened,
    '',
    'Why it matters:',
    story.whyItMatters,
    '',
    'Key facts:',
    ...story.keyFacts.map((kf) => `- ${kf.fact} [S${kf.sourceIndex}]`),
    '',
    'Key numbers:',
    ...story.keyNumbers.map((kn) => `- ${kn.label}: ${kn.value} [S${kn.sourceIndex}]`),
    '',
    'Comedy angles:',
    ...story.comedyAngles.map(
      (ca, idx) => `${idx + 1}. (${ca.target}) ${ca.angle} — ${ca.punchlineHint}`
    ),
    '',
    'Verified sources:',
    ...story.sources.map(
      (s) => `[S${s.index}] ${s.outlet} — ${s.title} (${s.url})`
    ),
  ];
  return lines.join('\n');
}

/* ============================================================================
 * PHASE 4: RETENTION, STARRED SNAPSHOTS, EXPIRING SOON & JANITOR AGENT (Section 5.4)
 * ==========================================================================*/

/**
 * Section 5.4: Every query and UI view also filters by date (`expiresAt <= now` or age > retentionDays)
 * so expired items disappear from the UI immediately on day 26 even if Firestore TTL has not run yet.
 */
export function isStoryExpired(
  story: StoryCluster,
  nowMs: number = Date.now(),
  retentionDays = 25
): boolean {
  const safeRetentionDays = Math.min(60, Math.max(1, retentionDays || 25));
  if (story.expiresAt) {
    const expMs = new Date(story.expiresAt).getTime();
    if (!Number.isNaN(expMs) && expMs <= nowMs) {
      return true;
    }
  }
  const firstSeenIso = story.createdAt || story.updatedAt;
  const firstSeenMs = new Date(firstSeenIso).getTime();
  if (!Number.isNaN(firstSeenMs)) {
    const computedExpiryMs = firstSeenMs + safeRetentionDays * 24 * 60 * 60 * 1000;
    if (computedExpiryMs <= nowMs) {
      return true;
    }
  }
  return false;
}

/**
 * Section 5.4: Creates a permanent `starred/{storyId}` document containing a full story snapshot
 * with NO `expiresAt` field so TTL and Janitor never touch it.
 */
export function createStarredStorySnapshot(
  story: StoryCluster,
  note = '',
  savedAtIso: string = new Date().toISOString()
): SavedStory {
  const snapshotCopy: StoryCluster = {
    ...story,
  };
  delete snapshotCopy.expiresAt;
  return {
    storyId: story.id,
    savedAt: savedAtIso,
    ...(note ? { note: note.slice(0, 2000) } : {}),
    snapshot: snapshotCopy,
  };
}

/**
 * Section 5.4: Resolves a story by ID across active `stories`, permanent `starred` snapshots,
 * and `desk` snapshots so starred or desk-queued stories remain readable on day 40+ after TTL cleanup.
 */
export function resolveStoryAcrossArchiveAndSnapshots(
  storyId: string,
  stories: StoryCluster[],
  savedList: SavedStory[],
  deskSnapshots?: Record<string, StoryCluster>,
  nowMs: number = Date.now(),
  retentionDays = 25
): StoryCluster | null {
  if (!storyId) return null;
  const active = stories.find(
    (s) => s.id === storyId && !isStoryExpired(s, nowMs, retentionDays)
  );
  if (active) return active;

  const starredEntry = savedList.find((sv) => sv.storyId === storyId);
  if (starredEntry?.snapshot) {
    return starredEntry.snapshot;
  }

  if (deskSnapshots && deskSnapshots[storyId]) {
    return deskSnapshots[storyId];
  }

  return null;
}

/**
 * Section 5.4: Expiring soon view — lists unstarred stories leaving the archive within 3 days
 * that had high Heat (>= 50), high Opportunity (>= 55), or a linked script, with a one-click Star button.
 */
export function getExpiringSoonStories(params: {
  stories: StoryCluster[];
  savedList: SavedStory[];
  scripts: ScriptRecord[];
  nowMs?: number;
  retentionDays?: number;
  windowDays?: number;
}): {
  story: StoryCluster;
  daysRemaining: number;
  hoursRemaining: number;
  reason: string;
}[] {
  const nowMs = params.nowMs ?? Date.now();
  const retentionDays = Math.min(60, Math.max(1, params.retentionDays || 25));
  const windowMs = (params.windowDays ?? 3) * 24 * 60 * 60 * 1000;
  const starredIds = new Set(params.savedList.map((s) => s.storyId));
  const scriptedStoryIds = new Set<string>();
  for (const sc of params.scripts || []) {
    for (const sid of sc.storyIds || []) {
      scriptedStoryIds.add(sid);
    }
  }

  const results: {
    story: StoryCluster;
    daysRemaining: number;
    hoursRemaining: number;
    reason: string;
  }[] = [];

  for (const st of params.stories) {
    if (starredIds.has(st.id)) continue;
    if (isStoryExpired(st, nowMs, retentionDays)) continue;

    const expIso =
      st.expiresAt || computeExpiresAt(st.createdAt || st.updatedAt, retentionDays);
    const expMs = new Date(expIso).getTime();
    if (Number.isNaN(expMs)) continue;

    const remainingMs = expMs - nowMs;
    if (remainingMs <= 0 || remainingMs > windowMs) continue;

    const heat =
      st.heatScore ??
      Math.min(95, Math.max(18, st.sourceCount * 16 + Math.round(st.importanceScore * 0.4)));
    const opportunity = Math.round(
      0.35 * heat +
        0.3 * (st.satirePotential * 10) +
        0.2 * st.importanceScore +
        0.15 * (st.verification === 'verified' ? 100 : 50)
    );
    const hasScript = scriptedStoryIds.has(st.id);
    const highHeat = heat >= 50;
    const highOpportunity = opportunity >= 55;

    if (!hasScript && !highHeat && !highOpportunity) continue;

    const reasons: string[] = [];
    if (hasScript) reasons.push('Used in script');
    if (highOpportunity) reasons.push(`Opportunity ${opportunity}`);
    if (highHeat) reasons.push(`Heat ${heat}`);

    const hoursRemaining = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60)));
    const daysRemaining = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

    results.push({
      story: st,
      daysRemaining,
      hoursRemaining,
      reason: reasons.join(' · '),
    });
  }

  return results.sort((a, b) => a.hoursRemaining - b.hoursRemaining);
}

/**
 * Section 5.4: Janitor Agent (dry-run first)
 * - Refuses to run if settings are missing/invalid or if the clock looks wrong (year < 2025).
 * - Runs in dry-run mode for the first 3 days after `installedAt` (unless `allowEarlyLiveRun: true`),
 *   or whenever `forceDryRun: true` is passed.
 * - Deletes at most 5,000 documents/entries per run.
 * - Never touches `starred` snapshots, `desk` snapshots, or kept `scripts`.
 */
export function runJanitorPass(input: {
  nowMs?: number;
  installedAt?: string;
  retentionDays?: number | null;
  keepScripts?: boolean;
  forceDryRun?: boolean;
  allowEarlyLiveRun?: boolean;
  stories: StoryCluster[];
  feedIndex: Record<string, FeedIndexDay>;
  seenShards: Record<string, SeenShard>;
  statsDays?: Record<string, { dayKey: string; updatedAt: string }>;
  agentRunRecords?: { id: string; startedAt: string }[];
  starredStories?: SavedStory[];
  deskSnapshots?: Record<string, StoryCluster>;
  scripts?: ScriptRecord[];
  tz?: string;
}): {
  report: JanitorRunReport;
  nextStories: StoryCluster[];
  nextFeedIndex: Record<string, FeedIndexDay>;
  nextSeenShards: Record<string, SeenShard>;
  nextStatsDays: Record<string, { dayKey: string; updatedAt: string }>;
  nextAgentRunRecords: { id: string; startedAt: string }[];
} {
  const nowMs = input.nowMs ?? Date.now();
  const tz = input.tz || 'Asia/Kolkata';
  const starredCount = (input.starredStories || []).length;
  const deskCount = Object.keys(input.deskSnapshots || {}).length;
  const scriptsCount = (input.scripts || []).length;

  // Guard 1: Validate clock (must be finite and >= 2025-01-01)
  const minValidClockMs = Date.UTC(2025, 0, 1, 0, 0, 0);
  if (typeof nowMs !== 'number' || Number.isNaN(nowMs) || nowMs < minValidClockMs) {
    return {
      report: {
        ok: false,
        dryRun: true,
        inInitialThreeDayWindow: false,
        refusedReason: 'Janitor refused to run: system clock is invalid or earlier than 2025.',
        ranAt: new Date(Math.max(0, nowMs || 0)).toISOString(),
        retentionDays: Number(input.retentionDays) || 25,
        cutoffDayKey: '',
        totalDeletedOrListed: 0,
        cappedAt5000: false,
        wouldDelete: {
          storyIds: [],
          feedIndexDayKeys: [],
          seenShardEntries: [],
          statsDayKeys: [],
          agentRunIds: [],
        },
        protectedCounts: {
          starredStories: starredCount,
          deskSnapshots: deskCount,
          keptScripts: scriptsCount,
        },
      },
      nextStories: input.stories,
      nextFeedIndex: input.feedIndex,
      nextSeenShards: input.seenShards,
      nextStatsDays: input.statsDays || {},
      nextAgentRunRecords: input.agentRunRecords || [],
    };
  }

  // Guard 2: Validate retentionDays setting (must be readable and between 1 and 60)
  const retentionDays = input.retentionDays;
  if (
    typeof retentionDays !== 'number' ||
    Number.isNaN(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 60
  ) {
    return {
      report: {
        ok: false,
        dryRun: true,
        inInitialThreeDayWindow: false,
        refusedReason:
          'Janitor refused to run: could not read valid retentionDays setting (expected 1..60 days).',
        ranAt: new Date(nowMs).toISOString(),
        retentionDays: 0,
        cutoffDayKey: '',
        totalDeletedOrListed: 0,
        cappedAt5000: false,
        wouldDelete: {
          storyIds: [],
          feedIndexDayKeys: [],
          seenShardEntries: [],
          statsDayKeys: [],
          agentRunIds: [],
        },
        protectedCounts: {
          starredStories: starredCount,
          deskSnapshots: deskCount,
          keptScripts: scriptsCount,
        },
      },
      nextStories: input.stories,
      nextFeedIndex: input.feedIndex,
      nextSeenShards: input.seenShards,
      nextStatsDays: input.statsDays || {},
      nextAgentRunRecords: input.agentRunRecords || [],
    };
  }

  // Check if within first 3 days of installation (Section 5.4: runs in dry-run mode for the first 3 days)
  const installedMs = input.installedAt ? new Date(input.installedAt).getTime() : nowMs;
  const validInstalledMs = Number.isNaN(installedMs) ? nowMs : installedMs;
  const inInitialThreeDayWindow =
    nowMs - validInstalledMs < 3 * 24 * 60 * 60 * 1000 && !input.allowEarlyLiveRun;

  const dryRun = Boolean(input.forceDryRun || inInitialThreeDayWindow);
  const cutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffDayKey = toDayKeyInTz(new Date(cutoffMs).toISOString(), tz);
  const agentRunCutoffMs = nowMs - 7 * 24 * 60 * 60 * 1000; // agentRuns older than 7 days

  const MAX_DELETIONS_PER_RUN = 5000;
  let budgetRemaining = MAX_DELETIONS_PER_RUN;
  let hitCap = false;

  const expiredStoryIds: string[] = [];
  for (const st of input.stories) {
    if (isStoryExpired(st, nowMs, retentionDays)) {
      if (budgetRemaining > 0) {
        expiredStoryIds.push(st.id);
        budgetRemaining--;
      } else {
        hitCap = true;
        break;
      }
    }
  }

  const expiredFeedIndexKeys: string[] = [];
  for (const key of Object.keys(input.feedIndex || {})) {
    const baseDayKey = key.slice(0, 10);
    if (baseDayKey <= cutoffDayKey) {
      if (budgetRemaining > 0) {
        expiredFeedIndexKeys.push(key);
        budgetRemaining--;
      } else {
        hitCap = true;
        break;
      }
    }
  }

  const expiredSeenEntries: { shardId: string; articleHash: string; dayKey: string }[] = [];
  for (const [shardId, shard] of Object.entries(input.seenShards || {})) {
    for (const [articleHash, entryDayKey] of Object.entries(shard.entries || {})) {
      if (entryDayKey <= cutoffDayKey) {
        if (budgetRemaining > 0) {
          expiredSeenEntries.push({ shardId, articleHash, dayKey: entryDayKey });
          budgetRemaining--;
        } else {
          hitCap = true;
          break;
        }
      }
    }
    if (hitCap) break;
  }

  const expiredStatsKeys: string[] = [];
  for (const key of Object.keys(input.statsDays || {})) {
    if (key.slice(0, 10) <= cutoffDayKey) {
      if (budgetRemaining > 0) {
        expiredStatsKeys.push(key);
        budgetRemaining--;
      } else {
        hitCap = true;
        break;
      }
    }
  }

  const expiredAgentRunIds: string[] = [];
  for (const rec of input.agentRunRecords || []) {
    const startedMs = new Date(rec.startedAt).getTime();
    if (!Number.isNaN(startedMs) && startedMs <= agentRunCutoffMs) {
      if (budgetRemaining > 0) {
        expiredAgentRunIds.push(rec.id);
        budgetRemaining--;
      } else {
        hitCap = true;
        break;
      }
    }
  }

  const totalDeletedOrListed =
    expiredStoryIds.length +
    expiredFeedIndexKeys.length +
    expiredSeenEntries.length +
    expiredStatsKeys.length +
    expiredAgentRunIds.length;

  const report: JanitorRunReport = {
    ok: true,
    dryRun,
    inInitialThreeDayWindow,
    ranAt: new Date(nowMs).toISOString(),
    retentionDays,
    cutoffDayKey,
    totalDeletedOrListed,
    cappedAt5000: hitCap,
    wouldDelete: {
      storyIds: expiredStoryIds,
      feedIndexDayKeys: expiredFeedIndexKeys,
      seenShardEntries: expiredSeenEntries,
      statsDayKeys: expiredStatsKeys,
      agentRunIds: expiredAgentRunIds,
    },
    protectedCounts: {
      starredStories: starredCount,
      deskSnapshots: deskCount,
      keptScripts: input.keepScripts !== false ? scriptsCount : 0,
    },
  };

  if (dryRun) {
    return {
      report,
      nextStories: input.stories,
      nextFeedIndex: input.feedIndex,
      nextSeenShards: input.seenShards,
      nextStatsDays: input.statsDays || {},
      nextAgentRunRecords: input.agentRunRecords || [],
    };
  }

  const deleteStorySet = new Set(expiredStoryIds);
  const nextStories = input.stories.filter((s) => !deleteStorySet.has(s.id));

  const deleteFeedSet = new Set(expiredFeedIndexKeys);
  const nextFeedIndex: Record<string, FeedIndexDay> = {};
  for (const [k, v] of Object.entries(input.feedIndex || {})) {
    if (!deleteFeedSet.has(k)) {
      nextFeedIndex[k] = v;
    }
  }

  const nextSeenShards: Record<string, SeenShard> = {};
  const deleteSeenMap = new Map<string, Set<string>>();
  for (const item of expiredSeenEntries) {
    if (!deleteSeenMap.has(item.shardId)) {
      deleteSeenMap.set(item.shardId, new Set());
    }
    deleteSeenMap.get(item.shardId)!.add(item.articleHash);
  }
  for (const [shardId, shard] of Object.entries(input.seenShards || {})) {
    const toRemove = deleteSeenMap.get(shardId);
    if (!toRemove || toRemove.size === 0) {
      nextSeenShards[shardId] = shard;
    } else {
      const nextEntries: Record<string, string> = {};
      for (const [hash, dKey] of Object.entries(shard.entries || {})) {
        if (!toRemove.has(hash)) {
          nextEntries[hash] = dKey;
        }
      }
      nextSeenShards[shardId] = {
        ...shard,
        entries: nextEntries,
        updatedAt: new Date(nowMs).toISOString(),
      };
    }
  }

  const deleteStatsSet = new Set(expiredStatsKeys);
  const nextStatsDays: Record<string, { dayKey: string; updatedAt: string }> = {};
  for (const [k, v] of Object.entries(input.statsDays || {})) {
    if (!deleteStatsSet.has(k)) {
      nextStatsDays[k] = v;
    }
  }

  const deleteRunsSet = new Set(expiredAgentRunIds);
  const nextAgentRunRecords = (input.agentRunRecords || []).filter(
    (r) => !deleteRunsSet.has(r.id)
  );

  return {
    report,
    nextStories,
    nextFeedIndex,
    nextSeenShards,
    nextStatsDays,
    nextAgentRunRecords,
  };
}

