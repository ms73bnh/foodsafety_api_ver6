import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const DEFAULT_MENU_CONFIG = [
  { key: 'dashboard', label: '대시보드', path: '/', group: null, visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'search', label: '건강기능식품 검색', path: '/search', group: '데이터 검색', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'general-search', label: '일반식품 검색', path: '/general-search', group: '데이터 검색', visibleTo: ['ADMIN', 'SALES'], enabled: true },
  { key: 'companies', label: '업체별 현황', path: '/companies', group: '업체별 정보', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'companies-compare', label: '업체 상호 비교', path: '/companies/compare', group: '업체별 정보', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'production', label: '생산 실적 분석', path: '/production', group: null, visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'analytics', label: '통합 분석 레포트', path: '/analytics', group: null, visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'categories', label: '기능성 카테고리', path: '/categories', group: '개별인정형', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'ingredients', label: '개별인정원료', path: '/ingredients', group: '개별인정형', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'guidelines', label: '기능성 평가 가이드라인', path: '/guidelines', group: '개별인정형', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'raw-materials', label: '원료별 정보 공시', path: '/raw-materials', group: '개별인정형', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'committee', label: '심의위원회 회의록 (AI Q&A)', path: '/committee', group: '개별인정형', visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
  { key: 'qna', label: 'Q&A', path: '/qna', group: null, visibleTo: ['ADMIN', 'SALES', 'USER'], enabled: true },
];

export async function GET() {
  try {
    const row = await prisma.system_settings.findUnique({ where: { key: 'menu_visibility' } });
    if (row?.value) {
      return Response.json({ config: JSON.parse(row.value), isDefault: false });
    }
    return Response.json({ config: DEFAULT_MENU_CONFIG, isDefault: true });
  } catch (e) {
    return Response.json({ config: DEFAULT_MENU_CONFIG, isDefault: true });
  }
}

export async function POST(req) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }
    const { config } = await req.json();
    if (!Array.isArray(config)) {
      return Response.json({ error: '잘못된 형식입니다.' }, { status: 400 });
    }
    await prisma.system_settings.upsert({
      where: { key: 'menu_visibility' },
      create: { key: 'menu_visibility', value: JSON.stringify(config), updatedBy: currentUser.username },
      update: { value: JSON.stringify(config), updatedBy: currentUser.username },
    });
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }
  await prisma.system_settings.deleteMany({ where: { key: 'menu_visibility' } });
  return Response.json({ success: true, config: DEFAULT_MENU_CONFIG });
}
