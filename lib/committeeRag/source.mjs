import * as cheerio from 'cheerio';

export const SOURCE_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9' };
export function assertSourceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.mfds.go.kr', 'mfds.go.kr'].includes(url.hostname) || url.port || url.username || url.password) {
    throw new Error('식약처 HTTPS 원본 주소만 수집할 수 있습니다.');
  }
  return url.href;
}
export async function fetchSource(url, { maxBytes = 32 * 1024 * 1024, timeoutMs = 30000 } = {}) {
  let target = assertSourceUrl(url);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await fetch(target, { headers: SOURCE_HEADERS, signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('원본 리디렉션 주소가 없습니다.');
      target = assertSourceUrl(new URL(location, target).href);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`원본 다운로드 HTTP ${response.status}`); }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('파일 크기 한도 초과: 별도 대용량 처리가 필요합니다.'); }
    const parts = []; let bytes = 0;
    for await (const part of response.body) {
      bytes += part.length;
      if (bytes > maxBytes) throw new Error('파일 크기 한도 초과: 별도 대용량 처리가 필요합니다.');
      parts.push(part);
    }
    return Buffer.concat(parts);
  }
  throw new Error('원본 리디렉션 횟수 초과');
}
export function parseDetail(html, sourceUrl) {
  const $ = cheerio.load(html);
  const content = $('.bv_contents .bv_cont, .view_cont, .view-con, .bbs_view_cont, .board_view_content, #content .view_content').first();
  if (!content.length) throw new Error('게시물 본문 영역을 찾지 못했습니다. 원본 HTML 구조를 확인하세요.');
  const copy = content.clone();
  copy.find('script,style,noscript').remove();
  copy.find('br').replaceWith('\n');
  copy.find('p,div,li,tr,h1,h2,h3,h4').append('\n');
  const text = copy.text().replace(/\r/g, '').replace(/[\t ]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  const attachments = new Map();
  $('a[href]').each((_, element) => {
    const anchor = $(element); const href = anchor.attr('href') || '';
    if (!/down\.do|FileDown\.do|fn_(?:egov_downFile|fileDown|atchFileDown)/i.test(href)) return;
    let rawUrl = href;
    const js = href.match(/fn_(?:egov_downFile|fileDown|atchFileDown)\(['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]/);
    if (js) rawUrl = `/cmm/fms/FileDown.do?atchFileId=${encodeURIComponent(js[1])}&fileSn=${js[2]}`;
    let url;
    try { url = assertSourceUrl(new URL(rawUrl, sourceUrl).href); } catch { return; }
    const container = anchor.closest('.bbs_file_cont, li');
    const name = (container.find('strong, .bbs_file_list_header span').first().text() || anchor.attr('title') || anchor.text()).trim();
    const match = name.match(/([^\n]+?\.(pdf|hwpx?|xlsx?|docx?|zip))(?:\s|$|\()/i);
    const fileName = match?.[1]?.trim() || name || '첨부파일';
    const fileType = match?.[2]?.toLowerCase() || 'unknown';
    attachments.set(url, { sourceKey: url, sourceUrl: url, fileName, fileType, sourceType: fileType === 'pdf' ? 'pdf' : 'attachment' });
  });
  return { text, attachments: [...attachments.values()] };
}

export function parseListing(html, baseUrl) {
  const $ = cheerio.load(html); const rows = new Map();
  $('a[href*="view.do"]').each((_, element) => {
    const a = $(element); const url = new URL(a.attr('href'), baseUrl); const seq = url.searchParams.get('seq');
    const title = a.text().trim();
    if (!seq || !title || !/^\d+$/.test(seq)) return;
    const context = a.closest('li,tr,.bbs_list').text();
    rows.set(seq, { seq, title, sourceUrl: assertSourceUrl(url.href), postDate: context.match(/20\d{2}[-.]\d{2}[-.]\d{2}/)?.[0]?.replaceAll('.', '-') || null });
  });
  const empty = /등록된\s*(게시물|자료|글).*없|게시물이\s*없|검색.*결과.*없/.test($.text());
  if (!rows.size && !empty) throw new Error('목록 종료를 확인할 수 없습니다. HTML 또는 접속 상태를 확인하세요.');
  return { rows: [...rows.values()], empty };
}
