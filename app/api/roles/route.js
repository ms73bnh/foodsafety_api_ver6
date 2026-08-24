import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const DEFAULT_ROLES = [
  {
    key: 'ADMIN',
    label: '관리자',
    description: '시스템 관리 및 모든 기능과 메뉴에 대한 전체 관리 권한',
    color: '#1d4ed8',
    isSystem: true,
    createdAt: '2025-01-01T00:00:00.000Z'
  },
  {
    key: 'SALES',
    label: '영업담당자',
    description: '영업 및 일반식품/건강기능식품 데이터 조회 및 분석 권한',
    color: '#c2410c',
    isSystem: true,
    createdAt: '2025-01-01T00:00:00.000Z'
  },
  {
    key: 'USER',
    label: '일반사용자',
    description: '기본적인 데이터 검색 및 조회 권한',
    color: '#16a34a',
    isSystem: true,
    createdAt: '2025-01-01T00:00:00.000Z'
  }
];

// 역할 목록 가져오기 헬퍼
async function getStoredRoles() {
  const row = await prisma.system_settings.findUnique({ where: { key: 'system_roles' } });
  if (!row?.value) {
    return DEFAULT_ROLES;
  }
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ROLES;
  } catch (e) {
    return DEFAULT_ROLES;
  }
}

// GET: 전체 역할 목록 및 각 역할별 사용자 수 반환
export async function GET() {
  try {
    const roles = await getStoredRoles();

    // 각 역할별 사용자 수 집계
    const userGroups = await prisma.user.groupBy({
      by: ['role'],
      _count: {
        id: true
      }
    });

    const userCountMap = {};
    userGroups.forEach(g => {
      userCountMap[g.role] = g._count.id;
    });

    const enrichedRoles = roles.map(r => ({
      ...r,
      userCount: userCountMap[r.key] || 0
    }));

    return Response.json({
      success: true,
      roles: enrichedRoles
    });
  } catch (e) {
    console.error('Failed to get roles:', e);
    return Response.json({ success: false, error: e.message, roles: DEFAULT_ROLES }, { status: 500 });
  }
}

