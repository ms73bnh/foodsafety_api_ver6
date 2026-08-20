'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL = 3 * 60 * 1000; // 3분마다 갱신

export default function PendingApprovalBadge() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);

  const fetchPending = useCallback(async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      const me = await meRes.json();
      if (!me.success || me.user?.role !== 'ADMIN') return;
      setIsAdmin(true);

      const uRes = await fetch('/api/users');
      const ud = await uRes.json();
      if (!ud.success) return;
      const pending = ud.users.filter(u => !u.isApproved).length;
      setCount(pending);
      setVisible(pending > 0);
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const timer = setInterval(fetchPending, POLL_INTERVAL);
    window.addEventListener('pending-approval-changed', fetchPending);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pending-approval-changed', fetchPending);
    };
  }, [fetchPending]);

  if (!isAdmin || !visible) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 9000,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* 탭 트리거 */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '36px',
            padding: '14px 0',
            background: 'linear-gradient(180deg, #f59e0b, #d97706)',
            border: 'none',
            borderRadius: '0 10px 10px 0',
            cursor: 'pointer',
            boxShadow: '2px 0 12px rgba(245,158,11,0.4)',
            color: '#fff',
            position: 'relative',
          }}
          title="승인 대기 목록"
        >
          {/* 펄스 링 */}
          <span style={{
            position: 'absolute',
            top: '10px',
            right: '-4px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#ef4444',
            animation: 'approvalPulse 1.8s ease-in-out infinite',
          }} />
          <i className="fa-solid fa-user-clock" style={{ fontSize: '0.85rem' }} />
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            lineHeight: 1,
            background: '#fff',
            color: '#d97706',
            borderRadius: '8px',
            padding: '2px 5px',
            minWidth: '20px',
            textAlign: 'center',
          }}>
            {count}
          </span>
          <span style={{
            fontSize: '0.55rem',
            fontWeight: 600,
            writingMode: 'vertical-rl',
            letterSpacing: '0.05em',
            opacity: 0.9,
          }}>
            승인대기
          </span>
        </button>

        {/* 확장 패널 */}
        <div style={{
          maxWidth: expanded ? '280px' : '0',
          overflow: 'hidden',
          transition: 'max-width 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{
            width: '280px',
            background: '#fff',
            border: '1px solid #fde68a',
            borderLeft: 'none',
            borderRadius: '0 12px 12px 0',
            boxShadow: '4px 0 20px rgba(245,158,11,0.15)',
            overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <div style={{
              background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
              padding: '14px 16px 10px',
              borderBottom: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-user-clock" style={{ color: '#d97706', fontSize: '0.85rem' }} />
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#92400e' }}>
                  가입 승인 대기
                </span>
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  borderRadius: '20px',
                  padding: '1px 8px',
                }}>
                  {count}건
                </span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', fontSize: '0.75rem', padding: '2px' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* 본문 */}
            <div style={{ padding: '14px 16px' }}>
              <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#78716c', lineHeight: 1.6 }}>
                관리자 승인을 기다리는 가입 신청이{' '}
                <strong style={{ color: '#d97706' }}>{count}건</strong> 있습니다.
                <br />지금 바로 처리하시겠습니까?
              </p>
              <button
                onClick={() => { setExpanded(false); router.push('/manage?tab=users'); }}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <i className="fa-solid fa-arrow-right" />
                사용자 관리 페이지로 이동
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes approvalPulse {
          0%   { transform: scale(1);   opacity: 1; }
          50%  { transform: scale(1.6); opacity: 0.4; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </>
  );
}
