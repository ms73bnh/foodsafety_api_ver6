'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ─────────────────────────────────────────────────────
   RunningCat  –  cat.gif 이스터에그 (우 → 좌)
   ───────────────────────────────────────────────────── */
const IDLE_MS   = 5_000;
const CAT_W     = 140;
const CAT_H     = 140;
const SPEED_MIN = 280;
const SPEED_MAX = 480;
const PATH_TYPES = ['HORIZONTAL', 'DIAG_DOWN', 'DIAG_UP', 'CURVE_S'];

function pickPath(W, H) {
  const type  = PATH_TYPES[Math.floor(Math.random() * PATH_TYPES.length)];
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);

  // 우 → 좌
  const startX = W + CAT_W + 20;
  const endX   = -CAT_W - 20;
  const dist   = startX - endX;
  const dur    = dist / speed;   // 초

  const margin = 80;
  let startY, endY, curveAmp = 0;

  if (type === 'HORIZONTAL') {
    startY = endY = H * 0.55 + Math.random() * (H * 0.3);
  } else if (type === 'DIAG_DOWN') {
    startY = margin + Math.random() * (H * 0.25);
    endY   = H - margin - Math.random() * (H * 0.2);
  } else if (type === 'DIAG_UP') {
    startY = H - margin - Math.random() * (H * 0.25);
    endY   = margin + Math.random() * (H * 0.2);
  } else {
    startY = endY = H * 0.3 + Math.random() * (H * 0.4);
    curveAmp = 60 + Math.random() * 80;
  }

  return { type, startX, startY, endX, endY, dur, curveAmp };
}

