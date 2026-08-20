import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const BASE_URL = "https://www.foodsafetykorea.go.kr";
    const LIST_AJAX = `${BASE_URL}/portal/board/boardList.do`;

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

    // 최신 1페이지(40건) 동기화
    const body = new URLSearchParams({ ...BASE_PARAMS, start_idx: "1", show_cnt: "40" });
    const resp = await fetch(LIST_AJAX, { method: "POST", headers, body: body.toString() });
    if (!resp.ok) throw new Error("식약처 API 응답 오류");
    const json = await resp.json();
    const items = json.list || [];

    let added = 0;
    for (const item of items) {
      const ntctxtNo = String(item.ntctxt_no || "");
      if (!ntctxtNo) continue;
      const exists = await prisma.raw_material_posts.findUnique({ where: { ntctxtNo } });
      if (exists) continue;

      const title = (item.titl || "").trim();
      let companyNm = "";
      let recogNo = "";
      const m = title.match(/\(([^,\(\)]+?)\s*,\s*([^\)]+)\)\s*$/);
      if (m) {
        companyNm = m[1].trim();
        recogNo = m[2].trim();
      }

      await prisma.raw_material_posts.create({
        data: {
          no: String(item.no || ""),
          ntctxtNo,
          title,
          companyNm: companyNm || null,
          recogNo: recogNo || null,
          regDate: (item.cret_dtm || "").substring(0, 10),
          viewCnt: String(item.inqry_cnt || ""),
        },
      });
      added++;
    }

    const total = await prisma.raw_material_posts.count();
    return NextResponse.json({
      success: true,
      message: `동기화 완료: ${added}건 신규 추가 (총 ${total}건)`,
      added,
      total,
    });
  } catch (error) {
    console.error("RawMaterial Sync Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}