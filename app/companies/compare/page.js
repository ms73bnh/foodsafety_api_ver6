"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

/**
 * 여러 업체 데이터를 하나로 병합
 * monthlyStats: 같은 월의 count 합산
 * functStats: 같은 기능성의 count 합산
 */
function mergeCompanyData(dataList) {
  if (!dataList || dataList.length === 0) return null;

  const monthlyMap = {};
  const functMap = {};
  let totalCount = 0;

  dataList.forEach(d => {
    totalCount += d.totalCount || 0;
    (d.monthlyStats || []).forEach(s => {
      monthlyMap[s.label] = (monthlyMap[s.label] || 0) + s.count;
    });
    (d.functStats || []).forEach(s => {
      functMap[s.label] = (functMap[s.label] || 0) + s.count;
    });
  });

  const monthlyStats = Object.entries(monthlyMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const functStats = Object.entries(functMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { totalCount, monthlyStats, functStats };
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 각 그룹의 선택된 업체 목록 (배열)
  const [groupA, setGroupA] = useState([]); // e.g. ['콜마비앤에이치(주) 음성', '콜마비앤에이치(주) 세종']
  const [groupB, setGroupB] = useState([]);

  // 병합된 데이터
  const [dataA, setDataA] = useState(null);
  const [dataB, setDataB] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('all');

  // 검색 자동완성
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [suggestionsA, setSuggestionsA] = useState([]);
  const [suggestionsB, setSuggestionsB] = useState([]);

  // URL 파라미터로 초기 업체 설정 (이전 버전 호환)
  useEffect(() => {
    const c1 = searchParams.get('comp1');
    const c2 = searchParams.get('comp2');
    if (c1 && groupA.length === 0) setGroupA([c1]);
    if (c2 && groupB.length === 0) setGroupB([c2]);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // 자동완성 A
  useEffect(() => {
    if (searchA.length > 1) {
      fetch(`/api/companies?search=${encodeURIComponent(searchA)}&limit=7`)
        .then(res => res.json())
        .then(res => setSuggestionsA(res.data || []));
    } else setSuggestionsA([]);
  }, [searchA]);

  // 자동완성 B
  useEffect(() => {
    if (searchB.length > 1) {
      fetch(`/api/companies?search=${encodeURIComponent(searchB)}&limit=7`)
        .then(res => res.json())
        .then(res => setSuggestionsB(res.data || []));
    } else setSuggestionsB([]);
  }, [searchB]);

  const addToGroup = (group, setGroup, name, setSearch, setSuggestions) => {
    if (!name || group.includes(name)) return;
    setGroup([...group, name]);
    setSearch('');
    setSuggestions([]);
  };

  const removeFromGroup = (group, setGroup, name) => {
    setGroup(group.filter(n => n !== name));
  };

  const handleCompare = async () => {
    if (groupA.length === 0 || groupB.length === 0) {
      return alert('비교 업체 A와 B에 각각 최소 1개 이상의 업체를 추가해주세요.');
    }
    setLoading(true);
    setDataA(null);
    setDataB(null);
    try {
      const fetchGroup = async (names) => {
        const results = await Promise.all(
          names.map(name =>
            fetch(`/api/companies/${encodeURIComponent(name)}`).then(r => r.json())
          )
        );
        const valid = results.filter(r => r.success);
        return mergeCompanyData(valid);
      };

      const [merged1, merged2] = await Promise.all([fetchGroup(groupA), fetchGroup(groupB)]);
      setDataA(merged1);
      setDataB(merged2);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const labelA = groupA.length === 1 ? groupA[0] : `그룹 A (${groupA.length}개사)`;
  const labelB = groupB.length === 1 ? groupB[0] : `그룹 B (${groupB.length}개사)`;

  const getChartData = () => {
    if (!dataA || !dataB) return null;
    let allMonths = Array.from(new Set([
      ...dataA.monthlyStats.map(s => s.label),
      ...dataB.monthlyStats.map(s => s.label)
    ])).sort();

    if (period !== 'all') {
      const monthsCount = parseInt(period);
      const now = new Date();
      const startD = new Date(now.getFullYear(), now.getMonth() - monthsCount + 1, 1);
      const startStr = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}`;
      allMonths = allMonths.filter(m => m >= startStr);
    }
    if (allMonths.length === 0) {
      const now = new Date();
      allMonths = [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`];
    }

    const d1Map = Object.fromEntries(dataA.monthlyStats.map(s => [s.label, s.count]));
    const d2Map = Object.fromEntries(dataB.monthlyStats.map(s => [s.label, s.count]));
    return {
      labels: allMonths,
      datasets: [
        { label: labelA, data: allMonths.map(m => d1Map[m] || 0), borderColor: '#0d9488', backgroundColor: 'rgba(13, 148, 136, 0.1)', fill: true, tension: 0.4 },
        { label: labelB, data: allMonths.map(m => d2Map[m] || 0), borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true, tension: 0.4 }
      ]
    };
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#1e293b', font: { family: 'Noto Sans KR', weight: 'bold' } } }, tooltip: { mode: 'index', intersect: false } },
    onClick: (e, elements) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        const month = getChartData().labels[idx];
        router.push(`/search?month=${month}`);
      }
    },
    scales: { x: { ticks: { color: '#475569' }, grid: { color: 'rgba(0,0,0,0.05)' } }, y: { ticks: { color: '#475569' }, grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true } }
  };

  const getDoughnut = (stats) => ({
    labels: stats.map(d => d.label),
    datasets: [{ data: stats.map(d => d.count), backgroundColor: ['#1e3a8a', '#0d9488', '#8b5cf6', '#3b82f6', '#39ff14', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316'], borderWidth: 0 }]
  });

  return (
    <main className="container animate-fade-in">
      <div style={{ marginBottom: '32px' }}>
        <h1 className="title-gradient">업체 상호 비교 분석</h1>
        <p style={{ color: '#94a3b8' }}>
          각 그룹에 여러 업체(공장)를 추가하여 합산 데이터로 비교합니다.
          <br />예) 그룹 A: 콜마비앤에이치 음성공장 + 세종공장 vs 그룹 B: 경쟁사 전 공장
        </p>
      </div>

      <div className="glass-panel" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '20px', alignItems: 'flex-start' }}>

          {/* 그룹 A */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#0d9488' }}>
              비교 그룹 A <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 400 }}>(여러 업체 선택 가능)</span>
            </label>

            {/* 선택된 업체 태그 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', minHeight: '32px' }}>
              {groupA.map(name => (
                <span key={name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                  color: '#fff', padding: '4px 10px', borderRadius: '6px',
                  fontSize: '0.82rem', fontWeight: 600, boxShadow: '0 2px 4px rgba(13,148,136,0.25)'
                }}>
                  {name}
                  <i
                    className="fa-solid fa-xmark"
                    style={{ cursor: 'pointer', opacity: 0.8 }}
                    onClick={() => removeFromGroup(groupA, setGroupA, name)}
                  />
                </span>
              ))}
              {groupA.length === 0 && (
                <span style={{ color: '#94a3b8', fontSize: '0.85rem', alignSelf: 'center' }}>업체를 검색해 추가하세요</span>
              )}
            </div>

            {/* 검색 입력 */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchA}
                onChange={e => setSearchA(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && suggestionsA.length > 0) {
                    addToGroup(groupA, setGroupA, suggestionsA[0].bsshNm, setSearchA, setSuggestionsA);
                  }
                }}
                placeholder="업체명 검색 후 선택..."
                style={{ width: '100%', borderColor: 'rgba(13,148,136,0.3)' }}
              />
              {suggestionsA.length > 0 && (
                <ul className="glass-panel" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: '8px', marginTop: '4px', listStyle: 'none' }}>
                  {suggestionsA.map(s => (
                    <li
                      key={s.bsshNm}
                      onClick={() => addToGroup(groupA, setGroupA, s.bsshNm, setSearchA, setSuggestionsA)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(13,148,136,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>{s.bsshNm}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.count?.toLocaleString()}건</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {groupA.length > 0 && (
              <div style={{ marginTop: '8px', color: '#0d9488', fontSize: '0.82rem', fontWeight: 600 }}>
                총 {groupA.length}개 업체 선택됨
              </div>
            )}
          </div>

          {/* 그룹 B */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: '#8b5cf6' }}>
              비교 그룹 B <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 400 }}>(여러 업체 선택 가능)</span>
            </label>

            {/* 선택된 업체 태그 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', minHeight: '32px' }}>
              {groupB.map(name => (
                <span key={name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  color: '#fff', padding: '4px 10px', borderRadius: '6px',
                  fontSize: '0.82rem', fontWeight: 600, boxShadow: '0 2px 4px rgba(139,92,246,0.25)'
                }}>
                  {name}
                  <i
                    className="fa-solid fa-xmark"
                    style={{ cursor: 'pointer', opacity: 0.8 }}
                    onClick={() => removeFromGroup(groupB, setGroupB, name)}
                  />
                </span>
              ))}
              {groupB.length === 0 && (
                <span style={{ color: '#94a3b8', fontSize: '0.85rem', alignSelf: 'center' }}>업체를 검색해 추가하세요</span>
              )}
            </div>

            {/* 검색 입력 */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchB}
                onChange={e => setSearchB(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && suggestionsB.length > 0) {
                    addToGroup(groupB, setGroupB, suggestionsB[0].bsshNm, setSearchB, setSuggestionsB);
                  }
                }}
                placeholder="업체명 검색 후 선택..."
                style={{ width: '100%', borderColor: 'rgba(139,92,246,0.3)' }}
              />
              {suggestionsB.length > 0 && (
                <ul className="glass-panel" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: '8px', marginTop: '4px', listStyle: 'none' }}>
                  {suggestionsB.map(s => (
                    <li
                      key={s.bsshNm}
                      onClick={() => addToGroup(groupB, setGroupB, s.bsshNm, setSearchB, setSuggestionsB)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>{s.bsshNm}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.count?.toLocaleString()}건</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {groupB.length > 0 && (
              <div style={{ marginTop: '8px', color: '#8b5cf6', fontSize: '0.82rem', fontWeight: 600 }}>
                총 {groupB.length}개 업체 선택됨
              </div>
            )}
          </div>

          {/* 비교 버튼 */}
          <div style={{ paddingTop: '32px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
            <button
              onClick={handleCompare}
              className="btn sync-btn"
              disabled={loading}
              style={{ padding: '12px 24px', whiteSpace: 'nowrap' }}
            >
              {loading ? (
                <><i className="fa-solid fa-spinner fa-spin" /> 분석 중...</>
              ) : (
                <><i className="fa-solid fa-code-compare" /> 데이터 대조하기</>
              )}
            </button>
            <button
              onClick={() => { setGroupA([]); setGroupB([]); setDataA(null); setDataB(null); }}
              className="btn"
              style={{ padding: '8px 24px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
            >
              <i className="fa-solid fa-arrow-rotate-left" /> 초기화
            </button>
          </div>
        </div>
      </div>

      {/* 결과 영역 */}
      {dataA && dataB && (
        <>
          {/* 그룹 요약 정보 배너 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #0d9488' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>그룹 A</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                {groupA.map(n => <span key={n} style={{ fontSize: '0.78rem', background: 'rgba(13,148,136,0.1)', color: '#0d9488', padding: '2px 8px', borderRadius: '4px' }}>{n}</span>)}
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0d9488' }}>
                총 {dataA.totalCount?.toLocaleString()}건
              </div>
            </div>
            <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>그룹 B</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                {groupB.map(n => <span key={n} style={{ fontSize: '0.78rem', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', padding: '2px 8px', borderRadius: '4px' }}>{n}</span>)}
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#8b5cf6' }}>
                총 {dataB.totalCount?.toLocaleString()}건
              </div>
            </div>
          </div>

          {/* 월별 추이 차트 */}
          <div className="glass-panel" style={{ height: '500px', marginBottom: '32px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>신규 신고 추이 비교 (그룹 합산)</h3>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'rgba(255,255,255,0.8)', fontFamily: 'inherit', fontWeight: '500', cursor: 'pointer' }}
              >
                <option value="1">최근 1개월</option>
                <option value="3">최근 3개월</option>
                <option value="6">최근 6개월</option>
                <option value="12">최근 1년</option>
                <option value="24">최근 2년</option>
                <option value="all">전체기간</option>
              </select>
            </div>
            <div style={{ flex: 1, position: 'relative' }}><Line data={getChartData()} options={chartOptions} /></div>
          </div>

          {/* 기능성 도넛 차트 */}
          <div className="layout-2-col">
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ alignSelf: 'flex-start', marginBottom: '20px' }}>{labelA} 주력 기능성</h3>
              <div style={{ width: '100%', maxWidth: '300px' }}>
                <Doughnut
                  data={getDoughnut(dataA.functStats)}
                  options={{ cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#1e293b', usePointStyle: true, boxWidth: 8, font: { weight: 'bold' } } } } }}
                />
              </div>
            </div>
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ alignSelf: 'flex-start', marginBottom: '20px' }}>{labelB} 주력 기능성</h3>
              <div style={{ width: '100%', maxWidth: '300px' }}>
                <Doughnut
                  data={getDoughnut(dataB.functStats)}
                  options={{ cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#1e293b', usePointStyle: true, boxWidth: 8, font: { weight: 'bold' } } } } }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="container">비교 데이터 로딩 중...</div>}>
      <CompareContent />
    </Suspense>
  );
}
