"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CompaniesPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  // Active search text is updated only when form is submitted
  const [activeSearch, setActiveSearch] = useState(''); 

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ search: activeSearch, page, limit: 20 });
      const res = await fetch(`/api/companies?${query.toString()}`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeSearch]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setActiveSearch(search);
  };

  const handleClear = () => {
    setSearch('');
    setActiveSearch('');
    setPage(1);
  };

  return (
    <main className="container animate-fade-in">
      <h1 className="title-gradient"><i className="fa-solid fa-city" style={{marginRight: '12px'}}></i>업체별 현황 디스커버리</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>전체 건강기능식품 신고 업체를 조회하고 업소별 통계를 열람합니다.</p>
      
      <div className="glass-panel" style={{ marginBottom: '32px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>업소명 검색</label>
            <input 
              type="text" 
              placeholder="예: 코스맥스, 바이오" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', maxWidth: '400px', background: '#fff' }}
            />
          </div>
          <button type="submit" className="btn sync-btn"><i className="fa-solid fa-magnifying-glass"></i> 검색</button>
          <button type="button" className="btn" onClick={handleClear} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: 'var(--text-muted)' }}>초기화</button>
        </form>
      </div>

      <div className="glass-panel">
        
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
             <i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: 'var(--accent)' }}></i>
             <p style={{ marginTop: '16px' }}>데이터 로딩중...</p>
          </div>
        ) : (
          <div className="table-container" style={{ fontSize: '0.9rem' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '10%', textAlign: 'center' }}>순위</th>
                  <th style={{ width: '60%' }}>업소명</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>등록 제품 수</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>상세 현황</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, idx) => (
                  <tr key={item.bsshNm} className="table-row">
                    <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>{ (page - 1) * 20 + idx + 1 }</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-color)' }}>{item.bsshNm}</td>
                    <td style={{ textAlign: 'center', color: 'var(--accent-secondary)', fontWeight: 'bold' }}>{item.count.toLocaleString()} 건</td>
                    <td style={{ textAlign: 'center' }}>
                      <Link href={`/companies/${encodeURIComponent(item.bsshNm)}`} className="btn sync-btn" style={{ fontSize: '0.8rem', padding: '6px 16px', display: 'inline-block' }}>분석</Link>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>검색 결과가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
          <button 
             className="btn" 
             disabled={page === 1}
             onClick={() => setPage(page - 1)}
             style={{ background: '#f1f5f9', color: 'var(--text-color)', border: '1px solid #e2e8f0', opacity: page === 1 ? 0.5 : 1 }}
          >
            <i className="fa-solid fa-chevron-left"></i> 이전
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}><strong>{page}</strong> 페이지 (상위 20개 매칭)</span>
          <button 
             className="btn" 
             disabled={data.length < 20}
             onClick={() => setPage(page + 1)}
             style={{ background: '#f1f5f9', color: 'var(--text-color)', border: '1px solid #e2e8f0', opacity: data.length < 20 ? 0.5 : 1 }}
          >
            다음 <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </main>
  );
}
