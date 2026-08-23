"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NewsSliderWidget from '@/components/NewsSliderWidget';
import { useToast } from '@/components/ToastProvider';
import Link from 'next/link';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { isNutrient } from '@/lib/nutrients';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Title, Filler);

export default function DashboardPage() {
   const router = useRouter();
   const toast = useToast();
   const [stats, setStats] = useState(null);
   const [loading, setLoading] = useState(true);

   const [selectedCompany, setSelectedCompany] = useState(null);
   const [companyFuncData, setCompanyFuncData] = useState([]);
   const [companyTotalExtracted, setCompanyTotalExtracted] = useState(0);
   const [loadingCompanyData, setLoadingCompanyData] = useState(false);

   const [banners, setBanners] = useState([]);
   const [wordCloud, setWordCloud] = useState([]);
   const [loadingWC, setLoadingWC] = useState(false);
   const [recentRange, setRecentRange] = useState('6m');

   const [news, setNews] = useState([]);
   const [loadingNews, setLoadingNews] = useState(false);
   const newsFullRef = useRef(null);

   const [activePanel, setActivePanel] = useState('news');
   const [newsTab, setNewsTab] = useState('all');
   const [newsPage, setNewsPage] = useState(0);
   const NEWS_PAGE_SIZE = 10;

   // 로그인 직후 환영 토스트 + 관리자 승인 대기 알림
   useEffect(() => {
      const name = sessionStorage.getItem('welcome_user');
      if (name) {
         sessionStorage.removeItem('welcome_user');
         setTimeout(() => {
            toast(`${name} 님, 안녕하세요. 👋`, { type: 'success', duration: 4000 });
         }, 600);
      }

      // 관리자: 승인 대기 사용자 수 알림
      fetch('/api/auth/me')
         .then(r => r.json())
         .then(d => {
            if (d.success && d.user?.role === 'ADMIN') {
               fetch('/api/users')
                  .then(r => r.json())
                  .then(ud => {
                     if (!ud.success) return;
                     const pending = ud.users.filter(u => !u.isApproved).length;
                     if (pending > 0) {
                        setTimeout(() => {
                           toast(
                              `가입 승인 대기 중인 신청이 ${pending}건 있습니다.`,
                              {
                                 type: 'warning',
                                 duration: 8000,
                                 onClick: () => { window.location.href = '/manage'; },
                              }
                           );
                        }, 1800);
                     }
                  })
                  .catch(() => {});
            }
         })
         .catch(() => {});
   }, []);

   const getStartDate = (range) => {
      if (range === 'all') return '';
      const now = new Date();
      if (range === '1m') now.setMonth(now.getMonth() - 1);
      else if (range === '3m') now.setMonth(now.getMonth() - 3);
      else if (range === '6m') now.setMonth(now.getMonth() - 6);
      else if (range === '1y') now.setFullYear(now.getFullYear() - 1);
      else if (range === '2y') now.setFullYear(now.getFullYear() - 2);
      return now.toISOString().split('T')[0].replace(/-/g, '');
   };

   const handleCompanyClick = useCallback(async (companyName, force = false) => {
      if (!force && companyName === selectedCompany) return;
      setSelectedCompany(companyName);
      setLoadingCompanyData(true);

      const startDate = getStartDate(recentRange);
      // /api/data 엔드포인트를 활용해 해당 업체의 내역 최대 10,000건을 가져오고 프론트에서 집계
      try {
         const res = await fetch(`/api/data?bsshNm=${companyName}&limit=10000&startDate=${startDate}`);
         const json = await res.json();
         if (json.success) {
            const functs = {};
            json.data.forEach(item => {
               const rawVal = item.normalizedFunctionality || item.primaryFnclty || '기타';
               // 쉼표로 분리하여 개별 성분 집계
               rawVal.split(',').forEach(v => {
                  const clean = v.trim();
                  if (clean && !isNutrient(clean)) functs[clean] = (functs[clean] || 0) + 1;
               });
            });
            const allExtracted = Object.keys(functs).map(k => ({ label: k, count: functs[k] })).sort((a, b) => b.count - a.count);
            setCompanyTotalExtracted(allExtracted.reduce((acc, cur) => acc + cur.count, 0));
            setCompanyFuncData(allExtracted.slice(0, 5));
         }
      } catch (e) {
         console.error(e);
      }
      setLoadingCompanyData(false);
   }, [recentRange, selectedCompany]);

   // Fetch stats when range changes
   useEffect(() => {
      fetch(`/api/stats?recentRange=${recentRange}`)
         .then(res => res.json())
         .then(data => {
            if (data.success) {
               setStats(data);
               // Only auto-select first company on initial load if none selected
               if (data.companyStats && data.companyStats.length > 0 && !selectedCompany) {
                  handleCompanyClick(data.companyStats[0].label);
               }
            }
            setLoading(false);
         });
   }, [recentRange, selectedCompany, handleCompanyClick]);

   useEffect(() => {
      // Fetch Banners
      fetch('/api/banners')
         .then(res => res.json())
         .then(res => { if (res.success) setBanners(res.data.filter(b => b.isActive)); });

      // Fetch Word Cloud
      setLoadingWC(true);
      fetch('/api/stats/wordcloud')
         .then(res => res.json())
         .then(res => {
            if (res.success) setWordCloud(res.data);
            setLoadingWC(false);
         });

      // Fetch Food Industry News
      setLoadingNews(true);
      fetch('/api/news')
         .then(res => res.json())
         .then(res => {
            if (res.success) setNews(res.data.slice(0, 20));
            setLoadingNews(false);
         })
         .catch(() => setLoadingNews(false));
   }, []);

   // 기간망 변경 시 선택된 업체가 있다면 동시 갱신
   useEffect(() => {
      if (selectedCompany) {
         handleCompanyClick(selectedCompany, true);
      }
   }, [recentRange, selectedCompany, handleCompanyClick]);

   if (loading) return <div className="container" style={{ textAlign: 'center', marginTop: '100px' }}>의미망 분석 엔진 로딩중...</div>;

   const yesterday = new Date();
   yesterday.setDate(yesterday.getDate() - 1);
   const yesterdayStr = yesterday.toISOString().split('T')[0];
   const todaysNew = stats?.dailyStats?.find(d => d.label === yesterdayStr)?.count || 0;

   // 차트 테마 설정 (글래스모피즘 어울리도록)
   const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
         legend: { labels: { color: '#475569', font: { family: 'Noto Sans KR' } } },
         tooltip: { mode: 'index', intersect: false }
      },
      onClick: (e, elements) => {
         if (elements.length > 0) {
            const idx = elements[0].index;
            const label = lineDataMonthly.labels[idx];
            router.push(`/search?month=${label}`);
         }
      },
      scales: {
         x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.05)' } },
         y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true }
      }
   };

   const lineDataMonthly = {
      labels: stats?.monthlyStats?.map(s => s.label) || [],
      datasets: [{
         label: '신규 품목신고 추이',
         data: stats?.monthlyStats?.map(s => s.count) || [],
         borderColor: '#0d9488', // Teal
         backgroundColor: 'rgba(13, 148, 136, 0.2)',
         fill: true,
         tension: 0.4,
         pointBackgroundColor: '#39ff14',
         pointBorderColor: '#fff',
         pointRadius: 4,
      }]
   };

   const companyDoughnut = Object.keys(companyFuncData).length > 0 ? {
      labels: companyFuncData.map(d => d.label),
      datasets: [{
         data: companyFuncData.map(d => d.count),
         backgroundColor: ['#1e3a8a', '#0d9488', '#8b5cf6', '#3b82f6', '#39ff14'],
         borderWidth: 0,
         hoverOffset: 10
      }]
   } : null;

   return (
      <main className="container dashboard-page animate-fade-in">
         {/* 0. Banner Carousel / List */}
         {banners.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', flexWrap: 'wrap' }}>
               {banners.map(b => (
                  <a
                    key={b.id}
                    href={b.linkUrl || '#'}
                    target={b.linkUrl ? '_blank' : '_self'}
                    rel="noreferrer"
                    style={{
                      flex: '0 0 auto',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 12px',
                      textDecoration: 'none',
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderLeft: '3px solid var(--accent)',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      transition: 'box-shadow 0.2s',
                      minWidth: '140px', maxWidth: '280px',
                    }}
                  >
                    {b.imageUrl ? (
                      <img src={b.imageUrl} alt={b.title} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '28px', height: '28px', borderRadius: '5px', background: 'linear-gradient(135deg,#0284c7,#0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className="fa-solid fa-rectangle-ad" style={{ color: '#fff', fontSize: '0.75rem' }}></i>
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text-color)', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                      {b.linkUrl && <div style={{ color: 'var(--accent)', fontSize: '0.7rem' }}>바로가기 <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '0.6rem' }}></i></div>}
                    </div>
                  </a>
               ))}
            </div>
         )}

         <h1 className="title-gradient" style={{ fontSize: '2rem' }}>실시간 시장 변화 및 트렌드 분석</h1>

         {/* 1. 상단 요약 — 통계 카드 2개 + 뉴스 슬라이더 */}
         <div className="dashboard-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: '16px', marginBottom: '32px', position: 'relative', zIndex: 10 }}>
            <div className="glass-panel dashboard-kpi-card" style={{ display: 'flex', flexDirection: 'column', padding: '24px', alignItems: 'center', textAlign: 'center' }}>
               <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}><i className="fa-solid fa-layer-group" style={{ marginRight: '6px' }}></i>총 품목제조신고</span>
               <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-color)', marginTop: '8px' }}>{stats?.totalCount?.toLocaleString()}</span>
            </div>
            <div className="glass-panel dashboard-kpi-card" style={{ display: 'flex', flexDirection: 'column', padding: '24px', alignItems: 'center', textAlign: 'center' }}>
               <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}><i className="fa-solid fa-calendar-day" style={{ marginRight: '6px' }}></i>어제 신규 (Daily New)</span>
               <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '8px' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>{todaysNew}</span>
                  {todaysNew > 0 && <span className="badge badge-new"><i className="fa-solid fa-arrow-trend-up"></i> Trending</span>}
               </div>
            </div>
            {/* 뉴스 슬라이더 — 3번째 카드 */}
            <NewsSliderWidget news={news} loading={loadingNews} />
         </div>

         {/* 2. 메인 차트 및 최근 등록 리스트 */}
         <div className="layout-2-col" style={{ marginBottom: '32px' }}>
            <div className="glass-panel dashboard-chart-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
               <h3 style={{ marginBottom: '16px', color: 'var(--text-color)' }}><i className="fa-solid fa-chart-area" style={{ marginRight: '8px' }}></i>월간 신고 건수 추이</h3>
               <div style={{ flex: 1, position: 'relative' }}>
                  <Line data={lineDataMonthly} options={chartOptions} />
               </div>
            </div>

            {/* 사용자 요청 추가반영: 최근 등록된 품목신고 목록 카드 */}
            <div className="glass-panel dashboard-list-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
               <h3 style={{ marginBottom: '16px', color: 'var(--text-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><i className="fa-solid fa-list-ul" style={{ marginRight: '8px' }}></i>최근 등록된 품목 목록</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', cursor: 'pointer' }} onClick={() => router.push('/search')}>전체 보기 <i className="fa-solid fa-arrow-right"></i></span>
               </h3>
               <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                  {stats?.recentAdditions?.length > 0 ? (
                     <ul style={{ listStyle: 'none' }}>
                        {stats.recentAdditions.map((item, idx) => (
                           <li key={idx} style={{ padding: '16px', marginBottom: '12px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', transition: 'background 0.2s', cursor: 'pointer', border: '1px solid var(--surface-border)' }} onClick={() => window.open(`/search?prdlstReportNo=${item.prdlstReportNo}`)} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}>
                              <div style={{ color: 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}><i className="fa-solid fa-sparkles"></i> NEW</div>
                              <div style={{ fontWeight: 600, color: 'var(--text-color)', marginBottom: '6px' }}>{item.prdlstNm || '품목명 없음'}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                 <span>{item.bsshNm}</span>
                                 <span>{item.prmsDt ? item.prmsDt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</span>
                              </div>
                           </li>
                        ))}
                     </ul>
                  ) : <p style={{ color: '#94a3b8' }}>데이터가 없습니다.</p>}
               </div>
            </div>
         </div>

         {/* 3. 업체 분석 및 정규화 기능성 트렌드 */}
         <h2 className="title-gradient" style={{ fontSize: '1.5rem', marginTop: '48px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><i className="fa-solid fa-ranking-star" style={{ marginRight: '12px' }}></i>시장 점유율 및 성분 구성 엔진</span>
         </h2>

         {/* Active Filters Summary */}
         <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div className="badge badge-upd" style={{ background: 'rgba(2, 132, 199, 0.1)', color: 'var(--accent)', border: '1px solid rgba(2, 132, 199, 0.2)', padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <i className="fa-solid fa-calendar-check"></i> 
               분석 기간: <strong>{recentRange === 'all' ? '전체 기간' : recentRange.replace('m', '개월').replace('y', '년')}</strong>
            </div>
            {selectedCompany && (
               <div className="badge badge-new" style={{ background: 'rgba(13, 148, 136, 0.1)', color: '#0d9488', border: '1px solid rgba(13, 148, 136, 0.2)', padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-building"></i> 
                  선택 업체: <strong>{selectedCompany}</strong>
               </div>
            )}
         </div>
         <div className="layout-2-col">
            {/* 최다 신고 업체 목록 */}
            <div className="glass-panel dashboard-list-card" style={{ height: '440px', display: 'flex', flexDirection: 'column' }}>
               <h3 style={{ marginBottom: '16px', color: 'var(--text-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><i className="fa-solid fa-trophy" style={{ marginRight: '8px', color: '#fbbf24' }}></i>성분 분석 기반 점유율 순위</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>기간:</span>
                        <select 
                           value={recentRange}
                           onChange={(e) => setRecentRange(e.target.value)}
                           style={{
                              backgroundColor: '#fff',
                              color: '#334155',
                              border: '1px solid #e2e8f0',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              outline: 'none'
                           }}
                        >
                           <option value="1m">최근 1개월</option>
                           <option value="3m">최근 3개월</option>
                           <option value="6m">최근 6개월</option>
                           <option value="1y">최근 1년</option>
                           <option value="2y">최근 2년</option>
                           <option value="all">전체 기간</option>
                        </select>
                     </div>
                     <span style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => router.push('/companies')}>전체 업체 보기 <i className="fa-solid fa-arrow-right"></i></span>
                  </div>
               </h3>
               <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                  <ul style={{ listStyle: 'none' }}>
                  {stats?.companyStats?.map((c, idx) => (
                     <li key={idx} onClick={() => handleCompanyClick(c.label)} style={{
                        padding: '16px', borderBottom: '1px solid var(--surface-border)', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: selectedCompany === c.label ? 'var(--surface-highlight)' : 'transparent',
                        borderLeft: selectedCompany === c.label ? '4px solid var(--accent)' : '4px solid transparent',
                        transition: 'all 0.2s'
                     }}>
                        <span style={{ fontWeight: 500, color: selectedCompany === c.label ? 'var(--accent)' : 'var(--text-color)' }}>{idx + 1}. {c.label}</span>
                        <span style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{c.count}건</span>
                     </li>
                  ))}
                  {(!stats?.companyStats || stats.companyStats.length === 0) && (
                     <p style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>해당 기간 내 신고 내역이 없습니다.</p>
                  )}
               </ul>
            </div>
         </div>

         {/* 선택 업체 기능성 품목 구성 */}
            <div className="glass-panel dashboard-chart-card" style={{ display: 'flex', flexDirection: 'column', height: '440px', overflow: 'hidden' }}>
               <h3 style={{ marginBottom: '24px', color: 'var(--text-color)' }}><i className="fa-solid fa-chart-pie" style={{ marginRight: '8px' }}></i>{selectedCompany} 기능성 성분 분포</h3>
               <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                  {loadingCompanyData ? (
                     <p style={{ color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin"></i> 분석 중...</p>
                  ) : companyDoughnut ? (
                     <div style={{ width: '100%', height: '100%', maxWidth: '500px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <Doughnut data={companyDoughnut} options={{ 
                           cutout: '72%', 
                           maintainAspectRatio: false,
                           responsive: true,
                           plugins: { 
                              legend: { 
                                 position: 'right', 
                                 labels: { 
                                    color: '#1e293b', 
                                    usePointStyle: true, 
                                    boxWidth: 8, 
                                    padding: 12, 
                                    font: { family: 'Noto Sans KR', size: 12, weight: 'bold' } 
                                 } 
                              } 
                           } 
                        }} />
                        <div style={{ position: 'absolute', top: '50%', left: '30.5%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                           <span style={{ fontSize: '0.85rem', color: '#64748b' }}>총 추출</span><br />
                           <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>{companyTotalExtracted.toLocaleString()}</span>
                        </div>
                     </div>
                  ) : <p style={{ color: 'var(--text-muted)' }}>추출된 성분 데이터가 없습니다.</p>}
               </div>
            </div>
         </div>

         {/* 4~6. 탭 패널: 트렌드 디스커버리 / 워드클라우드 / 식품업계 뉴스 */}
         <div className="dashboard-panel-tabs" style={{ marginTop: '48px' }}>
            {/* 탭 버튼 3개 */}
            <div className="dashboard-tab-list" style={{ display: 'flex', gap: '8px', marginBottom: '0' }}>
               {[
                  { id: 'trend',     icon: 'fa-fire',      label: '기능성 트렌드 디스커버리' },
                  { id: 'wordcloud', icon: 'fa-cloud',      label: '트렌드 워드클라우드' },
                  { id: 'news',      icon: 'fa-newspaper',  label: '식품업계 뉴스' },
               ].map(tab => {
                  const active = activePanel === tab.id;
                  return (
                     <button
                        key={tab.id}
                        onClick={() => setActivePanel(v => v === tab.id ? null : tab.id)}
                        style={{
                           flex: 1,
                           display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                           padding: '14px 16px',
                           border: `1px solid ${active ? 'var(--accent,#0284c7)' : '#e2e8f0'}`,
                           borderBottom: active ? '1px solid #fff' : '1px solid #e2e8f0',
                           borderRadius: active ? '12px 12px 0 0' : '12px',
                           background: active ? '#fff' : '#f8fafc',
                           color: active ? 'var(--accent,#0284c7)' : 'var(--text-muted,#64748b)',
                           cursor: 'pointer',
                           fontWeight: active ? 700 : 500,
                           fontSize: '0.9rem',
                           transition: 'all 0.15s',
                           position: 'relative',
                           zIndex: active ? 2 : 1,
                           marginBottom: active ? '-1px' : '0',
                        }}
                     >
                        <i className={`fa-solid ${tab.icon}`} style={{ fontSize: '0.85rem' }}></i>
                        {tab.label}
                     </button>
                  );
               })}
            </div>

            {/* 콘텐츠 패널 */}
            {activePanel && (
               <div style={{
                  border: '1px solid var(--accent,#0284c7)',
                  borderRadius: '0 0 16px 16px',
                  background: '#fff',
                  padding: '28px 24px',
                  animation: 'panelFadeIn 0.2s ease',
               }}>

                  {/* 트렌드 디스커버리 */}
                  {activePanel === 'trend' && (
                     <div className="trend-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                           <h4 style={{ color: 'var(--accent-secondary)', marginBottom: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <i className="fa-solid fa-fire" style={{ color: '#f59e0b' }}></i>
                              급부상 중인 기능성 성분 (Hot)
                           </h4>
                           <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                              {stats?.risingTrends?.map((f, idx) => (
                                 <div key={idx} className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                       <div style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: '1rem' }}>{f.label}</div>
                                       <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>최근 90일: {f.current}건</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                       <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '1.1rem' }}><i className="fa-solid fa-arrow-trend-up"></i> {f.diff}</div>
                                       <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>전기 대비 증가</div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                        <div>
                           <h4 style={{ color: 'var(--danger)', marginBottom: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <i className="fa-solid fa-snowflake" style={{ color: '#3b82f6' }}></i>
                              최근 주춤한 기능성 성분 (Cold)
                           </h4>
                           <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                              {stats?.fallingTrends?.map((f, idx) => (
                                 <div key={idx} className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                       <div style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: '1rem' }}>{f.label}</div>
                                       <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>최근 90일: {f.current}건</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                       <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '1.1rem' }}><i className="fa-solid fa-arrow-trend-down"></i> {Math.abs(f.diff)}</div>
                                       <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>전기 대비 감소</div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     </div>
                  )}

                  {/* 워드클라우드 */}
                  {activePanel === 'wordcloud' && (
                     <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                           <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              <strong>분석 대상:</strong> 최근 3개월 등록 품목 &nbsp;·&nbsp; <strong>데이터 원천:</strong> 정규화된 기능성 성분
                           </span>
                        </div>
                        {loadingWC ? <p>분석중...</p> : (
                           <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', alignItems: 'center', minHeight: '300px', padding: '10px' }}>
                              {(() => {
                                 const maxVal = Math.max(...wordCloud.map(w => w.value), 1);
                                 return wordCloud.map((w, i) => (
                                    <span
                                       key={i}
                                       onClick={() => router.push(`/search?search=${w.text}`)}
                                       style={{
                                          fontSize: `${Math.max(0.9, Math.min(3.5, (w.value / maxVal) * 4))}rem`,
                                          color: i % 4 === 0 ? 'var(--accent)' : i % 4 === 1 ? 'var(--accent-secondary)' : i % 4 === 2 ? '#6366f1' : '#f59e0b',
                                          opacity: 0.7 + (w.value / maxVal) * 0.3,
                                          fontWeight: w.value > (maxVal * 0.3) ? 800 : 500,
                                          cursor: 'pointer',
                                          display: 'inline-block',
                                          padding: '4px 8px',
                                          transition: 'all 0.3s cubic-bezier(0.175,0.885,0.32,1.275)',
                                       }}
                                       onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2) rotate(2deg)'; e.currentTarget.style.opacity = '1'; }}
                                       onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; e.currentTarget.style.opacity = (0.6 + (w.value / maxVal) * 0.4).toString(); }}
                                    >
                                       {w.text}
                                    </span>
                                 ));
                              })()}
                           </div>
                        )}
                     </div>
                  )}

                  {/* 식품업계 뉴스 */}
                  {activePanel === 'news' && (
                     <div>
                        {/* 서브탭: 전체 / 식품저널 / 신상품 뉴스 */}
                        <div style={{ display: 'flex', gap: '0', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', width: 'fit-content', marginBottom: '20px' }}>
                           {[{ id: 'all', label: '전체' }, { id: 'foodnews', label: '식품저널' }, { id: 'thinkfood', label: '신상품 뉴스' }].map(t => (
                              <button
                                 key={t.id}
                                 onClick={() => { setNewsTab(t.id); setNewsPage(0); }}
                                 style={{
                                    padding: '7px 18px', border: 'none', cursor: 'pointer',
                                    fontSize: '0.82rem', fontWeight: newsTab === t.id ? 700 : 500,
                                    background: newsTab === t.id ? 'var(--accent,#0284c7)' : '#fff',
                                    color: newsTab === t.id ? '#fff' : 'var(--text-muted)',
                                    transition: 'all 0.15s',
                                    borderRight: '1px solid #e2e8f0',
                                 }}
                              >
                                 {t.label}
                              </button>
                           ))}
                        </div>

                        {loadingNews ? (
                           <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                              <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '8px' }}></i>뉴스를 불러오는 중...
                           </div>
                        ) : (() => {
                           const filtered = newsTab === 'all' ? news : news.filter(n => n.sourceId === newsTab);
                           if (!filtered.length) return <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>뉴스가 없습니다.</div>;
                           const totalPages = Math.ceil(filtered.length / NEWS_PAGE_SIZE);
                           const pageItems = filtered.slice(newsPage * NEWS_PAGE_SIZE, (newsPage + 1) * NEWS_PAGE_SIZE);
                           return (
                              <div>
                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {pageItems.map((item, i) => (
                                       <a
                                          key={i}
                                          href={item.link}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 4px', borderBottom: i < pageItems.length - 1 ? '1px solid #f1f5f9' : 'none', textDecoration: 'none', transition: 'background 0.15s', borderRadius: '8px' }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                       >
                                          {item.thumbnail ? (
                                             <img src={item.thumbnail} alt="" style={{ width: '64px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                                          ) : (
                                             <div style={{ width: '64px', height: '48px', borderRadius: '6px', background: 'linear-gradient(135deg,#e0f2fe,#f0fdf4)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-utensils" style={{ color: '#94a3b8', fontSize: '1.1rem' }}></i>
                                             </div>
                                          )}
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', background: item.sourceId === 'thinkfood' ? '#eff6ff' : '#f0fdf4', color: item.sourceId === 'thinkfood' ? '#0284c7' : '#16a34a' }}>
                                                   {item.source}
                                                </span>
                                                {item.pubDate && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(item.pubDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>}
                                             </div>
                                             <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-color)', lineHeight: 1.4, marginBottom: '3px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {item.title}
                                             </p>
                                             {item.description && <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{item.description}</p>}
                                          </div>
                                          <i className="fa-solid fa-arrow-up-right-from-square" style={{ color: '#cbd5e1', fontSize: '0.7rem', flexShrink: 0, marginTop: '4px' }}></i>
                                       </a>
                                    ))}
                                 </div>

                                 {/* 페이지네이션 */}
                                 {totalPages > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                                       <button
                                          onClick={() => setNewsPage(0)}
                                          disabled={newsPage === 0}
                                          style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: newsPage === 0 ? '#f8fafc' : '#fff', color: newsPage === 0 ? '#cbd5e1' : 'var(--text-muted)', cursor: newsPage === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}
                                       >
                                          <i className="fa-solid fa-angles-left"></i>
                                       </button>
                                       <button
                                          onClick={() => setNewsPage(p => Math.max(0, p - 1))}
                                          disabled={newsPage === 0}
                                          style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: newsPage === 0 ? '#f8fafc' : '#fff', color: newsPage === 0 ? '#cbd5e1' : 'var(--text-muted)', cursor: newsPage === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}
                                       >
                                          <i className="fa-solid fa-chevron-left"></i>
                                       </button>

                                       {Array.from({ length: totalPages }, (_, i) => i)
                                          .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - newsPage) <= 2)
                                          .reduce((acc, i, idx, arr) => {
                                             if (idx > 0 && i - arr[idx - 1] > 1) acc.push('...');
                                             acc.push(i);
                                             return acc;
                                          }, [])
                                          .map((item, idx) =>
                                             item === '...' ? (
                                                <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>…</span>
                                             ) : (
                                                <button
                                                   key={item}
                                                   onClick={() => setNewsPage(item)}
                                                   style={{
                                                      width: '32px', height: '32px', borderRadius: '8px',
                                                      border: newsPage === item ? 'none' : '1px solid #e2e8f0',
                                                      background: newsPage === item ? 'var(--accent,#0284c7)' : '#fff',
                                                      color: newsPage === item ? '#fff' : 'var(--text-muted)',
                                                      cursor: 'pointer', fontWeight: newsPage === item ? 700 : 500,
                                                      fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                   }}
                                                >
                                                   {item + 1}
                                                </button>
                                             )
                                          )
                                       }

                                       <button
                                          onClick={() => setNewsPage(p => Math.min(totalPages - 1, p + 1))}
                                          disabled={newsPage >= totalPages - 1}
                                          style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: newsPage >= totalPages - 1 ? '#f8fafc' : '#fff', color: newsPage >= totalPages - 1 ? '#cbd5e1' : 'var(--text-muted)', cursor: newsPage >= totalPages - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}
                                       >
                                          <i className="fa-solid fa-chevron-right"></i>
                                       </button>
                                       <button
                                          onClick={() => setNewsPage(totalPages - 1)}
                                          disabled={newsPage >= totalPages - 1}
                                          style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e8f0', background: newsPage >= totalPages - 1 ? '#f8fafc' : '#fff', color: newsPage >= totalPages - 1 ? '#cbd5e1' : 'var(--text-muted)', cursor: newsPage >= totalPages - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}
                                       >
                                          <i className="fa-solid fa-angles-right"></i>
                                       </button>

                                       <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                          {newsPage + 1} / {totalPages} 페이지 &nbsp;·&nbsp; 총 {filtered.length}건
                                       </span>
                                    </div>
                                 )}
                              </div>
                           );
                        })()}
                     </div>
                  )}
               </div>
            )}
         </div>

         <style>{`
            @keyframes panelFadeIn {
               from { opacity: 0; transform: translateY(-6px); }
               to   { opacity: 1; transform: translateY(0); }
            }
         `}</style>
      </main>
   );
}
