"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

const SIGNAL_COLORS = { STRONG: '#dc2626', MODERATE: '#d97706', NORMAL: '#94a3b8' };
const SIGNAL_BG = { STRONG: '#fdf2f2', MODERATE: '#fffbeb', NORMAL: '#f8fafc' };
const SIGNAL_LABELS = { STRONG: 'STRONG (신규급증)', MODERATE: 'MODERATE (주목)', NORMAL: 'NORMAL (안정)' };

const TYPE_COLOR = { functionality: '#eff6ff', ingredient_type: '#fef3c7' };
const TYPE_BORDER = { functionality: '#bfdbfe', ingredient_type: '#fde68a' };
const TYPE_TEXT = { functionality: '#1d4ed8', ingredient_type: '#92400e' };

const SIGNAL_MAP = {
  "호흡기":   { label: "신규급증", color: "#dc2626" },
  "근육/운동": { label: "신규급증", color: "#dc2626" },
  "모발":     { label: "신규급증", color: "#dc2626" },
  "구강케어": { label: "급성장",  color: "#d97706" },
  "키성장":   { label: "급성장",  color: "#d97706" },
  "수면정신": { label: "주목",    color: "#7c3aed" },
  "위건강":   { label: "주목",    color: "#7c3aed" },
};

function Sparkline({ data }) {
  if (!data || data.length === 0) return null;
  const vals = data.map(d => d.count);
  const max = Math.max(...vals, 1);
  const w = 80, h = 28;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  const lastVal = vals[vals.length - 1];
  const prevVal = vals[vals.length - 2] || 0;
  const rising = lastVal >= prevVal;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={rising ? '#16a34a' : '#dc2626'} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CategoryCard({ cat, pipeline, onClick }) {
  const sig = pipeline?.signal || 'NORMAL';
  const sigColor = SIGNAL_COLORS[sig];
  const isSpecial = cat.type === 'ingredient_type';

  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.background = '#f8faff'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#fff'; }}
      style={{
        background: '#fff',
        border: `1px solid ${isSpecial ? TYPE_BORDER.ingredient_type : '#e2e8f0'}`,
        borderRadius: 8,
        padding: '9px 11px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, background 0.15s',
      }}
    >
      {/* 1행: 타입 배지 + 시그널 배지 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{
          fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px',
          background: isSpecial ? TYPE_COLOR.ingredient_type : TYPE_COLOR.functionality,
          color: isSpecial ? TYPE_TEXT.ingredient_type : TYPE_TEXT.functionality,
          borderRadius: 3, lineHeight: 1.5
        }}>
          {isSpecial ? '원료유형' : '기능성'}
        </span>
        {sig !== 'NORMAL' && (
          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', background: sigColor + '18', color: sigColor, borderRadius: 3, lineHeight: 1.5 }}>
            {sig === 'STRONG' ? '신규급증' : '주목'}
          </span>
        )}
      </div>
      {/* 2행: 카테고리명 */}
      <p style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', margin: '0 0 5px', lineHeight: 1.25 }}>
        {cat.displayName || cat.name}
      </p>
      {/* 3행: 제품 수 · YoY · 원료 수 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>{cat.productCount?.toLocaleString()}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: cat.growthRate > 0 ? '#16a34a' : cat.growthRate < 0 ? '#dc2626' : '#94a3b8' }}>
          {cat.growthRate > 0 ? '▲' : cat.growthRate < 0 ? '▼' : '—'}{Math.abs(cat.growthRate)}%
        </span>
        <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          원료 <strong style={{ color: '#0284c7' }}>{cat.ingredientCount}</strong>
        </span>
      </div>
    </div>
  );
}

function RankingTable({ rankTrend, selectedYear, onYearChange, weeklyTrend, weeklyLoading }) {
  const [viewMode, setViewMode] = useState('year'); // 'year' | 'week'
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0); // 0 = 최신 주차

  // ── 연도별 뷰 ──
  const yearData = rankTrend.find(r => r.year === selectedYear);
  const prev = rankTrend.find(r => r.year === String(Number(selectedYear) - 5));

  // ── 주차별 뷰 ──
  const currentWeekData = weeklyTrend[selectedWeekIdx] || null;
  const prevWeekData = weeklyTrend[selectedWeekIdx + 1] || null;

  const renderRankChange = (itemName, prevData, currentRank) => {
    if (!prevData) return <span style={{ color: '#94a3b8' }}>—</span>;
    const prevIdx = prevData.rankings.findIndex(r => r.name === itemName);
    if (prevIdx === -1) return <span style={{ color: '#7c3aed', fontSize: '0.78rem' }}>신규</span>;
    const change = (prevIdx + 1) - currentRank;
    if (change === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
    return (
      <span style={{ color: change > 0 ? '#16a34a' : '#dc2626' }}>
        {change > 0 ? `▲${change}` : `▼${Math.abs(change)}`}
      </span>
    );
  };

  const renderTable = (rankings, comparedData, countLabel) => {
    if (!rankings || rankings.length === 0) return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>데이터가 없습니다.</div>
    );
    const total = rankings.reduce((s, r) => s + r.count, 0);
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['순위', '카테고리', countLabel, '비중', '전기 대비'].map((h, i) => (
                <th key={i} style={{ padding: '10px 16px', textAlign: i >= 2 ? 'right' : 'left', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankings.map((item, idx) => {
              const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0';
              return (
                <tr key={item.name} style={{ borderBottom: '1px solid #f8fafc' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <td style={{ padding: '11px 16px', fontWeight: 700, color: idx < 3 ? '#0284c7' : '#64748b', fontSize: idx < 3 ? '1rem' : '0.85rem' }}>{item.rank}</td>
                  <td style={{ padding: '11px 16px', fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>{item.displayName}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{item.count.toLocaleString()}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (item.count / rankings[0].count) * 100)}%`, height: '100%', background: '#0284c7', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 600 }}>
                    {renderRankChange(item.name, comparedData, item.rank)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
          {viewMode === 'year' ? '연도별 카테고리 Top 15' : '주차별 카테고리 Top 15'}
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 연도별/주차별 토글 */}
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {[['year', '연도별'], ['week', '주차별']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '5px 14px', border: 'none',
                background: viewMode === mode ? '#0284c7' : '#fff',
                color: viewMode === mode ? '#fff' : '#64748b',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer'
              }}>{label}</button>
            ))}
          </div>
          {/* 연도별 모드: 연도 선택 버튼 */}
          {viewMode === 'year' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {['2015', '2020', '2025'].map(y => (
                <button key={y} onClick={() => onYearChange(y)} style={{ padding: '5px 14px', border: '1px solid', borderColor: selectedYear === y ? '#0284c7' : '#e2e8f0', borderRadius: 7, background: selectedYear === y ? '#0284c7' : '#fff', color: selectedYear === y ? '#fff' : '#64748b', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>{y}</button>
              ))}
            </div>
          )}
          {/* 주차별 모드: 이전/다음 주차 네비게이션 */}
          {viewMode === 'week' && weeklyTrend.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setSelectedWeekIdx(i => Math.min(i + 1, weeklyTrend.length - 1))} disabled={selectedWeekIdx >= weeklyTrend.length - 1} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: selectedWeekIdx >= weeklyTrend.length - 1 ? '#cbd5e1' : '#475569', fontSize: '0.82rem', cursor: selectedWeekIdx >= weeklyTrend.length - 1 ? 'default' : 'pointer' }}>←</button>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', minWidth: 160, textAlign: 'center' }}>
                {currentWeekData ? `${currentWeekData.label} (${currentWeekData.dateRange})` : ''}
              </span>
              <button onClick={() => setSelectedWeekIdx(i => Math.max(i - 1, 0))} disabled={selectedWeekIdx <= 0} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', color: selectedWeekIdx <= 0 ? '#cbd5e1' : '#475569', fontSize: '0.82rem', cursor: selectedWeekIdx <= 0 ? 'default' : 'pointer' }}>→</button>
            </div>
          )}
        </div>
      </div>

      {/* 연도별 테이블 */}
      {viewMode === 'year' && yearData && renderTable(yearData.rankings, prev, '제품 수')}

      {/* 주차별 테이블 */}
      {viewMode === 'week' && (
        weeklyLoading
          ? <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>주차별 데이터를 불러오는 중...</div>
          : (
            <>
              {currentWeekData && (
                <div style={{ padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 16 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    신규 신고 기준 | 전주 대비 순위 변동 | 기간: <strong style={{ color: '#475569' }}>{currentWeekData.dateRange}</strong>
                  </span>
                </div>
              )}
              {renderTable(currentWeekData?.rankings, prevWeekData, '신규 신고')}
            </>
          )
      )}
    </div>
  );
}

