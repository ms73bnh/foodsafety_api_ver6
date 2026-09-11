import prisma from '@/lib/prisma';
import { resolveMeetingPdf } from '@/lib/committeeRag/preview.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req, { params }) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: '올바르지 않은 게시물 ID입니다.' }, { status: 400 });
    const meeting = await prisma.committee_meetings.findUnique({ where: { id } });
    if (!meeting) return Response.json({ error: '게시물을 찾지 못했습니다.' }, { status: 404 });
    const { bytes, fileName } = await resolveMeetingPdf(meeting);
    const download = new URL(req.url).searchParams.get('download') === 'true';
    return new Response(bytes, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="committee-' + id + '.pdf"; filename*=UTF-8\'\'' + encodeURIComponent(fileName),
      'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('Committee PDF:', error.code || 'upstream error');
    return Response.json({ error: error.code === 'PDF_UNAVAILABLE' ? error.message : 'PDF를 가져오지 못했습니다. 잠시 후 다시 시도하거나 식약처 원문을 확인해 주세요.' }, { status: error.code === 'PDF_UNAVAILABLE' ? 422 : 502 });
  }
}
