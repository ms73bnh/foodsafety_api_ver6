const { PrismaClient } = require('@prisma/client');
const pdfParse = require('pdf-parse');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING
    }
  }
});

const BASE_URL_SYNC = 'https://www.mfds.go.kr';

function cleanText(text = '') {
  return String(text || '')
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
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractAttachmentsFromHtml(html = '', baseUrl = `${BASE_URL_SYNC}/brd/m_532/`) {
  let pdfFileName = null;
  let pdfFileUrl = null;
  let hwpFileName = null;
  let hwpFileUrl = null;

  const resolveUrl = (raw) => {
    if (!raw) return null;
    const unescaped = raw.replace(/&amp;/g, '&').trim();
    if (unescaped.startsWith('http')) return unescaped;
    if (unescaped.startsWith('./')) return `${baseUrl}${unescaped.slice(2)}`;
    return `${BASE_URL_SYNC}${unescaped.startsWith('/') ? '' : '/'}${unescaped}`;
  };

  // 1. 목록 페이지 구조 (bbs_file_list > li > bbs_file_list_header > span + bbs_icon_filedown)
  const listPattern = /<li[^>]*>[\s\S]*?<div\s+class=["']bbs_file_list_header["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/div>[\s\S]*?<a\s+[^>]*href=["']([^"']*)["'][^>]*class=["'][^"']*bbs_icon_filedown[^"']*["']/gi;
  let m;
  while ((m = listPattern.exec(html)) !== null) {
    const rawName = cleanText(m[1]);
    const rawHref = m[2];
    const fullUrl = resolveUrl(rawHref);

    if (/\.pdf$/i.test(rawName) || rawHref.toLowerCase().includes('.pdf')) {
      if (!pdfFileUrl) {
        pdfFileName = rawName;
        pdfFileUrl = fullUrl;
      }
    } else if (/\.(?:hwp|hwpx)$/i.test(rawName) || rawHref.toLowerCase().includes('.hwp')) {
      if (!hwpFileUrl) {
        hwpFileName = rawName;
        hwpFileUrl = fullUrl;
      }
    }
  }

  // 2. 상세 페이지 구조 (bbs_file_cont > strong + a.bbs_icon_filedown)
  if (!pdfFileUrl || !hwpFileUrl) {
    const viewPattern = /<div\s+class=["']bbs_file_cont["'][^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>[\s\S]*?<a\s+[^>]*href=["']([^"']*)["'][^>]*class=["'][^"']*bbs_icon_filedown[^"']*["']/gi;
    while ((m = viewPattern.exec(html)) !== null) {
      const rawName = cleanText(m[1]);
      const rawHref = m[2];
      const fullUrl = resolveUrl(rawHref);

      if (/\.pdf$/i.test(rawName) || rawHref.toLowerCase().includes('.pdf')) {
        if (!pdfFileUrl) {
          pdfFileName = rawName;
          pdfFileUrl = fullUrl;
        }
      } else if (/\.(?:hwp|hwpx)$/i.test(rawName) || rawHref.toLowerCase().includes('.hwp')) {
        if (!hwpFileUrl) {
          hwpFileName = rawName;
          hwpFileUrl = fullUrl;
        }
      }
    }
  }

  // 3. Fallback: 일반 a 태그 down.do 또는 FileDown.do 링크
  if (!pdfFileUrl || !hwpFileUrl) {
    const generalPattern = /<a\s+[^>]*href=["']([^"']*(?:down\.do|FileDown\.do)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = generalPattern.exec(html)) !== null) {
      const rawHref = m[1];
      const linkText = cleanText(m[2]);
      const fullUrl = resolveUrl(rawHref);

      const startIdx = Math.max(0, m.index - 200);
      const endIdx = Math.min(html.length, m.index + m[0].length + 200);
      const ctx = html.substring(startIdx, endIdx);
      const fnMatch = ctx.match(/[\w가-힣()[\]\-_ .]+\.(?:pdf|hwp|hwpx|PDF|HWP|HWPX)/i);
      const detectedName = fnMatch ? fnMatch[0].trim() : linkText;

      if (/\.pdf$/i.test(detectedName) || detectedName.includes('.pdf') || rawHref.toLowerCase().includes('.pdf')) {
        if (!pdfFileUrl) {
          pdfFileName = detectedName || '첨부파일.pdf';
          pdfFileUrl = fullUrl;
        }
      } else if (/\.(?:hwp|hwpx)$/i.test(detectedName) || detectedName.includes('.hwp') || rawHref.toLowerCase().includes('.hwp')) {
        if (!hwpFileUrl) {
          hwpFileName = detectedName || '첨부파일.hwp';
          hwpFileUrl = fullUrl;
        }
      }
    }
  }

  return { pdfFileName, pdfFileUrl, hwpFileName, hwpFileUrl };
}

async function extractPdfText(pdfUrl, refererUrl = BASE_URL_SYNC) {
  if (!pdfUrl || pdfUrl === 'NONE') return null;

  try {
    const resp = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Referer: refererUrl,
      },
      signal: AbortSignal.timeout(25000),
    });

    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.slice(0, 4).toString('ascii') !== '%PDF') return null;

    const parsed = await pdfParse(buffer);
    const rawText = parsed.text || '';
    const clean = rawText
      .replace(/\r\n|\r/g, '\n')
      .replace(/[\t\u00a0]+/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return clean.length > 30 ? clean : null;
  } catch (e) {
    return null;
  }
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
      const attachments = extractAttachmentsFromHtml(chunk, listPageBase);

      allArticles.push({
        seq,
        postNo,
        title,
        href: fullHref,
        department,
        viewCount,
        postDate,
        pdfFileName: attachments.pdfFileName,
        pdfFileUrl: attachments.pdfFileUrl,
        hwpFileName: attachments.hwpFileName,
        hwpFileUrl: attachments.hwpFileUrl
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
    const detailAttachments = extractAttachmentsFromHtml(detailHtml, detailBase);
    if (!pdfFileUrl && detailAttachments.pdfFileUrl) {
      pdfFileUrl = detailAttachments.pdfFileUrl;
      pdfFileName = detailAttachments.pdfFileName;
    }
    if (!hwpFileUrl && detailAttachments.hwpFileUrl) {
      hwpFileUrl = detailAttachments.hwpFileUrl;
      hwpFileName = detailAttachments.hwpFileName;
    }

    let pdfContent = null;
    if (pdfFileUrl) {
      pdfContent = await extractPdfText(pdfFileUrl, art.href);
    }

    return {
      rawText,
      pdfContent,
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

  console.log('=== 1. Scanning ALL MFDS committee pages (with accurate attachment parsing) ===');
  const articles = await fetchAllArticles(headers);
  console.log(`\n=== Total ${articles.length} committee meetings identified! ===\n`);

  let createdCount = 0;
  let updatedCount = 0;
  let pdfFoundCount = 0;
  let pdfTextExtractedCount = 0;

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    if (art.pdfFileUrl) pdfFoundCount++;

    const existing = await prisma.committee_meetings.findUnique({
      where: { seq: art.seq }
    });

    if (!existing) {
      const detail = await fetchDetailForArticle(art, headers);
      const rawText = detail?.rawText || '';
      const meetingDate = detail?.meetingDate || art.postDate;
      const pdfContent = detail?.pdfContent || null;
      if (pdfContent) pdfTextExtractedCount++;

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
          pdfContent,
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
      console.log(`[${i + 1}/${articles.length}] Created: #${art.postNo || art.seq} ${art.title} (PDF: ${createdMeeting.pdfFileUrl ? 'YES' : 'NO'}, pdfContent: ${pdfContent ? pdfContent.length + '자' : 'NO'})`);
    } else {
      // 기존 레코드의 첨부파일 및 pdfContent 백필/업데이트
      const updateData = {};
      let targetPdfUrl = existing.pdfFileUrl;

      // PDF/HWP 링크 갱신
      if (art.pdfFileUrl && existing.pdfFileUrl !== art.pdfFileUrl) {
        updateData.pdfFileName = art.pdfFileName;
        updateData.pdfFileUrl = art.pdfFileUrl;
        targetPdfUrl = art.pdfFileUrl;
      }
      if (art.hwpFileUrl && existing.hwpFileUrl !== art.hwpFileUrl) {
        updateData.hwpFileName = art.hwpFileName;
        updateData.hwpFileUrl = art.hwpFileUrl;
      }

      // 상세 페이지에서 첨부파일 재확인이 필요한 경우
      if (!targetPdfUrl || !existing.pdfContent) {
        const detail = await fetchDetailForArticle(art, headers);
        if (detail?.pdfFileUrl && (!existing.pdfFileUrl || existing.pdfFileUrl !== detail.pdfFileUrl)) {
          updateData.pdfFileName = detail.pdfFileName;
          updateData.pdfFileUrl = detail.pdfFileUrl;
          targetPdfUrl = detail.pdfFileUrl;
        }
        if (detail?.hwpFileUrl && (!existing.hwpFileUrl || existing.hwpFileUrl !== detail.hwpFileUrl)) {
          updateData.hwpFileName = detail.hwpFileName;
          updateData.hwpFileUrl = detail.hwpFileUrl;
        }
        if (detail?.pdfContent && !existing.pdfContent) {
          updateData.pdfContent = detail.pdfContent;
          pdfTextExtractedCount++;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.committee_meetings.update({
          where: { id: existing.id },
          data: updateData
        });
        console.log(`[${i + 1}/${articles.length}] Updated #${art.postNo || art.seq}: PDF=${updateData.pdfFileUrl || existing.pdfFileUrl ? 'YES' : 'NO'}, pdfContent=${updateData.pdfContent ? updateData.pdfContent.length + '자' : existing.pdfContent ? 'EXISTS' : 'NO'}`);
      }

      // 안건 백필
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
      }
      updatedCount++;
    }
  }

  const finalMeetings = await prisma.committee_meetings.count();
  const finalPdfMeetings = await prisma.committee_meetings.count({ where: { pdfFileUrl: { not: null } } });
  const finalPdfContentMeetings = await prisma.committee_meetings.count({ where: { pdfContent: { not: null } } });
  const finalAgendas = await prisma.committee_agendas.count();

  console.log(`\n=== All Done! ===`);
  console.log(`- Total Meetings: ${finalMeetings}`);
  console.log(`- Meetings with PDF URL: ${finalPdfMeetings}`);
  console.log(`- Meetings with PDF Text Content: ${finalPdfContentMeetings}`);
  console.log(`- Total Agendas: ${finalAgendas}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
