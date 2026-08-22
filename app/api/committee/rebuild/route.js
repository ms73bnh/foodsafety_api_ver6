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
// 식약처 HTML에서 모든 down.do 다운로드 URL을 추출 (배열 반환)
// 링크 텍스트가 "다운받기" 등 일반 텍스트일 수 있으므로 파일 타입은 실제 fetch로 판별
function extractAllDownUrls(html, sourceUrl = '') {
  let basePath = BASE_URL;
  if (sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      basePath = `${u.protocol}//${u.host}${u.pathname.substring(0, u.pathname.lastIndexOf('/') + 1)}`;
    } catch (e) {}
  }

  const urls = [];
  let m;

  // 패턴1: ./down.do?... (실제 식약처 패턴, &amp; 디코딩 필수)
  const downRe = /<a\s+[^>]*href=["']([^"']*down\.do\?[^"']*)["'][^>]*>/gi;
  while ((m = downRe.exec(html)) !== null) {
    const rawHref = m[1].replace(/&amp;/g, '&');
    let url;
    if (rawHref.startsWith('http')) url = rawHref;
    else if (rawHref.startsWith('./')) url = basePath + rawHref.slice(2);
    else url = `${BASE_URL}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
    if (!urls.includes(url)) urls.push(url);
  }

  // 패턴2: FileDown.do
  const fdRe = /<a\s+[^>]*href=["']([^"']*FileDown\.do\?[^"']*)["'][^>]*>/gi;
  while ((m = fdRe.exec(html)) !== null) {
    const url = m[1].startsWith('http') ? m[1] : `${BASE_URL}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
    if (!urls.includes(url)) urls.push(url);
  }

  // 패턴3: javascript:fn_egov_downFile('ID','N')
  const jsRe = /javascript:fn_(?:egov_downFile|fileDown|atchFileDown)\(['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\)/gi;
  while ((m = jsRe.exec(html)) !== null) {
    const url = `${BASE_URL}/cmm/fms/FileDown.do?atchFileId=${m[1]}&fileSn=${m[2]}`;
    if (!urls.includes(url)) urls.push(url);
  }

  return urls;
}

// PDF 매직바이트(%PDF)로 실제 PDF 여부 판별 후 텍스트 추출
async function extractPdfText(pdfUrl) {
  if (!pdfUrl || pdfUrl === 'NONE') return { text: null, error: 'URL 없음' };
  try {
    const response = await fetch(pdfUrl, {
      headers: { ...FETCH_HEADERS, 'Accept': 'application/pdf,*/*' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { text: null, error: `HTTP ${response.status}` };

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 10) return { text: null, error: '파일 너무 작음' };

    // 매직바이트로 파일 타입 판별
    const magic4 = buffer.slice(0, 4).toString('ascii');
    if (magic4 !== '%PDF') {
      const hex4 = buffer.slice(0, 4).toString('hex');
      if (hex4.startsWith('504b')) return { text: null, error: 'HWP/ZIP 파일', isHwp: true };
      if (hex4.startsWith('d0cf')) return { text: null, error: 'HWP(구버전) 파일', isHwp: true };
      return { text: null, error: `PDF 아님(${hex4})` };
    }

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
    // pdfFileUrl='NONE'은 "확인 완료, PDF 없음" 마커 → 재처리 제외
    const where = mode === 'missing'
      ? { OR: [{ rawContent: null }, { contentEmbedding: null }, { AND: [{ pdfFileUrl: null }] }] }
      : mode === 'pdf'
      ? { pdfFileUrl: null }  // PDF URL만 없는 것 (NONE 제외됨)
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
      // 'NONE'은 "확인 완료, PDF 없음" 마커 - 재시도 안 함
      let pdfFileUrl = meeting.pdfFileUrl;
      let pdfError = null;

      if (!pdfFileUrl && detailHtml) {
        const candidateUrls = extractAllDownUrls(detailHtml, meeting.sourceUrl || '');

        if (candidateUrls.length === 0) {
          updateData.pdfFileUrl = 'NONE';
          pdfFileUrl = 'NONE';
          pdfError = 'PDF 없음(확인완료)';
        } else {
          // 각 URL을 순서대로 시도하여 첫 번째 실제 PDF URL 사용
          for (const candidateUrl of candidateUrls) {
            const { text, error, isHwp } = await extractPdfText(candidateUrl);
            if (text) {
              pdfFileUrl = candidateUrl;
              updateData.pdfFileUrl = candidateUrl;
              updateData.pdfContent = text;
              break;
            }
            if (!isHwp) {
              // HWP가 아닌 실패(세션 필요 등)면 URL은 저장하고 중단
              pdfFileUrl = candidateUrl;
              updateData.pdfFileUrl = candidateUrl;
              pdfError = error;
              break;
            }
            // HWP 파일이면 다음 URL 시도
            pdfError = error;
          }
          if (!pdfFileUrl) {
            updateData.pdfFileUrl = 'NONE';
            pdfFileUrl = 'NONE';
          }
        }
      }

      // 2. PDF 텍스트 추출 (URL은 있지만 pdfContent 없는 경우)
      let pdfText = meeting.pdfContent || updateData.pdfContent;
      if (!pdfText && pdfFileUrl && pdfFileUrl !== 'NONE' && !updateData.pdfContent) {
        const { text, error } = await extractPdfText(pdfFileUrl);
        if (text) { pdfText = text; updateData.pdfContent = text; }
        else pdfError = pdfError || error;
      }
      if (!pdfText && !pdfError) {
        pdfError = pdfFileUrl === 'NONE' ? 'PDF 없음(확인완료)' : '첨부 PDF 없음';
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
