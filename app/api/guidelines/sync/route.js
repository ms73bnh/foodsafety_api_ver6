import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const BASE_URL = 'https://www.mfds.go.kr';
    const LIST_URL = `${BASE_URL}/brd/m_1060/list.do?multi_itm_seq=0&board_id=data0011&seq=&data_stts_gubun=C9999&srchTp=0&srchWord=%EA%B8%B0%EB%8A%A5%EC%84%B1+%ED%8F%89%EA%B0%80`;

    let syncedCount = 0;
    let updatedCount = 0;

    for (let page = 1; page <= 5; page++) {
      const resp = await fetch(`${LIST_URL}&page=${page}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await resp.text();

      const chunks = html.split(/<div\s+class=["']num["']\s*>/i);
      if (chunks.length <= 1) break;

      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];

        const noMatch = chunk.match(/^\s*(\d+)\s*<\/div>/i);
        const no = noMatch ? noMatch[1].trim() : null;

        const titleMatch = chunk.match(/<a[^>]*href=["']\.\/view\.do\?seq=([^"&]+)[^"']*["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!titleMatch) continue;

        const seq = titleMatch[1];
        const rawTitle = titleMatch[2].replace(/<[^>]+>/g, '').trim();
        if (!rawTitle || rawTitle.includes('미리보기')) continue;

        const dateMatch = chunk.match(/<div\s+class=["']right_column["']\s*>\s*([\d-]+)\s*<\/div>/i);
        const regDate = dateMatch ? dateMatch[1].trim() : null;

        const viewMatch = chunk.match(/조회수\s*\|\s*(\d+)/i);
        const viewCnt = viewMatch ? viewMatch[1].trim() : null;

        const fileMatch = chunk.match(/<div\s+class=["']bbs_file_list_header["']\s*>\s*<span>([^<]+)<\/span>/i);
        const attachmentName = fileMatch ? fileMatch[1].trim() : null;

        const downMatch = chunk.match(/down\.do\?[^"']*file_seq=(\d+)/i);
        const fileSeq = downMatch ? downMatch[1] : '1';

        const detailUrl = `${BASE_URL}/brd/m_1060/view.do?seq=${seq}&board_id=data0011`;
        const attachmentUrl = `${BASE_URL}/brd/m_1060/down.do?brd_id=data0011&seq=${seq}&data_tp=A&file_seq=${fileSeq}`;

        const existing = await prisma.functional_guidelines.findFirst({
          where: { detailUrl }
        });

        if (!existing) {
          await prisma.functional_guidelines.create({
            data: {
              no,
              title: rawTitle,
              dept: '식약처',
              regDate,
              viewCnt,
              attachmentName,
              detailUrl,
              attachmentUrl
            }
          });
          syncedCount++;
        } else {
          await prisma.functional_guidelines.update({
            where: { id: existing.id },
            data: {
              no: no || existing.no,
              title: rawTitle,
              regDate: regDate || existing.regDate,
              viewCnt: viewCnt || existing.viewCnt,
              attachmentName: attachmentName || existing.attachmentName,
              attachmentUrl: attachmentUrl || existing.attachmentUrl
            }
          });
          updatedCount++;
        }
      }
    }

    await writeAuditLog(req, {
      action: 'GUIDELINES_SYNC',
      page: '/guidelines',
      details: `기능성 평가 가이드라인 전체 동기화 (${syncedCount}건 신규 추가, ${updatedCount}건 업데이트)`
    });

    const total = await prisma.functional_guidelines.count();
    return NextResponse.json({
      success: true,
      message: `가이드라인 전체 동기화 완료: ${syncedCount}건 신규 추가, ${updatedCount}건 갱신 (총 ${total}건)`,
      syncedCount,
      updatedCount,
      total
    });
  } catch (error) {
    console.error('Guidelines Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
