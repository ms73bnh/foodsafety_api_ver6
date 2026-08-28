const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
    }
  }
});

const BASE_URL_SYNC = 'https://www.mfds.go.kr';

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

function findFileLink(src, extPat, baseUrl) {
  let m;
  const downRe = /<a\s+[^>]*href=["']([^"']*down\.do\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = downRe.exec(src)) !== null) {
    const linkText = m[2].replace(/<[^>]+>/g, '').trim();
    const raw = m[1].replace(/&amp;/g, '&');
    let matchedName = extPat.test(linkText) ? linkText : null;
    if (!matchedName) {
      const ctx = src.substring(m.index, m.index + m[0].length + 300);
      const fnMatch = ctx.match(/[\w가-힣()[\]\-_ ]+\.(?:pdf|hwp|hwpx|PDF|HWP)/);
      if (fnMatch && extPat.test(fnMatch[0])) matchedName = fnMatch[0].trim();
    }
    if (!matchedName && /file_seq=\d+/i.test(raw)) matchedName = extPat.source.includes('pdf') ? '첨부파일.pdf' : '첨부파일.hwp';
    if (matchedName) {
      const url = raw.startsWith('http') ? raw : raw.startsWith('./') ? `${baseUrl}${raw.slice(2)}` : `${BASE_URL_SYNC}${raw.startsWith('/') ? '' : '/'}${raw}`;
      return { url, name: matchedName };
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
  return { url: null, name: null };
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

function getMeetingNo(title = '') {
  const mMeetingNo = title.match(/제?\s*(\d+)\s*차/);
  return mMeetingNo ? `제${mMeetingNo[1]}차` : null;
}

async function fetchAllArticles(headers) {
  const allArticles = [];

  for (let page = 1; page <= 45; page++) {
    const url = `${BASE_URL_SYNC}/brd/m_532/list.do?page=${page}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) break;
    const html = await resp.text();

    // 청크 분할: <div class="num"> 기준으로 각 게시글 나누기
    const chunks = html.split(/<div\s+class=["']num["']\s*>/i);
    if (chunks.length <= 1) {
      console.log(`Page ${page}: no more chunks.`);
      break;
    }

    let pageCount = 0;
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];

      const linkMatch = chunk.match(/<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const rawHref = linkMatch[1].replace(/&amp;/g, '&');
      const seqMatch = rawHref.match(/seq=(\d+)/);
      const seq = seqMatch ? seqMatch[1] : null;
      if (!seq) continue;

      const title = cleanText(linkMatch[2]).trim();
      // 건강기능식품 관련 게시글 필터링
      if (!title || (!title.includes('건강기능식품') && !title.includes('심의') && !title.includes('회의') && !title.includes('위원') && !title.includes('재평가'))) {
        continue;
      }

      const fullHref = rawHref.startsWith('http') ? rawHref : `${BASE_URL_SYNC}/brd/m_532/${rawHref.replace(/^\.\//, '')}`;

      const numMatch = chunk.match(/^\s*(\d+)\s*<\/div>/i);
      const postNo = numMatch ? numMatch[1].trim() : null;

      const deptMatch = chunk.match(/담당부서\s*\|\s*([가-힣]+과|[가-힣]+팀|[가-힣]+부)/i) ||
                        chunk.match(/담당부서[\s\S]*?\|\s*([가-힣]+과|[가-힣]+팀)/i);
      const department = deptMatch ? deptMatch[1].trim() : '영양기능연구과';

      const viewMatch = chunk.match(/조회수\s*\|\s*(\d+)/i);
      const viewCount = viewMatch ? parseInt(viewMatch[1], 10) : null;

      const dateMatch = chunk.match(/<div class=["']date_column["']>([\s\S]*?)<\/div>/i) ||
                        chunk.match(/(\d{4}-\d{2}-\d{2})/);
      const postDate = dateMatch ? (dateMatch[1] || dateMatch[0]).replace(/<[^>]+>/g, '').trim() : null;

      const listPageBase = `${BASE_URL_SYNC}/brd/m_532/`;
      let pdfFileName = null, pdfFileUrl = null;
      let hwpFileName = null, hwpFileUrl = null;

      const pdfResult = findFileLink(chunk, /\.pdf/i, listPageBase);
      if (pdfResult.url) { pdfFileUrl = pdfResult.url; pdfFileName = pdfResult.name; }

      const hwpResult = findFileLink(chunk, /\.(?:hwp|hwpx)/i, listPageBase);
      if (hwpResult.url) { hwpFileUrl = hwpResult.url; hwpFileName = hwpResult.name; }

      allArticles.push({
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
        hwpFileUrl
      });
      pageCount++;
    }

    console.log(`Page ${page}: parsed ${pageCount} relevant committee posts.`);
  }

  return allArticles;
}

async function fetchDetailForArticle(art, headers) {
  try {
    const detailResp = await fetch(art.href, { headers });
    if (!detailResp.ok) return null;

    const detailHtml = await detailResp.text();
    const rawText = cleanText(detailHtml);
    const meetingDateMatch = rawText.match(/일시\s*[:：]\s*([^\n]+)/);
    const attendeesMatch = rawText.match(/참석자?\s*[:：]\s*([^\n]+)/);

    let pdfFileName = art.pdfFileName;
    let pdfFileUrl = art.pdfFileUrl;
    let hwpFileName = art.hwpFileName;
    let hwpFileUrl = art.hwpFileUrl;

    const detailBase = art.href.substring(0, art.href.lastIndexOf('/') + 1);
    if (!pdfFileUrl) {
      const r = findFileLink(detailHtml, /\.pdf/i, detailBase);
      if (r.url) { pdfFileUrl = r.url; pdfFileName = r.name; }
    }
    if (!hwpFileUrl) {
      const r = findFileLink(detailHtml, /\.(?:hwp|hwpx)/i, detailBase);
      if (r.url) { hwpFileUrl = r.url; hwpFileName = r.name; }
    }

    return {
      rawText,
      meetingDate: meetingDateMatch ? meetingDateMatch[1].trim() : art.postDate,
      attendees: attendeesMatch ? attendeesMatch[1].trim() : null,
      pdfFileName,
      pdfFileUrl,
      hwpFileName,
      hwpFileUrl,
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  };

  console.log('=== 1. Scanning ALL MFDS committee pages ===');
  const articles = await fetchAllArticles(headers);
  console.log(`\n=== Total ${articles.length} committee meetings identified! ===\n`);

  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const existing = await prisma.committee_meetings.findUnique({
      where: { seq: art.seq }
    });

    if (!existing) {
      const detail = await fetchDetailForArticle(art, headers);
      const rawText = detail?.rawText || '';
      const meetingDate = detail?.meetingDate || art.postDate;

      const createdMeeting = await prisma.committee_meetings.create({
        data: {
          seq: art.seq,
          postNo: art.postNo,
          title: art.title,
          meetingNo: getMeetingNo(art.title),
          meetingDate,
          department: art.department,
          viewCount: art.viewCount,
          postDate: art.postDate,
          attendees: detail?.attendees || null,
          rawContent: rawText ? rawText.substring(0, 8000) : null,
          sourceUrl: art.href,
          pdfFileName: detail?.pdfFileName || art.pdfFileName,
          pdfFileUrl: detail?.pdfFileUrl || art.pdfFileUrl,
          hwpFileName: detail?.hwpFileName || art.hwpFileName,
          hwpFileUrl: detail?.hwpFileUrl || art.hwpFileUrl,
        }
      });

      const agendas = parseAgendas(rawText, art.title);
      for (const ag of agendas) {
        await prisma.committee_agendas.create({
          data: {
            meetingId: createdMeeting.id,
            orderIndex: ag.orderIndex,
            rawName: ag.rawName,
            ingredientName: ag.ingredientName,
            result: ag.result,
            agendaType: ag.agendaType,
            details: ag.details
          }
        });
      }
      createdCount++;
      console.log(`[${i + 1}/${articles.length}] Created: #${art.postNo || art.seq} ${art.title} (Agendas: ${agendas.length})`);
    } else {
      // 기존에 안건이 없는 경우 본문에서 안건 백필
      const agendaCount = await prisma.committee_agendas.count({ where: { meetingId: existing.id } });
      if (agendaCount === 0 && existing.rawContent) {
        const agendas = parseAgendas(existing.rawContent, existing.title);
        for (const ag of agendas) {
          await prisma.committee_agendas.create({
            data: {
              meetingId: existing.id,
              orderIndex: ag.orderIndex,
              rawName: ag.rawName,
              ingredientName: ag.ingredientName,
              result: ag.result,
              agendaType: ag.agendaType,
              details: ag.details
            }
          });
        }
        if (agendas.length > 0) {
          console.log(`[${i + 1}/${articles.length}] Backfilled ${agendas.length} agendas for: ${existing.title}`);
        }
      }
      updatedCount++;
    }
  }

  const finalMeetings = await prisma.committee_meetings.count();
  const finalAgendas = await prisma.committee_agendas.count();
  console.log(`\n=== All Done! Total Meetings: ${finalMeetings}, Total Agendas: ${finalAgendas} ===`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
