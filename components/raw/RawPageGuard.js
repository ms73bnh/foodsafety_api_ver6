"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 로우데이터 추출 페이지 공통 래퍼: 로그인 + 메뉴 권한(menu_visibility) 확인
export default function RawPageGuard({ menuKey, children }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const verify = async () => {
      try {
        const [meRes, menuRes] = await Promise.all([fetch('/api/auth/me'), fetch('/api/menu-visibility')]);
        const me = await meRes.json();
        if (!me.success || !me.user) return router.push('/login');
        const menu = await menuRes.json();
        const item = Array.isArray(menu.config) ? menu.config.find((m) => m.key === menuKey) : null;
        const ok = me.user.role === 'ADMIN'
          || (item && item.enabled !== false && Array.isArray(item.visibleTo) && item.visibleTo.includes(me.user.role));
        if (!ok) {
          alert('접근 권한이 없는 페이지입니다.');
          return router.push('/');
        }
        setAllowed(true);
      } catch (e) {
        console.error(e);
        router.push('/login');
      }
    };
    verify();
  }, [menuKey, router]);

  if (!allowed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
        <i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: 'var(--accent)' }}></i>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>권한을 확인하는 중입니다...</p>
      </div>
    );
  }

  return <main className="container animate-fade-in">{children}</main>;
}
