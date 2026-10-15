import prisma from '@/lib/prisma';

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
  { key: 'raw-general', label: '일반식품 로우데이터', path: '/raw-data/general', group: '로우데이터 추출', visibleTo: ['ADMIN'], enabled: true },
  { key: 'raw-health', label: '건강기능식품 로우데이터', path: '/raw-data/health', group: '로우데이터 추출', visibleTo: ['ADMIN'], enabled: true },
  { key: 'raw-production', label: '생산실적 로우데이터', path: '/raw-data/production', group: '로우데이터 추출', visibleTo: ['ADMIN'], enabled: true },
];

// 저장된 설정 위에 기본 메뉴를 병합한다. (새로 추가된 기본 메뉴 키가 기존 저장본에 없어도 노출되도록)
export function mergeMenuConfig(saved) {
  if (!Array.isArray(saved)) return DEFAULT_MENU_CONFIG;
  const merged = DEFAULT_MENU_CONFIG.map((d) => {
    const s = saved.find((item) => item.key === d.key);
    return s ? { ...d, ...s, visibleTo: Array.isArray(s.visibleTo) ? s.visibleTo : d.visibleTo } : d;
  });
  const extras = saved.filter((s) => !DEFAULT_MENU_CONFIG.some((d) => d.key === s.key));
  return [...merged, ...extras];
}

export async function getStoredMenuConfig() {
  try {
    const row = await prisma.system_settings.findUnique({ where: { key: 'menu_visibility' } });
    if (!row?.value) return { config: DEFAULT_MENU_CONFIG, isDefault: true };
    return { config: mergeMenuConfig(JSON.parse(row.value)), isDefault: false };
  } catch (e) {
    return { config: DEFAULT_MENU_CONFIG, isDefault: true };
  }
}

// 서버측 메뉴 권한 확인: ADMIN은 항상 허용, 그 외는 메뉴 설정(enabled + visibleTo)을 따른다.
export async function hasMenuAccess(user, ...keys) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const { config } = await getStoredMenuConfig();
  return keys.some((key) => {
    const item = config.find((menu) => menu.key === key);
    return !!item && item.enabled !== false && Array.isArray(item.visibleTo) && item.visibleTo.includes(user.role);
  });
}
