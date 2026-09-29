import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFskTitle, parseOfficialIngredientPost } from '../lib/foodSafetyIngredientAnnouncement.js';

const articleHtml = `
  <nav>메뉴 텍스트</nav>
  <div class="view-container">
    <h4 class="view_title">블랙라즈베리한속단추출복합분말(㈜나일랜드, 제2026-27호)</h4>
    <div class="post" id="_post">
      <p id="bdt_pre">
        <html><head></head><body>
          <div><strong>○ 원료명 : 블랙라즈베리한속단추출복합분말</strong></div>
          <div><strong>○ 인정번호 : 제2026-27호(2026.8.26.)</strong></div>
          <div><strong>○ 업체명 : ㈜나일랜드</strong></div>
          <div><strong>○ 기능성내용 : 노화로 인해 감소될 수 있는 근력 유지에 도움을 줄 수 있음</strong></div>
          <div><strong>○ 일일섭취량 : 블랙라즈베리한속단추출복합분말로서 1,813 mg/일</strong></div>
          <div><strong>○ 섭취 시 주의사항</strong></div>
          <div><strong>&nbsp; &nbsp;- 영･유아, 어린이, 임산부 및 수유부는 섭취를 피할 것</strong></div>
          <div><strong>&nbsp; &nbsp;- 특정 질환(알레르기 체질)이 있는 분은 섭취에 주의할 것</strong></div>
          <div><strong>&nbsp; &nbsp;- 이상사례 발생 시 섭취를 중단하고 전문가와 상담할 것</strong></div>
          <div><strong>※ English version ※</strong></div>
          <div><strong>○ Ingredient name : Extract complex of Black raspberry and Phlomis umbrosa</strong></div>
          <div><strong>○ Recognition Number : 2026-27(2026.8.26.)</strong></div>
          <div><strong>○ Company or institution : NILELAND CO., LTD.</strong></div>
          <div><strong>○ Functionality of the ingredient : May help to maintain muscle strength which can be affected by aging</strong></div>
          <div><strong>○ Daily intake amount : 1,813 mg/day</strong></div>
        </body></html>
      </p>
    </div>
  </div>
  <div class="file-container">첨부파일 PDF 이름</div>
`;

test('parses only the official announcement body and its Korean ingredient fields', () => {
  const parsed = parseOfficialIngredientPost(articleHtml);

  assert.equal(parsed.name, '블랙라즈베리한속단추출복합분말');
  assert.equal(parsed.recogNo, '제2026-27호');
  assert.equal(parsed.company, '㈜나일랜드');
  assert.equal(parsed.fnText, '노화로 인해 감소될 수 있는 근력 유지에 도움을 줄 수 있음');
  assert.equal(parsed.dailyIntake, '블랙라즈베리한속단추출복합분말로서 1,813 mg/일');
  assert.equal(parsed.precautions, [
    '- 영･유아, 어린이, 임산부 및 수유부는 섭취를 피할 것',
    '- 특정 질환(알레르기 체질)이 있는 분은 섭취에 주의할 것',
    '- 이상사례 발생 시 섭취를 중단하고 전문가와 상담할 것',
  ].join('\n'));
  assert.match(parsed.rawText, /Extract complex of Black raspberry and Phlomis umbrosa/);
  assert.doesNotMatch(parsed.rawText, /메뉴 텍스트|첨부파일 PDF 이름|view_title/);
});

test('parses titles with nested company parentheses and refuses pages without the post body', () => {
  assert.deepEqual(
    parseFskTitle('블랙라즈베리한속단추출복합분말(㈜나일랜드, 제2026-27호)'),
    { ingrName: '블랙라즈베리한속단추출복합분말', companyNm: '㈜나일랜드', recogNo: '제2026-27호' }
  );
  assert.deepEqual(
    parseFskTitle('프로바이오틱스 복합물(CKDB-322)(㈜종근당바이오, 제2026-19호)'),
    { ingrName: '프로바이오틱스 복합물(CKDB-322)', companyNm: '㈜종근당바이오', recogNo: '제2026-19호' }
  );
  assert.throws(() => parseOfficialIngredientPost('<div>게시물 본문 없음</div>'), /#bdt_pre/);
});
