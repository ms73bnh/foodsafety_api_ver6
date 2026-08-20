'use client';

import { useRef, useEffect, useCallback } from 'react';

const FONT_SIZES = [
  { label: '소', value: '0.8rem' },
  { label: '보통', value: '1rem' },
  { label: '중', value: '1.15rem' },
  { label: '대', value: '1.35rem' },
  { label: '특대', value: '1.6rem' },
];

const TEXT_COLORS = [
  '#1e293b', '#0284c7', '#0d9488', '#16a34a',
  '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#64748b', '#ffffff',
];

export default function RichTextEditor({ value, onChange, placeholder = '내용을 입력하세요.' }) {
  const editorRef = useRef(null);

  // 외부 value → 에디터 동기화 (초기 마운트 또는 폼 리셋 시)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || '';
      // 초기 마운트 시 부모 state에도 현재 값을 즉시 동기화
      onChange(el.innerHTML);
    }
  }, [value]);

  const exec = useCallback((command, val = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    emitChange();
  }, []);

  const emitChange = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const applyFontSize = (size) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const span = document.createElement('span');
    span.style.fontSize = size;
    range.surroundContents(span);
    sel.removeAllRanges();
    emitChange();
  };

  const applyColor = (color) => {
    exec('foreColor', color);
  };

  const ToolBtn = ({ title, onClick, children, active }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        width: '30px', height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${active ? '#0284c7' : '#e2e8f0'}`,
        borderRadius: '6px',
        background: active ? '#eff6ff' : '#fff',
        color: active ? '#0284c7' : '#475569',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      {/* 툴바 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: '8px 10px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        flexWrap: 'wrap',
      }}>
        {/* 기본 서식 */}
        <ToolBtn title="굵게 (Ctrl+B)" onClick={() => exec('bold')}>
          <b>B</b>
        </ToolBtn>
        <ToolBtn title="기울임 (Ctrl+I)" onClick={() => exec('italic')}>
          <i>I</i>
        </ToolBtn>
        <ToolBtn title="밑줄 (Ctrl+U)" onClick={() => exec('underline')}>
          <u>U</u>
        </ToolBtn>

        <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 4px' }} />

        {/* 글자 크기 */}
        {FONT_SIZES.map(({ label, value: size }) => (
          <button
            key={size}
            type="button"
            title={`글자 크기: ${label}`}
            onMouseDown={(e) => { e.preventDefault(); applyFontSize(size); }}
            style={{
              height: '30px', padding: '0 8px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              background: '#fff',
              color: '#475569',
              cursor: 'pointer',
              fontSize: size,
              fontWeight: 600,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            가
          </button>
        ))}

        <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 4px' }} />

        {/* 글자 색상 */}
        {TEXT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={`글자 색: ${color}`}
            onMouseDown={(e) => { e.preventDefault(); applyColor(color); }}
            style={{
              width: '22px', height: '22px',
              borderRadius: '50%',
              background: color,
              border: color === '#ffffff' ? '1px solid #cbd5e1' : '2px solid transparent',
              cursor: 'pointer',
              flexShrink: 0,
              outline: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }}
          />
        ))}

        <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 4px' }} />

        {/* 정렬 */}
        <ToolBtn title="왼쪽 정렬" onClick={() => exec('justifyLeft')}>
          <i className="fa-solid fa-align-left" style={{ fontSize: '0.7rem' }}></i>
        </ToolBtn>
        <ToolBtn title="가운데 정렬" onClick={() => exec('justifyCenter')}>
          <i className="fa-solid fa-align-center" style={{ fontSize: '0.7rem' }}></i>
        </ToolBtn>
        <ToolBtn title="오른쪽 정렬" onClick={() => exec('justifyRight')}>
          <i className="fa-solid fa-align-right" style={{ fontSize: '0.7rem' }}></i>
        </ToolBtn>

        <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 4px' }} />

        {/* 서식 초기화 */}
        <ToolBtn title="서식 초기화" onClick={() => exec('removeFormat')}>
          <i className="fa-solid fa-text-slash" style={{ fontSize: '0.7rem' }}></i>
        </ToolBtn>
      </div>

      {/* 에디터 영역 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        data-placeholder={placeholder}
        style={{
          minHeight: '140px',
          padding: '14px 16px',
          outline: 'none',
          fontSize: '0.9rem',
          color: '#1e293b',
          lineHeight: 1.7,
          wordBreak: 'break-word',
        }}
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
