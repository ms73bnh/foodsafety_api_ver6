import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, parseIngredientList, ingredientLabels } from '../lib/ingredientNormalizer.mjs';
import canonicalMap from '../lib/ingredientCanonicalMap.mjs';
import { normalizeData } from '../lib/normalizer.js';

const keyOf = (raw) => parseIngredient(raw)?.keys.join('|');

test('같은 승인번호는 표기가 달라도 같은 원료', () => {
  const keys = new Set([
    keyOf('자일로올리고당분말(제2009-80호)'),
    keyOf('자일로올리고당(제 2009 - 80 호)'),
    keyOf('자일로올리고당(기능성원료인정제2009-80호)'),
    keyOf('자일로올리고당(Xylooligosaccharide) 분말(제2009-80호, 2009.10.21.)'),
  ]);
  assert.deepEqual([...keys], ['AP:2009-80']);
});

test('승인번호가 다르면 다른 원료', () => {
  assert.notEqual(keyOf('자일로올리고당(제2009-80호)'), keyOf('자일로올리고당(제2009-81호)'));
});

test('승인번호 없는 자일로올리고당과 분말은 별도 원료', () => {
  assert.notEqual(keyOf('자일로올리고당'), keyOf('자일로올리고당분말'));
});

test('승인번호 있는 원료는 승인번호 없는 원료와 별도', () => {
  assert.notEqual(keyOf('자일로올리고당분말'), keyOf('자일로올리고당분말(제2009-80호)'));
});

test('영문명 괄호는 괄호 없는 이름과 같은 원료', () => {
  assert.equal(keyOf('자일로올리고당(xylooligosaccharide)'), keyOf('자일로올리고당'));
  assert.equal(keyOf('자일로올리고당(Xylooligosaccharide) 분말'), keyOf('자일로올리고당 분말'));
  assert.equal(keyOf('비타민 D'), keyOf('비타민D'));
});

test('한 괄호에 승인번호가 여러 개면 각각의 키를 가진다', () => {
  const parsed = parseIngredient('자일로올리고당(HCN, 제2009-80호, HCN, 제2009-81호)');
  assert.deepEqual(parsed.keys, ['AP:2009-80', 'AP:2009-81']);
  assert.equal(parsed.kind, 'individual');
});

test('알 수 없는 한글 괄호는 키에 남기고 검토 대상으로 표시', () => {
  const parsed = parseIngredient('홍삼(6년근)');
  assert.equal(parsed.needsReview, true);
  assert.notEqual(parsed.keys[0], keyOf('홍삼'));
});

test('구형 표기 (2006-4) 도 승인번호로 인식하고 제2006-4호와 같은 원료', () => {
  assert.equal(keyOf('폴리코사놀-사탕수수 왁스알코올(2006-4)'), 'AP:2006-4');
  assert.equal(keyOf('폴리코사놀(제2006-4호)'), 'AP:2006-4');
  assert.deepEqual(parseIngredient('대웅 코엔자임 Q10(2007-19, 2008-36)').keys, ['AP:2007-19', 'AP:2008-36']);
  assert.equal(keyOf('표고버섯균사체 AHCC(2008-78호)'), 'AP:2008-78');
});

test('(원료성)·제품 접미사는 같은 원료로 합친다', () => {
  assert.equal(keyOf('홍삼(원료성)'), keyOf('홍삼'));
  assert.equal(keyOf('코엔자임Q10제품'), keyOf('코엔자임Q10'));
  assert.equal(keyOf('밀크씨슬(카르두스 마리아누스) 추출물 제품'), keyOf('밀크씨슬 추출물'));
  assert.equal(keyOf('바나바잎 추출물 (원료성)'), keyOf('바나바잎추출물'));
  assert.deepEqual(parseIngredient('홍삼(원료성)').markers, ['원료성']);
  // 승인번호 있는 원료의 접미사는 승인번호 그룹에 영향이 없다
  assert.equal(keyOf('자일로올리고당분말(원료성)(제2009-80호)'), 'AP:2009-80');
});

