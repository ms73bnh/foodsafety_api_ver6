import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req) {
  try {
    const user = getCurrentUser(req);
    
    if (!user) {
      return NextResponse.json({ success: true, user: null });
    }
    
    // 비밀번호 해시 등 민감한 정보 제외한 페이로드 전달
    return NextResponse.json({
      success: true,
      user: {
        username: user.username,
        name: user.name,
        role: user.role,
        companyNm: user.companyNm,
        deptNm: user.deptNm,
        positionNm: user.positionNm,
        titleNm: user.titleNm
      }
    });
  } catch (error) {
    console.error('Session Me API Error:', error);
    return NextResponse.json({ success: false, user: null }, { status: 500 });
  }
}