function RunningCat() {
  const [run, setRun] = useState(null);
  const activeRef     = useRef(false);
  const idleTimer     = useRef(null);
  const rafRef        = useRef(null);

  const spawnCat = useCallback(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    activeRef.current = true;
    setRun({ id: Date.now(), path: pickPath(W, H), startTime: performance.now() });
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (activeRef.current) {
      activeRef.current = false;
      setRun(null);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(spawnCat, IDLE_MS);
  }, [spawnCat]);

  useEffect(() => {
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown',   resetIdleTimer);
    idleTimer.current = setTimeout(spawnCat, IDLE_MS);
    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown',   resetIdleTimer);
      clearTimeout(idleTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [resetIdleTimer, spawnCat]);

  useEffect(() => {
    if (!run) return;
    const check = () => {
      const elapsed = (performance.now() - run.startTime) / 1000;
      if (elapsed >= run.path.dur + 0.5) {
        activeRef.current = false;
        setRun(null);
        clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(spawnCat, IDLE_MS);
        return;
      }
      rafRef.current = requestAnimationFrame(check);
    };
    rafRef.current = requestAnimationFrame(check);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [run, spawnCat]);

  if (!run) return null;

  const { path } = run;
  const durMs    = path.dur * 1000;
  const animName = `catRun_${run.id}`;

  let kfCSS = '';
  if (path.type === 'CURVE_S') {
    const steps   = 24;
    const totalPx = path.endX - path.startX; // 음수 (우→좌)
    const frames  = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const x = path.startX + t * totalPx;
      const y = path.startY + Math.sin(t * Math.PI * 3) * path.curveAmp;
      return `${(t * 100).toFixed(1)}% { transform: translate(${x.toFixed(1)}px, ${y.toFixed(1)}px); }`;
    });
    kfCSS = `@keyframes ${animName} { ${frames.join(' ')} }`;
  } else {
    kfCSS = `
      @keyframes ${animName} {
        0%   { transform: translate(${path.startX}px, ${path.startY}px); }
        100% { transform: translate(${path.endX}px,   ${path.endY}px); }
      }
    `;
  }

  return (
    <>
      <style>{kfCSS}</style>
      <img
        key={run.id}
        src="/cat.gif"
        alt=""
        style={{
          position:       'fixed',
          top:            0,
          left:           0,
          width:          `${CAT_W}px`,
          height:         `${CAT_H}px`,
          objectFit:      'contain',
          zIndex:         8500,
          pointerEvents:  'none',
          userSelect:     'none',
          animation:      `${animName} ${durMs}ms linear forwards`,
          filter:         'drop-shadow(0 6px 12px rgba(0,0,0,0.28))',
        }}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────
   CapsuleExplode  –  Canvas + RAF 기반 파티클
   (CSS keyframes 없음 → 100% 신뢰성 보장)
   ───────────────────────────────────────────────────── */
const EMOJIS = ['💊','💊','💊','✨','⭐','🌟','💫','🔵','🟡','🔴','🟢','💥'];

function CapsuleExplode() {
  const canvasRef    = useRef(null);
  const particlesRef = useRef([]);
  const rafRef       = useRef(null);
  const lastTimeRef  = useRef(null);

  /* 캔버스 크기 동기화 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  /* RAF 루프 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (now) => {
      const dt = lastTimeRef.current ? Math.min((now - lastTimeRef.current) / 1000, 0.05) : 0.016;
      lastTimeRef.current = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      for (const p of particlesRef.current) {
        p.x   += p.vx * dt;
        p.vy  += 400 * dt;   // 중력
        p.y   += p.vy * dt;
        p.rot += p.rotSpd * dt;
        p.life -= dt;

        const alpha = Math.max(0, Math.min(1, p.life / 0.35));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font        = `${p.size}px serif`;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillText(p.emoji, -p.size / 2, p.size / 2);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* 이벤트 수신 */
  useEffect(() => {
    const handler = (e) => {
      const cx = e.detail?.x ?? window.innerWidth  / 2;
      const cy = e.detail?.y ?? window.innerHeight / 2;

      const batch = Array.from({ length: 40 }, (_, i) => {
        const angle = (i / 40) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 120 + Math.random() * 320;
        return {
          x:      cx,
          y:      cy,
          vx:     Math.cos(angle) * speed,
          vy:     Math.sin(angle) * speed - 180,
          rot:    Math.random() * Math.PI * 2,
          rotSpd: (Math.random() - 0.5) * 12,
          emoji:  EMOJIS[i % EMOJIS.length],
          size:   22 + Math.random() * 20,
          life:   1.0 + Math.random() * 0.5,
        };
      });

      particlesRef.current = [...particlesRef.current, ...batch];
    };

    window.addEventListener('capsule-explode', handler);
    return () => window.removeEventListener('capsule-explode', handler);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        top:           0,
        left:          0,
        width:         '100vw',
        height:        '100vh',
        zIndex:        99998,
        pointerEvents: 'none',
        userSelect:    'none',
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────
   CapsuleTrigger
   위치: 화면 우측 하단 (right 20px, bottom 108px)
   트리거: 더블클릭 or 2초 내 2번 클릭
   ───────────────────────────────────────────────────── */
function CapsuleTrigger() {
  const clickCount = useRef(0);
  const clickTimer = useRef(null);
  const btnRef     = useRef(null);

  const fire = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width  / 2 : window.innerWidth  / 2;
    const y = rect ? rect.top  + rect.height / 2 : window.innerHeight / 2;
    triggerCapsuleExplode(x, y);
  }, []);

  const handleClick = useCallback(() => {
    clickCount.current += 1;
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { clickCount.current = 0; }, 2000);
    if (clickCount.current >= 2) {
      clickCount.current = 0;
      clearTimeout(clickTimer.current);
      fire();
    }
  }, [fire]);

  const handleDblClick = useCallback((e) => {
    e.preventDefault();
    clickCount.current = 0;
    clearTimeout(clickTimer.current);
    fire();
  }, [fire]);

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      onDoubleClick={handleDblClick}
      title="💊 더블클릭!"
      aria-label="Easter egg 캡슐"
      style={{
        position:     'fixed',
        right:        '18px',
        bottom:       '108px',
        zIndex:       7100,
        background:   'none',
        border:       'none',
        cursor:       'pointer',
        fontSize:     '1.5rem',
        opacity:      0.18,
        padding:      '8px',
        lineHeight:   1,
        transition:   'opacity 0.2s, transform 0.15s',
        userSelect:   'none',
        borderRadius: '50%',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.opacity   = '0.8';
        e.currentTarget.style.transform = 'scale(1.25)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.opacity   = '0.18';
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      💊
    </button>
  );
}

/* ─────────────────────────────────────────────────────
   진입점
   ───────────────────────────────────────────────────── */
export default function EasterEgg() {
  return (
    <>
      <RunningCat />
      <CapsuleExplode />
      <CapsuleTrigger />
    </>
  );
}

export function triggerCapsuleExplode(x, y) {
  window.dispatchEvent(new CustomEvent('capsule-explode', { detail: { x, y } }));
}
