// 기존 declarations 의 정규화 결과를 현재 규칙(lib/normalizer.js)으로 다시 계산한다.
//   node scripts/backfill-normalization.mjs            # 드라이런: 바뀔 행 수와 샘플만 출력 (DB 변경 없음)
//   node scripts/backfill-normalization.mjs --apply    # 실제 반영
// API를 다시 호출하지 않고 DB에 저장된 원본 값(rawmtrlNm 등)만 사용한다.
// 동기화와 같은 normalizeData 를 같은 입력으로 호출하므로, 반영 후 동기화가 같은 행을 다시 갱신하지 않는다.
import { PrismaClient } from '@prisma/client';
import { normalizeData } from '../lib/normalizer.js';

const apply = process.argv.includes('--apply');
const BATCH = 1000;
const FIELDS = ['normalizedPackaging', 'normalizedFunctionality', 'searchFunctionality', 'normalizedRawMaterials'];

const prisma = new PrismaClient();
let cursor = 0, scanned = 0, changed = 0;
const samples = [];

try {
  for (;;) {
    const rows = await prisma.declarations.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, rawmtrlNm: true, indvRawmtrlNm: true, frmlcMtrqlt: true, ...Object.fromEntries(FIELDS.map((f) => [f, true])) },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    const updates = [];
    for (const row of rows) {
      // 동기화(buildRecord)와 같은 입력 필드로 호출한다
      const next = normalizeData({ RAWMTRL_NM: row.rawmtrlNm, INDV_RAWMTRL_NM: row.indvRawmtrlNm, FRMLC_MTRQLT: row.frmlcMtrqlt });
      const diff = Object.fromEntries(FIELDS.filter((f) => (row[f] ?? '') !== (next[f] ?? '')).map((f) => [f, next[f]]));
      if (!Object.keys(diff).length) continue;
      changed++;
      if (samples.length < 15 && diff.normalizedFunctionality !== undefined) {
        samples.push({ id: row.id, before: row.normalizedFunctionality, after: diff.normalizedFunctionality });
      }
      updates.push({ id: row.id, data: diff });
    }

    if (apply) {
      for (let i = 0; i < updates.length; i += 50) {
        await Promise.all(updates.slice(i, i + 50).map((u) => prisma.declarations.update({ where: { id: u.id }, data: u.data })));
      }
    }
    console.log(`${scanned}건 확인, ${changed}건 ${apply ? '반영' : '변경 대상'}`);
  }

  console.log(`\n${apply ? '완료' : '드라이런 완료'}: 전체 ${scanned}건 중 ${changed}건 ${apply ? '갱신' : '변경 예정 (--apply 로 반영)'}`);
  console.log('샘플(기능성):');
  samples.forEach((s) => console.log(`  #${s.id}\n    전: ${s.before}\n    후: ${s.after}`));
} finally {
  await prisma.$disconnect();
}
