import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { getCurrentUser } from '@/lib/auth';

const RSS_FEEDS = [
  {
    id: 'thinkfood',
    name: '신상품 뉴스',
    url: 'https://www.thinkfood.co.kr/rss/S1N8.xml',
    category: '신상품',
  },
  {
    id: 'foodnews',
    name: '식품저널',
    url: 'https://www.foodnews.co.kr/rss/allArticle.xml',
    category: '업계',
  },
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// 캐시: 최대 30분
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000;

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FoodSafetyApp/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    const list = Array.isArray(items) ? items : [items];

    return list.slice(0, 15).map((item) => ({
      source: feed.name,
      sourceId: feed.id,
      category: feed.category,
      title: (item.title?.['#text'] || item.title || '').replace(/<[^>]+>/g, '').trim(),
      link: item.link?.['@_href'] || item.link || item.guid?.['#text'] || item.guid || '',
      description: (item.description || item.summary || '')
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 120),
      pubDate: item.pubDate || item.updated || item['dc:date'] || '',
      thumbnail:
        item['media:thumbnail']?.['@_url'] ||
        item.enclosure?.['@_url'] ||
        null,
    }));
  } catch {
    return [];
  }
}

export async function GET(req) {
  const user = getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) {
    return NextResponse.json({ success: true, data: cache, cached: true });
  }

  const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
  const all = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((item) => item.title);

  // 날짜 내림차순 정렬
  all.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  cache = all;
  cacheTime = now;

  return NextResponse.json({ success: true, data: all, cached: false });
}
