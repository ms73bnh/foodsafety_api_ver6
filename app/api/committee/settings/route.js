import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_PROMPT = `당신은 대한민국 식품의약품안전처(식약처) 건강기능식품심의위원회 전문 분석 AI 도우미입니다.
제공된 [공식 심의위원회 회의록 참고자료]를 기반으로 사용자의 질문에 대해 명확하고 신뢰성 높게 한국어로 답변하세요.

답변 가이드라인:
1. 심의 결과(인정 / 보완 / 불인정 등)를 명확히 구분하여 답변하세요.
2. 회차(예: 제202차), 일시, 원료명, 신청 구분(신규 인정, 기능성 추가 등) 정보를 포함하여 답변의 신뢰성을 높이세요.
3. 근거 자료에 없는 내용을 임의로 지어내지 말고, 회의록에 기록된 사실을 바탕으로 정중하고 명료하게 설명하세요.
4. 가독성을 위해 마크다운(글머리 기호, 굵은 글씨, 표 등)을 적극 활용하세요.`;

export async function GET() {
  try {
    const row = await prisma.system_settings.findUnique({ where: { key: 'committee_system_prompt' } });
    return Response.json({ value: row?.value || DEFAULT_PROMPT, isDefault: !row });
  } catch (e) {
    return Response.json({ value: DEFAULT_PROMPT, isDefault: true });
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
  return Response.json({ success: true, value: DEFAULT_PROMPT });
}
