import prisma from '@/lib/prisma';
import { isSalesOrAbove } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const XLSX_FILE_ROW_LIMIT = 100000;
const XLSX_SHEET_ROW_LIMIT = 50000;
const CSV_FILE_ROW_LIMIT = 150000;

const columns = [
  { header: '품목제조보고번호', value: item => item.prdlstReportNo || '' },
  { header: '업소명', value: item => item.bsshNm || '' },
  { header: '품목명', value: item => item.prdlstNm || '' },
  { header: '허가일자', value: item => formatDate(item.prmsDt) },
  { header: '품목유형명', value: item => item.prdlstDcnm || '' },
  { header: '제품형태', value: item => item.dispos || '' },
  { header: '소비기한', value: item => item.pogDaycnt || '' },
  { header: '포장재질(정규화)', value: item => item.normalizedPackaging || '' },
  { header: '포장재질(원문)', value: item => item.frmlcMtrqlt || '' },
  { header: '용법', value: item => item.usage || '' },
  { header: '용도', value: item => item.prpos || '' },
];

function formatDate(value) {
  if (!value || value.length !== 8) return value || '';
  return `${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)}`;
}

function getTextParam(searchParams, key) {
  return (searchParams.get(key) || '').trim();
}

function getNumberParam(searchParams, key, fallback) {
  const value = Number.parseInt(searchParams.get(key) || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function buildWhere(params) {
  const conditions = [];

  if (params.integrated) {
    const keywords = params.integrated.split(',').map(kw => kw.trim()).filter(Boolean);
    keywords.forEach(kw => {
      conditions.push({
        OR: [
          { prdlstReportNo: { contains: kw, mode: 'insensitive' } },
          { bsshNm: { contains: kw, mode: 'insensitive' } },
          { prdlstNm: { contains: kw, mode: 'insensitive' } },
          { prdlstDcnm: { contains: kw, mode: 'insensitive' } },
          { dispos: { contains: kw, mode: 'insensitive' } },
          { normalizedPackaging: { contains: kw, mode: 'insensitive' } },
          { frmlcMtrqlt: { contains: kw, mode: 'insensitive' } },
        ],
      });
    });
  }

  if (params.prdlstReportNo) conditions.push({ prdlstReportNo: { contains: params.prdlstReportNo, mode: 'insensitive' } });
  if (params.bsshNm) conditions.push({ bsshNm: { contains: params.bsshNm, mode: 'insensitive' } });
  if (params.prdlstNm) conditions.push({ prdlstNm: { contains: params.prdlstNm, mode: 'insensitive' } });
  if (params.prdlstDcnm) conditions.push({ prdlstDcnm: { contains: params.prdlstDcnm, mode: 'insensitive' } });
  if (params.dispos) conditions.push({ dispos: { contains: params.dispos, mode: 'insensitive' } });

  if (params.normalizedPackaging) {
    conditions.push({
      OR: [
        { normalizedPackaging: { contains: params.normalizedPackaging, mode: 'insensitive' } },
        { frmlcMtrqlt: { contains: params.normalizedPackaging, mode: 'insensitive' } },
      ],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

function buildOrderBy(sortValue) {
  if (sortValue === 'prmsDt_asc') {
    return [{ prmsDt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
  }
  if (sortValue === 'recent') {
    return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
  return [{ prmsDt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
}

function toRows(data) {
  return data.map(item => columns.map(column => column.value(item)));
}

function csvEscape(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function jsonError(message, status = 500, detail) {
  return Response.json(
    { success: false, error: message, detail: detail ? String(detail).slice(0, 1000) : undefined },
    { status }
  );
}

export async function GET(req) {
  try {
    if (!isSalesOrAbove(req)) {
      return jsonError('권한이 없습니다. ADMIN 또는 SALES 권한이 필요합니다.', 403);
    }

    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();
    const maxRows = format === 'xlsx' ? XLSX_FILE_ROW_LIMIT : CSV_FILE_ROW_LIMIT;
    const hasOffset = searchParams.has('offset');
    const requestedLimit = hasOffset ? getNumberParam(searchParams, 'limit', maxRows) : maxRows;
    const take = Math.min(requestedLimit, maxRows);
    const offset = getNumberParam(searchParams, 'offset', 0);
    const countOnly = searchParams.get('countOnly') === 'true';
    const fileIndex = getNumberParam(searchParams, 'fileIndex', Math.floor(offset / maxRows) + 1);

    if (!['csv', 'xlsx'].includes(format)) {
      return jsonError('지원하지 않는 다운로드 형식입니다.', 400);
    }

    const params = {
      integrated: getTextParam(searchParams, 'integrated'),
      prdlstReportNo: getTextParam(searchParams, 'prdlstReportNo'),
      bsshNm: getTextParam(searchParams, 'bsshNm'),
      prdlstNm: getTextParam(searchParams, 'prdlstNm'),
      prdlstDcnm: getTextParam(searchParams, 'prdlstDcnm'),
      normalizedPackaging: getTextParam(searchParams, 'normalizedPackaging'),
      dispos: getTextParam(searchParams, 'dispos'),
      sort: searchParams.get('sort') || 'prmsDt_desc',
    };

    const where = buildWhere(params);

    if (countOnly) {
      const total = await prisma.general_declarations.count({ where });
      return Response.json({
        success: true,
        total,
        fileRowLimit: maxRows,
        sheetRowLimit: format === 'xlsx' ? XLSX_SHEET_ROW_LIMIT : null,
      });
    }

<<<<<<< HEAD
    if (prdlstReportNo) conditions.push({ prdlstReportNo: { contains: prdlstReportNo, mode: 'insensitive' } });
    if (bsshNm) conditions.push({ bsshNm: { contains: bsshNm, mode: 'insensitive' } });
    if (prdlstNm) conditions.push({ prdlstNm: { contains: prdlstNm, mode: 'insensitive' } });
    if (prdlstDcnm) conditions.push({ prdlstDcnm: { contains: prdlstDcnm, mode: 'insensitive' } });
    if (dispos) conditions.push({ dispos: { contains: dispos, mode: 'insensitive' } });
    
    if (normalizedPackaging) {
      conditions.push({
        OR: [
          { normalizedPackaging: { contains: normalizedPackaging, mode: 'insensitive' } },
          { frmlcMtrqlt: { contains: normalizedPackaging, mode: 'insensitive' } }
        ]
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const sortValue = searchParams.get('sort') || 'prmsDt_desc';
    let orderBy = {};
    if (sortValue === 'prmsDt_desc') orderBy = { prmsDt: 'desc' };
    else if (sortValue === 'prmsDt_asc') orderBy = { prmsDt: 'asc' };
    else orderBy = { createdAt: 'desc' };

    // Select only needed columns to minimize memory footprint
    const select = {
      prdlstReportNo: true,
      bsshNm: true,
      prdlstNm: true,
      prmsDt: true,
      prdlstDcnm: true,
      dispos: true,
      pogDaycnt: true,
      normalizedPackaging: true,
      frmlcMtrqlt: true,
      usage: true,
      prpos: true
    };

    // Fetch all matching records without 50k cap
    const data = await prisma.general_declarations.findMany({
      where,
      orderBy: orderBy,
      select: select
    });

    if (!data || data.length === 0) {
      return new Response('데이터가 없습니다.', { status: 404 });
    }

    const headers = [
      '품목제조번호',
      '업소명',
      '품목명',
      '허가일자',
      '품목유형명',
      '제품형태',
      '소비기한',
      '포장재질(정규화)',
      '포장재질(원문)',
      '용법',
      '용도'
    ];

    const formatPrmsDt = (dt) => {
      if (!dt || dt.length < 8) return dt || '';
      return `${dt.substring(0, 4)}-${dt.substring(4, 6)}-${dt.substring(6, 8)}`;
    };

    if (format === 'xlsx') {
      const XLSX = require('xlsx');
      const workbook = XLSX.utils.book_new();
      const SHEET_LIMIT = 500000; // 50만 행 단위 시트 분할

      if (data.length <= SHEET_LIMIT) {
        const rows = data.map(item => [
          item.prdlstReportNo || '',
          item.bsshNm || '',
          item.prdlstNm || '',
          formatPrmsDt(item.prmsDt),
          item.prdlstDcnm || '',
          item.dispos || '',
          item.pogDaycnt || '',
          item.normalizedPackaging || '',
          item.frmlcMtrqlt || '',
          item.usage || '',
          item.prpos || ''
        ]);
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'GeneralFoodData');
      } else {
        const totalSheets = Math.ceil(data.length / SHEET_LIMIT);
        for (let i = 0; i < totalSheets; i++) {
          const startIdx = i * SHEET_LIMIT;
          const endIdx = Math.min(startIdx + SHEET_LIMIT, data.length);
          const chunk = data.slice(startIdx, endIdx);
          const rows = chunk.map(item => [
            item.prdlstReportNo || '',
            item.bsshNm || '',
            item.prdlstNm || '',
            formatPrmsDt(item.prmsDt),
            item.prdlstDcnm || '',
            item.dispos || '',
            item.pogDaycnt || '',
            item.normalizedPackaging || '',
            item.frmlcMtrqlt || '',
            item.usage || '',
            item.prpos || ''
          ]);
          const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          XLSX.utils.book_append_sheet(workbook, worksheet, `Part_${i + 1} (${startIdx + 1}~${endIdx})`);
        }
      }

      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="general_food_data_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      });
    } else {
      // CSV Streaming response for optimal performance and infinite row capacity
      const encoder = new TextEncoder();
      const BOM = '\uFEFF';

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(BOM));
          controller.enqueue(encoder.encode(headers.join(',') + '\n'));

          const BATCH = 10000;
          for (let i = 0; i < data.length; i += BATCH) {
            const slice = data.slice(i, i + BATCH);
            const chunkCsv = slice.map(item => {
              const row = [
                item.prdlstReportNo || '',
                item.bsshNm || '',
                item.prdlstNm || '',
                formatPrmsDt(item.prmsDt),
                item.prdlstDcnm || '',
                item.dispos || '',
                item.pogDaycnt || '',
                item.normalizedPackaging || '',
                item.frmlcMtrqlt || '',
                item.usage || '',
                item.prpos || ''
              ];
              return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
            }).join('\n') + '\n';

            controller.enqueue(encoder.encode(chunkCsv));
          }
          controller.close();
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="general_food_data_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }
=======
    const data = await prisma.general_declarations.findMany({
      where,
      skip: offset,
      take,
      orderBy: buildOrderBy(params.sort),
      select: {
        prdlstReportNo: true,
        bsshNm: true,
        prdlstNm: true,
        prmsDt: true,
        prdlstDcnm: true,
        dispos: true,
        pogDaycnt: true,
        normalizedPackaging: true,
        frmlcMtrqlt: true,
        usage: true,
        prpos: true,
      },
    });

    if (data.length === 0) {
      return jsonError('다운로드할 데이터가 없습니다.', 404);
    }

    const date = new Date().toISOString().split('T')[0];
    const suffix = String(fileIndex).padStart(3, '0');
    const filename = `general_food_data_${date}_part${suffix}.${format}`;
    const headers = columns.map(column => column.header);
    const rows = toRows(data);

    if (format === 'xlsx') {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      for (let start = 0; start < rows.length; start += XLSX_SHEET_ROW_LIMIT) {
        const sheetRows = rows.slice(start, start + XLSX_SHEET_ROW_LIMIT);
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
        XLSX.utils.book_append_sheet(workbook, worksheet, `GeneralFood_${Math.floor(start / XLSX_SHEET_ROW_LIMIT) + 1}`);
      }

      const body = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Export-Count': String(data.length),
          'X-Export-Offset': String(offset),
        },
      });
    }

    const csvContent = [
      headers.map(csvEscape).join(','),
      ...rows.map(row => row.map(csvEscape).join(',')),
    ].join('\n');

    return new Response('\uFEFF' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Count': String(data.length),
        'X-Export-Offset': String(offset),
      },
    });
>>>>>>> 386a139fe1336aa56fd9ae5900a9d092f9f7d2f4
  } catch (error) {
    console.error('Export General API Error:', error);
    return jsonError('일반식품 다운로드 생성 중 서버 오류가 발생했습니다.', 500, error?.message || error);
  }
}
