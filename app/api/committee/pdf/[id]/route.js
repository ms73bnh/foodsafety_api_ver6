import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

export async function GET(req, { params }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) return new Response('Invalid ID', { status: 400 });

    const meeting = await prisma.committee_meetings.findUnique({ where: { id } });
    if (!meeting) return new Response('Meeting not found', { status: 404 });

    if (!meeting.pdfFileUrl || meeting.pdfFileUrl === 'NONE') {
      return new Response('No PDF attachment available for this meeting', { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const isDownload = searchParams.get('download') === 'true';

    // 식약처에서 실시간 다운로드 (Vercel은 파일시스템 캐시 불가)
    const resp = await fetch(meeting.pdfFileUrl, {
      headers: { ...FETCH_HEADERS, 'Referer': meeting.sourceUrl || 'https://www.mfds.go.kr' },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      return new Response(`Failed to fetch from MFDS (HTTP ${resp.status})`, { status: 502 });
    }

    const fileBuffer = Buffer.from(await resp.arrayBuffer());

    // 매직바이트로 실제 파일 타입 결정
    const magic = fileBuffer.slice(0, 4).toString('hex');
    let contentType = 'application/octet-stream';
    let ext = 'bin';
    if (fileBuffer.slice(0, 4).toString('ascii') === '%PDF') {
      contentType = 'application/pdf';
      ext = 'pdf';
    } else if (magic.startsWith('504b')) {
      contentType = 'application/x-hwp'; // HWP/HWPX (ZIP 기반)
      ext = 'hwpx';
    } else if (magic.startsWith('d0cf')) {
      contentType = 'application/x-hwp'; // 구형 HWP
      ext = 'hwp';
    }

    const baseName = (meeting.pdfFileName || meeting.title || `meeting_${id}`)
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\.(pdf|hwp|hwpx)$/i, '');
    const filename = `${baseName}.${ext}`;
    const encodedFilename = encodeURIComponent(filename);

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(fileBuffer, { status: 200, headers });
  } catch (error) {
    console.error('Committee PDF Stream Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
