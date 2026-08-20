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

    const item = await prisma.raw_material_posts.findUnique({ where: { id } });
    if (!item) return new Response('Not found', { status: 404 });

    const { searchParams } = new URL(req.url);
    const isDownload = searchParams.get('download') === 'true';

    const pdfPath = path.join(process.cwd(), 'public', 'raw_material_pdf', `rm_${item.ntctxtNo}.pdf`);

    let fileBuffer;
    if (fs.existsSync(pdfPath)) {
      fileBuffer = fs.readFileSync(pdfPath);
    } else if (item.filePath && item.fileName) {
      const formData = new URLSearchParams({
        filePath: item.filePath,
        fileName: item.fileName,
        orgFileName: item.orgFileName || 'file.pdf',
        file_type_cd: item.fileTypeCd || 'pdf',
        ecm_file_no: item.ecmFileNo || ''
      });
      const resp = await fetch('https://www.foodsafetykorea.go.kr/common/downloadAttchdFile.do', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do',
          'User-Agent': 'Mozilla/5.0'
        },
        body: formData.toString()
      });
      if (!resp.ok) return new Response('PDF not available from source', { status: 404 });
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/html')) return new Response('PDF not available', { status: 404 });
      fileBuffer = Buffer.from(await resp.arrayBuffer());
      try { fs.writeFileSync(pdfPath, fileBuffer); } catch (e) {}
    } else {
      return new Response('No attachment available', { status: 404 });
    }

    const safeTitle = (item.title || `rm_${id}`).replace(/[/\\?%*:|"<>]/g, '_');
    const filename = `${safeTitle}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(fileBuffer, { status: 200, headers });
  } catch (error) {
    console.error('Raw Material PDF error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
