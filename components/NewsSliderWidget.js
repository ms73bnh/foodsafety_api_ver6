'use client';

import { useState, useEffect, useRef } from 'react';

const TABS = [
  { id: 'foodnews', label: '식품저널' },
  { id: 'thinkfood', label: '신상품 뉴스' },
];

const AUTO_ADVANCE_SEC = 5;
const PAGE_SIZE = 5;

export default function NewsSliderWidget({ news, loading }) {
  const [activeTab, setActiveTab] = useState('foodnews');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [expandPage, setExpandPage] = useState(0);
  const timerRef = useRef(null);
  const progressRef = useRef(null);

  const filtered = news.filter((n) => n.sourceId === activeTab);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(expandPage * PAGE_SIZE, (expandPage + 1) * PAGE_SIZE);

  useEffect(() => {
    setCurrentIdx(0);
    setProgress(0);
    setExpanded(false);
    setExpandPage(0);
  }, [activeTab]);

  // 자동 슬라이드 (확장 시 정지)
  useEffect(() => {
    if (filtered.length <= 1 || expanded) return;
    clearInterval(timerRef.current);
    clearInterval(progressRef.current);

    const total = AUTO_ADVANCE_SEC * 1000;
    const tick = 100;
    let elapsed = 0;

    progressRef.current = setInterval(() => {
      elapsed += tick;
      setProgress(Math.min((elapsed / total) * 100, 100));
    }, tick);

    timerRef.current = setInterval(() => {
      elapsed = 0;
      setProgress(0);
      setCurrentIdx((i) => (i + 1) % filtered.length);
    }, total);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(progressRef.current);
    };
  }, [filtered.length, activeTab, expanded]);

  const item = filtered[currentIdx];

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* ── 확장 패널: 카드 위로 올라옴 ── */}
      {expanded && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
          zIndex: 200,
          overflow: 'hidden',
          animation: 'newsExpandUp 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {/* 확장 패널 헤더 */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent, #0284c7)' }}>
              {TABS.find(t => t.id === activeTab)?.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* 좌우 페이지 네비 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setExpandPage(p => Math.max(0, p - 1))}
                  disabled={expandPage === 0}
                  style={{
                    width: '26px', height: '26px', borderRadius: '6px',
                    border: '1px solid #e2e8f0', background: expandPage === 0 ? '#f8fafc' : '#fff',
                    color: expandPage === 0 ? '#cbd5e1' : 'var(--accent, #0284c7)',
                    cursor: expandPage === 0 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem',
                  }}
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '48px', textAlign: 'center' }}>
                  {expandPage + 1} / {Math.max(totalPages, 1)}
                </span>
                <button
                  onClick={() => setExpandPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={expandPage >= totalPages - 1}
                  style={{
                    width: '26px', height: '26px', borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: expandPage >= totalPages - 1 ? '#f8fafc' : '#fff',
                    color: expandPage >= totalPages - 1 ? '#cbd5e1' : 'var(--accent, #0284c7)',
                    cursor: expandPage >= totalPages - 1 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem',
                  }}
                >
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '0.8rem', padding: '2px 4px',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* 기사 목록 */}
          <div>
            {pageItems.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                뉴스가 없습니다.
              </div>
            ) : pageItems.map((n, i) => (
              <a
                key={i}
                href={n.link}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '10px 16px',
                  textDecoration: 'none',
                  borderBottom: i < pageItems.length - 1 ? '1px solid #f8fafc' : 'none',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {n.thumbnail ? (
                  <img src={n.thumbnail} alt="" style={{ width: '44px', height: '34px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <div style={{ width: '44px', height: '34px', borderRadius: '5px', background: 'linear-gradient(135deg,#e0f2fe,#f0fdf4)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-utensils" style={{ color: '#94a3b8', fontSize: '0.75rem' }}></i>
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    margin: 0, fontSize: '0.78rem', fontWeight: 600,
                    color: 'var(--text-color, #1e293b)', lineHeight: 1.45,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {n.title}
                  </p>
                  {n.pubDate && (
                    <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                      {new Date(n.pubDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <i className="fa-solid fa-arrow-up-right-from-square" style={{ color: '#cbd5e1', fontSize: '0.65rem', flexShrink: 0, marginTop: '3px' }}></i>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── 메인 카드 (고정 크기, 절대 변하지 않음) ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                fontSize: '0.8rem',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? 'var(--accent, #0284c7)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent, #0284c7)' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 진행바 */}
        {filtered.length > 1 && (
          <div style={{ height: '2px', background: '#e2e8f0', flexShrink: 0 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent, #0284c7)', transition: 'width 0.1s linear' }} />
          </div>
        )}

        {/* 슬라이드 본문 */}
        <div style={{ flex: 1, padding: '12px 14px', minHeight: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: '6px' }}></i>로딩중...
            </div>
          ) : !item ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              뉴스가 없습니다.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 600, padding: '2px 7px', borderRadius: '20px',
                  background: activeTab === 'thinkfood' ? '#eff6ff' : '#f0fdf4',
                  color: activeTab === 'thinkfood' ? '#0284c7' : '#16a34a',
                }}>
                  {item.source}
                </span>
                {item.pubDate && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {new Date(item.pubDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <span style={{ fontSize: '0.68rem', color: '#cbd5e1', marginLeft: 'auto' }}>
                  {currentIdx + 1}/{filtered.length}
                </span>
              </div>
              <a href={item.link} target="_blank" rel="noreferrer noopener"
                style={{ textDecoration: 'none', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" style={{ width: '52px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <div style={{ width: '52px', height: '40px', borderRadius: '6px', background: 'linear-gradient(135deg,#e0f2fe,#f0fdf4)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-utensils" style={{ color: '#94a3b8', fontSize: '0.85rem' }}></i>
                  </div>
                )}
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-color,#1e293b)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {item.title}
                </p>
              </a>
            </>
          )}
        </div>

        {/* 도트 + 더보기 */}
        <div style={{
          padding: '8px 14px', borderTop: '1px solid #f1f5f9', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fafbfc',
        }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {filtered.slice(0, 8).map((_, i) => (
              <button key={i} onClick={() => { setCurrentIdx(i); setProgress(0); }}
                style={{
                  width: i === currentIdx ? '16px' : '6px', height: '6px', borderRadius: '3px',
                  background: i === currentIdx ? 'var(--accent,#0284c7)' : '#e2e8f0',
                  border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.2s',
                }}
              />
            ))}
          </div>
          <button
            onClick={() => { setExpanded(v => !v); setExpandPage(0); }}
            style={{
              background: 'none', border: 'none', fontSize: '0.75rem',
              color: 'var(--accent,#0284c7)', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            {expanded
              ? <>접기 <i className="fa-solid fa-chevron-down" style={{ fontSize: '0.65rem' }}></i></>
              : <>더보기 <i className="fa-solid fa-chevron-up" style={{ fontSize: '0.65rem' }}></i></>
            }
          </button>
        </div>
      </div>

      <style>{`
        @keyframes newsExpandUp {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
