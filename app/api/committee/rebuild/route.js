import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getEmbedding } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    .replace(/&quot;/gi, '"')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(pdfUrl) {
  if (!pdfUrl) return null;
  try {
    const response = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // pdf-parse를 동적으로 로드 (webpack 이슈 우회)
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(buffer, { max: 10 }); // 최대 10페이지
    return data.text ? data.text.substring(0, 6000) : null;
  } catch (e) {
    console.warn('PDF extract failed:', e.message);
    return null;
  }
}

// GET: 재구축 진행 현황 조회
export async function GET() {
  try {
    const [total, hasContent, hasEmbedding] = await Promise.all([
      prisma.committee_meetings.count(),
      prisma.committee_meetings.count({ where: { NOT: { rawContent: null } } }),
      prisma.committee_meetings.count({ where: { NOT: { contentEmbedding: null } } }),
    ]);
    return NextResponse.json({ total, hasContent, hasEmbedding, pending: total - hasEmbedding });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: 배치 단위로 재크롤 + PDF 추출 + 임베딩
// body: { batch: 3, offset: 0, mode: 'all'|'missing' }
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(parseInt(body.batch || '3'), 5);
    const offset = parseInt(body.offset || '0');
    const mode = body.mode || 'missing'; // 'missing': 빠진 것만, 'all': 전체

    const BASE_URL = 'https://www.mfds.go.kr';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    };

    // 처리 대상 조회 (오래된 것 → 최신 순으로 처리)
    const where = mode === 'missing'
      ? { OR: [{ rawContent: null }, { contentEmbedding: null }] }
      : {};

    const meetings = await prisma.committee_meetings.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: offset,
      take: batchSize,
      select: {
        id: true, seq: true, title: true, sourceUrl: true,
        meetingDate: true, postDate: true, meetingNo: true,
        rawContent: true, pdfContent: true, contentEmbedding: true,
        pdfFileUrl: true,
        agendas: { select: { ingredientName: true, result: true, agendaType: true } },
      },
    });

    if (meetings.length === 0) {
      return NextResponse.json({ done: true, processed: 0, offset });
    }

    let processed = 0;
    const results = [];

    for (const meeting of meetings) {
      const updateData = {};
      let rawText = meeting.rawContent;

      // 1. rawContent 재수집 (없거나 강제 재수집 모드)
      if (!rawText && meeting.sourceUrl) {
        try {
          const resp = await fetch(meeting.sourceUrl, { headers, signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            const html = await resp.text();
            rawText = cleanText(html).substring(0, 8000);
            updateData.rawContent = rawText;
          }
        } catch (e) {
          console.warn(`rawContent fetch failed for ${meeting.seq}:`, e.message);
        }
      }

      // 2. PDF 텍스트 추출 (없는 경우)
      let pdfText = meeting.pdfContent;
      if (!pdfText && meeting.pdfFileUrl) {
        pdfText = await extractPdfText(meeting.pdfFileUrl);
        if (pdfText) updateData.pdfContent = pdfText;
      }

      // 3. 회의 전체 내용 임베딩 생성
      if (!meeting.contentEmbedding || mode === 'all') {
        const agendaSummary = meeting.agendas.map(a => `${a.ingredientName}(${a.result})`).join(', ');
        const embedText = [
          `제목: ${meeting.title}`,
          `회차: ${meeting.meetingNo || ''}`,
          `일시: ${meeting.meetingDate || meeting.postDate || ''}`,
          agendaSummary ? `안건: ${agendaSummary}` : '',
          rawText ? `본문: ${rawText.substring(0, 1500)}` : '',
          pdfText ? `PDF: ${pdfText.substring(0, 1000)}` : '',
        ].filter(Boolean).join('\n');

        try {
          const vector = await getEmbedding(embedText);
          if (vector?.length > 0) updateData.contentEmbedding = JSON.stringify(vector);
        } catch (e) {
          console.warn('Meeting embedding failed:', meeting.seq, e.message);
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.committee_meetings.update({ where: { id: meeting.id }, data: updateData });
      }

      processed++;
      results.push({
        id: meeting.id,
        title: meeting.title,
        hasRaw: !!updateData.rawContent || !!meeting.rawContent,
        hasPdf: !!updateData.pdfContent || !!meeting.pdfContent,
        hasEmbed: !!updateData.contentEmbedding || !!meeting.contentEmbedding,
      });
    }

    return NextResponse.json({
      done: meetings.length < batchSize,
      processed,
      nextOffset: offset + processed,
      results,
    });
  } catch (error) {
    console.error('Rebuild Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
