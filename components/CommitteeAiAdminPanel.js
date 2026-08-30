"use client";

import { useCallback, useEffect, useState } from 'react';

const STAGE_LABELS = {
  E5_DIAGNOSTIC: 'E5 진단',
  QUESTION_ANALYSIS: '질문 분석',
  EVIDENCE_VALIDATION: '근거 검증',
  FINAL_ANSWER: '최종 답변',
  FINAL_ANSWER_TEST: '최종 답변 테스트',
};

function StatusCard({ title, ok, children }) {
  return (
    <div style={{ flex: '1 1 320px', padding: 18, background: '#fff', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong style={{ color: '#0f172a' }}>{title}</strong>
        <span style={{ padding: '3px 9px', borderRadius: 999, background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#166534' : '#991b1b', fontSize: '.72rem', fontWeight: 800 }}>
          {ok ? '정상 설정' : '확인 필요'}
        </span>
      </div>
      <div style={{ marginTop: 10, color: '#475569', fontSize: '.78rem', lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

export default function CommitteeAiAdminPanel() {
  const [data, setData] = useState(null);
  const [prompts, setPrompts] = useState({ system: '', questionAnalysis: '', evidenceValidation: '' });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState('');
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/committee/ai-admin', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setData(result);
      setPrompts(result.prompts);
    } catch (error) {
      setMessage(`불러오기 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const runAction = async (action, payload = {}) => {
    setRunning(action); setMessage(''); setTestResult(null);
    try {
      const response = await fetch('/api/committee/ai-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (result.prompts) setPrompts(result.prompts);
      if (result.result) setTestResult(result.result);
      setMessage(action === 'save-prompts' ? '프롬프트를 저장했습니다.' : action === 'reset-prompts' ? '기본 프롬프트로 초기화했습니다.' : '테스트가 정상 완료되었습니다.');
      await load();
    } catch (error) {
      setMessage(`실패: ${error.message}`);
    } finally {
      setRunning('');
    }
  };

  if (loading && !data) return <div className="glass-panel">AI 관리 정보를 불러오는 중...</div>;

  const e5 = data?.e5 || {};
  const gemini = data?.gemini || {};
  const embeddingHealthy = e5.configured && e5.embeddedChunks > 0 && e5.failedChunks === 0;

  return (
    <div className="animate-fade-in">
      <div className="glass-panel" style={{ marginBottom: 22 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>AI 운영 진단</h2>
        <p style={{ color: '#64748b', fontSize: '.84rem', lineHeight: 1.6 }}>
          테스트 버튼을 누를 때만 외부 API를 호출합니다. 일반 상태 새로고침은 Gemini 토큰이나 E5 임베딩을 소비하지 않습니다.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <StatusCard title="E5 임베딩 서버" ok={embeddingHealthy}>
            <div>환경변수: {e5.configured ? '설정됨' : '누락'}</div>
            <div>모델: {e5.model || '-'} / {e5.dimensions || '-'}차원</div>
            <div>청크: 완료 {e5.embeddedChunks ?? '-'} · 대기 {e5.pendingChunks ?? '-'} · 실패 {e5.failedChunks ?? '-'}</div>
            <div style={{ wordBreak: 'break-all' }}>주소: {e5.url || '-'}</div>
          </StatusCard>
          <StatusCard title="Gemini LLM" ok={gemini.configured}>
            <div>API 키: {gemini.configured ? '설정됨' : '누락'}</div>
            <div>질문/검증 모델: {(gemini.structuredModels || []).join(', ') || '-'}</div>
            <div>최종 답변 모델: {(gemini.answerModels || []).join(', ') || '-'}</div>
          </StatusCard>
        </div>
        {(e5.errors || []).length > 0 && (
          <div style={{ marginTop: 14, padding: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
            <strong style={{ color: '#9a3412', fontSize: '.78rem' }}>최근 임베딩 실패 원인</strong>
            {(e5.errors || []).map((item, index) => <div key={index} style={{ color: '#9a3412', fontSize: '.74rem', marginTop: 5, wordBreak: 'break-all' }}>{item.count}건 · {item.error}</div>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn btn-primary" disabled={!!running} onClick={() => runAction('test-e5')}>{running === 'test-e5' ? 'E5 테스트 중...' : 'E5 실제 임베딩 테스트'}</button>
          <button className="btn btn-primary" disabled={!!running} onClick={() => runAction('test-gemini-analysis')}>{running === 'test-gemini-analysis' ? 'Gemini 테스트 중...' : 'Gemini 질문 분석 테스트'}</button>
          <button className="btn btn-primary" disabled={!!running} onClick={() => runAction('test-gemini-answer')}>{running === 'test-gemini-answer' ? 'Gemini 테스트 중...' : 'Gemini 최종 답변 테스트'}</button>
          <button className="btn" disabled={loading || !!running} onClick={load}>상태·로그 새로고침</button>
        </div>
        {message && <div style={{ marginTop: 12, color: message.startsWith('실패') || message.startsWith('불러오기') ? '#b91c1c' : '#15803d', fontWeight: 700, fontSize: '.8rem' }}>{message}</div>}
        {testResult && <pre style={{ marginTop: 12, padding: 12, background: '#0f172a', color: '#cbd5e1', borderRadius: 8, whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: '.74rem' }}>{JSON.stringify(testResult, null, 2)}</pre>}
      </div>

      <div className="glass-panel" style={{ marginBottom: 22 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Gemini 프롬프트 편집</h2>
        <p style={{ color: '#64748b', fontSize: '.8rem' }}>저장 후 새 질문부터 즉시 적용됩니다. 중괄호 변수는 삭제하지 마세요.</p>
        {[
          ['questionAnalysis', '1. 질문 키워드·검색문 생성', '{{question}} 필수'],
          ['evidenceValidation', '2. 조건부 검색 근거 검증', '{{question}}, {{evidence}} 필수'],
          ['system', '3. 최종 답변 시스템 프롬프트', '답변 규칙·어투·금지사항'],
        ].map(([key, label, hint]) => (
          <label key={key} style={{ display: 'block', marginTop: 16 }}>
            <div style={{ fontWeight: 800, color: '#334155', fontSize: '.82rem', marginBottom: 6 }}>{label} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({hint})</span></div>
            <textarea value={prompts[key] || ''} onChange={event => setPrompts(current => ({ ...current, [key]: event.target.value }))} rows={key === 'system' ? 12 : 8} style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1px solid #cbd5e1', borderRadius: 9, fontFamily: 'inherit', fontSize: '.78rem', lineHeight: 1.6, resize: 'vertical' }} />
          </label>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" disabled={!!running} onClick={() => runAction('save-prompts', { prompts })}>{running === 'save-prompts' ? '저장 중...' : '프롬프트 저장'}</button>
          <button className="btn" disabled={!!running} onClick={() => confirm('세 프롬프트를 기본값으로 되돌릴까요?') && runAction('reset-prompts')}>기본값 초기화</button>
        </div>
      </div>

      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div><h2 style={{ margin: 0, fontSize: '1.2rem' }}>AI 호출 로그</h2><p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '.78rem' }}>최근 50건 · 동일 requestId로 질문 분석/검증/최종 답변을 연결합니다.</p></div>
          <button className="btn" onClick={load}>새로고침</button>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {(data?.logs || []).length === 0 && <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>아직 저장된 AI 호출 로그가 없습니다.</div>}
          {(data?.logs || []).map(log => (
            <details key={log.id} style={{ border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', padding: '10px 12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '.76rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>{STAGE_LABELS[log.stage] || log.stage}</strong>
                <span>{log.provider} · {log.model || '-'}</span>
                <span style={{ color: log.status === 'COMPLETED' ? '#15803d' : log.status === 'FAILED' ? '#b91c1c' : '#b45309', fontWeight: 800 }}>{log.status}</span>
                <span>{log.durationMs ?? '-'}ms</span>
                <span style={{ color: '#94a3b8' }}>{new Date(log.createdAt).toLocaleString('ko-KR')}</span>
              </summary>
              <div style={{ marginTop: 10, color: '#64748b', fontSize: '.7rem' }}>requestId: {log.requestId}</div>
              {log.error && <pre style={{ color: '#b91c1c', background: '#fef2f2', padding: 10, whiteSpace: 'pre-wrap', borderRadius: 6 }}>{log.error}</pre>}
              <div style={{ marginTop: 9, fontWeight: 800, fontSize: '.74rem' }}>입력 프롬프트</div>
              <pre style={{ maxHeight: 260, overflow: 'auto', background: '#f8fafc', padding: 10, whiteSpace: 'pre-wrap', borderRadius: 6, fontSize: '.7rem' }}>{log.prompt || '-'}</pre>
              <div style={{ marginTop: 9, fontWeight: 800, fontSize: '.74rem' }}>출력 응답</div>
              <pre style={{ maxHeight: 260, overflow: 'auto', background: '#f8fafc', padding: 10, whiteSpace: 'pre-wrap', borderRadius: 6, fontSize: '.7rem' }}>{log.response || '-'}</pre>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
