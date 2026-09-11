'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

const STATUS = { pending: '처리 대기', extracting: '페이지 추출 중', embedding: '임베딩 중', completed: '검색 가능', review: 'OCR 검토 필요', retry: '재시도 대기', failed: '처리 실패', unsupported: '미지원 형식' };
const DOCS = { body: '게시물 본문', minutes: '회의록', results: '심의결과', attachment: '기타 첨부' };
const TOPICS = { agenda: '심의 안건', result: '심의 결과', supplementation: '보완 사유', condition: '검토 조건·기준', safety: '안전성', functionality: '기능성', attendance: '참석·회의 정보', table: '표', other: '기타 내용' };

export default function CommitteeDocumentsPanel({ admin = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [topic, setTopic] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(async (signal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), category, search: query });
      const response = await fetch(`/api/committee/documents?${params}`, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '자료를 불러오지 못했습니다.');
      setData(result); setError('');
    } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [page, category, query]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function openDocument(id) {
    setDetailLoading(true); setSelected(null);
    try {
      const response = await fetch(`/api/committee/documents?documentId=${id}`);
      const result = await response.json();
      if (!response.ok || !result.documents?.[0]) throw new Error(result.error || '문서를 찾지 못했습니다.');
      setSelected(result.documents[0]);
    } catch (err) { setError(err.message); }
    finally { setDetailLoading(false); }
  }

  async function action(body) {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/committee/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '작업 요청에 실패했습니다.');
      setNotice(result.message || (result.queued !== undefined ? `${result.queued}건의 작업을 등록했습니다.` : '검토 내용을 저장했습니다.'));
      await refresh();
      if (selected && body.documentId) await openDocument(selected.id);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function processNext() {
    setBusy(true); setNotice('서버에서 다음 작업을 처리하고 있습니다.');
    try {
      const response = await fetch('/api/committee/ingestion/tick', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '작업 처리에 실패했습니다.');
      setNotice(result.idle ? '지금 처리할 대기 작업이 없습니다.' : result.error || `작업 처리 결과: ${STATUS[result.status] || result.status}`);
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function download(documentId) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ category: topic });
      if (documentId) params.set('documentId', documentId);
      const response = await fetch(`/api/committee/documents/export?${params}`);
      if (!response.ok) { const result = await response.json(); throw new Error(result.error); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `심의위원회_${documentId ? '문서' : '전체'}_${TOPICS[topic] || '청킹자료'}.md`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('마크다운 파일을 다운로드했습니다.');
    } catch (err) { setError(err.message || '다운로드하지 못했습니다.'); }
    finally { setBusy(false); }
  }

  const counts = Object.fromEntries((data?.statuses || []).map(row => [row.status, row._count]));
  return <section className="rag-library">
    <header className="library-header">
      <div><span className="eyebrow">심의위원회 자료실</span><h2>원문에서 근거까지</h2><p>게시물과 첨부파일을 분류별로 살펴보고, 표와 청킹 내용을 마크다운으로 내려받으세요.</p></div>
      <Link href="/committee">AI 질의응답으로 돌아가기 →</Link>
    </header>
    <div className="metrics">
      {[[counts.completed || 0, '검색 가능한 문서'], [counts.review || 0, 'OCR 검토 필요'], [(counts.failed || 0) + (counts.retry || 0), '실패·재시도'], [data?.chunks || 0, '활성 임베딩 청크']].map(([value, label]) => <div key={label}><strong>{value.toLocaleString()}</strong><span>{label}</span></div>)}
    </div>
    {admin && <div className="admin-actions"><button disabled={busy} onClick={() => action({ action: 'enqueue' })}>전체 게시물 재수집 등록</button><button disabled={busy} onClick={() => action({ action: 'retry' })}>실패 작업 재시도</button><button disabled={busy} onClick={processNext}>다음 작업 처리</button><span>진행 상황은 서버에 저장됩니다.</span></div>}
    <form className="filters" onSubmit={e => { e.preventDefault(); setPage(1); setQuery(search); }}>
      <label>문서 검색<input value={search} onChange={e => setSearch(e.target.value)} placeholder="게시물 제목 또는 파일명" /></label>
      <label>문서 분류<select value={category} onChange={e => { setPage(1); setCategory(e.target.value); }}><option value="">전체 문서</option>{Object.entries(DOCS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button type="submit" disabled={loading}>검색</button><button type="button" disabled={loading} onClick={() => refresh()}>새로고침</button>
    </form>
    <div className="export-actions"><label>다운로드할 내용<select value={topic} onChange={e => setTopic(e.target.value)}><option value="">모든 분류</option>{Object.entries(TOPICS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><button disabled={busy || !data} onClick={() => download()}>전체 활성 자료 .md 다운로드</button><small>위 문서 검색 조건과 관계없이 선택한 내용 분류의 전체 활성 자료를 받습니다.</small></div>
    {error && <div role="alert" className="error">{error}</div>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {loading ? <p role="status">자료를 불러오는 중입니다…</p> : data && <>
      <div className="result-count">문서 {data.total}건 <span>준비 중인 새 버전은 검증 완료 후 검색에 반영됩니다.</span></div>
      <div className="document-grid">{data.documents.map(doc => <article key={doc.id}>
        <div className="badges"><span>{DOCS[doc.category] || doc.category}</span><span className={doc.active ? 'ready' : ''}>{STATUS[doc.status] || doc.status}</span></div>
        <h3>{doc.fileName}</h3><p className="meeting-title">{doc.meeting.title}</p><p className="metadata">{doc.meeting.meetingNo || '회차 미확인'} · {doc.meeting.postDate || '날짜 미확인'} · {doc.pageCount}쪽 · 청크 {doc._count.chunks}개</p>
        {doc.error && <p className="document-error">{doc.error}</p>}
        <div className="card-actions"><button onClick={() => openDocument(doc.id)} disabled={detailLoading}>원문·표 보기</button><button disabled={busy} onClick={() => download(doc.id)}>.md 다운로드</button>{doc.fileType === 'pdf' && doc.pageCount > 0 && <a target="_blank" rel="noreferrer" href={`/api/committee/documents/${doc.id}/file`}>PDF 원본 ↗</a>}</div>
      </article>)}</div>
      {!data.documents.length && <div className="empty">조건에 맞는 문서가 없습니다. 새 자료는 수집 작업 후 표시됩니다.</div>}
      <nav className="pagination" aria-label="자료 페이지"><button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>이전</button><span>{page} / {Math.max(1, data.pages)}</span><button disabled={page >= data.pages || loading} onClick={() => setPage(p => p + 1)}>다음</button></nav>
    </>}
    {detailLoading && <p role="status">페이지와 표를 불러오는 중입니다…</p>}
    {selected && <div className="document-detail"><div className="detail-header"><h3>{selected.fileName}</h3><button onClick={() => setSelected(null)}>닫기</button></div>
      <p>원본의 표 구조를 보존한 페이지별 추출 결과입니다. 문서 안의 내용 분류는 자동 판정됩니다.</p>
      {(selected.pages || []).map(p => <section className="pdf-page" key={p.pageNumber}><div className="page-heading"><h4>{p.pageNumber}쪽</h4><span>{p.status === 'review' ? '검토 필요' : '추출 완료'}</span>{selected.fileType === 'pdf' && <a target="_blank" rel="noreferrer" href={`/api/committee/documents/${selected.id}/file#page=${p.pageNumber}`}>이 페이지 원본 ↗</a>}</div>
        {p.warnings?.length > 0 && <p className="document-error">{p.warnings.join(' / ')}</p>}
        <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{p.markdown || '(빈 페이지)'}</ReactMarkdown></div>
        {admin && p.status === 'review' && <><details><summary>텍스트 파서 결과와 대조</summary><pre>{p.nativeText || '추출된 텍스트 없음'}</pre></details><div className="card-actions"><button disabled={busy} onClick={() => action({ action: 'review-page', documentId: selected.id, pageNumber: p.pageNumber })}>원본 대조 완료</button><button disabled={busy} onClick={() => action({ action: 'review-page', documentId: selected.id, pageNumber: p.pageNumber, retryOcr: true })}>이 페이지 OCR 재시도</button></div></>}
      </section>)}
      {!selected.pages?.length && <p>페이지 추출이 아직 완료되지 않았습니다.</p>}
    </div>}
    <style jsx>{`
      .rag-library{color:#172c38;max-width:1280px;margin:0 auto;padding:28px;background:#f7faf9;border:1px solid #dbe6e2;border-radius:18px}.library-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.eyebrow{font-size:12px;color:#087f73;font-weight:700;letter-spacing:.1em}h2{font-size:30px;letter-spacing:-.04em;margin:10px 0}p{line-height:1.7}.library-header p{color:#58706f;margin:0 0 22px}.library-header a{font-size:13px;white-space:nowrap;color:#087f73}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:8px 0 24px}.metrics>div{display:flex;flex-direction:column;background:white;border:1px solid #dce7e3;padding:18px;border-radius:12px}.metrics strong{font-size:28px}.metrics span{font-size:12px;color:#637771;margin-top:5px}button,select,input{font:inherit}button{padding:9px 13px;border:1px solid #c5d7d1;background:white;color:#174d43;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}button:hover:not(:disabled){background:#eaf4f0}button:disabled{opacity:.5;cursor:default}label{display:flex;flex-direction:column;gap:7px;font-size:12px;color:#4c665e}input,select{padding:10px;border:1px solid #c5d7d1;border-radius:8px;background:white;color:#172c38;min-width:160px}input{min-width:260px}.filters,.admin-actions,.export-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:16px 0}.admin-actions{padding:14px;background:#eef6f2;border-radius:10px;align-items:center}.admin-actions span,small{font-size:12px;color:#657c74}.export-actions{padding-bottom:18px;border-bottom:1px solid #dbe6e2}.export-actions small{align-self:center}.result-count{font-size:14px;font-weight:700;margin:24px 0 12px}.result-count span{font-weight:400;font-size:12px;color:#687b75;margin-left:14px}.document-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}article{padding:20px;background:white;border:1px solid #dce7e3;border-radius:12px;min-width:0}h3{font-size:17px;line-height:1.5;overflow-wrap:anywhere;margin:12px 0}.badges{display:flex;gap:7px;font-size:11px}.badges span{padding:5px 8px;background:#f0f3f5;border-radius:5px;color:#50636d}.badges .ready{background:#e2f5e9;color:#196e43}.meeting-title{font-size:12px;color:#607770;margin:6px 0}.metadata{font-size:12px;color:#6e807b;margin:8px 0 16px}.card-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.card-actions a,.page-heading a{font-size:12px;color:#087f73}.document-error{font-size:12px;background:#fff6e5;color:#805910;padding:10px;border-radius:6px;overflow-wrap:anywhere}.error{background:#fff0ed;color:#9f3020;padding:15px;border-radius:8px;margin:16px 0}.notice{background:#eaf5ef;padding:12px;border-radius:8px;font-size:13px}.empty{padding:40px;text-align:center;color:#687b75;background:white;border-radius:10px}.pagination{display:flex;gap:18px;align-items:center;justify-content:center;margin:24px 0 0;font-size:13px}.document-detail{margin-top:28px;background:white;padding:24px;border:1px solid #c5d7d1;border-radius:12px}.detail-header,.page-heading{display:flex;align-items:center;gap:12px;justify-content:space-between}.pdf-page{padding:18px 0;border-top:1px solid #e0e7e4}.page-heading h4{margin:10px 0}.page-heading span{font-size:12px;color:#657c74}.markdown{overflow-x:auto;font-size:14px;line-height:1.8}.markdown :global(table){width:100%;border-collapse:collapse;margin:18px 0;min-width:380px}.markdown :global(th),.markdown :global(td){border:1px solid #d6e3dd;padding:10px;text-align:left;vertical-align:top}.markdown :global(th){background:#edf5f1}.markdown :global(pre),pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7f6;padding:14px}.markdown :global(a){color:#087f73}details{font-size:12px;margin:15px 0}summary{cursor:pointer}
      @media(max-width:760px){.rag-library{padding:16px}.library-header{display:block}.library-header a{display:inline-block;margin-bottom:14px}h2{font-size:25px}.metrics{grid-template-columns:repeat(2,1fr)}.document-grid{grid-template-columns:1fr}.filters label:first-child{width:100%}input{min-width:0;width:100%}.result-count span{display:block;margin:7px 0}.document-detail{padding:14px}.page-heading{flex-wrap:wrap}}
    `}</style>
  </section>;
}
