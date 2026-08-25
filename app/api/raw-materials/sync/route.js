import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseContent(content = '') {
  if (!content) return { fnText: '', dailyIntake: '', precautions: '' };

  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u00a0/g, ' ');

  let fnText = '';
  const fnMatch = text.match(/(?:[○*※\u25cb\u25a0]?\s*(?:기능성\s*내용|기능성내용|기능성\s*정보|기능성|Functionality)\s*[:：\n]?\s*)([\s\S]*?)(?=(?:[○*※\u25cb\u25a0]?\s*(?:일일\s*섭취량|일일섭취량|섭취량|섭취\s*시\s*주의사항|섭취시\s*주의사항|주의사항|English|○\s*English|※\s*English|○\s*원료명|○\s*인정번호|○\s*업체명)|\n\s*※\s*English|\n\s*○\s*English|$))/i);
  if (fnMatch && fnMatch[1]) fnText = fnMatch[1].trim();

  let dailyIntake = '';
  const dailyMatch = text.match(/(?:[○*※\u25cb\u25a0]?\s*(?:일일\s*섭취량|일일섭취량|섭취량|Daily\s*intake)\s*[:：\n]?\s*)([\s\S]*?)(?=(?:[○*※\u25cb\u25a0]?\s*(?:섭취\s*시\s*주의사항|섭취시\s*주의사항|주의사항|기능성|English|○\s*English|※\s*English)|\n\s*※\s*English|\n\s*○\s*English|$))/i);
  if (dailyMatch && dailyMatch[1]) dailyIntake = dailyMatch[1].trim();

  let precautions = '';
  const precMatch = text.match(/(?:[○*※\u25cb\u25a0]?\s*(?:섭취\s*시\s*주의사항|섭취시\s*주의사항|주의사항|Precautions)\s*[:：\n]?\s*)([\s\S]*?)(?=(?:[○*※\u25cb\u25a0]?\s*(?:English|기타사항|참고사항)|\n\s*※\s*English|\n\s*○\s*English|$))/i);
  if (precMatch && precMatch[1]) precautions = precMatch[1].trim();

  return { fnText, dailyIntake, precautions };
}

function parseTitle(title = '') {
  let ingrName = title.trim();
  let companyNm = '';
  let recogNo = '';

  const rm = title.match(/제?\s*(\d{4}\s*-\s*\d+\s*호)/);
  if (rm) {
    recogNo = `제${rm[1].replace(/\s+/g, '')}`;
  }

  const lastBracket = ingrName.match(/^(.*)\(([^()]+)\)$/);
  if (lastBracket) {
    const mainPart = lastBracket[1].trim();
    const inside = lastBracket[2].trim();
    const insideWithoutRecog = inside.replace(/제?\s*\d{4}\s*-\s*\d+\s*호/g, '').replace(/,\s*$/, '').trim();
    if (insideWithoutRecog) {
      companyNm = insideWithoutRecog;
      ingrName = mainPart;
    }
  }

  return { ingrName, companyNm, recogNo };
}

