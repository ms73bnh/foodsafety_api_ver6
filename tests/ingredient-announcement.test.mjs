import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFskTitle,
  parseOfficialIngredientPost,
  parseOfficialPdfAttachment,
} from '../lib/foodSafetyIngredientAnnouncement.js';

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

test('separates the unwrapped first line from subsequent official announcement fields', () => {
  const markup = `<div id="_post"><p id="bdt_pre"><html><body>
    <strong><span>○ 원료명 : 고소애가수분해물</span></strong>
    <div><strong>○ 인정번호 : 제2026-25호(2026.8.26.)</strong></div>
    <div><strong>○ 업체명 : 주식회사 한미양행</strong></div>
    <div><strong>○ 기능성내용 : 노화로 인해 감소될 수 있는 근력 유지에 도움을 줄 수 있음</strong></div>
    <div><strong>○ 일일섭취량 : 고소애가수분해물로서 2,000 mg/일</strong></div>
    <div><strong>○ 섭취 시 주의사항</strong></div>
    <div><strong>&nbsp; - 갑각류 알레르기가 있는 분은 섭취에 주의할 것</strong></div>
  </body></html></p></div>`;
  const parsed = parseOfficialIngredientPost(markup, '제2026-25호');

  assert.equal(parsed.name, '고소애가수분해물');
  assert.equal(parsed.recogNo, '제2026-25호');
  assert.equal(parsed.company, '주식회사 한미양행');
  assert.equal(parsed.fnText, '노화로 인해 감소될 수 있는 근력 유지에 도움을 줄 수 있음');
  assert.equal(parsed.dailyIntake, '고소애가수분해물로서 2,000 mg/일');
  assert.equal(parsed.precautions, '- 갑각류 알레르기가 있는 분은 섭취에 주의할 것');
});

test('parses multiline functionality when the source omits the label colon', () => {
  const markup = `<div id="_post"><p id="bdt_pre"><html><body>
    <div><strong>○ 원료명 : 병풀추출분말</strong></div>
    <div><strong>○ 인정번호 : 제2025-37호</strong></div>
    <div><strong>○ 기능성내용</strong></div>
    <div>- 눈 건강에 도움을 줄 수 있음</div>
    <div>- 간 건강에 도움을 줄 수 있음</div>
    <div><strong>○ 일일섭취량 : 300 mg/일</strong></div>
  </body></html></p></div>`;
  const parsed = parseOfficialIngredientPost(markup, '제2025-37호');

  assert.equal(parsed.fnText, '- 눈 건강에 도움을 줄 수 있음\n- 간 건강에 도움을 줄 수 있음');
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

test('extracts official PDF metadata from the board list or the post download link', () => {
  const listedFile = {
    fileList: [{
      file_type_cd: 'pdf',
      file_path: '/upload/20260922',
      physic_file_nm: '20260922100051_notice.pdf',
      logic_file_nm: '제2026-27호 원료 리포트.pdf',
      ecm_file_no: '1Q37KFUpprO',
    }],
  };
  const expected = {
    attachmentName: '제2026-27호 원료 리포트.pdf',
    filePath: '/upload/20260922',
    fileName: '20260922100051_notice.pdf',
    orgFileName: '제2026-27호 원료 리포트.pdf',
    fileTypeCd: 'pdf',
    ecmFileNo: '1Q37KFUpprO',
  };
  assert.deepEqual(parseOfficialPdfAttachment(listedFile), expected);

  const detailHtml = `<a href="javascript:downloadFile('/upload/20260922', '20260922100051_notice.pdf', '제2026-27호 원료 리포트.pdf', 'pdf', '1Q37KFUpprO')">다운로드</a>`;
  assert.deepEqual(parseOfficialPdfAttachment({}, detailHtml), expected);
  assert.equal(parseOfficialPdfAttachment({ fileList: [{ file_type_cd: 'hwpx', logic_file_nm: 'notice.hwpx' }] }), null);
});

test('selects the listing recognition number from legacy posts with multiple recognitions', () => {
  const legacyHtml = `
    <div id="_post"><p id="bdt_pre"><html><body><strong>
      ○ 원료명 : 돌외잎주정추출분말<br>
      ○ 인정번호 : 제2013-3호(2013.01.31)(자진반납), 제2013-8호(2013.05.08)<br>
      ○ 기능성내용 : 체지방감소에 도움을 줄 수 있음
    </strong></body></html></p></div>
  `;
  const parsed = parseOfficialIngredientPost(legacyHtml, '제2013-8호');
  assert.equal(parsed.recogNo, '제2013-8호');
  assert.match(parsed.rawText, /제2013-3호.*제2013-8호/);
});
