import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getEmbedding } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

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
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

// 회의록 본문에서 안건 파싱
function parseAgendas(rawContent = '', meetingTitle = '') {
  const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
  const agendas = [];

  let inResultSection = false;
  let order = 1;

  for (const line of lines) {
    if (line.includes('○ 결과') || line.includes('○ 심의결과') || line.includes('○ 의결사항') || line.includes('심의 결과')) {
      inResultSection = true;
      continue;
    }

    if (inResultSection && line.startsWith('○') && !line.startsWith('○ -') && !line.includes('인정') && !line.includes('보완')) {
      // 다른 섹션 시작 시 종료
      if (line.includes('일시') || line.includes('참석') || line.includes('붙임') || line.includes('기타')) {
        inResultSection = false;
      }
    }

    // 안건 패턴: "- 원료명 : 인정/보완/불인정" 또는 "1. 원료명 : 인정"
    const isAgendaLine = line.startsWith('-') || line.startsWith('•') || /^[0-9]+.s*/.test(line) || (inResultSection && (line.includes('인정') || line.includes('보완')));
    
    if (isAgendaLine) {
      const parts = line.replace(/^[-•0-9.s]+/, '').split(/[:：]/);
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

        // 원료명 정제
        let ingredientName = rawName
          .replace(/^기능성s*원료s*['‘]/, '')
          .replace(/['’]s*(기능성s*추가)/, '')
          .replace(/['’]/g, '')
          .trim();

        agendas.push({
          orderIndex: order++,
          rawName: line,
          ingredientName,
          result,
          agendaType,
          details: `${meetingTitle} > ${line}`
        });
      }
    }
  }

  return agendas;
}

export async function POST(req) {
  try {
    const BASE_URL = 'https://www.mfds.go.kr';
    const LIST_URL = `${BASE_URL}/brd/m_532/list.do`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    };

    // 1. 위원회 목록 페이지 조회 (1~2페이지 수집)
    const listResp = await fetch(LIST_URL, { headers });
    if (!listResp.ok) throw new Error('식약처 위원회 게시판 응답 오류');
    const listHtml = await listResp.text();

    // 게시글 seq 및 제목 파싱
    const linkRegex = /<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/gi;
    const articles = [];
    let match;

    while ((match = linkRegex.exec(listHtml)) !== null) {
      const rawHref = match[1].replace(/&amp;/g, '&');
      const seqMatch = rawHref.match(/seq=(\d+)/);
      const seq = seqMatch ? seqMatch[1] : String(Math.random());
      const title = cleanText(match[2]).trim();
      
      if (title && (title.includes('건강기능식품') || title.includes('심의') || title.includes('회의'))) {
        const fullHref = rawHref.startsWith('http') ? rawHref : `${BASE_URL}/brd/m_532/${rawHref.replace(/^\.\//, '')}`;
        articles.push({
          seq,
          title,
          href: fullHref
        });
      }
    }

    let addedMeetings = 0;
    let addedAgendas = 0;

    for (const art of articles.slice(0, 10)) { // 최신 10개 회의 동기화
      const existingMeeting = await prisma.committee_meetings.findUnique({
        where: { seq: art.seq }
      });

      if (existingMeeting) continue;

      // 상세 페이지 크롤링
      try {
        const detailResp = await fetch(art.href, { headers });
        if (!detailResp.ok) continue;
        const detailHtml = await detailResp.text();

        const rawText = cleanText(detailHtml);

        // 회차 추출 (예: 제202차)
        const mMeetingNo = art.title.match(/제\s*(\d+)\s*차/);
        const meetingNo = mMeetingNo ? `제${mMeetingNo[1]}차` : null;

        // 일시 추출
        const mDate = rawText.match(/일시\s*[:：]\s*([^\n]+)/);
        const meetingDate = mDate ? mDate[1].trim() : null;

        // 참석자 추출
        const mAttendees = rawText.match(/참석자?\s*[:：]\s*([^\n]+)/);
        const attendees = mAttendees ? mAttendees[1].trim() : null;

        // 담당부서
        const mDept = detailHtml.match(/담당부서[\s\S]*?\|[\s\S]*?([가-힣]+과|[가-힣]+팀)/);
        const department = mDept ? mDept[1].trim() : '영양기능연구과';

        // 첨부 PDF 링크
        let pdfFileName = null;
        let pdfFileUrl = null;
        const mPdf = detailHtml.match(/<a\s+[^>]*href=["']([^"']*download[^"']*)["'][^>]*>([\s\S]*?\.pdf)[\s\S]*?<\/a>/i);
        if (mPdf) {
          pdfFileUrl = mPdf[1].startsWith('http') ? mPdf[1] : `${BASE_URL}${mPdf[1].startsWith('/') ? '' : '/'}${mPdf[1]}`;
          pdfFileName = mPdf[2].replace(/<[^>]+>/g, '').trim();
        }

        // 회의 DB 등록
        const createdMeeting = await prisma.committee_meetings.create({
          data: {
            seq: art.seq,
            title: art.title,
            meetingNo,
            meetingDate,
            department,
            attendees,
            rawContent: rawText.substring(0, 8000),
            sourceUrl: art.href,
            pdfFileName,
            pdfFileUrl,
          }
        });
        addedMeetings++;

        // 안건 파싱 및 임베딩 벡터 생성
        const agendas = parseAgendas(rawText, art.title);

        for (const ag of agendas) {
          let embeddingJson = null;
          try {
            // 안건 검색용 텍스트 임베딩 생성 (무료 Gemini Embedding)
            const embedText = `회의: ${art.title} (일시: ${meetingDate || ''})\n원료/안건: ${ag.ingredientName} (${ag.agendaType})\n결과: ${ag.result}\n내용: ${ag.rawName}`;
            const vector = await getEmbedding(embedText);
            if (vector && vector.length > 0) {
              embeddingJson = JSON.stringify(vector);
            }
          } catch (embedErr) {
            console.error('Embedding error for agenda:', ag.ingredientName, embedErr.message);
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
              embedding: embeddingJson,
            }
          });
          addedAgendas++;
        }
      } catch (err) {
        console.error(`Error processing article ${art.seq}:`, err);
      }
    }

    const totalMeetings = await prisma.committee_meetings.count();
    const totalAgendas = await prisma.committee_agendas.count();

    return NextResponse.json({
      success: true,
      message: `심의위원회 회의록 동기화 완료: ${addedMeetings}개 회의 신규 등록, ${addedAgendas}개 안건 임베딩 완료 (총 ${totalMeetings}개 회의, ${totalAgendas}개 안건)`,
      addedMeetings,
      addedAgendas,
      totalMeetings,
      totalAgendas,
    });
  } catch (error) {
    console.error('Committee Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
