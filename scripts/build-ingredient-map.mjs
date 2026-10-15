// 원료 대표명 맵 생성: node scripts/build-ingredient-map.mjs <원본.csv | db>
//  - 승인번호별, 이름 키별로 가장 많이 쓰인 표기를 대표명으로 정해 lib/ingredientCanonicalMap.mjs 를 만든다.
//  - csv: 앱에서 내보낸 원본 CSV(품목유형(기능지표성분) 컬럼 사용), db: declarations.rawmtrlNm 사용(DB 접속 필요)
//  - 생성 파일은 수동으로 고쳐도 되지만 다시 생성하면 덮어써진다. 고정하고 싶은 대표명은 OVERRIDES에 넣는다.
import fs from 'node:fs';
import { parseIngredientList, nameKeyOf } from '../lib/ingredientNormalizer.mjs';

// 확정된 대표명. 생성 결과보다 우선한다. 예: { approvals: { '2009-80': '자일로올리고당분말' }, names: {} }
const OVERRIDES = { approvals: {}, names: {}, aliases: {} };

function parseRecord(rec) {
  const row = [];
  let field = '', inQ = false;
  for (let i = 0; i < rec.length; i++) {
    const c = rec[i];
    if (inQ) {
      if (c === '"') { if (rec[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else field += c;
  }
  row.push(field);
  return row;
}

// 레코드는 따옴표로 감싼 품목제조번호로 시작한다 (필드 안의 줄바꿈 때문에 줄 단위로 나눌 수 없다)
function readCsvColumn(path, column) {
  const text = fs.readFileSync(path, 'utf8').replace(/^﻿/, '');
  const head = text.indexOf('\n');
  const header = parseRecord(text.slice(0, head).replace(/\r$/, ''));
  const col = header.indexOf(column);
  if (col < 0) throw new Error(`CSV에 '${column}' 컬럼이 없습니다.`);
  return text.slice(head + 1).replace(/\r\n/g, '\n').split(/\n(?="\d{8,}",")/)
    .map((r) => parseRecord(r.replace(/\n$/, '')))
    .filter((r) => r.length === header.length)
    .map((r) => r[col] || '');
}

async function readDbColumn() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.declarations.findMany({ select: { rawmtrlNm: true } });
    return rows.map((r) => r.rawmtrlNm || '');
  } finally {
    await prisma.$disconnect();
  }
}

const source = process.argv[2];
if (!source) {
  console.error('사용법: node scripts/build-ingredient-map.mjs <원본.csv | db>');
  process.exit(1);
}
const texts = source === 'db' ? await readDbColumn() : readCsvColumn(source, '품목유형(기능지표성분)');

const tally = (map, group, spelling) => {
  let spellings = map.get(group);
  if (!spellings) map.set(group, spellings = new Map());
  spellings.set(spelling, (spellings.get(spelling) || 0) + 1);
};
const approvals = new Map(); // 승인번호 → 이름그룹 → 표기 → 건수
const names = new Map();     // NM 키 → 표기 → 건수
const aliasVotes = new Map(); // 별칭 키 → 대표 키 → 건수 (별칭 괄호에서 학습: 셀레늄(또는 셀렌), 엠에스엠(…, 디메틸설폰))
for (const text of texts) {
  for (const item of parseIngredientList(text)) {
    if (item.kind === 'individual') {
      if (item.approvalNos.length !== 1 || !item.baseName) continue; // 번호 여러 개인 토큰은 이름 귀속이 모호하다
      const no = item.approvalNos[0];
      let groups = approvals.get(no);
      if (!groups) approvals.set(no, groups = new Map());
      tally(groups, item.baseName.replace(/\s+/g, '').toLowerCase(), item.baseName);
    } else {
      tally(names, item.keys[0], item.displayName);
      for (const alias of item.aliases) {
        const aliasKey = nameKeyOf(alias.replace(/^또는\s+/, ''));
        if (aliasKey !== item.keys[0]) tally(aliasVotes, aliasKey, item.keys[0]);
      }
    }
  }
}

const top = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
const out = { approvals: {}, names: {}, aliases: {} };
for (const [no, groups] of [...approvals.entries()].sort()) {
  const best = [...groups.values()].sort((a, b) => [...b.values()].reduce((x, y) => x + y) - [...a.values()].reduce((x, y) => x + y))[0];
  out.approvals[no] = top(best);
}
for (const [key, spellings] of [...names.entries()].sort()) out.names[key] = top(spellings);
for (const [aliasKey, targets] of [...aliasVotes.entries()].sort()) out.aliases[aliasKey] = top(targets);
Object.assign(out.approvals, OVERRIDES.approvals);
Object.assign(out.names, OVERRIDES.names);
Object.assign(out.aliases, OVERRIDES.aliases);

const target = new URL('../lib/ingredientCanonicalMap.mjs', import.meta.url);
fs.writeFileSync(target, `// 자동 생성: scripts/build-ingredient-map.mjs (${new Date().toISOString().slice(0, 10)})\n// 승인번호·이름 키별 대표명. 맵에 없는 원료는 입력 표기를 그대로 쓴다.\nexport default ${JSON.stringify(out, null, 1)};\n`);
console.log(`승인번호 ${Object.keys(out.approvals).length}개, 이름 ${Object.keys(out.names).length}개, 별칭 ${Object.keys(out.aliases).length}개 → lib/ingredientCanonicalMap.mjs`);
