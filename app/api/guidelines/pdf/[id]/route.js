import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) return new Response('Invalid ID', { status: 400 });

    const item = await prisma.functional_guidelines.findUnique({ where: { id } });
    if (!item) return new Response('Guideline not found', { status: 404 });

    const { searchParams } = new URL(req.url);
    const isDownload = searchParams.get('download') === 'true';

    // 로컬 PDF 경로 확인
    const pdfPath = path.join(process.cwd(), 'public', 'guidelines_pdf', `guideline_${id}.pdf`);
    
    let fileBuffer;
    if (fs.existsSync(pdfPath)) {
      fileBuffer = fs.readFileSync(pdfPath);
    } else if (item.attachmentUrl) {
      // 로컬에 없으면 식약처에서 실시간 다운로드
      const resp = await fetch(item.attachmentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (!resp.ok) return new Response('Failed to load PDF from source', { status: 502 });
      fileBuffer = Buffer.from(await resp.arrayBuffer());
      try {
        fs.writeFileSync(pdfPath, fileBuffer);
      } catch (e) {}
    } else {
      return new Response('No attachment available', { status: 404 });
    }

    const safeTitle = (item.title || `guideline_${id}`).replace(/[/\\?%*:|"<>]/g, '_');
    const filename = `${safeTitle}.pdf`;
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
    console.error('PDF Stream Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