export async function POST(req) {
  try {
    const BASE_URL = "https://www.foodsafetykorea.go.kr";
    const LIST_AJAX = `${BASE_URL}/portal/board/boardList.do`;
    const DETAIL_URL = `${BASE_URL}/portal/board/boardDetail.do`;

    const BASE_PARAMS = {
      menu_no: "2660",
      menu_grp: "MENU_NEW01",
      bbs_no: "bbs987",
      ctgry_no: "1207",
      ctgry_type_cd: "CTG_TYPE01",
    };

    const headers = {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": `${BASE_URL}/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // 최신 공시 50건 조회
    const body = new URLSearchParams({ ...BASE_PARAMS, start_idx: "1", show_cnt: "50" });
    const resp = await fetch(LIST_AJAX, { method: "POST", headers, body: body.toString() });
    if (!resp.ok) throw new Error("식약처 API 응답 오류");
    const json = await resp.json();
    const items = json.list || [];

    let added = 0;
    let updated = 0;
    for (const item of items) {
      const ntctxtNo = String(item.ntctxt_no || "");
      if (!ntctxtNo) continue;

      const title = (item.titl || "").trim();
      const { ingrName, companyNm, recogNo } = parseTitle(title);
      const regDate = (item.cret_dtm || "").substring(0, 10);
      const viewCnt = String(item.inqry_cnt || "");

      const exists = await prisma.raw_material_posts.findUnique({ where: { ntctxtNo } });
      
      let content = exists?.content || "";
      let fnText = exists?.functionalityText || "";
      let dailyIntake = exists?.dailyIntake || "";
      let precautions = exists?.precautions || "";

      // 신규이거나 상세 기능성이 없으면 상세 페이지 호출
      if (!exists || !fnText || !content) {
        try {
          const detUrl = `${DETAIL_URL}?ntctxt_no=${ntctxtNo}&menu_no=2660&menu_grp=MENU_NEW01&bbs_no=bbs987`;
          const detResp = await fetch(detUrl, { headers });
          if (detResp.ok) {
            const html = await detResp.text();
            const cleanText = html
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
            content = cleanText.trim();
            const parsed = parseContent(content);
            if (parsed.fnText) fnText = parsed.fnText;
            if (parsed.dailyIntake) dailyIntake = parsed.dailyIntake;
            if (parsed.precautions) precautions = parsed.precautions;
          }
        } catch (detailErr) {
          console.error(`Detail fetch error for ${ntctxtNo}:`, detailErr);
        }
      }

      if (!exists) {
        await prisma.raw_material_posts.create({
          data: {
            no: parseInt(item.no, 10) || null,
            ntctxtNo,
            title,
            companyNm: companyNm || null,
            recogNo: recogNo || null,
            functionalityText: fnText || null,
            dailyIntake: dailyIntake || null,
            precautions: precautions || null,
            content: content || null,
            regDate,
            viewCnt,
          },
        });

        await prisma.change_log.create({
          data: {
            prdlstReportNo: recogNo || ntctxtNo,
            type: 'RAW_MATERIAL_CREATED',
            changes: JSON.stringify({
              title,
              companyNm,
              recogNo,
              regDate,
              action: '신규 공시 게시글 등록'
            })
          }
        });

        added++;
      } else {
        const changedFields = [];
        const before = {};
        const after = {};

        if (title && exists.title !== title) {
          changedFields.push('제목');
          before.title = exists.title;
          after.title = title;
        }

        if (companyNm && exists.companyNm !== companyNm) {
          changedFields.push('업체명');
          before.companyNm = exists.companyNm;
          after.companyNm = companyNm;
        }

        if (fnText && exists.functionalityText !== fnText) {
          changedFields.push('기능성 내용');
          before.functionalityText = exists.functionalityText;
          after.functionalityText = fnText;
        }

        const needUpdate = changedFields.length > 0 ||
          (!exists.functionalityText && fnText) ||
          (!exists.dailyIntake && dailyIntake) ||
          (!exists.precautions && precautions) ||
          (!exists.recogNo && recogNo);

        if (needUpdate) {
          await prisma.raw_material_posts.update({
            where: { ntctxtNo },
            data: {
              title,
              companyNm: companyNm || exists.companyNm,
              recogNo: recogNo || exists.recogNo,
              functionalityText: fnText || exists.functionalityText,
              dailyIntake: dailyIntake || exists.dailyIntake,
              precautions: precautions || exists.precautions,
              content: content || exists.content,
            }
          });

          if (changedFields.length > 0) {
            await prisma.change_log.create({
              data: {
                prdlstReportNo: recogNo || ntctxtNo,
                type: 'RAW_MATERIAL_UPDATED',
                changes: JSON.stringify({
                  title,
                  changedFields,
                  before,
                  after,
                  action: `공시 게시글 변경 (${changedFields.join(', ')})`
                })
              }
            });
          }

          updated++;
        }
      }
    }

    const total = await prisma.raw_material_posts.count();
    return NextResponse.json({
      success: true,
      message: `공시 게시글 동기화 완료: ${added}건 신규 추가, ${updated}건 변경 반영 (총 ${total}건)`,
      added,
      updated,
      total,
    });
  } catch (error) {
    console.error("RawMaterial Sync Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}