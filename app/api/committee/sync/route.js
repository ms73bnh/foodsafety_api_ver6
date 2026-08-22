import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getEmbedding } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_URL_SYNC = 'https://www.mfds.go.kr';

// 식약처 첨부파일 링크 추출 (down.do / FileDown.do / javascript:fn_egov_downFile 패턴)
function findFileLink(src, extPat, baseUrl) {
  let m;
  const downRe = /<a\s+[^>]*href=["']([^"']*down\.do\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = downRe.exec(src)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (extPat.test(text)) {
      const raw = m[1];
      const url = raw.startsWith('http') ? raw : raw.startsWith('./') ? `${baseUrl}${raw.slice(2)}` : `${BASE_URL_SYNC}${raw.startsWith('/') ? '' : '/'}${raw}`;
      return { url, name: text };
    }
  }
  const fdRe = /<a\s+[^>]*href=["']([^"']*(?:FileDown|fileDown)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = fdRe.exec(src)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (extPat.test(text) || extPat.test(m[1])) {
      const url = m[1].startsWith('http') ? m[1] : `${BASE_URL_SYNC}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
      return { url, name: text };
    }
  }
  const jsRe = /<a\s+[^>]*href=["']javascript:fn_(?:egov_downFile|fileDown|atchFileDown)\(['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\)[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = jsRe.exec(src)) !== null) {
    const text = m[3].replace(/<[^>]+>/g, '').trim();
    if (extPat.test(text)) return { url: `${BASE_URL_SYNC}/cmm/fms/FileDown.do?atchFileId=${m[1]}&fileSn=${m[2]}`, name: text };
  }
  return { url: null, name: null };
}

function cleanText(text = '') {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#034;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
    .replace(/&quot;/gi, '"')
    .replace(/&reg;/gi, '®')
    .replace(/&copy;/gi, '©')
    .replace(/&trade;/gi, '™')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function parseAgendas(rawContent = '', meetingTitle = '') {
  const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
  const agendas = [];
  let inResultSection = false;
  let order = 1;

  for (const line of lines) {
    if (line.includes('○ 결과') || line.includes('○ 심의결과') || line.includes('○ 의결사항') || line.includes('심의 결과') || line.includes('○ 안건')) {
      inResultSection = true;
      continue;
    }
    if (inResultSection && line.startsWith('○') && !line.includes('인정') && !line.includes('보완')) {
      if (line.includes('일시') || line.includes('참석') || line.includes('붙임') || line.includes('기타')) {
        inResultSection = false;
      }
    }

    const isAgendaLine = line.startsWith('-') || line.startsWith('•') || /^[0-9]+\.\s*/.test(line) ||
      (inResultSection && (line.includes('인정') || line.includes('보완')));

    if (isAgendaLine) {
      const parts = line.replace(/^[-•0-9.\s]+/, '').split(/[:：]/);
      if (parts.length >= 2) {
        const rawName = parts[0].trim();
        const resPart = parts.slice(1).join(':').trim();

        let result = '기타';
        if (resPart.includes('불인정') || resPart.includes('미인정')) result = '불인정';
        else if (resPart.includes('보완')) result = '보완';
        else if (resPart.includes('인정')) result = '인정';

        let agendaType = '신규인정';
        if (rawName.includes('기능성 추가') || rawName.includes('기능성추가')) agendaType = '기능성추가';
        else if (rawName.includes('기준') || rawName.includes('규격')) agendaType = '기준규격';
        else if (rawName.includes('재심의') || rawName.includes('재신청')) agendaType = '재심의';

        let ingredientName = rawName
          .replace(/^기능성\s*원료\s*/i, '')
          .replace(/^['"‘“\s]+|['"’”\s]+$/g, '')
          .replace(/\s*\(기능성\s*추가\)\s*$/i, '')
          .replace(/^['"‘“\s]+|['"’”\s]+$/g, '')
          .trim();

        agendas.push({ orderIndex: order++, rawName: line, ingredientName, result, agendaType, details: `${meetingTitle} > ${line}` });
      }
    }
  }
  return agendas;
}

export async function fetchArticlesFromPage(pageNum, headers, BASE_URL) {
  const url = `${BASE_URL}/brd/m_532/list.do?page=${pageNum}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return [];
  const html = await resp.text();

  // <li> 블록 단위로 분할하여 각 게시물의 메타데이터 파싱
  const liBlocks = html.split(/<li\s+class=["'](?:bbs_list|board_list)?/gi).slice(1);
  const articles = [];

  for (const block of liBlocks) {
    const linkMatch = block.match(/<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1].replace(/&amp;/g, '&');
    const seqMatch = rawHref.match(/seq=(\d+)/);
    const seq = seqMatch ? seqMatch[1] : null;
    if (!seq) continue;

    const title = cleanText(linkMatch[2]).trim();
    if (!title || (!title.includes('건강기능식품') && !title.includes('심의') && !title.includes('회의') && !title.includes('위원'))) {
      continue;
    }

    const fullHref = rawHref.startsWith('http') ? rawHref : `${BASE_URL}/brd/m_532/${rawHref.replace(/^\.\//, '')}`;

    // 게시물 번호 (예: 359)
    const numMatch = block.match(/<div class=["']num["']>([\s\S]*?)<\/div>/i);
    const postNo = numMatch ? numMatch[1].replace(/<[^>]+>/g, '').trim() : null;

    // 담당부서 (예: 영양기능연구과)
    const deptMatch = block.match(/담당부서\s*\|\s*([가-힣]+과|[가-힣]+팀|[가-힣]+부)/i) ||
                      block.match(/담당부서[\s\S]*?\|\s*([가-힣]+과|[가-힣]+팀)/i);
    const department = deptMatch ? deptMatch[1].trim() : '영양기능연구과';

    // 조회수 (예: 2126)
    const viewMatch = block.match(/조회수\s*\|\s*(\d+)/i);
    const viewCount = viewMatch ? parseInt(viewMatch[1], 10) : null;

    // 등록일 (예: 2026-07-07)
    const dateMatch = block.match(/<div class=["']date_column["']>([\s\S]*?)<\/div>/i) ||
                      block.match(/(\d{4}-\d{2}-\d{2})/);
    const postDate = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, '').trim() : null;

    // 첨부파일 (PDF & HWP)
    let pdfFileName = null, pdfFileUrl = null;
    let hwpFileName = null, hwpFileUrl = null;

    const listPageBase = `${BASE_URL_SYNC}/brd/m_532/`;
    const pdfResult = findFileLink(block, /\.pdf/i, listPageBase);
    if (pdfResult.url) { pdfFileUrl = pdfResult.url; pdfFileName = pdfResult.name; }

    const hwpResult = findFileLink(block, /\.(?:hwp|hwpx)/i, listPageBase);
    if (hwpResult.url) { hwpFileUrl = hwpResult.url; hwpFileName = hwpResult.name; }

    articles.push({
      seq,
      postNo,
      title,
      href: fullHref,
      department,
      viewCount,
      postDate,
      pdfFileName,
      pdfFileUrl,
      hwpFileName,
      hwpFileUrl,
    });
  }

  return articles;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    // 기본적으로 최신 3개 페이지를 조회하여 신규 게시물만 자동 증분 동기화
    const pages = Math.min(parseInt(body.pages || '3'), 50);

    const BASE_URL = 'https://www.mfds.go.kr';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    };

    let addedMeetings = 0;
    let addedAgendas = 0;
    let skippedMeetings = 0;

    for (let page = 1; page <= pages; page++) {
      const articles = await fetchArticlesFromPage(page, headers, BASE_URL);

      for (const art of articles) {
        const existing = await prisma.committee_meetings.findUnique({ where: { seq: art.seq } });
        
        // 이미 존재할 때 메타데이터 보강 업데이트 (postNo, viewCount, postDate 등)
        if (existing) {
          if (!existing.postNo || !existing.postDate || !existing.hwpFileUrl) {
            await prisma.committee_meetings.update({
              where: { seq: art.seq },
              data: {
                postNo: art.postNo || existing.postNo,
                viewCount: art.viewCount ?? existing.viewCount,
                postDate: art.postDate || existing.postDate,
                hwpFileName: art.hwpFileName || existing.hwpFileName,
                hwpFileUrl: art.hwpFileUrl || existing.hwpFileUrl,
                pdfFileName: art.pdfFileName || existing.pdfFileName,
                pdfFileUrl: art.pdfFileUrl || existing.pdfFileUrl,
              }
            });
          }
          skippedMeetings++;
          continue;
        }

        // 신규 게시물 크롤링
        try {
          const detailResp = await fetch(art.href, { headers });
          if (!detailResp.ok) continue;
          const detailHtml = await detailResp.text();
          const rawText = cleanText(detailHtml);

          const mMeetingNo = art.title.match(/제?\s*(\d+)\s*차/);
          const meetingNo = mMeetingNo ? `제${mMeetingNo[1]}차` : null;
          const mDate = rawText.match(/일시\s*[:：]\s*([^\n]+)/);
          const meetingDate = mDate ? mDate[1].trim() : art.postDate;
          const mAttendees = rawText.match(/참석자?\s*[:：]\s*([^\n]+)/);
          const attendees = mAttendees ? mAttendees[1].trim() : null;

          // 상세 페이지 내 PDF / HWP 링크 재확인
          let pdfFileName = art.pdfFileName, pdfFileUrl = art.pdfFileUrl;
          let hwpFileName = art.hwpFileName, hwpFileUrl = art.hwpFileUrl;

          const detailBase = art.href.substring(0, art.href.lastIndexOf('/') + 1);
          if (!pdfFileUrl) {
            const r = findFileLink(detailHtml, /\.pdf/i, detailBase);
            if (r.url) { pdfFileUrl = r.url; pdfFileName = r.name; }
          }
          if (!hwpFileUrl) {
            const r = findFileLink(detailHtml, /\.(?:hwp|hwpx)/i, detailBase);
            if (r.url) { hwpFileUrl = r.url; hwpFileName = r.name; }
          }

          const createdMeeting = await prisma.committee_meetings.create({
            data: {
              seq: art.seq,
              postNo: art.postNo,
              title: art.title,
              meetingNo,
              meetingDate,
              department: art.department,
              viewCount: art.viewCount,
              postDate: art.postDate,
              attendees,
              rawContent: rawText.substring(0, 8000),
              sourceUrl: art.href,
              pdfFileName,
              pdfFileUrl,
              hwpFileName,
              hwpFileUrl,
            }
          });
          addedMeetings++;

          // 안건 파싱 & 임베딩
          const agendas = parseAgendas(rawText, art.title);
          for (const ag of agendas) {
            let embeddingJson = null;
            try {
              const embedText = `회의: ${art.title} (일시: ${meetingDate || ''})\n원료/안건: ${ag.ingredientName} (${ag.agendaType})\n결과: ${ag.result}\n내용: ${ag.rawName}`;
              const vector = await getEmbedding(embedText);
              if (vector?.length > 0) embeddingJson = JSON.stringify(vector);
            } catch (e) {
              console.warn('Embedding failed:', ag.ingredientName, e.message);
            }

            await prisma.committee_agendas.create({
              data: {
                meetingId: createdMeeting.id,
                orderIndex: ag.orderIndex,
                rawName: ag.rawName,
                ingredientName: ag.ingredientName,
                result: ag.result,
                agendaType: ag.agendaType,
                details: ag.details,
                embedding: embeddingJson
              }
            });
            addedAgendas++;
          }
        } catch (err) {
          console.error(`Error processing ${art.seq}:`, err.message);
        }
      }
    }

    const [totalMeetings, totalAgendas, embeddedAgendas] = await Promise.all([
      prisma.committee_meetings.count(),
      prisma.committee_agendas.count(),
      prisma.committee_agendas.count({ where: { NOT: { embedding: null } } }),
    ]);

    return NextResponse.json({
      success: true,
      message: `동기화 완료: 신규 ${addedMeetings}개 회의 / ${addedAgendas}개 안건 처리 (기존 ${skippedMeetings}개 최신 상태 유지)`,
      addedMeetings,
      addedAgendas,
      skippedMeetings,
      totalMeetings,
      totalAgendas,
      embeddedAgendas,
    });
  } catch (error) {
    console.error('Committee Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
