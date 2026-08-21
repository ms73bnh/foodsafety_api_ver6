import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) return new Response('Invalid ID', { status: 400 });

    const meeting = await prisma.committee_meetings.findUnique({ where: { id } });
    if (!meeting) return new Response('Meeting not found', { status: 404 });

    if (!meeting.pdfFileUrl) {
      return new Response('No PDF attachment available for this meeting', { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const isDownload = searchParams.get('download') === 'true';

    // 로컬 캐시 디렉터리
    const cacheDir = path.join(process.cwd(), 'public', 'committee_pdf');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const pdfPath = path.join(cacheDir, `meeting_${id}.pdf`);
    let fileBuffer;

    if (fs.existsSync(pdfPath)) {
      fileBuffer = fs.readFileSync(pdfPath);
    } else {
      // 식약처에서 실시간 다운로드 & 캐싱
      const resp = await fetch(meeting.pdfFileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          'Referer': meeting.sourceUrl || 'https://www.mfds.go.kr',
        }
      });
      if (!resp.ok) {
        return new Response('Failed to fetch PDF from MFDS source', { status: 502 });
      }
      fileBuffer = Buffer.from(await resp.arrayBuffer());
      try {
        fs.writeFileSync(pdfPath, fileBuffer);
      } catch (writeErr) {
        console.warn('PDF Cache write failed:', writeErr.message);
      }
    }

    const safeTitle = (meeting.pdfFileName || meeting.title || `meeting_${id}`).replace(/[/\\?%*:|"<>]/g, '_');
    const filename = safeTitle.endsWith('.pdf') ? safeTitle : `${safeTitle}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(fileBuffer, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Committee PDF Stream Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
