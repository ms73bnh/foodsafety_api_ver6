import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getEmbedding } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
// Vercel 최대 실행 시간 (Pro: 300초, Hobby: 60초)
export const maxDuration = 60;

function cleanText(text = '') {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#034;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&reg;/g, "\u00AE")
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

        const ingredientName = rawName.replace(/^기능성\s*원료\s*[''']/, '').replace(/[''']\s*\(기능성\s*추가\)/, '').replace(/[''']/g, '').trim();

        agendas.push({ orderIndex: order++, rawName: line, ingredientName, result, agendaType, details: `${meetingTitle} > ${line}` });
      }
    }
  }
  return agendas;
}

async function fetchArticlesFromPage(pageNum, headers, BASE_URL) {
  const url = `${BASE_URL}/brd/m_532/list.do?page=${pageNum}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return [];
  const html = await resp.text();

  const linkRegex = /<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/gi;
  const articles = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].replace(/&amp;/g, '&');
    const seqMatch = rawHref.match(/seq=(\d+)/);
    const seq = seqMatch ? seqMatch[1] : null;
    if (!seq) continue;
    const title = cleanText(match[2]).trim();
    if (title && (title.includes('건강기능식품') || title.includes('심의') || title.includes('회의'))) {
      const fullHref = rawHref.startsWith('http') ? rawHref : `${BASE_URL}/brd/m_532/${rawHref.replace(/^\.\//, '')}`;
      articles.push({ seq, title, href: fullHref });
    }
  }
  return articles;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    // pages: 수집할 페이지 수 (기본 1, 최대 36 = 전체 359개 / 10개씩)
    const pages = Math.min(parseInt(body.pages || '1'), 36);
    const forceReembed = body.forceReembed === true; // 임베딩 누락분 재시도 여부

    const BASE_URL = 'https://www.mfds.go.kr';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    };

    let addedMeetings = 0;
    let addedAgendas = 0;
    let skippedMeetings = 0;

    // ── 다중 페이지 순회 ────────────────────────────────────────────────────
    for (let page = 1; page <= pages; page++) {
      const articles = await fetchArticlesFromPage(page, headers, BASE_URL);

      for (const art of articles) {
        // 이미 DB에 있는 게시물은 건너뜀 (증분 동기화)
        const existing = await prisma.committee_meetings.findUnique({ where: { seq: art.seq } });
        if (existing) { skippedMeetings++; continue; }

        try {
          const detailResp = await fetch(art.href, { headers });
          if (!detailResp.ok) continue;
          const detailHtml = await detailResp.text();
          const rawText = cleanText(detailHtml);

          const mMeetingNo = art.title.match(/제?\s*(\d+)\s*차/);
          const meetingNo = mMeetingNo ? `제${mMeetingNo[1]}차` : null;
          const mDate = rawText.match(/일시\s*[:：]\s*([^\n]+)/);
          const meetingDate = mDate ? mDate[1].trim() : null;
          const mAttendees = rawText.match(/참석자?\s*[:：]\s*([^\n]+)/);
          const attendees = mAttendees ? mAttendees[1].trim() : null;
          const mDept = detailHtml.match(/담당부서[\s\S]*?\|[\s\S]*?([가-힣]+과|[가-힣]+팀)/);
          const department = mDept ? mDept[1].trim() : '영양기능연구과';

          let pdfFileName = null, pdfFileUrl = null;
          const mPdf = detailHtml.match(/<a\s+[^>]*href=["']([^"']*download[^"']*)["'][^>]*>([\s\S]*?\.pdf)[\s\S]*?<\/a>/i);
          if (mPdf) {
            pdfFileUrl = mPdf[1].startsWith('http') ? mPdf[1] : `${BASE_URL}${mPdf[1].startsWith('/') ? '' : '/'}${mPdf[1]}`;
            pdfFileName = mPdf[2].replace(/<[^>]+>/g, '').trim();
          }

          const createdMeeting = await prisma.committee_meetings.create({
            data: { seq: art.seq, title: art.title, meetingNo, meetingDate, department, attendees, rawContent: rawText.substring(0, 8000), sourceUrl: art.href, pdfFileName, pdfFileUrl }
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
            } catch (e) { console.warn('Embedding failed:', ag.ingredientName, e.message); }

            await prisma.committee_agendas.create({
              data: { meetingId: createdMeeting.id, orderIndex: ag.orderIndex, rawName: ag.rawName, ingredientName: ag.ingredientName, result: ag.result, agendaType: ag.agendaType, details: ag.details, embedding: embeddingJson }
            });
            addedAgendas++;
          }
        } catch (err) {
          console.error(`Error processing ${art.seq}:`, err.message);
        }
      }
    }

    // ── 임베딩 누락분 재시도 (forceReembed=true일 때) ────────────────────
    let reembedCount = 0;
    if (forceReembed) {
      const missing = await prisma.committee_agendas.findMany({ where: { embedding: null }, include: { meeting: true }, take: 50 });
      for (const ag of missing) {
        try {
          const embedText = `회의: ${ag.meeting?.title || ''} (일시: ${ag.meeting?.meetingDate || ''})\n원료/안건: ${ag.ingredientName} (${ag.agendaType})\n결과: ${ag.result}\n내용: ${ag.rawName}`;
          const vector = await getEmbedding(embedText);
          if (vector?.length > 0) {
            await prisma.committee_agendas.update({ where: { id: ag.id }, data: { embedding: JSON.stringify(vector) } });
            reembedCount++;
          }
        } catch (e) { console.warn('Re-embed failed:', ag.ingredientName); }
      }
    }

    const [totalMeetings, totalAgendas, embeddedAgendas] = await Promise.all([
      prisma.committee_meetings.count(),
      prisma.committee_agendas.count(),
      prisma.committee_agendas.count({ where: { NOT: { embedding: null } } }),
    ]);

    return NextResponse.json({
      success: true,
      message: `동기화 완료: 신규 ${addedMeetings}개 회의 / ${addedAgendas}개 안건 임베딩 완료`,
      addedMeetings, addedAgendas, skippedMeetings, reembedCount,
      totalMeetings, totalAgendas, embeddedAgendas,
      embeddingCoverage: totalAgendas > 0 ? Math.round(embeddedAgendas / totalAgendas * 100) : 0,
    });
  } catch (error) {
    console.error('Committee Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// 현재 수집 현황 조회 (GET)
export async function GET() {
  try {
    const [totalMeetings, totalAgendas, embeddedAgendas] = await Promise.all([
      prisma.committee_meetings.count(),
      prisma.committee_agendas.count(),
      prisma.committee_agendas.count({ where: { NOT: { embedding: null } } }),
    ]);
    const meetings = await prisma.committee_meetings.findMany({
      select: { seq: true, title: true, meetingNo: true, meetingDate: true, _count: { select: { agendas: true } } },
      orderBy: { id: 'desc' }, take: 20
    });
    return NextResponse.json({
      totalMeetings, totalAgendas, embeddedAgendas,
      embeddingCoverage: totalAgendas > 0 ? Math.round(embeddedAgendas / totalAgendas * 100) : 0,
      meetings,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
