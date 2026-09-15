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

/**
 * parseFskTitle: 식약처 게시물 제목에서 원료명, 업체명, 인정번호를 정밀 파싱
 * 예: "연어코연골추출물(종근당건강(주), 제2026-23호)"
 *     "프로바이오틱스(Lactiplantibacillus plantarum Q180)... 복합물(CKDB-322)(㈜종근당바이오, 제2026-19호)"
 */
function parseFskTitle(title = '') {
  title = title.trim();
  let ingrName = title;
  let companyNm = '';
  let recogNo = '';

  // 1. 인정번호 추출 ("제2026-23호", "2026-23호", "제 2026-23 호" 등)
  const rm = title.match(/(?:제\s*)?(\d{4}\s*-\s*\d+\s*호)/);
  if (rm) {
    recogNo = '제' + rm[1].replace(/\s+/g, '');
  }

  // 2. 인정번호 위치 기준으로 괄호 매칭 (중첩 괄호 `(주)` 완벽 처리)
  if (recogNo) {
    const recogPos = title.search(/(?:제\s*)?\d{4}\s*-\s*\d+\s*호/);
    if (recogPos !== -1) {
      let openParenIdx = -1;
      let depth = 0;
      for (let i = recogPos - 1; i >= 0; i--) {
        if (title[i] === ')') depth++;
        else if (title[i] === '(') {
          if (depth === 0) { openParenIdx = i; break; }
          else depth--;
        }
      }

      if (openParenIdx !== -1) {
        ingrName = title.substring(0, openParenIdx).trim();
        let inside = title.substring(openParenIdx + 1);
        if (inside.endsWith(')')) inside = inside.slice(0, -1);
        inside = inside.trim();

        const parts = inside.split(',').map(s => s.trim());
        const companyParts = parts.filter(p => !/(?:제\s*)?\d{4}\s*-\s*\d+\s*호/.test(p));
        companyNm = companyParts.join(', ').trim();
      }
    }
  } else {
    const lastParenMatch = title.match(/^(.*)\(([^)]+)\)$/);
    if (lastParenMatch) {
      ingrName = lastParenMatch[1].trim();
      companyNm = lastParenMatch[2].trim();
    }
  }

  ingrName = ingrName.replace(/\s+/g, ' ').trim();

  return { ingrName, companyNm, recogNo };
}

/**
 * parseDetailHtml: HTML 상세 본문에서 원료명, 업체명, 기능성내용, 일일섭취량, 섭취시 주의사항 추출
 */
function parseDetailHtml(html = '') {
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<tr\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#034;/g, '"')
    .replace(/\r\n|\r/g, '\n');

  let name = '';
  let company = '';
  let recogNo = '';
  let fnText = '';
  let dailyIntake = '';
  let precautions = '';

  // 원료명 추출
  const mName = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:원료명|Ingredient\s*name)\s*[:：]\s*)([^\n]+)/i);
  if (mName && mName[1]) name = mName[1].trim();

  // 업체명 추출
  const mComp = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:업체명|업체\s*및\s*기관|업체|제조업체|Company(?:\s*or\s*institution)?)\s*[:：]\s*)([^\n]+)/i);
  if (mComp && mComp[1]) company = mComp[1].trim();

  // 인정번호 추출
  const mRecog = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:인정번호|Recognition\s*Number)\s*[:：]\s*)([^\n]+)/i);
  if (mRecog && mRecog[1]) {
    const rm = mRecog[1].match(/(?:제\s*)?(\d{4}\s*-\s*\d+\s*호)/);
    if (rm) recogNo = '제' + rm[1].replace(/\s+/g, '');
  }

  // 1. 기능성 내용 파싱
  const mFn = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:기능성\s*내용|기능성내용|기능성|Functionality(?:\s*of\s*the\s*ingredient)?)\s*[:：]?\s*)([\s\S]*?)(?=(?:[○*※\-\u25cb\u25a0]?\s*일일\s*섭취량|[○*※\-\u25cb\u25a0]?\s*일일섭취량|[○*※\-\u25cb\u25a0]?\s*섭취량|[○*※\-\u25cb\u25a0]?\s*섭취\s*시\s*주의사항|주의사항|※\s*English|○\s*English|\n\s*※|\n\n\n|$))/i);
  if (mFn && mFn[1]) fnText = mFn[1].trim().replace(/\n{2,}/g, '\n');

  // 2. 일일섭취량 파싱
  const mDaily = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:일일\s*섭취량|일일섭취량|섭취량|Daily\s*intake(?:\s*amount)?)\s*[:：]?\s*)([\s\S]*?)(?=(?:[○*※\-\u25cb\u25a0]?\s*섭취\s*시\s*주의사항|주의사항|기능성|※\s*English|○\s*English|\n\s*※|\n\n\n|$))/i);
  if (mDaily && mDaily[1]) dailyIntake = mDaily[1].trim().replace(/\n{2,}/g, '\n');

  // 3. 섭취 시 주의사항 파싱
  const mPrec = text.match(/(?:[○*※\-\u25cb\u25a0]?\s*(?:섭취\s*시\s*주의사항|섭취시\s*주의사항|주의사항|Precautions)\s*[:：\n]?\s*)([\s\S]*?)(?=(?:※\s*English|○\s*English|○\s*기타|기타사항|첨부파일|\n\n\n\n|$))/i);
  if (mPrec && mPrec[1]) precautions = mPrec[1].trim().replace(/\n{2,}/g, '\n');

  return { name, company, recogNo, fnText, dailyIntake, precautions, rawText: text.trim() };
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

  const resp = await fetch(LIST_AJAX, { method: 'POST', headers, body: body.toString() });
  if (!resp.ok) throw new Error(`식약처 API 응답 오류 (page ${page}): ${resp.status}`);
  return await resp.json();
}

