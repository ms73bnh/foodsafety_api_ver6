'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
} from 'chart.js';
import { Pie, Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title
);

export default function ProductionDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success && d.user?.role === 'ADMIN') setIsAdmin(true);
    }).catch(() => {});
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [excludeHy, setExcludeHy] = useState(false);

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

  const fetchData = async () => {
    setLoading(true);
    setShowSuggestions(false);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('query', searchQuery);
      if (selectedYear) queryParams.append('year', selectedYear);
      if (excludeHy) queryParams.append('excludeHy', 'true');
      queryParams.append('limit', '50'); // 대시보드에서는 상위 50개만 표시
      
      const res = await fetch(`/api/production/stats?${queryParams.toString()}`);
      const json = await res.json();
      if (json.success) {
        setStats(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedYear, excludeHy]);

  // 상단 검색 핸들러
  const handleSearch = (e) => {
    if (e.key === 'Enter') fetchData();
  };

  // 정렬 핸들러
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // 데이터 동기화 핸들러 (연도별 개별 동기화)
  const handleYearSync = async (year) => {
    if (syncing) return;
    if (!confirm(`${year}년 생산 실적 데이터를 동기화하시겠습니까?`)) return;

    setSyncing(year); // 현재 동기화 중인 연도 저장
    try {
      let currentIdx = 1;
      let keepGoing = true;
      
      while (keepGoing) {
        const res = await fetch('/api/production/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, startIdx: currentIdx, limit: 1000 })
        });
        const data = await res.json();
        
        if (data.success && data.fetchedRows > 0) {
          currentIdx += data.fetchedRows;
        } else {
          keepGoing = false;
        }
      }
      alert(`${year}년 데이터 동기화가 완료되었습니다.`);
      fetchData();
    } catch (err) {
      alert(`${year}년 동기화 중 오류 발생: ` + err.message);
    } finally {
      setSyncing(false);
    }
  };

  // 데이터 동기화 핸들러 (2016년부터 순차적으로)
  const handleFullSync = async () => {
    if (syncing) return;
    if (!confirm('2016년부터 2025년까지의 모든 생산 실적 데이터를 동기화하시겠습니까? (상당한 시간이 소요될 수 있습니다)')) return;

    setSyncing('ALL');
    try {
      const years = Array.from({ length: 2025 - 2016 + 1 }, (_, i) => 2016 + i);
      
      for (const year of years) {
        let currentIdx = 1;
        let keepGoing = true;
        
        while (keepGoing) {
          const res = await fetch('/api/production/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, startIdx: currentIdx, limit: 1000 })
          });
          const data = await res.json();
          
          if (data.success && data.fetchedRows > 0) {
            currentIdx += data.fetchedRows;
          } else {
            keepGoing = false;
          }
        }
        console.log(`${year}년 동기화 완료`);
      }
      alert('전체 데이터 동기화가 완료되었습니다.');
      fetchData();
    } catch (err) {
      alert('동기화 중 오류 발생: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  // 차트 데이터 준비: 도넛(TOP 10)
  const donutData = useMemo(() => {
    if (!stats?.topProducts) return null;
    return {
      labels: stats.topProducts.map(p => p.prdlstNm.length > 10 ? p.prdlstNm.substring(0, 10) + '..' : p.prdlstNm),
      datasets: [{
        data: stats.topProducts.map(p => p.prdctnQy),
        backgroundColor: [
          '#0d9488', '#0284c7', '#8b5cf6', '#f59e0b', '#ef4444',
          '#10b981', '#3b82f6', '#d946ef', '#f97316', '#64748b'
        ],
        borderWidth: 1,
      }]
    };
  }, [stats]);

  // 차트 데이터 준비: 트렌드(연도별)
  const trendData = useMemo(() => {
    if (!stats?.yearlyTrend) return null;
    return {
      labels: stats.yearlyTrend.map(t => t.year + '년').filter(l => !l.includes('2026')),
      datasets: [{
        label: searchQuery ? `'${searchQuery}' 생산량 합계` : '전체 생산량 (KG)',
        data: stats.yearlyTrend.filter(t => t.year !== 2026).map(t => t.value),
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.2)',
        fill: true,
        tension: 0.4
      }]
    };
  }, [stats, searchQuery]);

  // 매트릭스 테이블 데이터 가공
  const tableMatrix = useMemo(() => {
    if (!stats?.matrixData) return { data: [], years: [] };
    
    // 존재하는 모든 연도 추출 (2026 제외)
    const yearsSet = new Set();
    stats.matrixData.forEach(p => {
      Object.keys(p.yearly).forEach(y => {
        if (y !== '2026') yearsSet.add(y);
      });
    });
    
    let sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    if (sortedYears.length === 0) sortedYears = ['2025', '2024', '2023', '2022'];

    // 데이터 가공 및 정렬
    const processedData = stats.matrixData.map(p => {
      const total = Object.entries(p.yearly)
        .filter(([y]) => y !== '2026')
        .reduce((sum, [_, val]) => sum + (val || 0), 0);
      return { ...p, total };
    });

    // 정렬 로직
    processedData.sort((a, b) => {
      let valA, valB;
      if (sortConfig.key === 'total') {
        valA = a.total;
        valB = b.total;
      } else if (sortConfig.key === 'name') {
        valA = a.prdlstNm;
        valB = b.prdlstNm;
      } else {
        valA = a.yearly[sortConfig.key] || 0;
        valB = b.yearly[sortConfig.key] || 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return {
      data: processedData,
      years: sortedYears
    };
  }, [stats, sortConfig]);

  return (
    <main className="container animate-fade-in" style={{ padding: '40px 20px' }}>
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>생산 실적 보고 현황</h1>
          <p style={{ color: 'var(--text-muted)' }}>건강기능식품 품목별/업체별 연간 생산 실적을 분석합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/production/list" className="btn" style={{ background: '#f8fafc', color: 'var(--text-color)', border: '1px solid #e2e8f0' }}>
            <i className="fa-solid fa-list-ul" style={{ marginRight: '8px' }}></i>
            실적 데이터 리스트 보기
          </Link>
          {isAdmin && <div className="sync-group" style={{ display: 'flex', gap: '8px', padding: '12px', background: 'rgba(13, 148, 136, 0.05)', borderRadius: '15px', border: '1px solid rgba(13, 148, 136, 0.1)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0d9488', marginBottom: '4px', textAlign: 'center', width: '100%', gridColumn: '1 / -1' }}>
              연도별 동기화
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
              {Array.from({ length: 2025 - 2016 + 1 }, (_, i) => 2016 + i).map(y => (
                <button 
                  key={y}
                  onClick={() => handleYearSync(y.toString())}
                  className={`btn ${syncing === y.toString() ? 'loading' : ''}`}
                  style={{ 
                    padding: '4px 8px', 
                    fontSize: '0.7rem', 
                    background: syncing === y.toString() ? '#0d9488' : '#fff',
                    color: syncing === y.toString() ? '#fff' : '#0d9488',
                    border: '1px solid #0d9488'
                  }}
                  disabled={syncing !== false}
                >
                  {y}
                </button>
              ))}
            </div>
            <button 
              onClick={handleFullSync} 
              className={`btn sync-btn ${syncing === 'ALL' ? 'loading' : ''}`}
              style={{ background: '#0d9488', color: 'white', padding: '8px 12px', fontSize: '0.8rem', height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}
              disabled={syncing !== false}
            >
              <i className={`fa-solid fa-rotate ${syncing === 'ALL' ? 'fa-spin' : ''}`} style={{ marginRight: '8px' }}></i>
              전체
            </button>
          </div>}
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'nowrap', position: 'relative', zIndex: 1000 }}>
         <div style={{ flex: 1, position: 'relative', minWidth: '300px' }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
            <input 
              type="text" 
              placeholder="업체명 또는 품목명으로 검색 (Enter)" 
              className="tag-input-container" 
              style={{ width: '100%', padding: '10px 12px 10px 45px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.9rem' }}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onKeyDown={handleSearch}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
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
          <select 
            className="btn" 
            style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 12px', minWidth: '160px', height: '42px', fontSize: '0.85rem' }}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">전체 연도별 보기</option>
            {Array.from({ length: 2025 - 2016 + 1 }, (_, i) => 2025 - i).map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
         <button 
           className="btn sync-btn" 
           style={{ padding: '8px 20px', height: '42px', fontSize: '0.85rem', whiteSpace: 'nowrap' }} 
           onClick={fetchData}
         >
           검색
         </button>
      </div>

      {/* 대시보드 시각화 섹션 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="glass-panel" style={{ padding: '24px', position: 'relative' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-chart-pie" style={{ color: '#0d9488' }}></i>
            {stats?.targetYear}년 생산량 TOP 10 품목 비중
            <div className="info-tooltip-container">
              <i className="fa-solid fa-circle-question" style={{ color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer' }}></i>
              <div className="info-tooltip">아래 검색 조건에 따라 품목별 생산 합계 비중이 시각화됩니다.</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', cursor: 'pointer' }} onClick={() => setExcludeHy(!excludeHy)}>
              <input 
                type="checkbox" 
                checked={excludeHy} 
                onChange={(e) => setExcludeHy(e.target.checked)} 
                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#0d9488' }}
                onClick={(e) => e.stopPropagation()}
              />
              에치와이 제외
            </div>
          </h3>
          <div style={{ height: '350px', display: 'flex', justifyContent: 'center', position: 'relative' }}>
            {loading && (
              <div className="chart-loading-overlay">
                <i className="fa-solid fa-spinner fa-spin fa-2xl"></i>
                <span>데이터 반영 중...</span>
              </div>
            )}
            {donutData ? <Pie data={donutData} options={{ maintainAspectRatio: false }} /> : <div className="loading-placeholder">데이터가 없습니다.</div>}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', position: 'relative' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-chart-line" style={{ color: '#0284c7' }}></i>
            {searchQuery ? `'${searchQuery}' 검색 결과 생산량 추이` : '전체 생산량 연도별 추이 (KG)'}
            <div className="info-tooltip-container">
              <i className="fa-solid fa-circle-question" style={{ color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer' }}></i>
              <div className="info-tooltip">검색어 및 필터 조건에 따른 연도별 생산량 변화 추이를 보여줍니다.</div>
            </div>
          </h3>
          <div style={{ height: '350px', position: 'relative' }}>
            {loading && (
              <div className="chart-loading-overlay">
                <i className="fa-solid fa-spinner fa-spin fa-2xl"></i>
                <span>데이터 분석 중...</span>
              </div>
            )}
            {trendData ? <Line data={trendData} options={{ maintainAspectRatio: false }} /> : <div className="loading-placeholder">데이터가 없습니다.</div>}
          </div>
        </div>
      </div>

      {/* 랭킹 및 분석 섹션 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* 제조업체 랭킹 */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-building" style={{ color: '#0d9488' }}></i>
            {stats?.targetYear}년 제조업체 랭킹 (TOP 10)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats?.companyRanking?.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ minWidth: '24px', height: '24px', borderRadius: '50%', background: i < 3 ? 'var(--accent)' : '#f1f5f9', color: i < 3 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(c.value / stats.companyRanking[0].value) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #0d9488, #2dd4bf)', borderRadius: '3px' }}></div>
                  </div>
                </div>
                <div title={c.value ? `${c.value.toLocaleString()} KG` : ''} style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent)', marginLeft: '8px', cursor: 'default' }}>{c.value ? Math.round(c.value).toLocaleString() : '0'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 기능성 성분 랭킹 */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-flask-vial" style={{ color: '#0284c7' }}></i>
            주요 기능성 원료 비중 (TOP 10)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats?.ingredientRanking?.map((ing, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ minWidth: '24px', height: '24px', borderRadius: '50%', background: i < 3 ? '#0284c7' : '#f1f5f9', color: i < 3 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ing.name}</div>
                  <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(ing.value / stats.ingredientRanking[0].value) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)', borderRadius: '3px' }}></div>
                  </div>
                </div>
                <div title={ing.value ? `${ing.value.toLocaleString()} KG` : ''} style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0284c7', marginLeft: '8px', cursor: 'default' }}>{ing.value ? Math.round(ing.value).toLocaleString() : '0'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 시장 모멘텀: 카테고리별 성장/쇠퇴 */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-chart-line" style={{ color: '#f59e0b' }}></i>
            시장 모멘텀: 기능성 성분 트렌드
            <div className="info-tooltip-container">
              <i className="fa-solid fa-circle-question" style={{ color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer' }}></i>
              <div className="info-tooltip">
                전년 대비 생산량이 존재하는 카테고리 중 절대 증감량이 큰 순으로 정렬되었습니다.<br/>
                <b>* 영양성분(비타민, 미네랄 등) 제외</b>
              </div>
            </div>
          </h3>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '-15px', marginBottom: '15px' }}>
            * 영양성분(비타민, 미네랄 등)은 제외된 데이터입니다.
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-fire"></i> 급격히 확장 중인 시장 (Top 5)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stats?.topGrowingCategories?.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.03)', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{c.name}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444' }}>+{c.growthRate?.toFixed(1)}%</div>
                    <div title={c.diff ? `+${c.diff.toLocaleString()} KG` : ''} style={{ fontSize: '0.6rem', color: '#94a3b8', cursor: 'default' }}>+{c.diff ? Math.round(c.diff).toLocaleString() : '0'} KG</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#3b82f6', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-temperature-low"></i> 축소 중인 시장 (Top 5)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stats?.topShrinkingCategories?.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(59, 130, 246, 0.03)', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{c.name}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#3b82f6' }}>{c.growthRate?.toFixed(1)}%</div>
                    <div title={c.diff ? `${c.diff.toLocaleString()} KG` : ''} style={{ fontSize: '0.6rem', color: '#94a3b8', cursor: 'default' }}>{c.diff ? Math.round(c.diff).toLocaleString() : '0'} KG</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .loading-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #94a3b8;
          font-weight: 500;
        }
        .chart-loading-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(255, 255, 255, 0.7);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          z-index: 5;
          backdrop-filter: blur(2px);
          font-size: 0.9rem;
          color: var(--accent);
          font-weight: 700;
          border-radius: 12px;
        }
        .info-tooltip-container {
          position: relative;
          display: flex;
          align-items: center;
        }
        .info-tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: #334155;
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 500;
          width: 200px;
          text-align: center;
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          margin-bottom: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
        }
        .info-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 5px;
          border-style: solid;
          border-color: #334155 transparent transparent transparent;
        }
        .info-tooltip-container:hover .info-tooltip {
          opacity: 1;
          visibility: visible;
          bottom: 120%;
        }
        .table-row-hover:hover {
          background: #fdfdfd;
          cursor: pointer;
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
