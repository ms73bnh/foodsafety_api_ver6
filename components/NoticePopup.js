'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function NoticePopup() {
  const [notices, setNotices] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // 대시보드(/)에서만 표시
    if (pathname !== '/') return;
    if (visible) return;

    const fetchNotices = async () => {
      try {
        const res = await fetch('/api/notices/active');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.data?.length) return;

        // localStorage 기반으로만 표시 여부 판단
        const today = new Date().toDateString();
        const filtered = data.data.filter((n) => {
          if (localStorage.getItem(`notice_forever_${n.id}`)) return false;
          if (localStorage.getItem(`notice_today_${n.id}`) === today) return false;
          return true;
        });

        if (filtered.length > 0) {
          setNotices(filtered);
          setCurrentIndex(0);
          setVisible(true);
        }
      } catch {
        // 미로그인 등 오류는 무시
      }
    };

    fetchNotices();
  }, [pathname]);

  if (!visible || notices.length === 0) return null;

  const notice = notices[currentIndex];
  const total = notices.length;

  const close = () => setVisible(false);

  const dismissToday = () => {
    const today = new Date().toDateString();
    localStorage.setItem(`notice_today_${notice.id}`, today);
    goNextOrClose();
  };

  const dismissForever = () => {
    localStorage.setItem(`notice_forever_${notice.id}`, '1');
    goNextOrClose();
  };

  const goNextOrClose = () => {
    const remaining = notices.filter((n, i) => {
      if (i === currentIndex) return false;
      const today = new Date().toDateString();
      if (localStorage.getItem(`notice_forever_${n.id}`)) return false;
      if (localStorage.getItem(`notice_today_${n.id}`) === today) return false;
      return true;
    });

    if (remaining.length === 0) {
      setVisible(false);
      return;
    }
    const nextIdx = currentIndex < total - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(nextIdx);
    setNotices(prev => prev.filter((_, i) => i !== currentIndex));
  };

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'noticeBackdropIn 0.2s ease',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          width: '520px',
          maxWidth: '95vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
          animation: 'noticeSlideIn 0.25s ease',
          overflow: 'hidden',
        }}>
          {/* 헤더 */}
          <div style={{
            background: 'var(--accent-gradient, linear-gradient(135deg, #0284c7, #0d9488))',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-solid fa-bullhorn" style={{ color: '#fff', fontSize: '1.1rem' }}></i>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>공지사항</span>
              {total > 1 && (
                <span style={{
                  background: 'rgba(255,255,255,0.25)',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '20px',
                }}>
                  {currentIndex + 1} / {total}
                </span>
              )}
            </div>
            <button onClick={close} style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              width: '30px', height: '30px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          {/* 본문 */}
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            <h3 style={{
              margin: '0 0 16px',
              fontSize: '1.05rem',
              fontWeight: 700,
              color: 'var(--text-color, #1e293b)',
              lineHeight: 1.4,
            }}>
              {notice.title}
            </h3>
            <div
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-muted, #64748b)',
                lineHeight: 1.7,
                wordBreak: 'break-word',
              }}
              dangerouslySetInnerHTML={{ __html: notice.content }}
            />
          </div>

          {/* 복수 공지 내비게이션 */}
          {total > 1 && (
            <div style={{
              padding: '8px 24px',
              display: 'flex',
              justifyContent: 'center',
              gap: '6px',
            }}>
              {notices.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  style={{
                    width: i === currentIndex ? '20px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    background: i === currentIndex ? 'var(--accent, #0284c7)' : '#cbd5e1',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          )}

          {/* 푸터 액션 */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
            background: '#f8fafc',
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={dismissToday} style={{
                background: 'none',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '7px 13px',
                fontSize: '0.8rem',
                color: 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: 500,
              }}>
                오늘 하루 보지 않기
              </button>
              <button onClick={dismissForever} style={{
                background: 'none',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '7px 13px',
                fontSize: '0.8rem',
                color: 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: 500,
              }}>
                다시 보지 않기
              </button>
            </div>
            <button onClick={close} style={{
              background: 'var(--accent-gradient, linear-gradient(135deg, #0284c7, #0d9488))',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '0.85rem',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}>
              확인
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes noticeBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes noticeSlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}
