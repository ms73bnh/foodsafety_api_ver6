'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function ProductionListPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hItemNm, setHItemNm] = useState('');
  const [limit] = useState(20);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 자동완성 제안 호출
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!searchQuery || searchQuery.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/production/suggestions?query=${encodeURIComponent(searchQuery)}`);
        const json = await res.json();
        if (json.success) setSuggestions(json.suggestions);
      } catch (err) { console.error(err); }
    };
    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [sortConfig, setSortConfig] = useState({ key: 'total', direction: 'desc' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setShowSuggestions(false);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('page', page);
      queryParams.append('limit', limit);
      if (searchQuery) queryParams.append('query', searchQuery);
      if (hItemNm) queryParams.append('hItemNm', hItemNm);
      
      const res = await fetch(`/api/production/stats?${queryParams.toString()}`);
      const json = await res.json();
      if (json.success) {
        // 데이터 집계 및 가공
        const processed = (json.matrixData || []).map(p => {
          const total = Object.entries(p.yearly || {})
            .filter(([y]) => y !== '2026')
            .reduce((sum, [_, val]) => sum + (Number(val) || 0), 0);
          return { ...p, total };
        });

        // 현재 선택된 정렬 기준 적용
        const { key, direction } = sortConfig;
        processed.sort((a, b) => {
          let valA, valB;
          if (key === 'total') {
            valA = Number(a.total || 0);
            valB = Number(b.total || 0);
            return direction === 'asc' ? valA - valB : valB - valA;
          } else if (key === 'prdlstNm') {
            valA = a.prdlstNm || '';
            valB = b.prdlstNm || '';
            return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          } else if (key === 'bsshNm') {
            valA = a.bsshNm || '';
            valB = b.bsshNm || '';
            return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          } else {
            valA = Number(a.yearly?.[key] || 0);
            valB = Number(b.yearly?.[key] || 0);
            return direction === 'asc' ? valA - valB : valB - valA;
          }
        });

        setData(processed);
        setTotal(json.totalCount || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, hItemNm, limit, sortConfig]);

  useEffect(() => {
    fetchData();
  }, [page]);

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      setPage(1);
      fetchData();
    }
  };

  // 정렬 함수
  const handleSort = (key) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc';
    setSortConfig({ key, direction });

    const sortedData = [...data].sort((a, b) => {
      let valA, valB;
      if (key === 'total') {
        valA = Number(a.total || 0);
        valB = Number(b.total || 0);
        return direction === 'asc' ? valA - valB : valB - valA;
      } else if (key === 'prdlstNm') {
        valA = a.prdlstNm || '';
        valB = b.prdlstNm || '';
        return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (key === 'bsshNm') {
        valA = a.bsshNm || '';
        valB = b.bsshNm || '';
        return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        valA = Number(a.yearly?.[key] || 0);
        valB = Number(b.yearly?.[key] || 0);
        return direction === 'asc' ? valA - valB : valB - valA;
      }
    });
    setData(sortedData);
  };

  const years = Array.from({ length: 2025 - 2016 + 1 }, (_, i) => 2016 + i).reverse();

  // 페이징 번호 계산
  const totalPages = Math.ceil(total / limit);
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <main className="container animate-fade-in" style={{ padding: '40px 20px' }}>
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <Link href="/production" style={{ textDecoration: 'none', color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
              <i className="fa-solid fa-arrow-left"></i> 대시보드로 돌아가기
           </Link>
           <h1 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>생산 실적 매트릭스 목록</h1>
           <p style={{ color: 'var(--text-muted)' }}>2016년~2025년 품목별 생산 실적을 매트릭스 형태로 조회합니다.</p>
        </div>
      </div>

      {/* 고급 검색 필터 */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px', position: 'relative', zIndex: 1000 }}>
         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
            <div style={{ position: 'relative' }}>
               <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-muted)', fontWeight: 600 }}>업체명 / 품목명 / 보고번호</label>
               <div style={{ position: 'relative' }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                  <input 
                    type="text" 
                    placeholder="검색어 입력 후 Enter" 
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onKeyDown={handleSearch}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="suggestions-box">
                      {suggestions.map((s, i) => (
                        <div key={i} className="suggestion-item" onClick={() => {
                          setSearchQuery(s.value);
                          setShowSuggestions(false);
                          fetchData();
                        }}>
                          <span className={`suggestion-badge ${s.type === '회사' ? 'badge-company' : 'badge-product'}`}>{s.type}</span>
                          <span className="suggestion-value">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
               </div>
            </div>
            <div>
               <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-muted)', fontWeight: 600 }}>품목유형 (예: 프로바이오틱스, 비타민 C)</label>
               <input 
                 type="text" 
                 placeholder="유형 입력" 
                 value={hItemNm}
                 onChange={(e) => setHItemNm(e.target.value)}
                 onKeyDown={handleSearch}
                 style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
               />
            </div>
            <button className="btn sync-btn" onClick={() => { setPage(1); fetchData(); }} style={{ padding: '12px 32px' }}>검색하기</button>
         </div>
      </div>

      {/* 데이터 테이블 */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>총 <span style={{ color: 'var(--accent)' }}>{total.toLocaleString()}</span>건의 품목</div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>* 헤더 클릭 시 현재 페이지 정렬 가능 / 생산량 단위: KG</span>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1300px' }}>
            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th 
                  onClick={() => handleSort('prdlstNm')}
                  style={{ padding: '12px 16px', fontSize: '0.7rem', width: '200px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}
                >
                  품목 명칭 {sortConfig.key === 'prdlstNm' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                <th 
                  onClick={() => handleSort('bsshNm')}
                  style={{ padding: '12px 16px', fontSize: '0.7rem', width: '130px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}
                >
                  업체명 / 유형 {sortConfig.key === 'bsshNm' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                <th 
                  onClick={() => handleSort('total')}
                  style={{ padding: '12px 16px', fontSize: '0.7rem', width: '100px', background: 'rgba(13, 148, 136, 0.05)', borderBottom: '2px solid #e2e8f0', textAlign: 'right', color: 'var(--accent)', cursor: 'pointer', userSelect: 'none' }}
                >
                  총 합계 {sortConfig.key === 'total' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </th>
                {years.map(y => (
                  <th 
                    key={y} 
                    onClick={() => handleSort(y)}
                    style={{ padding: '12px 4px', fontSize: '0.65rem', width: '70px', textAlign: 'right', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}
                  >
                    {y}년 {sortConfig.key === y && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={years.length + 3} style={{ padding: '100px', textAlign: 'center' }}><i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: 'var(--accent)' }}></i></td></tr>
              ) : data.length > 0 ? (
                data.map((item, idx) => (
                  <tr key={idx} className="table-row">
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <Link href={`/detail/${item.prdlstReportNo}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-color)', marginBottom: '2px', fontSize: '0.75rem' }}>{item.prdlstNm}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>보고번호: {item.prdlstReportNo}</div>
                      </Link>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{item.bsshNm}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }} title={item.hItemNm}>{item.hItemNm}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: 'var(--accent)', fontSize: '0.75rem', background: 'rgba(13, 148, 136, 0.02)' }}>
                      {item.total?.toLocaleString() || '0'}
                    </td>
                    {years.map(y => (
                      <td key={y} style={{ padding: '12px 4px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: item.yearly[y] ? 'var(--accent-secondary)' : '#e2e8f0', fontSize: '0.7rem' }}>
                        {item.yearly[y] ? item.yearly[y].toLocaleString() : '-'}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr><td colSpan={years.length + 3} style={{ padding: '100px', textAlign: 'center', color: '#94a3b8' }}>검색 결과가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* 숫자형 페이징 */}
        {totalPages > 0 && (
          <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', gap: '8px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
             <button onClick={() => setPage(1)} className="btn-page" disabled={page === 1} title="처음으로"><i className="fa-solid fa-angles-left"></i></button>
             <button onClick={() => setPage(p => Math.max(1, p - 1))} className="btn-page" disabled={page === 1} title="이전"><i className="fa-solid fa-angle-left"></i></button>
             
             {getPageNumbers().map(p => (
               <button 
                 key={p} 
                 onClick={() => setPage(p)} 
                 className={`btn-page ${page === p ? 'active' : ''}`}
               >
                 {p}
               </button>
             ))}
             
             <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="btn-page" disabled={page === totalPages} title="다음"><i className="fa-solid fa-angle-right"></i></button>
             <button onClick={() => setPage(totalPages)} className="btn-page" disabled={page === totalPages} title="끝으로"><i className="fa-solid fa-angles-right"></i></button>
             
             <div style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{page} / {totalPages} 페이지</div>
          </div>
        )}
      </div>

      <style jsx>{`
        .table-row:hover { background: #fdfdfd; }
        .btn-page {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: var(--text-color);
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.2s;
        }
        .btn-page:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .btn-page.active {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }
        .btn-page:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .suggestions-box {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          z-index: 99999; 
          margin-top: 8px;
          max-height: 400px;
          overflow-y: auto;
          backdrop-filter: blur(15px);
        }
        .suggestion-item {
          padding: 14px 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s;
          border-bottom: 1px solid #f1f5f9;
        }
        .suggestion-item:last-child { border-bottom: none; }
        .suggestion-item:hover {
          background: #f1f5f9;
          padding-left: 20px;
        }
        .suggestion-badge {
          font-size: 0.65rem;
          padding: 3px 8px;
          border-radius: 6px;
          font-weight: 800;
          min-width: 45px;
          text-align: center;
        }
        .badge-company { background: #0d9488; color: #fff; }
        .badge-product { background: #0284c7; color: #fff; }
        .suggestion-value { font-size: 0.85rem; color: #1e293b; font-weight: 500; }
      `}</style>
    </main>
  );
}
