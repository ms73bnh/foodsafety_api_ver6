export const GENERAL_EXPORT_LIMITS = {
  xlsx: 100000,
  csv: 150000,
};

function buildExportParams(filters, format) {
  const params = new URLSearchParams({ format });
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (['page', 'limit'].includes(key)) return;
    const normalized = String(value ?? '').trim();
    if (normalized) params.set(key, normalized);
  });
  return params;
}

function getDownloadFilename(response, fallback) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

async function getFailureMessage(response) {
  const body = await response.text().catch(() => '');
  if (!body) return `다운로드 실패 (${response.status})`;

  try {
    const data = JSON.parse(body);
    const detail = data.detail ? `\n상세: ${data.detail}` : '';
    return `다운로드 실패 (${response.status})\n서버 응답: ${data.error || body}${detail}`;
  } catch {
    return `다운로드 실패 (${response.status})\n서버 응답: ${body.slice(0, 1000)}`;
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getGeneralExportKey(filters, format) {
  return buildExportParams(filters, format).toString();
}

export async function downloadGeneralExport({
  filters,
  format,
  resumeOffset = 0,
  onProgress,
  onResumeOffset,
}) {
  const fileRowLimit = GENERAL_EXPORT_LIMITS[format] || GENERAL_EXPORT_LIMITS.csv;
  const baseParams = buildExportParams(filters, format);
  const countParams = new URLSearchParams(baseParams);
  countParams.set('countOnly', 'true');

  const countRes = await fetch(`/api/export-general?${countParams.toString()}`);
  if (!countRes.ok) throw new Error(await getFailureMessage(countRes));
  const countData = await countRes.json();
  if (!countData.success) throw new Error(countData.error || '다운로드 건수 확인에 실패했습니다.');

  const total = countData.total || 0;
  if (total === 0) throw new Error('다운로드할 데이터가 없습니다.');

  let offset = Math.min(Math.max(resumeOffset, 0), total);
  const startingOffset = offset;

  while (offset < total) {
    const params = new URLSearchParams(baseParams);
    params.set('offset', String(offset));
    params.set('limit', String(fileRowLimit));
    params.set('fileIndex', String(Math.floor(offset / fileRowLimit) + 1));

    onProgress?.({
      offset,
      total,
      fileIndex: Math.floor(offset / fileRowLimit) + 1,
      resumed: startingOffset > 0,
    });

    const res = await fetch(`/api/export-general?${params.toString()}`);
    if (!res.ok) {
      onResumeOffset?.(offset);
      throw new Error(await getFailureMessage(res));
    }

    const blob = await res.blob();
    const fallback = `general_food_data_part${String(Math.floor(offset / fileRowLimit) + 1).padStart(3, '0')}.${format}`;
    saveBlob(blob, getDownloadFilename(res, fallback));

    const exportedCount = Number.parseInt(res.headers.get('X-Export-Count') || '', 10) || fileRowLimit;
    offset += exportedCount;
    onResumeOffset?.(offset < total ? offset : 0);
  }

  return { total, fileCount: Math.ceil(total / fileRowLimit), resumed: startingOffset > 0 };
}
