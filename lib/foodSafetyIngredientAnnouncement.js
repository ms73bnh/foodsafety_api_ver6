import * as cheerio from 'cheerio';

const POST_BODY_PATTERN = /<p\b(?=[^>]*\bid\s*=\s*(?:"bdt_pre"|'bdt_pre'))[^>]*>([\s\S]*?)<\/p>/i;
const FIELD_PATTERNS = [
  /^(?:[○◯◦●*※-]\s*)?(?:원료명|Ingredient\s*name)\s*[:：]\s*(.*)$/i,
  /^(?:[○◯◦●*※-]\s*)?(?:인정번호|Recognition\s*Number)\s*[:：]\s*(.*)$/i,
  /^(?:[○◯◦●*※-]\s*)?(?:업체명|업체\s*및\s*기관|업체|제조업체|Company(?:\s*or\s*institution)?)\s*[:：]\s*(.*)$/i,
  /^(?:[○◯◦●*※-]\s*)?(?:기능성\s*내용|기능성내용|기능성|Functionality(?:\s*of\s*the\s*ingredient)?)\s*[:：]\s*(.*)$/i,
  /^(?:[○◯◦●*※-]\s*)?(?:일일\s*섭취량|일일섭취량|섭취량|Daily\s*intake(?:\s*amount)?)\s*[:：]\s*(.*)$/i,
  /^(?:[○◯◦●*※-]\s*)?(?:섭취\s*시\s*주의사항|섭취시\s*주의사항|주의사항|Precautions)\s*[:：]?\s*(.*)$/i,
];

function readField(lines, pattern) {
  const line = lines.find(value => pattern.test(value));
  return line ? line.match(pattern)[1].trim() : '';
}

function readSection(lines, pattern) {
  const start = lines.findIndex(value => pattern.test(value));
  if (start === -1) return '';

  const firstLine = lines[start].match(pattern)[1].trim();
  const section = firstLine ? [firstLine] : [];

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^(?:※\s*)?(?:English\b|○\s*English\b)/i.test(line)) break;
    if (FIELD_PATTERNS.some(fieldPattern => fieldPattern.test(line))) break;
    section.push(line);
  }

  return section.join('\n').trim();
}

export function parseFskTitle(title = '') {
  title = String(title || '').trim();
  let ingrName = title;
  let companyNm = '';
  let recogNo = '';

  const recognitionMatch = title.match(/(?:제\s*)?(\d{4}\s*-\s*\d+\s*호)/);
  if (recognitionMatch) {
    recogNo = `제${recognitionMatch[1].replace(/\s+/g, '')}`;
  }

  if (recogNo) {
    const recogPos = title.search(/(?:제\s*)?\d{4}\s*-\s*\d+\s*호/);
    if (recogPos !== -1) {
      let openParenIdx = -1;
      let depth = 0;
      for (let i = recogPos - 1; i >= 0; i--) {
        if (title[i] === ')') depth++;
        else if (title[i] === '(') {
          if (depth === 0) {
            openParenIdx = i;
            break;
          }
          depth--;
        }
      }

      if (openParenIdx !== -1) {
        ingrName = title.substring(0, openParenIdx).trim();
        let inside = title.substring(openParenIdx + 1);
        if (inside.endsWith(')')) inside = inside.slice(0, -1);
        companyNm = inside
          .split(',')
          .map(part => part.trim())
          .filter(part => !/(?:제\s*)?\d{4}\s*-\s*\d+\s*호/.test(part))
          .join(', ')
          .trim();
      }
    }
  } else {
    const lastParenMatch = title.match(/^(.*)\(([^)]+)\)$/);
    if (lastParenMatch) {
      ingrName = lastParenMatch[1].trim();
      companyNm = lastParenMatch[2].trim();
    }
  }

  return { ingrName: ingrName.replace(/\s+/g, ' ').trim(), companyNm, recogNo };
}

export function parseOfficialIngredientPost(html = '') {
  const bodyMatch = String(html || '').match(POST_BODY_PATTERN);
  if (!bodyMatch) {
    throw new Error('식약처 게시물에서 원문 본문(#bdt_pre)을 찾을 수 없습니다.');
  }

  const bodyMarkup = bodyMatch[1]
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|tr|body|html)\s*>/gi, '\n');
  const text = cheerio.load(bodyMarkup).root().text();
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const rawText = lines.join('\n');
  const recogValue = readField(lines, FIELD_PATTERNS[1]);
  const recognitionMatch = recogValue.match(/(?:제\s*)?(\d{4}\s*-\s*\d+\s*호)/);

  return {
    name: readField(lines, FIELD_PATTERNS[0]),
    company: readField(lines, FIELD_PATTERNS[2]),
    recogNo: recognitionMatch ? `제${recognitionMatch[1].replace(/\s+/g, '')}` : '',
    fnText: readSection(lines, FIELD_PATTERNS[3]),
    dailyIntake: readSection(lines, FIELD_PATTERNS[4]),
    precautions: readSection(lines, FIELD_PATTERNS[5]),
    rawText,
  };
}
