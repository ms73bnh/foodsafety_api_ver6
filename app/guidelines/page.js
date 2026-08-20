"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function GuidelinesPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // PDF 미리보기 모달 상태
  const [previewPdf, setPreviewPdf] = useState(null); // { url, title }

  // 상세 보기 모달 상태
  const [detailItem, setDetailItem] = useState(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: p.toString(),
        limit: limit.toString(),
        search: debouncedSearch
      });
      const res = await fetch(`/api/guidelines?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setTotal(json.total);
        setPage(p);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit]);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <main className="container animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 20px 60px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="title-gradient" style={{ margin: '0 0 6px', fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-book-bookmark" style={{ color: '#0d9488' }}></i> 기능성 평가 가이드라인
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
            식약처 건강기능식품 기능성 평가 가이드라인(민원인 안내서) 목록 및 PDF 원문 미리보기/다운로드 — 총 <strong style={{ color: '#0d9488' }}>{total}</strong>건
          </p>
        </div>

        {/* 검색창 */}
        <div style={{ position: 'relative', minWidth: '280px' }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
          <input
            type="text"
            placeholder="가이드라인 제목, 내용 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px 9px 36px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '0.85rem',
              outline: 'none',
              background: '#fff'
            }}
          />
        </div>
      </div>

      {/* 가이드라인 목록 테이블 */}
      <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
              <th style={{ padding: '14px 16px', width: '70px', textAlign: 'center' }}>번호</th>
              <th style={{ padding: '14px 16px' }}>가이드라인 제목</th>
              <th style={{ padding: '14px 16px', width: '120px' }}>작성부서</th>
              <th style={{ padding: '14px 16px', width: '110px', textAlign: 'center' }}>등록일</th>
              <th style={{ padding: '14px 16px', width: '90px', textAlign: 'center' }}>조회수</th>
              <th style={{ padding: '14px 16px', width: '220px', textAlign: 'center' }}>첨부파일 / 미리보기</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> 가이드라인을 불러오는 중입니다...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                  <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}></i>
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                    {item.no}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        onClick={() => setDetailItem(item)}
                        style={{ fontWeight: 600, color: '#0f172a', cursor: 'pointer', hover: { color: '#0d9488' } }}
                      >
                        {item.title}
                      </span>
                      {item.detailUrl && (
                        <a
                          href={item.detailUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="식약처 원문 보기"
                          style={{ color: '#94a3b8', fontSize: '0.78rem' }}
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '0.82rem' }}>
                    {item.dept || '식약처'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                    {item.regDate || '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {item.viewCnt || '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    {item.localPdfPath ? (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {/* 미리보기 버튼 */}
                        <button
                          onClick={() => setPreviewPdf({ url: item.localPdfPath, title: item.title })}
                          style={{
                            padding: '5px 10px',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            border: '1px solid #bae6fd',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <i className="fa-solid fa-eye"></i> 미리보기
                        </button>
                        {/* 다운로드 버튼 */}
                        <a
                          href={item.localPdfPath}
                          download
                          style={{
                            padding: '5px 10px',
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <i className="fa-solid fa-download"></i> 다운로드
                        </a>
                      </div>
                    ) : item.attachmentUrl ? (
                      <a
                        href={item.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: '5px 10px',
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <i className="fa-solid fa-file-arrow-down"></i> 식약처 다운로드
                      </a>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>첨부 없음</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 페이징 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '18px', borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={() => fetchData(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
            >
              이전
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => fetchData(p)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: page === p ? '#0d9488' : '#e2e8f0',
                  background: page === p ? '#0d9488' : '#fff',
                  color: page === p ? '#fff' : '#475569',
                  fontWeight: page === p ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => fetchData(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* ─── PDF 미리보기 모달 ─── */}
      {previewPdf && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)' }} onClick={() => setPreviewPdf(null)} />
          <div style={{ position: 'relative', width: '92vw', height: '90vh', background: '#fff', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>
            {/* 모달 헤더 */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-file-pdf" style={{ color: '#ef4444', fontSize: '1.2rem' }}></i>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>
                  {previewPdf.title}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <a
                  href={previewPdf.url}
                  download
                  style={{
                    padding: '6px 12px',
                    background: '#0d9488',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="fa-solid fa-download"></i> 다운로드
                </a>
                <a
                  href={previewPdf.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '6px 12px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                >
                  새 탭에서 열기
                </a>
                <button
                  onClick={() => setPreviewPdf(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8', marginLeft: '6px' }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* 모달 바디: PDF iframe */}
            <div style={{ flex: 1, width: '100%', background: '#525659' }}>
              <iframe
                src={previewPdf.url}
                width="100%"
                height="100%"
                style={{ border: 'none' }}
                title="PDF 미리보기"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── 상세 보기 모달 ─── */}
      {detailItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)' }} onClick={() => setDetailItem(null)} />
          <div style={{ position: 'relative', width: '680px', maxWidth: '92vw', background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0d9488' }}>
                  No. {detailItem.no} · {detailItem.dept}
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.15rem', color: '#0f172a' }}>{detailItem.title}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>등록일: {detailItem.regDate} · 조회수: {detailItem.viewCnt}</p>
              </div>
              <button onClick={() => setDetailItem(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', background: '#f8fafc', padding: '16px', borderRadius: '8px', fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#334155', marginBottom: '16px' }}>
              {detailItem.content || '본문 내용이 없습니다.'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {detailItem.localPdfPath ? (
                <button
                  onClick={() => {
                    const path = detailItem.localPdfPath;
                    const title = detailItem.title;
                    setDetailItem(null);
                    setPreviewPdf({ url: path, title });
                  }}
                  style={{ padding: '8px 16px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  <i className="fa-solid fa-file-pdf" style={{ marginRight: '6px' }}></i> PDF 미리보기 열기
                </button>
              ) : <div />}
              <button
                onClick={() => setDetailItem(null)}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
