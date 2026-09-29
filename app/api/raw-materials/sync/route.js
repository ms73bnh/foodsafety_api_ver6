import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  parseFskTitle,
  parseOfficialIngredientPost,
  parseOfficialPdfAttachment,
} from '@/lib/foodSafetyIngredientAnnouncement';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BASE_URL = 'https://www.foodsafetykorea.go.kr';
const LIST_URL = `${BASE_URL}/portal/board/boardList.do`;
const DETAIL_URL = `${BASE_URL}/portal/board/boardDetail.do`;
const BOARD_URL = `${BASE_URL}/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660`;
const PAGE_SIZE = 50;
const CONCURRENCY = 15;

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': BOARD_URL,
  'Content-Type': 'application/x-www-form-urlencoded',
};

async function fetchListPage(page) {
  const body = new URLSearchParams({
    menu_no: '2660',
    menu_grp: 'MENU_NEW01',
    bbs_no: 'bbs987',
    ctgry_no: '1207',
    ctgry_type_cd: 'CTG_TYPE01',
    start_idx: String(page),
    show_cnt: String(PAGE_SIZE),
  });
  const response = await fetch(LIST_URL, {
    method: 'POST',
    headers: REQUEST_HEADERS,
    body: body.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`식약처 공시 목록 응답 오류 (page ${page}): ${response.status}`);

  const json = await response.json();
  if (!Array.isArray(json.list)) {
    throw new Error(`식약처 공시 목록 응답 형식이 올바르지 않습니다 (page ${page}).`);
  }
  return json;
}

async function fetchPostDetail(item, recogNo) {
  const ntctxtNo = String(item.ntctxt_no || '');
  if (!ntctxtNo) throw new Error(`식약처 게시물 번호가 없습니다 (${recogNo}).`);

  const detailUrl = new URL(DETAIL_URL);
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
        headers: REQUEST_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`식약처 상세 응답 오류: ${response.status}`);

      const html = await response.text();
      const detail = parseOfficialIngredientPost(html, recogNo);
      if (!detail.rawText || detail.recogNo !== recogNo) {
        throw new Error(`식약처 상세 본문이 비었거나 인정번호가 일치하지 않습니다 (${recogNo}).`);
      }

      return {
        ntctxtNo,
        html,
        detail,
        attachment: parseOfficialPdfAttachment(item, html),
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }

  throw new Error(`식약처 상세 게시물을 가져오지 못했습니다 (${recogNo}, ${ntctxtNo}): ${lastError?.message || '알 수 없는 오류'}`);
}

async function fetchAllAnnouncements() {
  const firstPage = await fetchListPage(1);
  const totalCount = Number.parseInt(firstPage.total_cnt || '0', 10);
  if (!Number.isInteger(totalCount) || totalCount < 1 || totalCount > 10000) {
    throw new Error(`식약처 공시 게시물 수가 유효하지 않습니다: ${firstPage.total_cnt}`);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchListPage(index + 2))
  );
  const items = [firstPage, ...remainingPages].flatMap(page => page.list);
  const postIds = new Set(items.map(item => String(item.ntctxt_no || '')));

  if (items.length !== totalCount || postIds.size !== totalCount || postIds.has('')) {
    throw new Error(`식약처 공시 목록이 불완전합니다 (전체 ${totalCount}건, 수집 ${items.length}건, 고유 게시물 ${postIds.size}건).`);
  }

  const posts = items.map(item => {
    const title = String(item.titl || '').trim();
    const { companyNm, recogNo } = parseFskTitle(title);
    if (!title || !recogNo) {
      throw new Error(`식약처 게시물 제목에서 인정번호를 확인할 수 없습니다 (${item.ntctxt_no}).`);
    }
    return {
      item,
      title,
      companyNm,
      recogNo,
      regDate: String(item.cret_dtm || '').substring(0, 10),
      viewCnt: String(item.inqry_cnt || ''),
    };
  });

  const recognitionNumbers = new Set(posts.map(post => post.recogNo));
  if (recognitionNumbers.size !== totalCount) {
    throw new Error(`식약처 공시의 인정번호가 중복되거나 누락되었습니다 (${recognitionNumbers.size}/${totalCount}).`);
  }

  const details = new Map();
  for (let index = 0; index < posts.length; index += CONCURRENCY) {
    const batch = posts.slice(index, index + CONCURRENCY);
    const result = await Promise.all(batch.map(async post => [
      post.recogNo,
      await fetchPostDetail(post.item, post.recogNo),
    ]));
    result.forEach(([recogNo, detail]) => details.set(recogNo, detail));
  }

  return { posts, details };
}

