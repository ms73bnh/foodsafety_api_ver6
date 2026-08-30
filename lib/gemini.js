import { GoogleGenAI } from '@google/genai';
import { createHash } from 'node:crypto';
import { createAiLog, completeAiLog } from '@/lib/committeeAiLogs';
import {
  DEFAULT_EVIDENCE_VALIDATION_PROMPT,
  DEFAULT_QUESTION_ANALYSIS_PROMPT,
} from '@/lib/committeePrompt';

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

async function safeCreateLog(data) {
  try { return await createAiLog(data); } catch (error) {
    console.warn('AI log creation failed:', error.message);
    return null;
  }
}

async function safeCompleteLog(id, data) {
  try { await completeAiLog(id, data); } catch (error) {
    console.warn('AI log update failed:', error.message);
  }
}

function renderPrompt(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value ?? '')),
    String(template || ''),
  );
}

async function generateGeminiJson(prompt, responseJsonSchema, { stage = 'STRUCTURED', logContext = {} } = {}) {
  const ai = getGenAI();
  let lastError;
  for (const model of STRUCTURED_MODELS) {
    const startedAt = Date.now();
    const logId = await safeCreateLog({
      ...logContext,
      stage,
      provider: 'gemini',
      model,
      prompt,
    });
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
      const parsed = JSON.parse(response.text || '{}');
      await safeCompleteLog(logId, {
        model,
        response: parsed,
        durationMs: Date.now() - startedAt,
      });
      return { value: parsed, model };
    } catch (error) {
      lastError = error;
      await safeCompleteLog(logId, {
        model,
        status: 'FAILED',
        durationMs: Date.now() - startedAt,
        error: error.message,
      });
      console.warn(`Structured model ${model} failed:`, error.message);
    }
  }
  throw lastError || new Error('Gemini 구조화 응답 생성 실패');
}

export async function analyzeCommitteeQuestion(question = '', options = {}) {
  const promptTemplate = options.promptTemplate || DEFAULT_QUESTION_ANALYSIS_PROMPT;
  const promptVersion = createHash('sha256').update(promptTemplate).digest('hex').slice(0, 12);
  const cleanedQuestion = cleanQuestionText(question).toLowerCase();
  if (!cleanedQuestion) return { keywords: [], searchQuery: '', intent: 'general', needsValidation: false };
  const cacheKey = `${promptVersion}:${cleanedQuestion}`;
  const now = Date.now();
  const cached = questionAnalysisCache.get(cacheKey);
  if (!options.bypassCache && cached && now - cached.createdAt < QUESTION_ANALYSIS_TTL_MS) return cached.value;

  const prompt = renderPrompt(promptTemplate, { question });
  const { value: result } = await generateGeminiJson(
    prompt,
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
    { stage: 'QUESTION_ANALYSIS', logContext: options.logContext },
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

export async function validateCommitteeEvidence(question = '', evidence = '', options = {}) {
  const clippedEvidence = String(evidence).slice(0, 12_000);
  const prompt = renderPrompt(options.promptTemplate || DEFAULT_EVIDENCE_VALIDATION_PROMPT, {
    question,
    evidence: clippedEvidence,
  });
  const { value } = await generateGeminiJson(
    prompt,
    {
      type: 'object',
      properties: {
        supported: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' },
      },
      required: ['supported', 'confidence', 'reason'],
    },
    { stage: 'EVIDENCE_VALIDATION', logContext: options.logContext },
  );
  return value;
}

// systemInstruction을 별도 파라미터로 분리하여 Gemini가 올바르게 인식하도록 함
export async function streamGeminiResponse(userPrompt, systemInstruction = '', options = {}) {
  const ai = getGenAI();
  let lastErr = null;

  for (const model of ANSWER_MODELS) {
    const startedAt = Date.now();
    const logId = await safeCreateLog({
      ...options.logContext,
      stage: options.stage || 'FINAL_ANSWER',
      provider: 'gemini',
      model,
      prompt: `[SYSTEM]\n${systemInstruction}\n\n[USER]\n${userPrompt}`,
    });
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
      return { stream, model, logId, startedAt };
    } catch (err) {
      lastErr = err;
      await safeCompleteLog(logId, {
        model,
        status: 'FAILED',
        durationMs: Date.now() - startedAt,
        error: err.message,
      });
      console.warn(`Model ${model} failed:`, err.message);
    }
  }
  throw new Error(`AI 답변 생성 실패: ${lastErr?.message}`);
}

export async function finishGeminiStreamLog(logId, data) {
  await safeCompleteLog(logId, data);
}

export function getGeminiConfiguration() {
  return {
    configured: Boolean(process.env.GEMINI_API_KEY),
    structuredModels: [...new Set(STRUCTURED_MODELS)],
    answerModels: [...new Set(ANSWER_MODELS)],
  };
}
