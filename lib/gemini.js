import { GoogleGenAI } from '@google/genai';

const QUERY_CACHE_MAX_ENTRIES = 200;
const QUESTION_ANALYSIS_TTL_MS = 30 * 60 * 1000;
const STRUCTURED_MODELS = [
  process.env.GEMINI_FAST_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
];
const ANSWER_MODELS = [
  process.env.GEMINI_ANSWER_MODEL || 'gemini-3.6-flash',
  'gemini-3.5-flash',
];

const questionAnalysisCache = globalThis.__committeeQuestionAnalysisCache || new Map();
globalThis.__committeeQuestionAnalysisCache = questionAnalysisCache;

function getGenAI() {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  return new GoogleGenAI({ apiKey: key });
}

function cleanQuestionText(text = '') {
  return String(text || '').trim().replace(/\s+/g, ' ').substring(0, 6000);
}

async function generateGeminiJson(prompt, responseJsonSchema) {
  const ai = getGenAI();
  let lastError;
  for (const model of STRUCTURED_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
          responseJsonSchema,
        },
      });
      return JSON.parse(response.text || '{}');
    } catch (error) {
      lastError = error;
      console.warn(`Structured model ${model} failed:`, error.message);
    }
  }
  throw lastError || new Error('Gemini 구조화 응답 생성 실패');
}

export async function analyzeCommitteeQuestion(question = '') {
  const cacheKey = cleanQuestionText(question).toLowerCase();
  if (!cacheKey) return { keywords: [], searchQuery: '', intent: 'general', needsValidation: false };
  const now = Date.now();
  const cached = questionAnalysisCache.get(cacheKey);
  if (cached && now - cached.createdAt < QUESTION_ANALYSIS_TTL_MS) return cached.value;

  const result = await generateGeminiJson(
    `건강기능식품 심의위원회 회의록 검색용으로 사용자 질문을 분석하세요.\n` +
    `검색에 실제 도움이 되는 원료명, 회차, 연도, 심의결과, 기능성 표현만 keywords에 넣으세요.\n` +
    `searchQuery는 의미 검색에 적합한 한 문장으로 쓰세요. 질문이 모호하거나 여러 해석이 가능하면 needsValidation을 true로 하세요.\n\n질문: ${question}`,
    {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        searchQuery: { type: 'string' },
        intent: { type: 'string', enum: ['agenda', 'recent', 'member', 'meeting', 'general'] },
        needsValidation: { type: 'boolean' },
      },
      required: ['keywords', 'searchQuery', 'intent', 'needsValidation'],
    },
  );
  const value = {
    keywords: Array.isArray(result.keywords) ? result.keywords.map(String).filter(Boolean).slice(0, 10) : [],
    searchQuery: String(result.searchQuery || question).trim(),
    intent: String(result.intent || 'general'),
    needsValidation: Boolean(result.needsValidation),
  };
  if (questionAnalysisCache.size >= QUERY_CACHE_MAX_ENTRIES) questionAnalysisCache.delete(questionAnalysisCache.keys().next().value);
  questionAnalysisCache.set(cacheKey, { value, createdAt: now });
  return value;
}

export async function validateCommitteeEvidence(question = '', evidence = '') {
  const clippedEvidence = String(evidence).slice(0, 12_000);
  return generateGeminiJson(
    `아래 검색 근거가 사용자 질문에 답하기에 충분한지 검증하세요. 외부 지식은 사용하지 마세요.\n` +
    `직접적인 근거가 없거나 다른 원료·다른 회의를 가리키면 supported를 false로 하세요.\n\n` +
    `[질문]\n${question}\n\n[검색 근거]\n${clippedEvidence}`,
    {
      type: 'object',
      properties: {
        supported: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' },
      },
      required: ['supported', 'confidence', 'reason'],
    },
  );
}

// systemInstruction을 별도 파라미터로 분리하여 Gemini가 올바르게 인식하도록 함
export async function streamGeminiResponse(userPrompt, systemInstruction = '') {
  const ai = getGenAI();
  let lastErr = null;

  for (const model of ANSWER_MODELS) {
    try {
      const config = {
        maxOutputTokens: 2048,
      };
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }

      const stream = await ai.models.generateContentStream({
        model,
        contents: userPrompt,
        config,
      });
      return stream;
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${model} failed:`, err.message);
    }
  }
  throw new Error(`AI 답변 생성 실패: ${lastErr?.message}`);
}
