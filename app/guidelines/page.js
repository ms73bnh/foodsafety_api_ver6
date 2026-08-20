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
  
  // 정렬 상태
  const [sortBy, setSortBy] = useState('regDate'); // 'regDate' | 'no' | 'title'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

  // 우측 슬라이드 드로어 PDF 미리보기 상태
  const [previewItem, setPreviewItem] = useState(null);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

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
        search: debouncedSearch,
        sortBy,
        sortOrder
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
  }, [debouncedSearch, limit, sortBy, sortOrder]);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleManualSync = async () => {
    if (!confirm('식약처 서버에서 최신 기능성 평가 가이드라인을 동기화하시겠습니까?')) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/guidelines/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSyncMsg(json.message);
        fetchData(1);
      } else {
        alert(json.error || '동기화에 실패했습니다.');
      }
    } catch (e) {
      alert('동기화 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <main className="container animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 20px 60px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="title-gradient" style={{ margin: '0 0 6px', fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-book-bookmark" style={{ color: '#0d9488' }}></i> 기능성 평가 가이드라인
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
            식약처 건강기능식품 기능성 평가 가이드라인(민원인 안내서) 목록 및 PDF 원문 미리보기/다운로드 — 총 <strong style={{ color: '#0d9488' }}>{total}</strong>건
          </p>
        </div>

        {/* 수동 동기화 및 검색창 */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{
              padding: '9px 14px',
              background: '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)'
            }}
          >
            <i className={`fa-solid fa-arrows-rotate ${syncing ? 'fa-spin' : ''}`}></i>
            {syncing ? '동기화 중...' : '최신 가이드라인 동기화'}
          </button>

          <div style={{ position: 'relative', minWidth: '260px' }}>
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
      </div>

      {syncMsg && (
        <div style={{ padding: '10px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><i className="fa-solid fa-circle-check" style={{ marginRight: '6px' }}></i>{syncMsg}</span>
          <button onClick={() => setSyncMsg('')} style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 가이드라인 목록 테이블 */}
      <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
              <th
                onClick={() => handleSort('no')}
                style={{ padding: '14px 16px', width: '80px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
              >
                번호 {sortBy === 'no' ? (sortOrder === 'asc' ? '▲' : '▼') : <span style={{ color: '#cbd5e1' }}>↕</span>}
              </th>
              <th
                onClick={() => handleSort('title')}
                style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
              >
                가이드라인 제목 {sortBy === 'title' ? (sortOrder === 'asc' ? '▲' : '▼') : <span style={{ color: '#cbd5e1' }}>↕</span>}
              </th>
              <th style={{ padding: '14px 16px', width: '120px' }}>작성부서</th>
              <th
                onClick={() => handleSort('regDate')}
                style={{ padding: '14px 16px', width: '130px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', color: sortBy === 'regDate' ? '#0d9488' : '#475569' }}
              >
                등록일 {sortBy === 'regDate' ? (sortOrder === 'asc' ? '▲' : '▼') : <span style={{ color: '#cbd5e1' }}>↕</span>}
              </th>
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
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background 0.15s',
                    background: previewItem?.id === item.id ? '#f0fdfa' : 'transparent'
                  }}
                  onMouseEnter={e => { if (previewItem?.id !== item.id) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (previewItem?.id !== item.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                    {item.no || item.id}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        onClick={() => setPreviewItem(item)}
                        style={{
                          fontWeight: 600,
                          color: previewItem?.id === item.id ? '#0d9488' : '#0f172a',
                          cursor: 'pointer',
                          textDecoration: previewItem?.id === item.id ? 'underline' : 'none'
                        }}
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
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.82rem', fontWeight: sortBy === 'regDate' ? 600 : 400 }}>
                    {item.regDate || '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {item.viewCnt || '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      {/* 미리보기 버튼 */}
                      <button
                        onClick={() => setPreviewItem(item)}
                        style={{
                          padding: '5px 10px',
                          background: previewItem?.id === item.id ? '#0d9488' : '#e0f2fe',
                          color: previewItem?.id === item.id ? '#fff' : '#0369a1',
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
                        href={`/api/guidelines/pdf/${item.id}?download=true`}
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

      {/* ─── 우측 슬라이드 드로어 PDF 미리보기 ─── */}
      {previewItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
          {/* 백드롭 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,23,42,0.4)',
              backdropFilter: 'blur(2px)',
              transition: 'opacity 0.25s'
            }}
            onClick={() => setPreviewItem(null)}
          />
          {/* 드로어 컨테이너 */}
          <div
            style={{
              position: 'relative',
              width: '68vw',
              maxWidth: '1200px',
              minWidth: '360px',
              height: '100vh',
              background: '#fff',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1,
              animation: 'slideInRight 0.25s ease-out'
            }}
          >
            {/* 드로어 상단 바 */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <i className="fa-solid fa-file-pdf" style={{ color: '#ef4444', fontSize: '1.4rem', flexShrink: 0 }}></i>
                <div style={{ overflow: 'hidden' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {previewItem.title}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    등록일: {previewItem.regDate} · 작성부서: {previewItem.dept}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {/* 다운로드 버튼 */}
                <a
                  href={`/api/guidelines/pdf/${previewItem.id}?download=true`}
                  download
                  style={{
                    padding: '7px 14px',
                    background: '#0d9488',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="fa-solid fa-download"></i> 다운로드
                </a>
                {/* 새 창에서 열기 */}
                <a
                  href={`/api/guidelines/pdf/${previewItem.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '7px 12px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square"></i> 새 창
                </a>
                {/* 닫기 버튼 */}
                <button
                  onClick={() => setPreviewItem(null)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    color: '#64748b'
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* 드로어 본문: PDF iframe 뷰어 */}
            <div style={{ flex: 1, width: '100%', background: '#525659' }}>
              <iframe
                src={`/api/guidelines/pdf/${previewItem.id}`}
                width="100%"
                height="100%"
                style={{ border: 'none' }}
                title="PDF 미리보기"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

