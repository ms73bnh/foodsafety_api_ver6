import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return new Response('Invalid document ID', { status: 400 });
  const doc = await prisma.committee_documents.findUnique({ where: { id }, select: { original: true, fileName: true, fileType: true } });
  if (!doc?.original || doc.fileType !== 'pdf') return new Response('PDF not found', { status: 404 });
  return new Response(doc.original, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="committee.pdf"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' } });
}
