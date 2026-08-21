import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATEGORIES_MASTER } from '@/lib/category_data';

export const dynamic = 'force-dynamic';

function autoClassify(functionalityText = '', name = '') {
  const matched = [];
  const text = (functionalityText || '') + ' ' + (name || '');

  CATEGORIES_MASTER.forEach(cat => {
    if (cat.name === '멀티비타민') return;
    const hasKeyword = cat.keywords.some(keyword => text.includes(keyword));
    if (hasKeyword) matched.push(cat.name);
  });

  if (!matched.includes('홍삼인삼') && (text.includes('홍삼') || text.includes('인삼'))) {
    matched.push('홍삼인삼');
  }

  return matched.join(', ');
}

// 텍스트 정규화 비교 함수 (괄호, 특수문자 ㈜, 공백 등 단순 표기 차이 무시)
function normalizeForComparison(val = '') {
  return String(val || '')
    .replace(/[\(\)㈜㈲\[\]]/g, '')
    .replace(/주식회사|\(주\)|\(유\)|\(재\)|\(사\)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function isContentEqual(val1 = '', val2 = '') {
  const clean1 = normalizeForComparison(val1);
  const clean2 = normalizeForComparison(val2);
  return clean1 === clean2;
}

// HTML 상세 본문에서 구조화 데이터 파싱
function parseDetailHtml(html = '') {
  // HTML 태그 제거 및 텍스트화
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#034;/g, '"')
    .replace(/\r\n|\r/g, '\n');

  let fnText = '';
  let dailyIntake = '';
  let precautions = '';

  // 1. 기능성 내용 파싱
  const mFn = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:기능성\s*내용|기능성|Functionality)\s*[:：]?\s*)([\s\S]*?)(?=(?:[○*※\-\u25cb\u25a0]?\s*일일\s*섭취량|[○*※\-\u25cb\u25a0]?\s*섭취량|[○*※\-\u25cb\u25a0]?\s*섭취\s*시\s*주의사항|주의사항|○\s*English|\n\s*※|\n\n\n|$))/i);
  if (mFn && mFn[1]) {
    fnText = mFn[1].trim().replace(/\n{2,}/g, '\n');
  }

  // 2. 일일섭취량 파싱
  const mDaily = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:일일\s*섭취량|섭취량|Daily\s*intake)\s*[:：]?\s*)([\s\S]*?)(?=(?:[○*※\-\u25cb\u25a0]?\s*섭취\s*시\s*주의사항|주의사항|기능성|○\s*English|\n\s*※|\n\n\n|$))/i);
  if (mDaily && mDaily[1]) {
    dailyIntake = mDaily[1].trim().replace(/\n{2,}/g, '\n');
  }

  // 3. 섭취 시 주의사항 파싱
  const mPrec = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:섭취\s*시\s*주의사항|주의사항|Precautions)\s*[:：\n]?\s*)([\s\S]*?)(?=(?:○\s*English|※\s*English|○\s*기타|기타사항|첨부파일|\n\n\n\n|$))/i);
  if (mPrec && mPrec[1]) {
    precautions = mPrec[1].trim().replace(/\n{2,}/g, '\n');
  }

  return { fnText, dailyIntake, precautions, rawText: text.trim() };
}