test('별칭 괄호는 키에서 빠지고 aliases로 남는다', () => {
  assert.equal(keyOf('셀레늄(또는 셀렌)'), 'NM:셀레늄');
  assert.deepEqual(parseIngredient('셀레늄(또는 셀렌)').aliases, ['또는 셀렌']);
  const msm = parseIngredient('엠에스엠(MSM, Methyl sulfonylmethane, 디메틸설폰)');
  assert.equal(msm.keys[0], 'NM:엠에스엠');
  assert.equal(msm.needsReview, false);
  assert.equal(keyOf('NAG(엔에이지, N-아세틸글루코사민, N-Acetylglucosamine)'), 'NM:nag');
  assert.equal(keyOf('서목태(쥐눈이콩)펩타이드'), keyOf('서목태펩타이드(쥐눈이콩)'));
});

test('승인번호 없는 개별인정형 이름은 승인번호 원료와 별도', () => {
  assert.notEqual(keyOf('HK 나토배양물'), keyOf('HK 나토배양물(제2009-50호)'));
});

test('한 글자 한글 원료(철)는 노이즈가 아니다', () => {
  assert.equal(keyOf('철'), 'NM:철');
  assert.equal(parseIngredient('a'), null);
  assert.equal(parseIngredient('1'), null);
});

test('목록 파싱은 괄호 안 쉼표를 나누지 않고 중복을 제거한다', () => {
  const list = parseIngredientList('아연, 자일로올리고당(HCN, 제2009-80호), 자일로올리고당분말(제2009-80호), 10, 100mg');
  assert.deepEqual(list.map((i) => i.keys.join('|')), ['NM:아연', 'AP:2009-80']);
});

test('라벨: 같은 승인번호는 대표명 하나로, 승인번호 없는 이름은 별도 라벨', () => {
  const canonical = { approvals: { '2009-80': '자일로올리고당 분말' }, names: {} };
  const { labels } = ingredientLabels('자일로올리고당(xylooligosaccharide) 분말(제2009-80호), 자일로올리고당(기능성원료인정제2009-80호), 자일로올리고당분말, 자일로올리고당', canonical);
  assert.deepEqual(labels, ['자일로올리고당 분말(제2009-80호)', '자일로올리고당분말', '자일로올리고당']);
});

test('라벨: 맵에 없는 승인번호는 입력 이름을 쓰고 쉼표는 라벨에 남기지 않는다', () => {
  const { labels } = ingredientLabels('신규원료(제2030-1호)', canonicalMap);
  assert.deepEqual(labels, ['신규원료(제2030-1호)']);
  assert.ok(labels.every((l) => !l.includes(',')));
});

test('normalizeData: 새 규칙이 동기화 출력에 반영된다 (실제 대표명 맵)', () => {
  const result = normalizeData({
    RAWMTRL_NM: '셀레늄(또는 셀렌), 홍삼(원료성), 홍삼제품, 철, 자일로올리고당분말(기능성원료인정제2009-80호), 비타민D, 비타민 D',
    FRMLC_MTRQLT: 'PE',
  });
  assert.equal(result.normalizedFunctionality, '셀레늄, 홍삼, 철, 자일로올리고당 분말(제2009-80호), 비타민 D');
  assert.equal(result.searchFunctionality, '셀레늄,홍삼,철,자일로올리고당분말(제2009-80호),비타민d');
  assert.deepEqual(Object.keys(result).sort(), ['normalizedFunctionality', 'normalizedPackaging', 'normalizedRawMaterials', 'searchFunctionality']);
});

test('normalizeData: 원료가 없으면 빈 문자열', () => {
  assert.equal(normalizeData({}).normalizedFunctionality, '');
});

test('별칭으로만 표기된 이름은 대표 원료로 합쳐진다 (실제 대표명 맵)', () => {
  const { labels } = ingredientLabels('엠에스엠(MSM, Methyl sulfonylmethane, 디메틸설폰), 디메틸설폰, 셀레늄(또는 셀렌), 셀렌, 서목태(쥐눈이콩)펩타이드', canonicalMap);
  assert.deepEqual(labels, ['엠에스엠', '셀레늄', '서목태펩타이드']);
  // 쥐눈이콩 같은 한글 괄호 별칭은 독립 이름으로 쓰이지 않는다
  assert.equal(ingredientLabels('쥐눈이콩', canonicalMap).labels[0], '쥐눈이콩');
});
