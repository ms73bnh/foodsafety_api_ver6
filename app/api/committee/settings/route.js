import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_COMMITTEE_SYSTEM_PROMPT } from '@/lib/committeePrompt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const row = await prisma.system_settings.findUnique({ where: { key: 'committee_system_prompt' } });
    return Response.json({ value: row?.value || DEFAULT_COMMITTEE_SYSTEM_PROMPT, isDefault: !row });
  } catch (e) {
    return Response.json({ value: DEFAULT_COMMITTEE_SYSTEM_PROMPT, isDefault: true });
  }
}

export async function POST(req) {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return Response.json({ error: '관리자 권한이 필요합니다. (로그인 세션을 확인하세요)' }, { status: 403 });
    }
    const { value } = await req.json();
    if (!value || !value.trim()) {
      return Response.json({ error: '프롬프트 내용이 비어있습니다.' }, { status: 400 });
    }
    await prisma.system_settings.upsert({
      where: { key: 'committee_system_prompt' },
      create: { key: 'committee_system_prompt', value: value.trim(), updatedBy: currentUser.username },
      update: { value: value.trim(), updatedBy: currentUser.username },
    });
    return Response.json({ success: true });
  } catch (e) {
    console.error('Settings POST error:', e);
    return Response.json({ error: e.message || '저장 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }
  await prisma.system_settings.deleteMany({ where: { key: 'committee_system_prompt' } });
  return Response.json({ success: true, value: DEFAULT_COMMITTEE_SYSTEM_PROMPT });
}
