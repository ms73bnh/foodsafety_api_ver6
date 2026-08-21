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

export async function POST(req) {
  try {
    const BASE_URL = 'https://www.foodsafetykorea.go.kr';
    const LIST_AJAX = `${BASE_URL}/portal/board/boardList.do`;

    const BASE_PARAMS = {
      menu_no: '2660',
      menu_grp: 'MENU_NEW01',
      bbs_no: 'bbs987',
      ctgry_no: '1207',
      ctgry_type_cd: 'CTG_TYPE01',
    };

    const headers = {
      'User-Agent': 'Mozilla/5.0',
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
      if (!title) continue;

      let companyNm = '';
      let recogNo = '';
      let ingrName = title;

      // 제목 패턴 예: Lacticaseibacillus ...(주식회사 헥토헬스케어, 제2026-22호)
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
      const functionalityText = (item.cntnts || item.fnclty_cntnts || '').trim();

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
            functionalityText,
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
              action: '신규 개별인정원료 공시 등록'
            })
          }
        });

        addedCount++;
        changeDetails.push({ recogNo, name: ingrName, type: '신규 등록' });
      } else {
        // 변경 사항 비교 (회사명, 기능성 등)
        const changedFields = [];
        const before = {};
        const after = {};

        if (companyNm && existing.company !== companyNm) {
          changedFields.push('업체명');
          before.company = existing.company;
          after.company = companyNm;
        }

        if (functionalityText && existing.functionalityText !== functionalityText) {
          changedFields.push('기능성 내용');
          before.functionalityText = existing.functionalityText;
          after.functionalityText = functionalityText;
        }

        if (changedFields.length > 0) {
          await prisma.individual_raw_materials.update({
            where: { recognitionNumber: recogNo },
            data: {
              company: companyNm || existing.company,
              functionalityText: functionalityText || existing.functionalityText,
              categories: autoClassify(functionalityText || existing.functionalityText, existing.name || ingrName),
            }
          });

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
