const BASE_URL_SYNC = 'https://www.mfds.go.kr';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/**
 * HTML 문자열에서 HTML 엔티티 및 태그를 제거하는 함수
 */
export function cleanHtmlText(text = '') {
  return String(text || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#034;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
    .replace(/&quot;/gi, '"')
    .replace(/&reg;/gi, '®')
    .replace(/&copy;/gi, '©')
    .replace(/&trade;/gi, '™')
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 식약처 HTML(목록 페이지 또는 상세 페이지)에서 PDF 및 HWP 첨부파일 링크/이름을 정밀 추출
 */
export function extractAttachmentsFromHtml(html = '', baseUrl = `${BASE_URL_SYNC}/brd/m_532/`) {
  let pdfFileName = null;
  let pdfFileUrl = null;
  let hwpFileName = null;
  let hwpFileUrl = null;

  const resolveUrl = (raw) => {
    if (!raw) return null;
    const unescaped = raw.replace(/&amp;/g, '&').trim();
    if (unescaped.startsWith('http')) return unescaped;
    if (unescaped.startsWith('./')) return `${baseUrl}${unescaped.slice(2)}`;
    return `${BASE_URL_SYNC}${unescaped.startsWith('/') ? '' : '/'}${unescaped}`;
  };

  // 1. 목록 페이지 구조 (bbs_file_list > li > bbs_file_list_header > span + bbs_icon_filedown)
  const listPattern = /<li[^>]*>[\s\S]*?<div\s+class=["']bbs_file_list_header["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/div>[\s\S]*?<a\s+[^>]*href=["']([^"']*)["'][^>]*class=["'][^"']*bbs_icon_filedown[^"']*["']/gi;
  let m;
  while ((m = listPattern.exec(html)) !== null) {
    const rawName = cleanHtmlText(m[1]);
    const rawHref = m[2];
    const fullUrl = resolveUrl(rawHref);

    if (/\.pdf$/i.test(rawName) || rawHref.toLowerCase().includes('.pdf')) {
      if (!pdfFileUrl) {
        pdfFileName = rawName;
        pdfFileUrl = fullUrl;
      }
    } else if (/\.(?:hwp|hwpx)$/i.test(rawName) || rawHref.toLowerCase().includes('.hwp')) {
      if (!hwpFileUrl) {
        hwpFileName = rawName;
        hwpFileUrl = fullUrl;
      }
    }
  }

  // 2. 상세 페이지 구조 (bbs_file_cont > strong + a.bbs_icon_filedown)
  if (!pdfFileUrl || !hwpFileUrl) {
    const viewPattern = /<div\s+class=["']bbs_file_cont["'][^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>[\s\S]*?<a\s+[^>]*href=["']([^"']*)["'][^>]*class=["'][^"']*bbs_icon_filedown[^"']*["']/gi;
    while ((m = viewPattern.exec(html)) !== null) {
      const rawName = cleanHtmlText(m[1]);
      const rawHref = m[2];
      const fullUrl = resolveUrl(rawHref);

      if (/\.pdf$/i.test(rawName) || rawHref.toLowerCase().includes('.pdf')) {
        if (!pdfFileUrl) {
          pdfFileName = rawName;
          pdfFileUrl = fullUrl;
        }
      } else if (/\.(?:hwp|hwpx)$/i.test(rawName) || rawHref.toLowerCase().includes('.hwp')) {
        if (!hwpFileUrl) {
          hwpFileName = rawName;
          hwpFileUrl = fullUrl;
        }
      }
    }
  }

  // 3. Fallback: 일반 a 태그 down.do 또는 FileDown.do 링크
  if (!pdfFileUrl || !hwpFileUrl) {
    const generalPattern = /<a\s+[^>]*href=["']([^"']*(?:down\.do|FileDown\.do)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = generalPattern.exec(html)) !== null) {
      const rawHref = m[1];
      const linkText = cleanHtmlText(m[2]);
      const fullUrl = resolveUrl(rawHref);

      const startIdx = Math.max(0, m.index - 200);
      const endIdx = Math.min(html.length, m.index + m[0].length + 200);
      const ctx = html.substring(startIdx, endIdx);
      const fnMatch = ctx.match(/[\w가-힣()[\]\-_ .]+\.(?:pdf|hwp|hwpx|PDF|HWP|HWPX)/i);
      const detectedName = fnMatch ? fnMatch[0].trim() : linkText;

      if (/\.pdf$/i.test(detectedName) || detectedName.includes('.pdf') || rawHref.toLowerCase().includes('.pdf')) {
        if (!pdfFileUrl) {
          pdfFileName = detectedName || '첨부파일.pdf';
          pdfFileUrl = fullUrl;
        }
      } else if (/\.(?:hwp|hwpx)$/i.test(detectedName) || detectedName.includes('.hwp') || rawHref.toLowerCase().includes('.hwp')) {
        if (!hwpFileUrl) {
          hwpFileName = detectedName || '첨부파일.hwp';
          hwpFileUrl = fullUrl;
        }
      }
    }
  }

  // 4. javascript:fn_egov_downFile 패턴
  if (!pdfFileUrl || !hwpFileUrl) {
    const jsPattern = /<a\s+[^>]*href=["']javascript:fn_(?:egov_downFile|fileDown|atchFileDown)\(['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\)[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = jsPattern.exec(html)) !== null) {
      const text = cleanHtmlText(m[3]);
      const fullUrl = `${BASE_URL_SYNC}/cmm/fms/FileDown.do?atchFileId=${m[1]}&fileSn=${m[2]}`;
      if (/\.pdf$/i.test(text) && !pdfFileUrl) {
        pdfFileName = text;
        pdfFileUrl = fullUrl;
      } else if (/\.(?:hwp|hwpx)$/i.test(text) && !hwpFileUrl) {
        hwpFileName = text;
        hwpFileUrl = fullUrl;
      }
    }
  }

  return { pdfFileName, pdfFileUrl, hwpFileName, hwpFileUrl };
}

/**
 * 식약처에서 PDF 파일을 fetch하여 텍스트를 추출
 */
export async function extractPdfTextFromUrl(pdfUrl, refererUrl = BASE_URL_SYNC) {
  if (!pdfUrl || pdfUrl === 'NONE') return null;

  try {
    const resp = await fetch(pdfUrl, {
      headers: {
        ...FETCH_HEADERS,
        Referer: refererUrl,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      console.warn(`[PDF Extract] Failed to fetch ${pdfUrl}: HTTP ${resp.status}`);
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // PDF 매직바이트 확인 (%PDF)
    const isPdf = buffer.slice(0, 4).toString('ascii') === '%PDF';
    if (!isPdf) {
      console.warn(`[PDF Extract] Downloaded file is not PDF (magic: ${buffer.slice(0, 4).toString('hex')})`);
      return null;
    }

    // pdf-parse dynamic import (Next.js 빌드 호환성)
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = pdfParseModule.default || pdfParseModule;

    const parsed = await pdfParse(buffer);
    const rawText = parsed.text || '';

    // 텍스트 클렌징
    const cleanText = rawText
      .replace(/\r\n|\r/g, '\n')
      .replace(/[\t\u00a0]+/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return cleanText.length > 30 ? cleanText : null;
  } catch (error) {
    console.error(`[PDF Extract Error] ${pdfUrl}:`, error.message);
    return null;
  }
}
