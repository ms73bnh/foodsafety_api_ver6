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

    // 1페이지 최신 게시글 10건 크롤링하여 동기화
    const resp = await fetch(`${LIST_URL}&page=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await resp.text();

    const regex = /<a[^>]*href=["']\.\/view\.do\?seq=([^"']+)&[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let syncedCount = 0;

    while ((match = regex.exec(html)) !== null) {
      const seq = match[1];
      const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
      if (!rawTitle || rawTitle.includes('미리보기')) continue;

      const detailUrl = `${BASE_URL}/brd/m_1060/view.do?seq=${seq}&board_id=data0011`;
      
      const existing = await prisma.functional_guidelines.findFirst({
        where: { detailUrl }
      });

      if (!existing) {
        await prisma.functional_guidelines.create({
          data: {
            title: rawTitle,
            dept: '식약처',
            detailUrl,
            attachmentUrl: `${BASE_URL}/brd/m_1060/down.do?brd_id=data0011&seq=${seq}&data_tp=A&file_seq=1`
          }
        });
        syncedCount++;
      }
    }

    await writeAuditLog(req, {
      action: 'GUIDELINES_SYNC',
      page: '/guidelines',
      details: `기능성 평가 가이드라인 수동 동기화 (${syncedCount}건 추가)`
    });

    const total = await prisma.functional_guidelines.count();
    return NextResponse.json({
      success: true,
      message: `가이드라인 동기화 완료: ${syncedCount}건 신규 추가 (총 ${total}건)`,
      syncedCount,
      total
    });
  } catch (error) {
    console.error('Guidelines Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
