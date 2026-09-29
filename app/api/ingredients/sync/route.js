import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATEGORIES_MASTER } from '@/lib/category_data';
import { parseFskTitle, parseOfficialIngredientPost } from '@/lib/foodSafetyIngredientAnnouncement';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

function parseDetailHtml(html = '') {
  return parseOfficialIngredientPost(html);
}

async function fetchFskPage(page = 1, showCnt = 50, headers) {
  const LIST_AJAX = 'https://www.foodsafetykorea.go.kr/portal/board/boardList.do';
  const body = new URLSearchParams({
    menu_no: '2660',
    menu_grp: 'MENU_NEW01',
    bbs_no: 'bbs987',
    ctgry_no: '1207',
    ctgry_type_cd: 'CTG_TYPE01',
    start_idx: String(page),
    show_cnt: String(showCnt),
  });

  const resp = await fetch(LIST_AJAX, {
    method: 'POST',
    headers,
    body: body.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`식약처 API 응답 오류 (page ${page}): ${resp.status}`);
  const json = await resp.json();
  if (!Array.isArray(json.list)) throw new Error(`식약처 목록 응답 형식이 올바르지 않습니다 (page ${page}).`);
  return json;
}

async function fetchFskDetail(ntctxtNo, recogNo, headers) {
  const detailUrl = new URL('https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do');
  detailUrl.search = new URLSearchParams({
    ntctxt_no: ntctxtNo,
    menu_no: '2660',
    menu_grp: 'MENU_NEW01',
    bbs_no: 'bbs987',
  }).toString();

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(detailUrl, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`식약처 상세 응답 오류 (${response.status})`);

      const parsed = parseDetailHtml(await response.text());
      if (!parsed.rawText || (parsed.recogNo && parsed.recogNo !== recogNo)) {
        throw new Error(`식약처 상세 본문이 비었거나 인정번호가 일치하지 않습니다 (${recogNo}).`);
      }
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }

  throw new Error(`식약처 상세 게시물을 가져오지 못했습니다 (${recogNo}, ${ntctxtNo}): ${lastError?.message || '알 수 없는 오류'}`);
}