function valuesForPost(post, fetched) {
  const detail = fetched.detail;
  const attachment = fetched.attachment;
  return {
    no: Number.parseInt(post.item.no, 10) || null,
    ntctxtNo: fetched.ntctxtNo,
    title: post.title,
    companyNm: detail.company || post.companyNm || null,
    recogNo: post.recogNo,
    functionalityText: detail.fnText || null,
    dailyIntake: detail.dailyIntake || null,
    precautions: detail.precautions || null,
    content: detail.rawText || null,
    regDate: post.regDate,
    viewCnt: post.viewCnt,
    attachmentName: attachment?.attachmentName || null,
    filePath: attachment?.filePath || null,
    fileName: attachment?.fileName || null,
    orgFileName: attachment?.orgFileName || null,
    fileTypeCd: attachment?.fileTypeCd || null,
    ecmFileNo: attachment?.ecmFileNo || null,
  };
}

function changedFields(existing, current) {
  const fields = [
    ['제목', 'title'],
    ['업체명', 'companyNm'],
    ['인정번호', 'recogNo'],
    ['기능성 내용', 'functionalityText'],
    ['일일섭취량', 'dailyIntake'],
    ['섭취 시 주의사항', 'precautions'],
    ['공시 원문', 'content'],
    ['등록일', 'regDate'],
    ['첨부파일', 'attachmentName'],
    ['첨부파일 경로', 'filePath'],
    ['첨부파일명', 'fileName'],
    ['첨부파일 키', 'ecmFileNo'],
  ];
  return fields
    .filter(([, key]) => (existing[key] || null) !== (current[key] || null))
    .map(([label]) => label);
}

export async function POST() {
  try {
    const { posts, details } = await fetchAllAnnouncements();
    const existingPosts = await prisma.raw_material_posts.findMany({
      select: {
        id: true,
        no: true,
        ntctxtNo: true,
        title: true,
        companyNm: true,
        recogNo: true,
        functionalityText: true,
        dailyIntake: true,
        precautions: true,
        content: true,
        regDate: true,
        viewCnt: true,
        attachmentName: true,
        filePath: true,
        fileName: true,
        orgFileName: true,
        fileTypeCd: true,
        ecmFileNo: true,
      },
    });
    const existingByPostId = new Map(existingPosts.map(post => [post.ntctxtNo, post]));
    let added = 0;
    let updated = 0;
    let pdfCount = 0;

    for (const post of posts) {
      const fetched = details.get(post.recogNo);
      if (!fetched) throw new Error(`상세 게시물을 수집하지 못했습니다 (${post.recogNo}).`);

      const current = valuesForPost(post, fetched);
      if (current.attachmentName) pdfCount++;
      const existing = existingByPostId.get(current.ntctxtNo);

      if (!existing) {
        await prisma.raw_material_posts.create({ data: current });
        await prisma.change_log.create({
          data: {
            prdlstReportNo: current.recogNo || current.ntctxtNo,
            type: 'RAW_MATERIAL_CREATED',
            changes: JSON.stringify({
              title: current.title,
              companyNm: current.companyNm,
              recogNo: current.recogNo,
              regDate: current.regDate,
              attachmentName: current.attachmentName,
              action: '신규 공시 게시글 등록',
            }),
          },
        });
        added++;
        continue;
      }

      const labels = changedFields(existing, current);
      const needsUpdate = labels.length > 0 ||
        existing.no !== current.no ||
        existing.dailyIntake !== current.dailyIntake ||
        existing.precautions !== current.precautions ||
        existing.fileTypeCd !== current.fileTypeCd ||
        existing.orgFileName !== current.orgFileName ||
        existing.viewCnt !== current.viewCnt ||
        existing.regDate !== current.regDate;

      if (!needsUpdate) continue;

      await prisma.raw_material_posts.update({
        where: { id: existing.id },
        data: current,
      });
      if (labels.length > 0) {
        await prisma.change_log.create({
          data: {
            prdlstReportNo: current.recogNo || current.ntctxtNo,
            type: 'RAW_MATERIAL_UPDATED',
            changes: JSON.stringify({
              title: current.title,
              changedFields: labels,
              attachmentName: current.attachmentName,
              action: `공시 게시글 변경 (${labels.join(', ')})`,
            }),
          },
        });
      }
      updated++;
    }

    const total = await prisma.raw_material_posts.count();
    return NextResponse.json({
      success: true,
      message: `공시 게시글 동기화 완료: ${added}건 신규 추가, ${updated}건 변경 반영, 원문 ${details.size}건 확인, PDF 첨부 ${pdfCount}건 확인 (총 ${total}건)`,
      added,
      updated,
      checked: details.size,
      pdfCount,
      total,
    });
  } catch (error) {
    console.error('RawMaterial Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
