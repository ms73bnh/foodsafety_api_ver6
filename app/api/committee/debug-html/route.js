import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const seq = searchParams.get('seq') || '33424';
  const url = `https://www.mfds.go.kr/brd/m_532/view.do?seq=${seq}`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Referer': 'https://www.mfds.go.kr/brd/m_532/list.do',
    },
  });

  if (!resp.ok) return NextResponse.json({ error: `HTTP ${resp.status}` });

  const html = await resp.text();

  // 모든 <a href> 추출
  const allLinks = [];
  const linkRe = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim().substring(0, 60);
    if (href && href !== '#') allLinks.push({ href, text });
  }

  // javascript: 함수 호출 패턴 추출 (eGovFrame 방식)
  const jsFuncs = [];
  const jsRe = /href=["'](javascript:[^"']*)["']/gi;
  while ((m = jsRe.exec(html)) !== null) {
    jsFuncs.push(m[1].substring(0, 120));
  }

  // 첨부파일 영역 HTML 추출 (파일 관련 섹션)
  const attachIdx = html.indexOf('첨부');
  const attachSnippet = attachIdx > -1 ? html.substring(Math.max(0, attachIdx - 100), attachIdx + 800) : '첨부 섹션 없음';

  // atchFileId 패턴 찾기
  const atchIds = [];
  const atchRe = /atchFileId[=:'"]+([A-Za-z0-9_]+)/gi;
  while ((m = atchRe.exec(html)) !== null) atchIds.push(m[1]);

  // FileDown 패턴 찾기
  const fileDowns = [];
  const fdRe = /FileDown[^"'<>]{0,200}/gi;
  while ((m = fdRe.exec(html)) !== null) fileDowns.push(m[0].substring(0, 120));

  return NextResponse.json({
    url,
    totalLinks: allLinks.length,
    fileRelatedLinks: allLinks.filter(l =>
      /pdf|hwp|file|down|attach|atch/i.test(l.href + l.text)
    ),
    jsFunctions: jsFuncs.filter(f => /file|down|attach|atch/i.test(f)),
    atchFileIds: [...new Set(atchIds)],
    fileDownPatterns: fileDowns,
    attachSnippet,
  });
}