function CagrChart({ cagrStats }) {
  const top10 = cagrStats.filter(d => typeof d.cagr === 'number').sort((a, b) => b.cagr - a.cagr).slice(0, 10);
  const maxCagr = Math.max(...top10.map(d => d.cagr));
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
      <h3 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4, fontSize: '0.95rem' }}>CAGR 성장률 Top 10 (2020→2025)</h3>
      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 18 }}>5년 연평균성장률 기준</p>
      {top10.map(d => (
        <div key={d.name} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{d.name}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#16a34a' }}>+{(d.cagr * 100).toFixed(1)}%</span>
          </div>
          <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(d.cagr / maxCagr) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, #0d9488)', borderRadius: 3, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelinePanel({ pipelineInsights, onCardClick }) {
  const strong = pipelineInsights.filter(p => p.signal === 'STRONG');
  const moderate = pipelineInsights.filter(p => p.signal === 'MODERATE');
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
      <h3 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4, fontSize: '0.95rem' }}>파이프라인 시그널</h3>
      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 18 }}>최근 2년 개별인정원료 집중 등록 카테고리 → 향후 제품화 예상</p>
      {strong.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>STRONG 시그널 (집중도 50% 이상)</p>
          {strong.map(p => (
            <div key={p.name} 
              onClick={() => onCardClick(p.name)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff5f5', borderRadius: 8, marginBottom: 6, cursor: 'pointer', border: '1px solid #fee2e2' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#fca5a5'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#fee2e2'}
            >
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{p.name}</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 700 }}>{Math.round(p.ratio * 100)}% 집중</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 8 }}>({p.recent}/{p.total}건)</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {moderate.length > 0 && (
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d97706', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>MODERATE 시그널 (집중도 30~50% 미만)</p>
          {moderate.map(p => (
            <div key={p.name}
              onClick={() => onCardClick(p.name)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fffbeb', borderRadius: 8, marginBottom: 6, cursor: 'pointer', border: '1px solid #fef3c7' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#fde68a'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#fef3c7'}
            >
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{p.name}</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 700 }}>{Math.round(p.ratio * 100)}% 집중</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 8 }}>({p.recent}/{p.total}건)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [rankTrend, setRankTrend] = useState([]);
  const [cagrStats, setCagrStats] = useState([]);
  const [pipelineInsights, setPipelineInsights] = useState([]);
  const [totalUniqueProducts, setTotalUniqueProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('2025');
  const [sort, setSort] = useState('productCount');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tab, setTab] = useState('cards'); // 'cards' | 'ranking' | 'growth'
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyFetched, setWeeklyFetched] = useState(false);

  // 모달 상세 정보 상태
  const [detailModal, setDetailModal] = useState(null); // null | categoryName
  const [modalIngredients, setModalIngredients] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // 개별인정형 원료 상세 모달 상태 (모달 내 모달)
  const [selectedIng, setSelectedIng] = useState(null); // null | ingredientObj
  const [ingProducts, setIngProducts] = useState([]);
  const [ingProductsLoading, setIngProductsLoading] = useState(false);
  const [ingProductsTotal, setIngProductsTotal] = useState(0);

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(json => {
      if (json.success) {
        setCategories(json.categories);
        setRankTrend(json.rankTrend);
        setCagrStats(json.cagrStats);
        setPipelineInsights(json.pipelineInsights);
        if (json.totalUniqueProducts) setTotalUniqueProducts(json.totalUniqueProducts);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchWeeklyTrend = async () => {
    if (weeklyFetched) return;
    setWeeklyLoading(true);
    try {
      const res = await fetch('/api/categories/weekly-trend');
      const json = await res.json();
      if (json.success) {
        setWeeklyTrend(json.weeklyRankings);
        setWeeklyFetched(true);
      }
    } catch (e) {
      console.error('Failed to fetch weekly trend:', e);
    }
    setWeeklyLoading(false);
  };

  const handleOpenDetail = async (catName) => {
    setDetailModal(catName);
    setModalLoading(true);
    setModalIngredients([]);
    try {
      const res = await fetch(`/api/ingredients?category=${encodeURIComponent(catName)}&limit=100`);
      const json = await res.json();
      if (json.success) {
        setModalIngredients(json.data);
      }
    } catch (e) {
      console.error('Failed to fetch category ingredients:', e);
    }
    setModalLoading(false);
  };

  const handleOpenIngDetail = async (ing) => {
    setSelectedIng(ing);
    setIngProductsLoading(true);
    setIngProducts([]);
    setIngProductsTotal(0);
    try {
      const res = await fetch(`/api/ingredients/${ing.id}/products?limit=10`);
      const json = await res.json();
      if (json.success) {
        setIngProducts(json.products);
        setIngProductsTotal(json.total);
      }
    } catch (e) {
      console.error('Failed to fetch mapped products:', e);
    }
    setIngProductsLoading(false);
  };

  const filtered = categories
    .filter(c => typeFilter === 'all' || c.type === typeFilter)
    .sort((a, b) => {
      if (sort === 'productCount') return b.productCount - a.productCount;
      if (sort === 'growthRate') return b.growthRate - a.growthRate;
      if (sort === 'ingredientCount') return b.ingredientCount - a.ingredientCount;
      return 0;
    });

  const totalMappings = categories.reduce((s, c) => s + (c.productCount || 0), 0);
  const avgCategoriesPerProduct = totalUniqueProducts > 0
    ? (totalMappings / totalUniqueProducts).toFixed(1)
    : '-';

  const activeCategory = categories.find(c => c.name === detailModal);
  const activePipeline = pipelineInsights.find(p => p.name === detailModal);

  const getCategoryTags = (cats) => {
    if (!cats) return [];
    return cats.split(',').map(c => c.trim()).filter(Boolean);
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Link href="/" style={{ color: '#94a3b8', fontSize: '0.85rem', textDecoration: 'none' }}>대시보드</Link>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <span style={{ color: '#0f172a', fontSize: '0.85rem', fontWeight: 600 }}>기능성 카테고리</span>
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>기능성 카테고리 트렌드</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>건강기능식품 기능성 대분류 카테고리별 시장 현황 및 성장 추이</p>
      </div>

      {/* KPI 요약 */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: '기능성 카테고리', value: categories.length + '개', sub: `${categories.length}개 대분류 체계`, color: '#0284c7' },
            { label: '고유 제품 수', value: totalUniqueProducts.toLocaleString(), sub: '품목제조신고 기준 (중복 제거)', color: '#0d9488' },
            { label: 'STRONG 시그널', value: pipelineInsights.filter(p => p.signal === 'STRONG').length + '개', sub: '향후 제품화 예상 카테고리', color: '#dc2626' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: k.color, marginBottom: 2 }}>{k.value}</p>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
        {[['cards', '카테고리 카드'], ['ranking', 'Top 15 순위'], ['growth', '성장률 분석']].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); if (key === 'ranking') fetchWeeklyTrend(); }} style={{
            padding: '10px 20px', border: 'none', background: 'none', fontWeight: tab === key ? 700 : 500,
            color: tab === key ? '#0284c7' : '#64748b', borderBottom: `2px solid ${tab === key ? '#0284c7' : 'transparent'}`,
            cursor: 'pointer', fontSize: '0.9rem', marginBottom: -1, transition: 'color 0.2s'
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <Link href="/ingredients" style={{ padding: '8px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#475569', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600, alignSelf: 'center', marginBottom: 4 }}>
          개별인정형원료 DB →
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>데이터를 불러오는 중...</div>
      ) : (
        <>
          {/* 카테고리 카드 탭 */}
          {tab === 'cards' && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['all', '전체'], ['functionality', '기능성'], ['ingredient_type', '원료유형']].map(([v, l]) => (
                    <button key={v} onClick={() => setTypeFilter(v)} style={{ padding: '6px 14px', border: '1px solid', borderColor: typeFilter === v ? '#0284c7' : '#e2e8f0', borderRadius: 7, background: typeFilter === v ? '#eff6ff' : '#fff', color: typeFilter === v ? '#0284c7' : '#64748b', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>정렬:</span>
                  <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem', background: '#fff', width: 'auto' }}>
                    <option value="productCount">제품 수 순</option>
                    <option value="growthRate">성장률 순</option>
                    <option value="ingredientCount">원료 수 순</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 8 }}>
                {filtered.map(cat => (
                  <CategoryCard 
                    key={cat.id} 
                    cat={cat} 
                    pipeline={pipelineInsights.find(p => p.name === cat.name)} 
                    onClick={() => handleOpenDetail(cat.name)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Top 15 순위 탭 */}
          {tab === 'ranking' && (
            <RankingTable
              rankTrend={rankTrend}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
              weeklyTrend={weeklyTrend}
              weeklyLoading={weeklyLoading}
            />
          )}

          {/* 성장률 분석 탭 */}
          {tab === 'growth' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <CagrChart cagrStats={cagrStats} />
              <PipelinePanel pipelineInsights={pipelineInsights} onCardClick={handleOpenDetail} />
            </div>
          )}
        </>
      )}

      {/* 카테고리 상세 및 시그널 로직 모달 */}
      {detailModal && activeCategory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setDetailModal(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', background: activeCategory.type === 'ingredient_type' ? TYPE_COLOR.ingredient_type : TYPE_COLOR.functionality, color: activeCategory.type === 'ingredient_type' ? TYPE_TEXT.ingredient_type : TYPE_TEXT.functionality, borderRadius: 4 }}>
                    {activeCategory.type === 'ingredient_type' ? '원료유형' : '기능성'}
                  </span>
                  {activePipeline && activePipeline.signal !== 'NORMAL' && (
                    <span style={{ padding: '2px 6px', background: SIGNAL_COLORS[activePipeline.signal] + '15', color: SIGNAL_COLORS[activePipeline.signal], borderRadius: 4, fontSize: '0.7rem', fontWeight: 700 }}>
                      {activePipeline.signal === 'STRONG' ? '신규급증' : '주목'}
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginTop: 6 }}>{activeCategory.displayName || activeCategory.name} 카테고리 상세</h2>
              </div>
              <button onClick={() => setDetailModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            {/* Content */}
            <div style={{ padding: 24, overflowY: 'auto' }}>
              {/* 기본정보 */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>정의 및 설명</h4>
                <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>{activeCategory.description || '정의가 등록되지 않은 기능성 분류입니다.'}</p>
              </div>

              {/* 통계 요약 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ border: '1px solid #f1f5f9', background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>누적 제품 수</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{activeCategory.productCount?.toLocaleString()}개</p>
                </div>
                <div style={{ border: '1px solid #f1f5f9', background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>등록 개별인정형 원료 수</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0284c7' }}>{activeCategory.ingredientCount?.toLocaleString()}건</p>
                </div>
              </div>

              {/* 파이프라인 시그널 산정 로직 설명 */}
              {activePipeline && (
                <div style={{ background: SIGNAL_BG[activePipeline.signal], border: `1px solid ${SIGNAL_COLORS[activePipeline.signal]}25`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
                  <h4 style={{ fontSize: '0.85rem', color: SIGNAL_COLORS[activePipeline.signal], fontWeight: 700, marginBottom: 6 }}>
                    파이프라인 시그널 분석: {SIGNAL_LABELS[activePipeline.signal]}
                  </h4>
                  
                  <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>최근 2년 원료 등록 수 (2024~2026):</span>
                      <span style={{ fontWeight: 600 }}>{activePipeline.recent}건</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>전체 누적 원료 수:</span>
                      <span style={{ fontWeight: 600 }}>{activePipeline.total}건</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: 4, marginTop: 4, fontWeight: 700 }}>
                      <span>최근 원료 등록 집중도 (비중):</span>
                      <span style={{ color: SIGNAL_COLORS[activePipeline.signal] }}>{Math.round(activePipeline.ratio * 100)}%</span>
                    </div>

                    <div style={{ marginTop: 12, padding: 10, background: '#fff', borderRadius: 6, fontSize: '0.75rem', color: '#64748b' }}>
                      <p style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>💡 시그널 계산 및 판정 로직</p>
                      <p style={{ marginBottom: 2 }}>• <strong>집중도 비율(Ratio)</strong> = (최근 2개년 등록 원료 수 / 전체 등록 원료 수)</p>
                      <p style={{ marginBottom: 2 }}>• <strong>STRONG (신규급증)</strong>: 전체 원료 4건 이상 & 집중도 50% 이상</p>
                      <p style={{ marginBottom: 2 }}>• <strong>MODERATE (주목)</strong>: 전체 원료 4건 이상 & 집중도 30% ~ 50% 미만</p>
                      <p>• <strong>NORMAL (안정)</strong>: 전체 원료 4건 미만 또는 집중도 30% 미만</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 매핑된 실시간 개별인정형 원료 목록 */}
              <div>
                <h4 style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 700, marginBottom: 10 }}>소속 개별인정형 원료 리스트</h4>
                {modalLoading ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>원료 리스트 로딩 중...</div>
                ) : modalIngredients.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#f8fafc', borderRadius: 8 }}>등록된 개별인정형 원료가 없습니다.</div>
                ) : (
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', background: '#f8fafc' }}>인정번호</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', background: '#f8fafc' }}>원료명</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', background: '#f8fafc' }}>업체명</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', background: '#f8fafc', width: 80 }}>등록일/연도</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalIngredients.map(item => (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#64748b' }}>{item.recognitionNumber}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                              <button 
                                onClick={() => handleOpenIngDetail(item)}
                                style={{ color: '#0284c7', textDecoration: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', textAlign: 'left' }}
                              >
                                {item.name}
                              </button>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#475569' }}>{item.company || '-'}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>{item.registeredDate || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
              <button onClick={() => setDetailModal(null)} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', color: '#475569' }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 개별인정형 원료 상세 모달 (모달 위의 상세 모달) */}
      {selectedIng && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setSelectedIng(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontWeight: 700, fontSize: '1.15rem', color: '#0f172a' }}>{selectedIng.name}</h2>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>인정번호: {selectedIng.recognitionNumber}</span>
              </div>
              <button onClick={() => setSelectedIng(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {[['등록일/연도', selectedIng.registeredDate], ['업체명', selectedIng.company]].map(([k, v]) => (
                  <div key={k}>
                    <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginBottom: 2, textTransform: 'uppercase' }}>{k}</p>
                    <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{v || '-'}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>기능성 카테고리</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {getCategoryTags(selectedIng.categories).map(c => {
                    const sig = SIGNAL_MAP[c];
                    return (
                      <span key={c} style={{ padding: '3px 10px', background: sig ? sig.color + '15' : '#eff6ff', color: sig ? sig.color : '#0284c7', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 }}>{c}</span>
                    );
                  })}
                </div>
              </div>
              {[['기능성 내용', selectedIng.functionalityText], ['일일섭취량', selectedIng.dailyIntake], ['섭취시 주의사항', selectedIng.precautions]].map(([k, v]) => v ? (
                <div key={k} style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>{k}</p>
                  <p style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.6, background: '#f8fafc', padding: '10px 14px', borderRadius: 8 }}>{v}</p>
                </div>
              ) : null)}

              {/* 연관 품목제조신고 정보 리스트 */}
              <div style={{ marginTop: 20, borderTop: '1px dashed #cbd5e1', paddingTop: 16 }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>해당 원료 함유 완제품 품목제조신고 내역</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>
                    검색 결과: 총 <strong style={{ color: '#0284c7' }}>{ingProductsTotal}</strong>건
                  </span>
                </h3>

                {ingProductsLoading ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>연관 완제품 품목을 검색 중...</div>
                ) : ingProducts.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', background: '#f8fafc', borderRadius: 8 }}>
                    이 원료가 포함된 완제품 품목이 검색되지 않았습니다.
                  </div>
                ) : (
                  <div>
                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                        <thead>
                          <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>신고번호</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>품목(제품명)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>제조업체</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', width: 90 }}>인허가일자</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ingProducts.map(p => (
                            <tr key={p.prdlstReportNo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#64748b' }}>{p.prdlstReportNo}</td>
                              <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                                <Link href={`/search?integrated=${encodeURIComponent(p.prdlstNm)}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                                  {p.prdlstNm}
                                </Link>
                              </td>
                              <td style={{ padding: '6px 10px', color: '#475569' }}>{p.bsshNm}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'center', color: '#64748b' }}>{p.prmsDt || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
              <button onClick={() => setSelectedIng(null)} style={{ padding: '8px 16px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