export async function POST(req) {
  try {
    const BASE_URL = 'https://www.foodsafetykorea.go.kr';

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE_URL}/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // ────────────────────────────────────────────────────────────
    // STEP 1: 식약처 전체 공시 목록 병렬 수집
    // ────────────────────────────────────────────────────────────
    const showCnt = 50;
    const firstJson = await fetchFskPage(1, showCnt, headers);
    const totalCnt = parseInt(firstJson.total_cnt || '0', 10);
    if (!Number.isInteger(totalCnt) || totalCnt < 1 || totalCnt > 10000) {
      throw new Error(`식약처 공시 게시물 수가 유효하지 않습니다: ${firstJson.total_cnt}`);
    }
    const totalPages = Math.ceil(totalCnt / showCnt);

    const pagePromises = [];
    for (let p = 2; p <= totalPages; p++) {
      pagePromises.push(fetchFskPage(p, showCnt, headers));
    }
    const otherPages = await Promise.all(pagePromises);

    const allFskItems = [firstJson, ...otherPages].flatMap(page => page.list);
    const uniquePostNumbers = new Set(allFskItems.map(item => String(item.ntctxt_no || '')));
    if (
      allFskItems.length !== totalCnt ||
      uniquePostNumbers.size !== totalCnt ||
      uniquePostNumbers.has('')
    ) {
      throw new Error(`식약처 공시 목록이 불완전합니다 (전체 ${totalCnt}건 중 고유 게시물 ${uniquePostNumbers.size}건). 동기화를 중단합니다.`);
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: 인정번호 기준으로 FSK 맵 구성
    // ────────────────────────────────────────────────────────────
    const fskMap = new Map(); // recognitionNumber → parsed item
    const fskRecogSet = new Set();

    for (const item of allFskItems) {
      const { ingrName, companyNm, recogNo } = parseFskTitle(item.titl);
      if (!recogNo) continue;
      fskRecogSet.add(recogNo);
      if (!fskMap.has(recogNo)) {
        fskMap.set(recogNo, {
          name: ingrName,
          company: companyNm,
          recogNo,
          regDate: (item.cret_dtm || '').substring(0, 10),
          functionalityText: (item.cntnts || item.fnclty_cntnts || '').trim(),
          ntctxtNo: String(item.ntctxt_no || ''),
          rawTitle: item.titl,
        });
      }
    }
    if (fskMap.size !== totalCnt) {
      throw new Error(`식약처 공시 중 인정번호를 확인할 수 없는 게시물이 있습니다 (${fskMap.size}/${totalCnt}). 동기화를 중단합니다.`);
    }

    // Always re-read the official post body so edits to existing MFDS announcements are applied.
    const fskItemsArray = Array.from(fskMap.entries());
    const detailedFskItems = new Map();
    const CONCURRENCY = 15;
    for (let i = 0; i < fskItemsArray.length; i += CONCURRENCY) {
      const batch = fskItemsArray.slice(i, i + CONCURRENCY);
      const details = await Promise.all(batch.map(async ([recogNo, fskItem]) => {
        if (!fskItem.ntctxtNo) {
          throw new Error(`식약처 공시 게시물 번호가 없습니다 (${recogNo}). 동기화를 중단합니다.`);
        }
        return [recogNo, await fetchFskDetail(fskItem.ntctxtNo, recogNo, headers)];
      }));
      details.forEach(([recogNo, detail]) => detailedFskItems.set(recogNo, detail));
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: 현재 DB 전체 조회
    // ────────────────────────────────────────────────────────────
    const currentDbItems = await prisma.individual_raw_materials.findMany();
    const dbRecogMap = new Map(currentDbItems.map(d => [d.recognitionNumber, d]));

    let addedCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    const changeDetails = [];

    // ────────────────────────────────────────────────────────────
    // STEP 4: 상세 페이지 동시성(Concurrency) 제어 병렬 수집 & DB 1:1 동기화
    // ────────────────────────────────────────────────────────────
    for (let i = 0; i < fskItemsArray.length; i += CONCURRENCY) {
      const batch = fskItemsArray.slice(i, i + CONCURRENCY);

      await Promise.all(batch.map(async ([recogNo, fskItem]) => {
        const parsedDetail = detailedFskItems.get(recogNo);
        const functionalityText = parsedDetail.fnText || fskItem.functionalityText;
        const dailyIntake = parsedDetail.dailyIntake;
        const precautions = parsedDetail.precautions;
        const detailContent = parsedDetail.rawText;
        const existing = dbRecogMap.get(recogNo);
        const finalName = parsedDetail?.name || fskItem.name;
        const finalCompany = parsedDetail?.company || fskItem.company || '';

        if (!existing) {
          // ── 신규 등록 ──
          const categories = autoClassify(functionalityText, finalName);
          await prisma.individual_raw_materials.create({
            data: {
              recognitionNumber: recogNo,
              name: finalName,
              company: finalCompany,
              functionalityText: functionalityText || null,
              dailyIntake: dailyIntake || null,
              precautions: precautions || null,
              detailContent: detailContent || null,
              registeredDate: fskItem.regDate,
              categories,
            }
          });

          await prisma.change_log.create({
            data: {
              prdlstReportNo: recogNo,
              type: 'INGREDIENT_CREATED',
              changes: JSON.stringify({
                name: finalName,
                company: finalCompany,
                recogNo,
                registeredDate: fskItem.regDate,
                functionalityText,
                dailyIntake,
                precautions,
                action: '신규 개별인정원료 공시 등록',
              })
            }
          });

          addedCount++;
          changeDetails.push({ recogNo, name: finalName, type: '신규 등록' });
        } else {
          // ── 변경 감지 및 업데이트 ──
          const changedFields = [];
          const before = {};
          const after = {};

          if (finalCompany && existing.company && !isContentEqual(existing.company, finalCompany)) {
            changedFields.push('업체명');
            before.company = existing.company;
            after.company = finalCompany;
          }
          if (functionalityText && existing.functionalityText && !isContentEqual(existing.functionalityText, functionalityText)) {
            changedFields.push('기능성 내용');
            before.functionalityText = existing.functionalityText;
            after.functionalityText = functionalityText;
          }
          if (dailyIntake && existing.dailyIntake && !isContentEqual(existing.dailyIntake, dailyIntake)) {
            changedFields.push('일일섭취량');
            before.dailyIntake = existing.dailyIntake;
            after.dailyIntake = dailyIntake;
          }
          if (precautions && existing.precautions && !isContentEqual(existing.precautions, precautions)) {
            changedFields.push('섭취시 주의사항');
            before.precautions = existing.precautions;
            after.precautions = precautions;
          }
          if (detailContent && existing.detailContent !== detailContent) {
            changedFields.push('공시 원문');
          }

          const needUpdate = changedFields.length > 0 ||
            (!existing.company && finalCompany) ||
            (!existing.dailyIntake && dailyIntake) ||
            (!existing.precautions && precautions) ||
            (!existing.functionalityText && functionalityText) ||
            existing.detailContent !== detailContent ||
            (existing.name !== finalName);

          if (needUpdate) {
            await prisma.individual_raw_materials.update({
              where: { id: existing.id },
              data: {
                name: finalName,
                company: finalCompany || existing.company,
                functionalityText: functionalityText || existing.functionalityText,
                dailyIntake: dailyIntake || existing.dailyIntake,
                precautions: precautions || existing.precautions,
                detailContent: detailContent || existing.detailContent,
                categories: autoClassify(functionalityText || existing.functionalityText, finalName),
              }
            });

            if (changedFields.length > 0) {
              await prisma.change_log.create({
                data: {
                  prdlstReportNo: recogNo,
                  type: 'INGREDIENT_UPDATED',
                  changes: JSON.stringify({
                    name: finalName,
                    recogNo,
                    changedFields,
                    before,
                    after,
                    action: '개별인정원료 항목 변경',
                  })
                }
              });
              updatedCount++;
              changeDetails.push({ recogNo, name: finalName, type: '항목 수정', changedFields });
            }
          }
        }
      }));
    }

    // ────────────────────────────────────────────────────────────
    // STEP 5: DB에 있으나 FSK에 없는 항목 삭제 (고시형 전환 / 취하 원료)
    // ────────────────────────────────────────────────────────────
    for (const dbItem of currentDbItems) {
      if (!fskRecogSet.has(dbItem.recognitionNumber)) {
        await prisma.change_log.create({
          data: {
            prdlstReportNo: dbItem.recognitionNumber,
            type: 'INGREDIENT_DELETED',
            changes: JSON.stringify({
              name: dbItem.name,
              company: dbItem.company,
              recogNo: dbItem.recognitionNumber,
              registeredDate: dbItem.registeredDate,
              functionalityText: dbItem.functionalityText,
              categories: dbItem.categories,
              action: '식약처 개별인정원료 공시 목록에서 제외 (고시형 기능성 원료 전환 또는 인정 취하)',
              syncedAt: new Date().toISOString(),
            })
          }
        });

        await prisma.individual_raw_materials.delete({
          where: { id: dbItem.id }
        });

        deletedCount++;
        changeDetails.push({ recogNo: dbItem.recognitionNumber, name: dbItem.name, type: '고시형 전환/취하 (삭제)' });
      }
    }

    const total = await prisma.individual_raw_materials.count();

    return NextResponse.json({
      success: true,
      message: `개별인정형 원료 1:1 동기화 완료 — 신규 ${addedCount}건, 수정 ${updatedCount}건, 삭제 ${deletedCount}건 (고시형 전환/취하) | 최종 DB: ${total}건 / 식약처 공시: ${fskMap.size}건`,
      addedCount,
      updatedCount,
      deletedCount,
      total,
      fskTotal: fskMap.size,
      changeDetails,
    });
  } catch (error) {
    console.error('Ingredient Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
