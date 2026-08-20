"use client";

import { useEffect, useState, use, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

function CompanyDetailContent({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const { bsshNm } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeUnit, setTimeUnit] = useState('monthly');
  const [timeRange, setTimeRange] = useState('all');

  useEffect(() => {
    fetch(`/api/companies/${encodeURIComponent(bsshNm)}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) setData(result);
        else setError(result.error);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [bsshNm]);

  if (loading) return <div className="container" style={{ textAlign: 'center', marginTop: '50px' }}>의미망 분석 엔진 로딩중...</div>;
  if (error) return <div className="container" style={{ color: 'red' }}>오류 발생: {error}</div>;
  if (!data) return <div className="container">데이터를 찾을 수 없습니다.</div>;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
       legend: { labels: { color: 'var(--text-color)', font: { family: 'Noto Sans KR' } } },
       tooltip: { mode: 'index', intersect: false }
    },
    onClick: (e, elements) => {
       if (elements.length > 0) {
          const idx = elements[0].index;
          const label = lineData.labels[idx];
          const query = timeUnit === 'daily' ? `date=${label}` : `month=${label}`;
          router.push(`/search?${query}&bsshNm=${bsshNm}`);
       }
    },
    scales: {
       x: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'rgba(0,0,0,0.05)' } },
       y: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true }
    }
  };

  const getChartData = () => {
    let sourceData = timeUnit === 'daily' ? data.dailyStats : data.monthlyStats;
    if (timeRange !== 'all') {
      const now = new Date();
      if (timeRange === '2y') now.setFullYear(now.getFullYear() - 2);
      else if (timeRange === '1y') now.setFullYear(now.getFullYear() - 1);
      else if (timeRange === '6m') now.setMonth(now.getMonth() - 6);
      else if (timeRange === '3m') now.setMonth(now.getMonth() - 3);
      else if (timeRange === '1m') now.setMonth(now.getMonth() - 1);
      sourceData = sourceData.filter(d => new Date(d.label) >= now);
    }
    return {
      labels: sourceData.map(s => s.label),
      datasets: [{
        label: timeUnit === 'daily' ? '일간 신규 제품 등록 트렌드' : '월간 신규 제품 등록 트렌드',
        data: sourceData.map(s => s.count),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#8b5cf6',
        pointRadius: 4,
      }]
    };
  };

  const lineData = getChartData();

  const companyDoughnut = data.functStats.length > 0 ? {
    labels: data.functStats.map(d => d.label),
    datasets: [{
      data: data.functStats.map(d => d.count),
      backgroundColor: ['#1e3a8a', '#0d9488', '#8b5cf6', '#3b82f6', '#39ff14'],
      borderWidth: 0,
      hoverOffset: 10
    }]
  } : null;

  return (
    <main className="container animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <Link href="/companies" className="btn" style={{ background: '#f1f5f9', color: 'var(--text-color)', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
          <i className="fa-solid fa-arrow-left" style={{marginRight: '6px'}}></i> 전체 업체 목록으로
        </Link>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '32px', marginBottom: '32px' }}>
         <span style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 600 }}>업체 상세 리포트</span>
         <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-color)', marginTop: '8px' }}>{data.companyName}</span>
         <span style={{ color: 'var(--accent-secondary)', fontSize: '1.2rem', fontWeight: 600, marginTop: '8px' }}>총 누적 신고: {data.totalCount.toLocaleString()}건</span>
      </div>

      <div className="layout-2-col" style={{ marginBottom: '32px' }}>
         <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
             <h3 style={{ marginBottom: '16px', color: 'var(--text-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <i className="fa-solid fa-chart-line" style={{marginRight: '8px'}}></i>업체 시계열 신고 추적
                <div style={{ display: 'flex', gap: '8px' }}>
                   <select 
                      value={timeUnit} 
                      onChange={e => setTimeUnit(e.target.value)}
                      style={{ background: '#fff', color: 'var(--text-color)', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                   >
                      <option value="monthly">월간</option>
                      <option value="daily">일간</option>
                   </select>
                   <select 
                      value={timeRange} 
                      onChange={e => setTimeRange(e.target.value)}
                      style={{ background: '#fff', color: 'var(--text-color)', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', minWidth: '100px' }}
                   >
                      <option value="all">전체 기간</option>
                      <option value="2y">최근 2년</option>
                      <option value="1y">최근 1년</option>
                      <option value="6m">최근 6개월</option>
                      <option value="3m">최근 3개월</option>
                      <option value="1m">최근 1개월</option>
                   </select>
                </div>
             </h3>
            <div style={{ flex: 1, position: 'relative' }}>
               <Line data={lineData} options={chartOptions} />
            </div>
         </div>

         <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
             <h3 style={{ marginBottom: '24px', color: 'var(--text-color)', alignSelf: 'flex-start', width: '100%' }}><i className="fa-solid fa-chart-pie" style={{marginRight: '8px'}}></i>주력 기능성 제품 분포</h3>
             {companyDoughnut ? (
                <div style={{ width: '100%', maxWidth: '300px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                   <Doughnut data={companyDoughnut} options={{ cutout: '75%', plugins: { legend: { position: 'right', labels: { color: 'var(--text-color)', usePointStyle: true, boxWidth: 8, font: { family: 'Noto Sans KR' } } } } }} />
                </div>
            ) : <p style={{ color: '#94a3b8' }}>추출된 성분 데이터가 없습니다.</p>}
         </div>
      </div>

      <h2 className="title-gradient" style={{ fontSize: '1.5rem', marginTop: '48px', marginBottom: '16px' }}>최근 등록한 제품 리스트 (최대 20건)</h2>
      <div className="glass-panel">
          <div className="table-container" style={{ fontSize: '0.85rem', overflowX: 'auto' }}>
            <table style={{ tableLayout: 'fixed', minWidth: '900px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>허가일자</th>
                  <th style={{ width: '38%' }}>품목명</th>
                  <th style={{ width: '15%' }}>제형</th>
                  <th style={{ width: '25%' }}>기능성</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>상세</th>
                </tr>
              </thead>
              <tbody>
                {data.recentItems.map((item, idx) => (
                   <tr key={idx} className="table-row">
                    <td style={{ color: 'var(--text-muted)' }}>{item.prmsDt ? item.prmsDt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                    <td><div style={{ fontWeight: 600, color: 'var(--text-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.prdlstNm}</div></td>
                    <td><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.dispos || '-'}</div></td>
                    <td><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span className="badge badge-new" style={{ fontSize: '0.75rem' }}>{item.normalizedFunctionality || '-'}</span></div></td>
                    <td style={{ textAlign: 'center' }}>
                      <Link href={`/detail/${item.prdlstReportNo}`} className="btn sync-btn" style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-block' }}>상세</Link>
                    </td>
                  </tr>
                ))}
                {data.recentItems.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '32px' }}>등록된 제품이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </div>
    </main>
  );
}

export default function CompanyDetailPage({ params }) {
  return (
    <Suspense fallback={<div className="container">데이터 로딩 중...</div>}>
      <CompanyDetailContent params={params} />
    </Suspense>
  );
}

