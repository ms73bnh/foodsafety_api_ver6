import * as cheerio from 'cheerio';
import { fetchSource, parseDetail } from './source.mjs';

export function attachmentKind(bytes) {
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (/FASOO|DRMONE/i.test(bytes.subarray(0, 512).toString('ascii'))) return 'drm';
  if (bytes.subarray(0, 2).toString('hex') === '504b') return 'hwpx';
  if (bytes.subarray(0, 4).toString('hex') === 'd0cf11e0') return 'hwp';
  return 'unknown';
}

export function cleanFileName(value) {
  return cheerio.load(`<span>${String(value || '회의자료.pdf').replaceAll('<', '&lt;')}</span>`).text()
    .replace(/[\r\n/\\?%*:|"<>]/g, '_').replace(/\.(pdf|hwpx?|bin)$/i, '') + '.pdf';
}

export async function resolveMeetingPdf(meeting, fetcher = fetchSource) {
  let first;
  if (meeting.pdfFileUrl && meeting.pdfFileUrl !== 'NONE') {
    try {
      first = await fetcher(meeting.pdfFileUrl);
      if (attachmentKind(first) === 'pdf') return { bytes: first, fileName: cleanFileName(meeting.pdfFileName || meeting.title) };
    } catch { /* Rediscover the current attachment URL. */ }
  }
  if (meeting.sourceUrl) {
    const detail = parseDetail((await fetcher(meeting.sourceUrl)).toString('utf8'), meeting.sourceUrl);
    for (const file of detail.attachments.filter(a => a.fileType === 'pdf')) {
      try {
        const bytes = file.sourceUrl === meeting.pdfFileUrl && first ? first : await fetcher(file.sourceUrl);
        if (attachmentKind(bytes) === 'pdf') return { bytes, fileName: cleanFileName(file.fileName) };
        if (attachmentKind(bytes) === 'drm') first = bytes;
      } catch { /* Another PDF attachment can still be usable. */ }
    }
  }
  const error = new Error(first && attachmentKind(first) === 'drm'
    ? '식약처 첨부파일이 DRM 보안 문서여서 브라우저 미리보기와 OCR을 할 수 없습니다. 식약처 원문에서 확인해 주세요.'
    : '첨부파일에서 미리볼 수 있는 PDF를 확인하지 못했습니다. 식약처 원문에서 첨부파일을 확인해 주세요.');
  error.code = 'PDF_UNAVAILABLE';
  throw error;
}