export async function POST(req) {
  try {
    const BASE_URL = 'https://www.foodsafetykorea.go.kr';
    const LIST_AJAX = `${BASE_URL}/portal/board/boardList.do`;
    const DETAIL_URL = `${BASE_URL}/portal/board/boardDetail.do`;

    const BASE_PARAMS = {
      menu_no: '2660',
      menu_grp: 'MENU_NEW01',
      bbs_no: 'bbs987',
      ctgry_no: '1207',
      ctgry_type_cd: 'CTG_TYPE01',
    };

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE_URL}/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // 최신 공시 50건 조회
    const body = new URLSearchParams({ ...BASE_PARAMS, start_idx: '1', show_cnt: '50' });
    const resp = await fetch(LIST_AJAX, { method: 'POST', headers, body: body.toString() });
    if (!resp.ok) throw new Error('식약처 API 응답 오류');
    const json = await resp.json();
    const items = json.list || [];

    let addedCount = 0;
    let updatedCount = 0;
    const changeDetails = [];

    for (const item of items) {
      const title = (item.titl || '').trim();
      const ntctxtNo = String(item.ntctxt_no || '');
      if (!title) continue;

      let companyNm = '';
      let recogNo = '';
      let ingrName = title;

      // 제목 패턴: 원료명 (업체명, 인정번호)
      const m = title.match(/^(.*?)(?:\s*\(\s*([^,\(\)]+?)\s*,\s*([^\)]+)\s*\))?$/);
      if (m && m[2] && m[3]) {
        ingrName = m[1].trim();
        companyNm = m[2].trim();
        recogNo = m[3].trim();
      } else {
        const recogMatch = title.match(/제\s*\d{4}\s*-\s*\d+\s*호/);
        if (recogMatch) recogNo = recogMatch[0].replace(/\s+/g, '');
      }

      if (!recogNo) continue;

      const regDate = (item.cret_dtm || '').substring(0, 10);
      let functionalityText = (item.cntnts || item.fnclty_cntnts || '').trim();
      let dailyIntake = '';
      let precautions = '';
      let detailContent = '';

      // 상세 페이지 호출하여 본문 파싱 (기능성, 일일섭취량, 주의사항)
      if (ntctxtNo) {
        try {
          const detUrl = `${DETAIL_URL}?ntctxt_no=${ntctxtNo}&menu_no=2660&menu_grp=MENU_NEW01&bbs_no=bbs987`;
          const detResp = await fetch(detUrl, {
            headers: {
              'User-Agent': headers['User-Agent'],
              'Referer': headers['Referer']
            }
          });
          if (detResp.ok) {
            const detHtml = await detResp.text();
            const parsed = parseDetailHtml(detHtml);
            if (parsed.fnText) functionalityText = parsed.fnText;
            if (parsed.dailyIntake) dailyIntake = parsed.dailyIntake;
            if (parsed.precautions) precautions = parsed.precautions;
            detailContent = parsed.rawText.substring(0, 2000);
          }
        } catch (detailErr) {
          console.error(`Detail fetch error for ${ntctxtNo}:`, detailErr);
        }
      }

      // 기존 DB 조회
      const existing = await prisma.individual_raw_materials.findUnique({
        where: { recognitionNumber: recogNo }
      });

      if (!existing) {
        // 신규 등록
        const categories = autoClassify(functionalityText, ingrName);
        await prisma.individual_raw_materials.create({
          data: {
            recognitionNumber: recogNo,
            name: ingrName,
            company: companyNm,
            functionalityText: functionalityText || null,
            dailyIntake: dailyIntake || null,
            precautions: precautions || null,
            detailContent: detailContent || null,
            registeredDate: regDate,
            categories,
          }
        });

        await prisma.change_log.create({
          data: {
            prdlstReportNo: recogNo,
            type: 'INGREDIENT_CREATED',
            changes: JSON.stringify({
              name: ingrName,
              company: companyNm,
              recogNo,
              registeredDate: regDate,
              functionalityText,
              dailyIntake,
              precautions,
              action: '신규 개별인정원료 공시 등록'
            })
          }
        });

        addedCount++;
        changeDetails.push({ recogNo, name: ingrName, type: '신규 등록' });
      } else {
        // 기존 원료 변경 사항 비교 (정규화 비교로 단순 괄호/공백 차이 무시)
        const changedFields = [];
        const before = {};
        const after = {};

        // 업체명 비교
        if (companyNm && existing.company && !isContentEqual(existing.company, companyNm)) {
          changedFields.push('업체명');
          before.company = existing.company;
          after.company = companyNm;
        }

        // 기능성 내용 비교
        if (functionalityText && existing.functionalityText && !isContentEqual(existing.functionalityText, functionalityText)) {
          changedFields.push('기능성 내용');
          before.functionalityText = existing.functionalityText;
          after.functionalityText = functionalityText;
        }

        // 일일섭취량 비교
        if (dailyIntake && existing.dailyIntake && !isContentEqual(existing.dailyIntake, dailyIntake)) {
          changedFields.push('일일섭취량');
          before.dailyIntake = existing.dailyIntake;
          after.dailyIntake = dailyIntake;
        }

        // 섭취시 주의사항 비교
        if (precautions && existing.precautions && !isContentEqual(existing.precautions, precautions)) {
          changedFields.push('섭취시 주의사항');
          before.precautions = existing.precautions;
          after.precautions = precautions;
        }

        // 기존에 비어있던 필드 채우기 or 실제 변경 업데이트
        const needUpdate = changedFields.length > 0 ||
          (!existing.dailyIntake && dailyIntake) ||
          (!existing.precautions && precautions) ||
          (!existing.functionalityText && functionalityText);

        if (needUpdate) {
          await prisma.individual_raw_materials.update({
            where: { recognitionNumber: recogNo },
            data: {
              company: companyNm || existing.company,
              functionalityText: functionalityText || existing.functionalityText,
              dailyIntake: dailyIntake || existing.dailyIntake,
              precautions: precautions || existing.precautions,
              detailContent: detailContent || existing.detailContent,
              categories: autoClassify(functionalityText || existing.functionalityText, existing.name || ingrName),
            }
          });

          if (changedFields.length > 0) {
            await prisma.change_log.create({
              data: {
                prdlstReportNo: recogNo,
                type: 'INGREDIENT_UPDATED',
                changes: JSON.stringify({
                  name: existing.name || ingrName,
                  recogNo,
                  changedFields,
                  before,
                  after,
                  action: '개별인정원료 항목 변경'
                })
              }
            });

            updatedCount++;
            changeDetails.push({ recogNo, name: existing.name, type: '항목 수정', changedFields });
          }
        }
      }
    }

    const total = await prisma.individual_raw_materials.count();

    return NextResponse.json({
      success: true,
      message: `개별인정형 원료 동기화 완료: ${addedCount}건 신규 등록, ${updatedCount}건 변경 반영 (총 ${total}건)`,
      addedCount,
      updatedCount,
      total,
      changeDetails,
    });
  } catch (error) {
    console.error('Ingredient Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
