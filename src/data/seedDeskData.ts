import {
  ArticleItem,
  DeskState,
  RelatedVideo,
  ScriptRecord,
  Sector,
  SourceItem,
  StoryCluster,
  SyncMeta,
  UserSettings,
} from '../types/desk';

function makeGoogleNewsUrl(query: string, lang: 'en' | 'hi' = 'en'): string {
  const encoded = encodeURIComponent(query);
  if (lang === 'hi') {
    return `https://news.google.com/rss/search?q=${encoded}&hl=hi&gl=IN&ceid=IN:hi`;
  }
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;
}

interface RawFeedSeed {
  id: string;
  name: string;
  type: 'rss' | 'youtube' | 'regulator' | 'google_news';
  url: string;
  sector: Sector;
  language: 'en' | 'hi';
  trust: number;
  priority: 'high' | 'normal';
}

const DIRECT_AND_REGULATOR_SEEDS: RawFeedSeed[] = [
  // Top stories & National Outlets
  {
    id: 'src_ie_top',
    name: 'The Indian Express — Top News',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com India news when:1d', 'en'),
    sector: 'Top stories',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_the_hindu_top',
    name: 'The Hindu — News & National',
    type: 'rss',
    url: 'https://www.thehindu.com/news/feeder/default.rss',
    sector: 'Top stories',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_ndtv_top',
    name: 'NDTV — Top Stories',
    type: 'rss',
    url: 'https://feeds.feedburner.com/ndtvnews-top-stories',
    sector: 'Top stories',
    language: 'en',
    trust: 4,
    priority: 'high',
  },
  {
    id: 'src_ht_top',
    name: 'Hindustan Times — Top News',
    type: 'rss',
    url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',
    sector: 'Top stories',
    language: 'en',
    trust: 4,
    priority: 'high',
  },
  {
    id: 'src_deccan_herald_national',
    name: 'Deccan Herald — India',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:deccanherald.com India news when:2d', 'en'),
    sector: 'Top stories',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Politics & Governance
  {
    id: 'src_indian_express_india',
    name: 'The Indian Express — India & Politics',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/india Parliament OR Government when:2d', 'en'),
    sector: 'Politics',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_indian_express_political_pulse',
    name: 'The Indian Express — Political Pulse',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/political-pulse when:3d', 'en'),
    sector: 'Politics',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_scroll_in',
    name: 'Scroll.in — Latest',
    type: 'rss',
    url: 'https://feeds.feedburner.com/ScrollinArticles.rss',
    sector: 'Politics',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_the_hindu_national',
    name: 'The Hindu — National',
    type: 'rss',
    url: 'https://www.thehindu.com/news/national/feeder/default.rss',
    sector: 'Politics',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_ndtv_india',
    name: 'NDTV — India News',
    type: 'rss',
    url: 'https://feeds.feedburner.com/ndtvnews-india-news',
    sector: 'Politics',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },
  {
    id: 'src_tribune_india',
    name: 'The Tribune — Nation',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:tribuneindia.com India politics when:2d', 'en'),
    sector: 'Politics',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Official Government & Regulators
  {
    id: 'src_pib_releases',
    name: 'PIB India — Official Press Releases',
    type: 'regulator',
    url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',
    sector: 'Politics',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_rbi_press',
    name: 'RBI — Official Press Releases',
    type: 'regulator',
    url: 'https://rbi.org.in/pressreleases_rss.xml',
    sector: 'Markets and finance',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_rbi_notifications',
    name: 'RBI — Official Notifications',
    type: 'regulator',
    url: 'https://rbi.org.in/notifications_rss.xml',
    sector: 'Business and economy',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_sebi_circulars',
    name: 'SEBI — Orders & Circulars',
    type: 'regulator',
    url: 'https://www.sebi.gov.in/sebirss.xml',
    sector: 'Markets and finance',
    language: 'en',
    trust: 5,
    priority: 'high',
  },

  // Business and economy
  {
    id: 'src_livemint_economy',
    name: 'Mint — Economy & Policy',
    type: 'rss',
    url: 'https://www.livemint.com/rss/economy',
    sector: 'Business and economy',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_livemint_companies',
    name: 'Mint — Companies',
    type: 'rss',
    url: 'https://www.livemint.com/rss/companies',
    sector: 'Business and economy',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_ie_business',
    name: 'The Indian Express — Business',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/business economy India when:2d', 'en'),
    sector: 'Business and economy',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_the_hindu_economy',
    name: 'The Hindu — Economy',
    type: 'rss',
    url: 'https://www.thehindu.com/business/Economy/feeder/default.rss',
    sector: 'Business and economy',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_et_economy',
    name: 'The Economic Times — Economy',
    type: 'rss',
    url: 'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms',
    sector: 'Business and economy',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Markets and finance
  {
    id: 'src_moneycontrol_markets',
    name: 'Moneycontrol — Market Reports',
    type: 'rss',
    url: 'https://www.moneycontrol.com/rss/marketreports.xml',
    sector: 'Markets and finance',
    language: 'en',
    trust: 4,
    priority: 'high',
  },
  {
    id: 'src_livemint_markets',
    name: 'Mint — Markets',
    type: 'rss',
    url: 'https://www.livemint.com/rss/markets',
    sector: 'Markets and finance',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_livemint_money',
    name: 'Mint — Money & Personal Finance',
    type: 'rss',
    url: 'https://www.livemint.com/rss/money',
    sector: 'Markets and finance',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_the_hindu_markets',
    name: 'The Hindu — Markets',
    type: 'rss',
    url: 'https://www.thehindu.com/business/markets/feeder/default.rss',
    sector: 'Markets and finance',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_et_markets',
    name: 'The Economic Times — Markets',
    type: 'rss',
    url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
    sector: 'Markets and finance',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Startups and tech
  {
    id: 'src_inc42_startups',
    name: 'Inc42 — Indian Startups & Tech',
    type: 'rss',
    url: 'https://inc42.com/feed/',
    sector: 'Startups and tech',
    language: 'en',
    trust: 4,
    priority: 'high',
  },
  {
    id: 'src_livemint_technology',
    name: 'Mint — Technology',
    type: 'rss',
    url: 'https://www.livemint.com/rss/technology',
    sector: 'Startups and tech',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_ie_technology',
    name: 'The Indian Express — Technology',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/technology tech India when:2d', 'en'),
    sector: 'Startups and tech',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_techcrunch',
    name: 'TechCrunch — Global Tech & Startups',
    type: 'rss',
    url: 'https://techcrunch.com/feed/',
    sector: 'Startups and tech',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },
  {
    id: 'src_the_verge',
    name: 'YourStory — Indian Startup Ecosystem',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:yourstory.com Indian startups funding when:3d', 'en'),
    sector: 'Startups and tech',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // AI
  {
    id: 'src_ie_ai',
    name: 'The Indian Express — Artificial Intelligence',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com artificial intelligence AI when:3d', 'en'),
    sector: 'AI',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_livemint_ai',
    name: 'Mint — AI',
    type: 'rss',
    url: 'https://www.livemint.com/rss/ai',
    sector: 'AI',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_arstechnica_ai',
    name: 'Analytics India Magazine — AI & ML India',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:analyticsindiamag.com AI India when:3d', 'en'),
    sector: 'AI',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Sports
  {
    id: 'src_ie_sports',
    name: 'The Indian Express — Sports',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/sports cricket India when:2d', 'en'),
    sector: 'Sports',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_the_hindu_sport',
    name: 'The Hindu — Sport',
    type: 'rss',
    url: 'https://www.thehindu.com/sport/feeder/default.rss',
    sector: 'Sports',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_espncricinfo',
    name: 'ESPNcricinfo — Cricket News',
    type: 'rss',
    url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml',
    sector: 'Sports',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },

  // Entertainment
  {
    id: 'src_ie_entertainment',
    name: 'The Indian Express — Entertainment',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/entertainment Bollywood OTT when:2d', 'en'),
    sector: 'Entertainment',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },
  {
    id: 'src_the_hindu_entertainment',
    name: 'The Hindu — Entertainment',
    type: 'rss',
    url: 'https://www.thehindu.com/entertainment/feeder/default.rss',
    sector: 'Entertainment',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },

  // Crime and law
  {
    id: 'src_bar_and_bench',
    name: 'Bar & Bench — Legal & Courts',
    type: 'rss',
    url: 'https://www.barandbench.com/feed',
    sector: 'Crime and law',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_livelaw_top',
    name: 'LiveLaw — Supreme Court & High Courts',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:livelaw.in Supreme Court OR High Court when:2d', 'en'),
    sector: 'Crime and law',
    language: 'en',
    trust: 5,
    priority: 'high',
  },

  // Cities (Regional / Metro)
  {
    id: 'src_ie_delhi',
    name: 'The Indian Express — Delhi',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/cities/delhi when:2d', 'en'),
    sector: 'Cities',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_ie_mumbai',
    name: 'The Indian Express — Mumbai',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/cities/mumbai when:2d', 'en'),
    sector: 'Cities',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_ie_bengaluru',
    name: 'The Indian Express — Bengaluru',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/cities/bangalore when:2d', 'en'),
    sector: 'Cities',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_the_hindu_cities',
    name: 'The Hindu — Cities',
    type: 'rss',
    url: 'https://www.thehindu.com/news/cities/feeder/default.rss',
    sector: 'Cities',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },

  // Environment and climate
  {
    id: 'src_the_hindu_environment',
    name: 'The Hindu — Environment',
    type: 'rss',
    url: 'https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss',
    sector: 'Environment and climate',
    language: 'en',
    trust: 5,
    priority: 'high',
  },

  // Health
  {
    id: 'src_the_hindu_health',
    name: 'The Hindu — Health',
    type: 'rss',
    url: 'https://www.thehindu.com/sci-tech/health/feeder/default.rss',
    sector: 'Health',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_ie_lifestyle_health',
    name: 'The Indian Express — Health & Wellness',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com health AIIMS ICMR when:3d', 'en'),
    sector: 'Health',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Education and jobs
  {
    id: 'src_ie_education',
    name: 'The Indian Express — Education & Jobs',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/education UPSC NEET CBSE JEE when:2d', 'en'),
    sector: 'Education and jobs',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_the_hindu_education',
    name: 'The Hindu — Education',
    type: 'rss',
    url: 'https://www.thehindu.com/education/feeder/default.rss',
    sector: 'Education and jobs',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },

  // World
  {
    id: 'src_the_hindu_world',
    name: 'The Hindu — International',
    type: 'rss',
    url: 'https://www.thehindu.com/news/international/feeder/default.rss',
    sector: 'World',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_ie_world',
    name: 'The Indian Express — World',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/world geopolitics diplomacy when:2d', 'en'),
    sector: 'World',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_bbc_world',
    name: 'BBC News — World',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    sector: 'World',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_bbc_asia_india',
    name: 'BBC News — India & Asia',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml',
    sector: 'World',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_aljazeera_all',
    name: 'Al Jazeera — Global News',
    type: 'rss',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    sector: 'World',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Auto
  {
    id: 'src_ie_auto',
    name: 'The Indian Express — Auto & Mobility',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com EV OR car OR highway India when:3d', 'en'),
    sector: 'Auto',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },
  {
    id: 'src_autocar_india',
    name: 'Autocar India — News',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:autocarindia.com EV OR car launch India when:3d', 'en'),
    sector: 'Auto',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // Science
  {
    id: 'src_the_hindu_science',
    name: 'The Hindu — Science & ISRO',
    type: 'rss',
    url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss',
    sector: 'Science',
    language: 'en',
    trust: 5,
    priority: 'high',
  },
  {
    id: 'src_sciencedaily',
    name: 'ScienceDaily — Top Science News',
    type: 'rss',
    url: 'https://www.sciencedaily.com/rss/top/science.xml',
    sector: 'Science',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },

  // Viral and social
  {
    id: 'src_ie_trending',
    name: 'The Indian Express — Trending & Viral',
    type: 'google_news',
    url: makeGoogleNewsUrl('site:indianexpress.com/section/trending viral India when:2d', 'en'),
    sector: 'Viral and social',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },
  {
    id: 'src_ndtv_offbeat',
    name: 'NDTV — Offbeat & Viral',
    type: 'rss',
    url: 'https://feeds.feedburner.com/ndtvnews-offbeat-news',
    sector: 'Viral and social',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },

  // YouTube Channel Feeds (News & Official)
  {
    id: 'src_yt_sansad_tv',
    name: 'Sansad TV Official YouTube',
    type: 'youtube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCv01OPQaJRWahh6bd8i04Hw',
    sector: 'Politics',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_yt_the_hindu',
    name: 'The Hindu YouTube',
    type: 'youtube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC3njZ48-FDxLleBYaP0SZIg',
    sector: 'Politics',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
  {
    id: 'src_yt_ndtv',
    name: 'NDTV YouTube',
    type: 'youtube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZFMm1mMw0F81Z37aaEzTUA',
    sector: 'Top stories',
    language: 'en',
    trust: 4,
    priority: 'normal',
  },
  {
    id: 'src_yt_livemint',
    name: 'Mint YouTube',
    type: 'youtube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCUI9vm69ZbAqRK3q3vKLWCQ',
    sector: 'Business and economy',
    language: 'en',
    trust: 5,
    priority: 'normal',
  },
];

// Google News RSS Queries (English & Hindi across all 17 sectors — Section 5.1)
const GOOGLE_NEWS_SECTOR_QUERIES: {
  sector: Sector;
  queries: { id: string; label: string; q: string; lang?: 'en' | 'hi'; priority?: 'high' | 'normal' }[];
}[] = [
  {
    sector: 'Top stories',
    queries: [
      { id: 'gn_top_india_breaking', label: 'Google News — India Top Stories', q: 'India breaking news when:1d', priority: 'high' },
      { id: 'gn_top_parliament_cabinet', label: 'Google News — Union Cabinet & Policy', q: 'Union Cabinet OR PMO India policy when:2d' },
      { id: 'gn_top_hindi_bharat', label: 'Google News Hindi — भारत प्रमुख समाचार', q: 'भारत ताज़ा समाचार', lang: 'hi' },
      { id: 'gn_top_pti_wire', label: 'Google News — PTI Wire India', q: '"PTI" India news when:1d' },
    ],
  },
  {
    sector: 'Politics',
    queries: [
      { id: 'gn_pol_parliament', label: 'Google News — Parliament & Lok Sabha', q: 'Lok Sabha OR Rajya Sabha OR Parliament India when:2d', priority: 'high' },
      { id: 'gn_pol_eci_elections', label: 'Google News — Election Commission of India', q: '"Election Commission" India OR assembly elections when:2d', priority: 'high' },
      { id: 'gn_pol_state_assemblies', label: 'Google News — State Governments & CMs', q: 'Chief Minister India state cabinet policy when:2d' },
      { id: 'gn_pol_cag_reports', label: 'Google News — CAG & Parliamentary Committees', q: '"CAG report" OR "Parliamentary committee" India when:7d' },
      { id: 'gn_pol_hindi_rajniti', label: 'Google News Hindi — भारतीय राजनीति', q: 'भारतीय राजनीति संसद चुनाव', lang: 'hi' },
    ],
  },
  {
    sector: 'Business and economy',
    queries: [
      { id: 'gn_biz_gst_tax', label: 'Google News — GST Council & Direct Tax', q: '"GST Council" OR CBDT OR income tax India when:3d', priority: 'high' },
      { id: 'gn_biz_inflation_gdp', label: 'Google News — India CPI Inflation & GDP', q: 'India retail inflation CPI OR GDP growth MOSPI when:3d', priority: 'high' },
      { id: 'gn_biz_infra_railways', label: 'Google News — Indian Railways & Highways', q: '"Indian Railways" OR NHAI infrastructure India when:2d' },
      { id: 'gn_biz_fmcg_retail', label: 'Google News — FMCG & Consumer Demand India', q: 'FMCG India rural urban consumer demand when:3d' },
      { id: 'gn_biz_hindi_arthvyavastha', label: 'Google News Hindi — भारतीय अर्थव्यवस्था महंगाई', q: 'भारतीय अर्थव्यवस्था जीएसटी महंगाई', lang: 'hi' },
    ],
  },
  {
    sector: 'Markets and finance',
    queries: [
      { id: 'gn_mkt_sensex_nifty', label: 'Google News — Sensex & Nifty 50', q: 'Sensex OR Nifty 50 NSE BSE markets when:1d', priority: 'high' },
      { id: 'gn_mkt_sebi_ipo', label: 'Google News — SEBI Orders & IPO Watch', q: 'SEBI order OR India IPO listing when:2d', priority: 'high' },
      { id: 'gn_mkt_rbi_mpc', label: 'Google News — RBI Monetary Policy & Banking', q: 'RBI repo rate OR Indian banking NPAs when:3d' },
      { id: 'gn_mkt_rupee_forex', label: 'Google News — Indian Rupee & Forex Reserves', q: 'Indian rupee USD INR forex reserves RBI when:3d' },
      { id: 'gn_mkt_hindi_share_bazaar', label: 'Google News Hindi — शेयर बाजार सेंसेक्स निफ्टी', q: 'शेयर बाजार सेंसेक्स निफ्टी सेबी', lang: 'hi' },
    ],
  },
  {
    sector: 'Startups and tech',
    queries: [
      { id: 'gn_tech_bengaluru_startups', label: 'Google News — Indian Startup Funding & Layoffs', q: 'Indian startup funding OR unicorn OR layoffs Bengaluru when:3d', priority: 'high' },
      { id: 'gn_tech_fintech_upi', label: 'Google News — UPI, NPCI & Fintech India', q: 'NPCI UPI fintech India RBI digital payments when:3d' },
      { id: 'gn_tech_meity_telecom', label: 'Google News — MeitY, TRAI & Telecom', q: 'MeitY OR TRAI 5G telecom policy India when:3d' },
      { id: 'gn_tech_quick_commerce', label: 'Google News — Quick Commerce & E-Commerce India', q: 'Blinkit OR Zepto OR Swiggy OR Zomato quick commerce India when:3d' },
    ],
  },
  {
    sector: 'AI',
    queries: [
      { id: 'gn_ai_india_mission', label: 'Google News — IndiaAI Mission & Sovereign AI', q: '"IndiaAI" OR artificial intelligence India IT Ministry when:3d', priority: 'high' },
      { id: 'gn_ai_llms_global', label: 'Google News — Gemini, OpenAI & Global AI Models', q: 'Gemini AI OR OpenAI OR Anthropic LLM release when:2d', priority: 'high' },
      { id: 'gn_ai_deepfake_regulation', label: 'Google News — AI Regulation, Deepfakes & Copyright', q: 'AI deepfake regulation India OR generative AI rules when:3d' },
      { id: 'gn_ai_enterprise_it', label: 'Google News — Indian IT Services & AI Automation', q: 'TCS OR Infosys OR Wipro generative AI deals when:3d' },
    ],
  },
  {
    sector: 'Sports',
    queries: [
      { id: 'gn_spt_bcci_cricket', label: 'Google News — BCCI & Indian Cricket Team', q: 'BCCI OR Indian cricket team Test ODI T20 when:2d', priority: 'high' },
      { id: 'gn_spt_ipl_auction', label: 'Google News — IPL & Domestic Cricket', q: 'IPL cricket BCCI franchise when:2d' },
      { id: 'gn_spt_olympics_federations', label: 'Google News — Indian Olympic Sports & Athletics', q: 'IOA OR Sports Ministry India athletics badminton wrestling chess when:3d' },
      { id: 'gn_spt_hindi_khel', label: 'Google News Hindi — क्रिकेट और खेल समाचार', q: 'भारतीय क्रिकेट टीम बीसीसीआई खेल', lang: 'hi' },
    ],
  },
  {
    sector: 'Entertainment',
    queries: [
      { id: 'gn_ent_bollywood_boxoffice', label: 'Google News — Bollywood & Box Office India', q: 'Bollywood box office collection Hindi cinema when:2d', priority: 'high' },
      { id: 'gn_ent_ott_streaming', label: 'Google News — OTT Streaming & Web Series India', q: 'Netflix India OR Prime Video OR JioHotstar web series OTT when:3d' },
      { id: 'gn_ent_cbfc_censorship', label: 'Google News — CBFC & Film Regulation India', q: 'CBFC film certification censorship India cinema when:7d' },
      { id: 'gn_ent_regional_cinema', label: 'Google News — South & Regional Indian Cinema', q: 'Malayalam OR Tamil OR Telugu cinema box office India when:3d' },
    ],
  },
  {
    sector: 'Crime and law',
    queries: [
      { id: 'gn_law_supreme_court', label: 'Google News — Supreme Court of India', q: '"Supreme Court of India" bench order judgment when:2d', priority: 'high' },
      { id: 'gn_law_high_courts', label: 'Google News — High Courts India', q: '"High Court" Delhi OR Bombay OR Madras OR Allahabad order when:2d', priority: 'high' },
      { id: 'gn_law_ed_cbi', label: 'Google News — ED, CBI & Financial Investigations', q: '"Enforcement Directorate" OR CBI probe chargesheet India when:2d' },
      { id: 'gn_law_cybercrime_police', label: 'Google News — Cybercrime & Digital Arrest Scams', q: 'cybercrime India "digital arrest" OR mule accounts police when:3d' },
      { id: 'gn_law_hindi_adalat', label: 'Google News Hindi — सुप्रीम कोर्ट और कानून', q: 'सुप्रीम कोर्ट हाई कोर्ट ईडी सीबीआई', lang: 'hi' },
    ],
  },
  {
    sector: 'Cities',
    queries: [
      { id: 'gn_cit_delhi_ncr', label: 'Google News — Delhi NCR Civic & Metro', q: 'Delhi NCR civic MCD DDA metro traffic pollution when:2d', priority: 'high' },
      { id: 'gn_cit_mumbai_bmc', label: 'Google News — Mumbai BMC & Local Trains', q: 'Mumbai BMC civic local trains MMRDA infrastructure when:2d' },
      { id: 'gn_cit_bengaluru_bbmp', label: 'Google News — Bengaluru BBMP, Traffic & Water', q: 'Bengaluru BBMP Namma Metro traffic civic roads when:2d' },
      { id: 'gn_cit_chennai_hyderabad_kolkata', label: 'Google News — Chennai, Hyderabad & Kolkata Civic', q: 'Chennai OR Hyderabad OR Kolkata civic metro municipal when:2d' },
      { id: 'gn_cit_tier2_smartcities', label: 'Google News — Patna, Lucknow, Jaipur & Pune Civic', q: 'Patna OR Lucknow OR Jaipur OR Pune municipal infrastructure when:3d' },
    ],
  },
  {
    sector: 'Environment and climate',
    queries: [
      { id: 'gn_env_aqi_pollution', label: 'Google News — Air Quality Index (AQI) & Smog India', q: 'AQI air pollution smog GRAP CPCB India when:2d', priority: 'high' },
      { id: 'gn_env_imd_weather', label: 'Google News — IMD Monsoon, Heatwave & Cyclones', q: 'IMD weather forecast monsoon heatwave rainfall India when:2d', priority: 'high' },
      { id: 'gn_env_forest_wildlife', label: 'Google News — Forest Clearances, NGT & Wildlife', q: '"National Green Tribunal" OR MoEFCC forest clearance India when:4d' },
      { id: 'gn_env_renewable_solar', label: 'Google News — Solar, Green Hydrogen & Energy Transition', q: 'India solar renewable energy coal power grid when:4d' },
    ],
  },
  {
    sector: 'Health',
    queries: [
      { id: 'gn_hlt_icmr_ministry', label: 'Google News — Health Ministry, ICMR & AIIMS', q: 'ICMR OR AIIMS OR "Health Ministry" India public health when:3d', priority: 'high' },
      { id: 'gn_hlt_cdsco_pharma', label: 'Google News — CDSCO Drug Quality & Pharma India', q: 'CDSCO drug quality test pharma recall India when:4d', priority: 'high' },
      { id: 'gn_hlt_fssai_food', label: 'Google News — FSSAI Food Safety & Adulteration', q: 'FSSAI food safety inspection packaging India when:4d' },
      { id: 'gn_hlt_dengue_outbreaks', label: 'Google News — Seasonal Outbreaks & Hospital Infra', q: 'dengue OR malaria OR hospital infrastructure India health when:3d' },
    ],
  },
  {
    sector: 'Education and jobs',
    queries: [
      { id: 'gn_edu_nta_upsc_ssc', label: 'Google News — UPSC, NTA, NEET, JEE & SSC Exams', q: 'UPSC OR NTA OR NEET OR JEE OR SSC exam recruitment India when:2d', priority: 'high' },
      { id: 'gn_edu_ugc_iits_universities', label: 'Google News — UGC, IITs, IIMs & Higher Education', q: 'UGC OR IIT placement OR central universities India education when:3d', priority: 'high' },
      { id: 'gn_edu_epfo_employment', label: 'Google News — EPFO Payroll, Jobs & Labour Market', q: 'EPFO payroll employment jobs hiring India when:3d' },
      { id: 'gn_edu_hindi_rozgar', label: 'Google News Hindi — शिक्षा और रोजगार परीक्षा', q: 'यूपीएससी नीट सरकारी नौकरी परीक्षा भर्ती', lang: 'hi' },
    ],
  },
  {
    sector: 'World',
    queries: [
      { id: 'gn_wld_india_diplomacy', label: 'Google News — MEA India Foreign Policy & Geopolitics', q: 'External Affairs Ministry India Jaishankar diplomacy bilateral when:2d', priority: 'high' },
      { id: 'gn_wld_us_china_europe', label: 'Google News — US, China, Europe & Global Trade', q: 'US China tariff geopolitics global economy when:2d' },
      { id: 'gn_wld_south_asia', label: 'Google News — South Asia & Neighbourhood Watch', q: 'Bangladesh OR Sri Lanka OR Nepal OR Maldives diplomacy India when:3d' },
      { id: 'gn_wld_middle_east_energy', label: 'Google News — Middle East, Oil Prices & Global Conflict', q: 'Brent crude oil OPEC Middle East diplomacy when:2d' },
    ],
  },
  {
    sector: 'Auto',
    queries: [
      { id: 'gn_aut_ev_policy', label: 'Google News — Electric Vehicles (EV) & Battery Policy India', q: 'electric vehicle EV sales FAME subsidy charging India when:3d', priority: 'high' },
      { id: 'gn_aut_maruti_tata_mahindra', label: 'Google News — Passenger Vehicles & SUV Launches India', q: 'Maruti Suzuki OR Tata Motors OR Mahindra passenger vehicles India when:3d' },
      { id: 'gn_aut_two_wheelers_ola', label: 'Google News — Two-Wheelers, Electric Scooters & Service', q: 'electric scooter two-wheeler sales CCPA service India when:3d' },
      { id: 'gn_aut_road_safety_tolls', label: 'Google News — Road Safety, FASTag & Highway Tolls', q: 'FASTag highway toll MoRTH road safety challan India when:4d' },
    ],
  },
  {
    sector: 'Science',
    queries: [
      { id: 'gn_sci_isro_space', label: 'Google News — ISRO, Gaganyaan & Space Missions', q: 'ISRO Gaganyaan satellite launch space India when:4d', priority: 'high' },
      { id: 'gn_sci_csir_drdo_research', label: 'Google News — CSIR, IISc & Indian Scientific Research', q: 'IISc Bengaluru OR CSIR research discovery India science when:4d' },
      { id: 'gn_sci_physics_astronomy', label: 'Google News — Astronomy, Climate Science & Physics', q: 'astronomy telescope quantum physics scientific study when:3d' },
    ],
  },
  {
    sector: 'Viral and social',
    queries: [
      { id: 'gn_vir_social_trends_india', label: 'Google News — Viral Social Media & Internet Culture India', q: 'viral video India social media trend internet reacts when:2d', priority: 'high' },
      { id: 'gn_vir_work_culture_debate', label: 'Google News — Work Culture, Corporate Memes & Urban Life', q: '"work-life balance" OR Bengaluru landlord OR corporate culture viral India when:4d' },
      { id: 'gn_vir_civic_absurdity', label: 'Google News — Bizarre Civic & Bureaucratic Stories India', q: 'bizarre notice OR unusual inaugural OR viral billboard India when:4d' },
      { id: 'gn_vir_creator_economy', label: 'Google News — Indian YouTubers, Influencers & ASCI Rules', q: 'ASCI influencer guidelines OR Indian YouTuber creator economy when:4d' },
    ],
  },
];

const GOOGLE_NEWS_SEEDS: RawFeedSeed[] = GOOGLE_NEWS_SECTOR_QUERIES.flatMap((group) =>
  group.queries.map((q) => ({
    id: q.id,
    name: q.label,
    type: 'google_news' as const,
    url: makeGoogleNewsUrl(q.q, q.lang || 'en'),
    sector: group.sector,
    language: q.lang || 'en',
    trust: 4,
    priority: q.priority || 'normal',
  }))
);

export const SEED_SOURCES: SourceItem[] = [
  ...DIRECT_AND_REGULATOR_SEEDS,
  ...GOOGLE_NEWS_SEEDS,
].map((seed) => ({
  ...seed,
  enabled: true,
  lastFetchedAt: '',
  lastError: '',
  consecutiveErrors: 0,
}));

// Zero mock stories, zero mock videos, zero mock articles, zero mock scripts (Section 2 Truth Rules)
export const SEED_VIDEOS: RelatedVideo[] = [];
export const SEED_STORIES: StoryCluster[] = [];
export const SEED_ARTICLES: ArticleItem[] = [];
export const SEED_SCRIPTS: ScriptRecord[] = [];

export const SEED_DESK: DeskState = {
  id: 'current',
  title: 'Untitled episode desk',
  storyIds: [],
  notes: '',
  storyNotes: {},
  storyMinutes: {},
  updatedAt: '',
};

export const SEED_SETTINGS: UserSettings = {
  theme: 'dark',
  density: 'comfortable',
  showThumbnails: false,
  defaultLanguage: 'Hinglish',
  defaultTone: 'Savage',
  defaultRuntime: '8 min',
  defaultFormat: 'News-desk monologue',
  wpm: 150,
  aiDailyLimit: 20,
  retentionDays: 25,
  keepScripts: true,
  doNotJokeAbout:
    'Victims of violent crime, fatal accidents, disasters, communal or caste violence, sexual violence, minors, disability, religion, or sensitive ongoing court matters.',
  sectorBoosts: {
    'Top stories': 0.9,
    Politics: 0.85,
    'Business and economy': 0.8,
    'Markets and finance': 0.8,
    'Startups and tech': 0.75,
    AI: 0.8,
    Sports: 0.7,
    Entertainment: 0.65,
    'Crime and law': 0.8,
    Cities: 0.85,
    'Environment and climate': 0.75,
    Health: 0.75,
    'Education and jobs': 0.8,
    World: 0.7,
    Auto: 0.65,
    Science: 0.7,
    'Viral and social': 0.75,
  },
  updatedAt: '',
};

export const SEED_SYNC_META: SyncMeta = {
  lastSyncedAt: '',
  lastStatus: 'ok',
  articlesAdded: 0,
  storiesUpdated: 0,
  estimatedReadsToday: 0,
  estimatedWritesToday: 0,
  aiCallsToday: 0,
  installedAt: '2026-11-14T00:00:00.000Z',
};

