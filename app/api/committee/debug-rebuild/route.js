import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.mfds.go.kr';
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.mfds.go.kr/brd/m_532/list.do',
};

// GET /api/committee/debug-rebuild?id=18
// 특정 회의 ID의 PDF 탐지 과정을 단계별로 진단
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') || '18');

  const meeting = await prisma.committee_meetings.findUnique({
    where: { id },
    select: { id: true, seq: true, title: true, sourceUrl: true, pdfFileUrl: true, pdfContent: true },
  });
  if (!meeting) return NextResponse.json({ error: '회의 없음' }, { status: 404 });

  const result = { id, seq: meeting.seq, title: meeting.title, sourceUrl: meeting.sourceUrl, existingPdfUrl: meeting.pdfFileUrl };

  if (!meeting.sourceUrl) {
    result.error = 'sourceUrl 없음 - 크롤링 불가';
    return NextResponse.json(result);
  }

  // 1. 페이지 fetch
  let html;
  try {
    const resp = await fetch(meeting.sourceUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10000) });
    result.httpStatus = resp.status;
    if (!resp.ok) { result.error = `HTTP ${resp.status}`; return NextResponse.json(result); }
    html = await resp.text();
    result.htmlLength = html.length;
  } catch (e) {
    result.error = `fetch 실패: ${e.message}`;
    return NextResponse.json(result);
  }

  // 2. down.do 링크 전수 추출
  const downLinks = [];
  const downRe = /<a\s+[^>]*href=["']([^"']*down\.do\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = downRe.exec(html)) !== null) {
    const rawHref = m[1].replace(/&amp;/g, '&');
    const linkText = m[2].replace(/<[^>]+>/g, '').trim();
    const ctx = html.substring(m.index, m.index + m[0].length + 300).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200);
    downLinks.push({ rawHref: m[1], decodedHref: rawHref, linkText, contextAfter: ctx });
  }
  result.downLinks = downLinks;

  // 3. FileDown / javascript:fn_egov 링크
  const jsLinks = [];
  const jsRe = /href=["'](javascript:[^"']*(?:downFile|fileDown|atchFile)[^"']*)["']/gi;
  while ((m = jsRe.exec(html)) !== null) jsLinks.push(m[1].substring(0, 150));
  result.jsLinks = jsLinks;

  // 4. 첨부파일 섹션 HTML
  const attachIdx = html.search(/첨부|atch|attach|파일/i);
  result.attachSnippet = attachIdx > -1
    ? html.substring(Math.max(0, attachIdx - 50), attachIdx + 600).replace(/\s+/g, ' ')
    : '첨부 섹션 없음';

  // 5. PDF URL이 있으면 실제 fetch 시도
  if (meeting.pdfFileUrl) {
    try {
      const pdfResp = await fetch(meeting.pdfFileUrl, {
        headers: { ...FETCH_HEADERS, Accept: 'application/pdf,*/*' },
        signal: AbortSignal.timeout(8000),
      });
      const ct = pdfResp.headers.get('content-type') || '';
      const buf = Buffer.from(await pdfResp.arrayBuffer());
      result.pdfFetch = {
        status: pdfResp.status,
        contentType: ct,
        size: buf.length,
        first20bytes: buf.slice(0, 20).toString('hex'),
        isPdf: buf.slice(0, 4).toString() === '%PDF',
      };
    } catch (e) {
      result.pdfFetch = { error: e.message };
    }
  }

  return NextResponse.json(result, { status: 200 });
}