export async function POST(req) {
  try {
    const BASE_URL = 'https://www.foodsafetykorea.go.kr';
    const DETAIL_URL = `${BASE_URL}/portal/board/boardDetail.do`;

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
    const totalPages = Math.ceil(totalCnt / showCnt);

    const pagePromises = [];
    for (let p = 2; p <= totalPages; p++) {
      pagePromises.push(fetchFskPage(p, showCnt, headers));
    }
    const otherPages = await Promise.all(pagePromises);

    let allFskItems = [...(firstJson.list || [])];
    otherPages.forEach(pj => { allFskItems = allFskItems.concat(pj.list || []); });

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
    const fskItemsArray = Array.from(fskMap.entries());
    const CONCURRENCY = 15;

    for (let i = 0; i < fskItemsArray.length; i += CONCURRENCY) {
      const batch = fskItemsArray.slice(i, i + CONCURRENCY);

      await Promise.all(batch.map(async ([recogNo, fskItem]) => {
        let functionalityText = fskItem.functionalityText;
        let dailyIntake = '';
        let precautions = '';
        let detailContent = '';
        let parsedDetail = null;

        const existing = dbRecogMap.get(recogNo);

        // 상세 내용이 없거나 업체명이 미기재된 경우 상세 페이지 호출
        const needDetailFetch = fskItem.ntctxtNo && (
          !existing ||
          !existing.functionalityText ||
          !existing.company ||
          !existing.dailyIntake ||
          !existing.precautions
        );

        if (needDetailFetch) {
          try {
            const detUrl = `${DETAIL_URL}?ntctxt_no=${fskItem.ntctxtNo}&menu_no=2660&menu_grp=MENU_NEW01&bbs_no=bbs987`;
            const detResp = await fetch(detUrl, {
              headers: { 'User-Agent': headers['User-Agent'], 'Referer': headers['Referer'] }
            });
            if (detResp.ok) {
              const detHtml = await detResp.text();
              parsedDetail = parseDetailHtml(detHtml);
              if (parsedDetail.fnText) functionalityText = parsedDetail.fnText;
              if (parsedDetail.dailyIntake) dailyIntake = parsedDetail.dailyIntake;
              if (parsedDetail.precautions) precautions = parsedDetail.precautions;
              detailContent = parsedDetail.rawText.substring(0, 2000);
            }
          } catch (detailErr) {
            console.error(`Detail fetch error for ${recogNo}:`, detailErr);
          }
        }

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

          const needUpdate = changedFields.length > 0 ||
            (!existing.company && finalCompany) ||
            (!existing.dailyIntake && dailyIntake) ||
            (!existing.precautions && precautions) ||
            (!existing.functionalityText && functionalityText) ||
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