// POST: 신규 역할 생성
export async function POST(req) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return Response.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json();
    let { key, label, description, color, autoAddToMenus } = body;

    if (!label || !label.trim()) {
      return Response.json({ success: false, error: '권한명을 입력해주세요.' }, { status: 400 });
    }

    label = label.trim();
    description = description ? description.trim() : '';
    color = color ? color.trim() : '#6366f1';

    // key가 없거나 비어있는 경우 권한명 기반 또는 ROLE_랜덤/타임스탬프로 생성
    if (!key || !key.trim()) {
      const sanitized = label.toUpperCase().replace(/[^A-Z0-9]/g, '');
      key = sanitized.length >= 2 ? sanitized : `ROLE_${Date.now().toString(36).toUpperCase()}`;
    } else {
      key = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    }

    const currentRoles = await getStoredRoles();

    // 중복 체크
    if (currentRoles.some(r => r.key === key)) {
      return Response.json({ success: false, error: `이미 존재하는 권한 코드입니다 (${key}).` }, { status: 400 });
    }
    if (currentRoles.some(r => r.label.toLowerCase() === label.toLowerCase())) {
      return Response.json({ success: false, error: `이미 존재하는 권한명입니다 (${label}).` }, { status: 400 });
    }

    const newRole = {
      key,
      label,
      description,
      color,
      isSystem: false,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.username
    };

    const updatedRoles = [...currentRoles, newRole];

    await prisma.system_settings.upsert({
      where: { key: 'system_roles' },
      create: { key: 'system_roles', value: JSON.stringify(updatedRoles), updatedBy: currentUser.username },
      update: { value: JSON.stringify(updatedRoles), updatedBy: currentUser.username }
    });

    // menu_visibility 설정에 새 role 기본 추가
    if (autoAddToMenus !== false) {
      try {
        const menuRow = await prisma.system_settings.findUnique({ where: { key: 'menu_visibility' } });
        if (menuRow?.value) {
          const menuConfig = JSON.parse(menuRow.value);
          const updatedMenuConfig = menuConfig.map(m => {
            if (!m.visibleTo.includes(key)) {
              return { ...m, visibleTo: [...m.visibleTo, key] };
            }
            return m;
          });
          await prisma.system_settings.update({
            where: { key: 'menu_visibility' },
            data: { value: JSON.stringify(updatedMenuConfig), updatedBy: currentUser.username }
          });
        }
      } catch (me) {
        console.error('Failed to sync new role with menu config:', me);
      }
    }

    await writeAuditLog(req, {
      action: 'ROLE_CREATE',
      page: '/manage/roles',
      details: `새 권한 생성: ${label} (${key})`
    });

    return Response.json({ success: true, role: newRole, roles: updatedRoles });
  } catch (e) {
    console.error('Create role error:', e);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

// PUT: 기존 역할 수정 (label, description, color)
export async function PUT(req) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return Response.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json();
    const { key, label, description, color } = body;

    if (!key) {
      return Response.json({ success: false, error: '수정할 권한 코드가 지정되지 않았습니다.' }, { status: 400 });
    }
    if (!label || !label.trim()) {
      return Response.json({ success: false, error: '권한명을 입력해주세요.' }, { status: 400 });
    }

    const currentRoles = await getStoredRoles();
    const targetIdx = currentRoles.findIndex(r => r.key === key);

    if (targetIdx === -1) {
      return Response.json({ success: false, error: '해당 권한을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 다른 권한과 label 중복 체크
    if (currentRoles.some((r, idx) => idx !== targetIdx && r.label.toLowerCase() === label.trim().toLowerCase())) {
      return Response.json({ success: false, error: `이미 사용 중인 권한명입니다 (${label}).` }, { status: 400 });
    }

    const existingRole = currentRoles[targetIdx];
    const updatedRole = {
      ...existingRole,
      label: label.trim(),
      description: description !== undefined ? description.trim() : existingRole.description,
      color: color ? color.trim() : existingRole.color,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.username
    };

    const updatedRoles = [...currentRoles];
    updatedRoles[targetIdx] = updatedRole;

    await prisma.system_settings.upsert({
      where: { key: 'system_roles' },
      create: { key: 'system_roles', value: JSON.stringify(updatedRoles), updatedBy: currentUser.username },
      update: { value: JSON.stringify(updatedRoles), updatedBy: currentUser.username }
    });

    await writeAuditLog(req, {
      action: 'ROLE_UPDATE',
      page: '/manage/roles',
      details: `권한 정보 수정: ${key} (명칭: ${updatedRole.label})`
    });

    return Response.json({ success: true, role: updatedRole, roles: updatedRoles });
  } catch (e) {
    console.error('Update role error:', e);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

// DELETE: 역할 삭제
export async function DELETE(req) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return Response.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const fallbackRole = searchParams.get('fallbackRole') || 'USER';

    if (!key) {
      return Response.json({ success: false, error: '삭제할 권한 코드가 지정되지 않았습니다.' }, { status: 400 });
    }

    const currentRoles = await getStoredRoles();
    const targetRole = currentRoles.find(r => r.key === key);

    if (!targetRole) {
      return Response.json({ success: false, error: '존재하지 않는 권한입니다.' }, { status: 404 });
    }

    if (targetRole.isSystem || ['ADMIN', 'SALES', 'USER'].includes(key)) {
      return Response.json({ success: false, error: '시스템 기본 권한(ADMIN, SALES, USER)은 삭제할 수 없습니다.' }, { status: 400 });
    }

    // 해당 권한을 사용 중인 사용자 수 확인 및 대체 권한으로 이전
    const assignedUserCount = await prisma.user.count({ where: { role: key } });
    if (assignedUserCount > 0) {
      await prisma.user.updateMany({
        where: { role: key },
        data: { role: fallbackRole }
      });
    }

    const updatedRoles = currentRoles.filter(r => r.key !== key);

    await prisma.system_settings.upsert({
      where: { key: 'system_roles' },
      create: { key: 'system_roles', value: JSON.stringify(updatedRoles), updatedBy: currentUser.username },
      update: { value: JSON.stringify(updatedRoles), updatedBy: currentUser.username }
    });

    // menu_visibility에서도 해당 role key 제거
    try {
      const menuRow = await prisma.system_settings.findUnique({ where: { key: 'menu_visibility' } });
      if (menuRow?.value) {
        const menuConfig = JSON.parse(menuRow.value);
        const updatedMenuConfig = menuConfig.map(m => ({
          ...m,
          visibleTo: m.visibleTo.filter(r => r !== key)
        }));
        await prisma.system_settings.update({
          where: { key: 'menu_visibility' },
          data: { value: JSON.stringify(updatedMenuConfig), updatedBy: currentUser.username }
        });
      }
    } catch (me) {
      console.error('Failed to clean up role from menu config:', me);
    }

    await writeAuditLog(req, {
      action: 'ROLE_DELETE',
      page: '/manage/roles',
      details: `권한 삭제: ${targetRole.label} (${key})${assignedUserCount > 0 ? ` - 소속 사용자 ${assignedUserCount}명을 ${fallbackRole} 권한으로 변경` : ''}`
    });

    return Response.json({
      success: true,
      roles: updatedRoles,
      reassignedUsers: assignedUserCount,
      fallbackRole
    });
  } catch (e) {
    console.error('Delete role error:', e);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}
