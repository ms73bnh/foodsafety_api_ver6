'use client';

import { useState, useEffect } from 'react';

export default function FloatingClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setDate(now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        zIndex: 7000,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '14px',
        padding: '10px 16px',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        userSelect: 'none',
        minWidth: '110px',
      }}
    >
      <div style={{
        fontSize: '1.35rem',
        fontWeight: 700,
        color: '#e2e8f0',
        letterSpacing: '0.06em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.2,
      }}>
        {time}
      </div>
      <div style={{
        fontSize: '0.68rem',
        color: '#94a3b8',
        marginTop: '3px',
        letterSpacing: '0.02em',
      }}>
        {date}
      </div>
    </div>
  );
}
