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

const BASE_URL = 'https://www.mfds.go.kr';
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.mfds.go.kr/brd/m_532/list.do',
};

// 식약처 첨부파일 URL 추출
// 실제 패턴: <a href="./down.do?brd_id=plc0062&seq=33423&data_tp=A&file_seq=1">파일명.pdf</a>
// 폴백 패턴: FileDown.do, fn_egov_downFile, fn_fileDown 등
function extractAttachmentUrl(html, type = 'pdf', sourceUrl = '') {
  const extPat = type === 'pdf' ? /\.pdf/i : /\.(?:hwp|hwpx)/i;

  // sourceUrl에서 base 경로 추출 (예: https://www.mfds.go.kr/brd/m_532/)
  let basePath = BASE_URL;
  if (sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      basePath = `${u.protocol}//${u.host}${u.pathname.substring(0, u.pathname.lastIndexOf('/') + 1)}`;
    } catch (e) {}
  }

  // 패턴1 (실제 식약처): ./down.do?... - &amp; 디코딩 필수
  const downRe = /<a\s+[^>]*href=["']([^"']*down\.do\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = downRe.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (extPat.test(text)) {
      const rawHref = m[1].replace(/&amp;/g, '&');  // HTML 엔티티 디코딩
      let url;
      if (rawHref.startsWith('http')) url = rawHref;
      else if (rawHref.startsWith('./')) url = basePath + rawHref.slice(2);
      else url = `${BASE_URL}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
      return { url, name: text };
    }
  }

  // 패턴2: href에 직접 FileDown URL이 있는 경우
  const fileDownRe = /<a\s+[^>]*href=["']([^"']*(?:FileDown|fileDown|download)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = fileDownRe.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (extPat.test(text) || extPat.test(m[1])) {
      const url = m[1].startsWith('http') ? m[1] : `${BASE_URL}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
      return { url, name: text };
    }
  }

  // 패턴3: javascript:fn_egov_downFile 방식
  const jsRe = /<a\s+[^>]*href=["']javascript:fn_(?:egov_downFile|fileDown|atchFileDown)\(['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\)[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = jsRe.exec(html)) !== null) {
    const text = m[3].replace(/<[^>]+>/g, '').trim();
    if (extPat.test(text)) {
      const url = `${BASE_URL}/cmm/fms/FileDown.do?atchFileId=${m[1]}&fileSn=${m[2]}`;
      return { url, name: text };
    }
  }

  return { url: null, name: null };
}

async function extractPdfText(pdfUrl) {
  if (!pdfUrl) return { text: null, error: 'URL 없음' };
  try {
    const response = await fetch(pdfUrl, {
      headers: { ...FETCH_HEADERS, 'Accept': 'application/pdf,*/*' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { text: null, error: `HTTP ${response.status}` };

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !contentType.includes('octet')) {
      return { text: null, error: `콘텐츠 타입 불일치: ${contentType.substring(0, 40)}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 100) return { text: null, error: '파일 크기 너무 작음' };

    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(buffer, { max: 10 });
    const text = (data.text || '').trim();
    if (!text) return { text: null, error: '텍스트 없음(이미지 PDF)' };
    return { text: text.substring(0, 6000), error: null };
  } catch (e) {
    return { text: null, error: e.message?.substring(0, 60) };
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

    // 처리 대상 조회
    const where = mode === 'missing'
      ? { OR: [{ rawContent: null }, { contentEmbedding: null }, { pdfFileUrl: null }] }
      : mode === 'pdf'
      ? { pdfFileUrl: null }  // PDF URL만 없는 것
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
      let detailHtml = null;
      if ((!rawText || !meeting.pdfFileUrl) && meeting.sourceUrl) {
        try {
          const resp = await fetch(meeting.sourceUrl, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            detailHtml = await resp.text();
            if (!rawText) {
              rawText = cleanText(detailHtml).substring(0, 8000);
              updateData.rawContent = rawText;
            }
          }
        } catch (e) {
          console.warn(`detail fetch failed for ${meeting.seq}:`, e.message);
        }
      }

      // 1-1. pdfFileUrl이 DB에 없으면 상세페이지 HTML에서 재탐색
      let pdfFileUrl = meeting.pdfFileUrl;
      if (!pdfFileUrl && detailHtml) {
        const { url, name } = extractAttachmentUrl(detailHtml, 'pdf', meeting.sourceUrl || '');
        if (url) {
          pdfFileUrl = url;
          updateData.pdfFileUrl = url;
          if (name) updateData.pdfFileName = name;
        }
      }

      // 2. PDF 텍스트 추출 (없는 경우)
      let pdfText = meeting.pdfContent;
      let pdfError = null;
      if (!pdfText) {
        if (pdfFileUrl) {
          const { text, error } = await extractPdfText(pdfFileUrl);
          if (text) { pdfText = text; updateData.pdfContent = text; }
          else pdfError = error;
        } else {
          pdfError = '첨부 PDF 없음';
        }
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
        pdfError,
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
