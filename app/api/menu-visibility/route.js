import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_MENU_CONFIG, getStoredMenuConfig } from '@/lib/menu-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await getStoredMenuConfig());
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
