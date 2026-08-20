'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

/**
 * MultiSelectPopup Component
 * @param {boolean} isOpen - 모달 오픈 여부
 * @param {string} title - 모달 제목
 * @param {any} options - 선택 가능한 옵션 데이터 (all: [], top20: [], categories: [])
 * @param {string[]} selected - 현재 선택된 옵션 명칭 배열
 * @param {function} onConfirm - 확인 버튼 클릭 시 실행될 함수 (selected 배열 전달)
 * @param {function} onClose - 닫기 버튼 클릭 시 실행될 함수
 */
export default function MultiSelectPopup({ isOpen, title, options, selected, onConfirm, onClose }) {
  const [internalSelected, setInternalSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const searchInputRef = useRef(null);

  // 데이터 구조화 (전달받은 options가 객체형태인지 단순 배열인지 대응)
  const isStructured = useMemo(() => options && typeof options === 'object' && options.all, [options]);
  const allList = useMemo(() => isStructured ? options.all : (Array.isArray(options) ? options : []), [isStructured, options]);
  const categories = useMemo(() => isStructured ? options.categories : [], [isStructured, options]);

  // 모달이 열릴 때마다 초기화
  useEffect(() => {
    if (isOpen) {
      setInternalSelected([...selected]);
      setSearchTerm('');
      setActiveTab('ALL');
      // 포커스 자동 이동
      setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 100);
    }
  }, [isOpen, selected, isStructured]);

  // 현재 필터링된 결과
  const filteredOptions = useMemo(() => {
    if (!searchTerm) {
      if (!isStructured) return allList;
      if (activeTab === 'ALL') return allList;
      // 특정 카테고리 선택 시
      return allList.filter(opt => opt.category === activeTab);
    }

    const term = searchTerm.toLowerCase();
    return allList.filter(opt => {
      const name = typeof opt === 'string' ? opt : opt.name;
      return name.toLowerCase().includes(term);
    });
  }, [allList, searchTerm, activeTab, isStructured]);

  // 소분류 그룹화 (정규화된 리스트 용)
  const groupedOptions = useMemo(() => {
    if (searchTerm || !isStructured) return { "": filteredOptions };
    
    const groups = {};
    filteredOptions.forEach(opt => {
      const sub = opt.subcategory || "기타";
      if (!groups[sub]) groups[sub] = [];
      groups[sub].push(opt);
    });
    return groups;
  }, [filteredOptions, searchTerm, activeTab, isStructured]);

  const toggleOption = (option) => {
    const name = typeof option === 'string' ? option : option.name;
    if (internalSelected.includes(name)) {
      setInternalSelected(internalSelected.filter(o => o !== name));
    } else {
      setInternalSelected([...internalSelected, name]);
    }
  };

  const handleSelectAll = () => {
    const names = filteredOptions.map(opt => typeof opt === 'string' ? opt : opt.name);
    const newSelected = new Set([...internalSelected, ...names]);
    setInternalSelected(Array.from(newSelected));
  };

  const handleClearAll = () => {
    const names = new Set(filteredOptions.map(opt => typeof opt === 'string' ? opt : opt.name));
    setInternalSelected(internalSelected.filter(o => !names.has(o)));
  };

  if (!isOpen) return null;

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content shadow-premium animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <h3>
            <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: '10px', color: 'var(--accent)' }}></i>
            {title} 정밀 선택
          </h3>
          <button className="popup-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="popup-body">
          <div className="popup-search-container">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="성분명으로 검색하세요... (예: 비타민, 오메가)" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="popup-search-input"
            />
          </div>

          {isStructured && !searchTerm && (
            <div className="popup-tabs">
              <button 
                className={`tab-item ${activeTab === 'ALL' ? 'active' : ''}`}
                onClick={() => setActiveTab('ALL')}
              >전체 목록</button>
              {categories.map(cat => (
                <button 
                  key={cat.category}
                  className={`tab-item ${activeTab === cat.category ? 'active' : ''}`}
                  onClick={() => setActiveTab(cat.category)}
                >{cat.category}</button>
              ))}
            </div>
          )}

          <div className="popup-actions-bar">
            <button onClick={handleSelectAll} className="action-link">현재 항목 전체 선택</button>
            <span className="divider">|</span>
            <button onClick={handleClearAll} className="action-link">현재 항목 전체 해제</button>
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b' }}>
              총 선택됨: <strong>{internalSelected.length}</strong>건
            </span>
          </div>

          <div className="options-scroll-area">
            {Object.keys(groupedOptions).map(group => (
              <div key={group} className="group-section">
                {group && <h4 className="group-title">{group}</h4>}
                <div className="popup-options-grid">
                  {groupedOptions[group].map((opt, idx) => {
                    const name = typeof opt === 'string' ? opt : opt.name;
                    const count = opt.count || 0;
                    const isSelected = internalSelected.includes(name);
                    return (
                      <label key={idx} className={`popup-option-item ${isSelected ? 'active' : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleOption(opt)}
                        />
                        <span className="option-label" title={name}>{name}</span>
                        {count > 0 && <span className="option-count">{count.toLocaleString()}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div className="no-options">검색 결과가 없습니다.</div>
            )}
          </div>
        </div>

        <div className="popup-footer">
          <button className="popup-btn cancel" onClick={onClose}>취소</button>
          <button 
            className="popup-btn confirm" 
            onClick={() => onConfirm(internalSelected)}
          >
            선택 항목 적용하기
          </button>
        </div>
      </div>

      <style jsx>{`
        .popup-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(8px);
          z-index: 3000;
          display: flex;
          align-items: flex-start; /* 화면 상단으로 이동 */
          justify-content: center;
          padding: 80px 20px 20px; /* 상단 여백 추가 */
        }
        .popup-content {
          background: white;
          width: 100%;
          max-width: 800px; /* 넓이 약간 확장 */
          max-height: 80vh;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .popup-header {
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fff;
        }
        .popup-header h3 {
          margin: 0;
          font-size: 1.1rem; /* 제목 약간 축소 */
          color: #0f172a;
          font-weight: 800;
        }
        .popup-close-btn {
          background: none;
          border: none;
          font-size: 1.5rem; /* 닫기 버튼 축소 */
          line-height: 1;
          color: #94a3b8;
          cursor: pointer;
          transition: color 0.2s;
        }
        .popup-close-btn:hover {
          color: #ef4444;
        }
        .popup-body {
          flex: 1;
          overflow: hidden;
          padding: 16px 20px; /* 패딩 축소 */
          display: flex;
          flex-direction: column;
          gap: 12px; /* 간격 축소 */
        }
        .popup-search-container {
          position: relative;
        }
        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }
        .popup-search-input {
          width: 100%;
          padding: 10px 14px 10px 40px; /* 패딩 축소 */
          border-radius: 12px;
          border: 1px solid #e2e8f0; 
          font-size: 0.9rem; /* 폰트 축소 */
          transition: all 0.3s;
          background: #f8fafc;
        }
        .popup-search-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.1);
          background: #fff;
        }

        .popup-tabs {
          display: flex;
          gap: 6px; /* 간격 약간 증가 */
          padding: 8px; /* 패딩 증가 */
          background: #f1f5f9;
          border-radius: 14px;
          overflow-x: auto;
          scrollbar-width: none;
          min-height: 54px; /* 높이 확실히 확보 */
          align-items: center;
        }
        .popup-tabs::-webkit-scrollbar { display: none; }

        .tab-item {
          flex: none;
          white-space: nowrap;
          padding: 12px 20px; /* 수직/수평 패딩 증가 */
          font-size: 0.85rem; /* 폰트 다시 약간 상향 (가시성 확보) */
          font-weight: 700;
          line-height: 1.2;
          border: none;
          background: none;
          color: #64748b;
          cursor: pointer;
          border-radius: 10px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tab-item:hover { color: #334155; background: #e2e8f0; }
        .tab-item.active {
          background: white;
          color: var(--accent);
          box-shadow: 0 2px 8px rgba(0,0,0,0.08); /* 그림자 강화 */
        }

        .popup-actions-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 4px;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 4px;
        }
        .action-link {
          background: none;
          border: none;
          color: #64748b;
          font-size: 0.75rem; /* 액션 링크 폰트 축소 */
          font-weight: 600;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .action-link:hover {
          background: #f1f5f9;
          color: var(--accent);
        }
        .divider { color: #e2e8f0; }

        .options-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding-right: 4px;
        }
        .group-section {
          margin-bottom: 16px; /* 섹션 간격 축소 */
        }
        .group-title {
          font-size: 0.8rem; /* 그룹 타이틀 축소 */
          color: #94a3b8;
          margin-bottom: 8px;
          padding-left: 4px;
          border-left: 3px solid #e2e8f0;
        }

        .popup-options-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); /* 3열 정렬을 위해 최소 넓이 증가 */
          gap: 6px; 
        }
        .popup-option-item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          padding: 6px 10px; /* 패딩 대폭 축소 */
          border: 1px solid #f1f5f9;
          background: #f8fafc;
          border-radius: 8px; /* 곡률 축소 */
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }
        .popup-option-item:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .popup-option-item.active {
          background: #f0f9ff;
          border-color: #7dd3fc;
          color: #0369a1;
        }
        .popup-option-item input {
          margin-right: 8px; /* 마진 축소 */
          cursor: pointer;
          width: 14px;
          height: 14px;
          accent-color: var(--accent);
        }
        .option-label {
          font-size: 0.75rem; /* 폰트 대폭 축소 (이전 0.9rem) */
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          text-align: left;
        }
        .option-count {
          font-size: 0.65rem; /* 카운트 폰트 축소 */
          color: #94a3b8;
          margin-left: 4px;
          background: #f1f5f9;
          padding: 1px 4px;
          border-radius: 3px;
          font-weight: 500;
        }

        .no-options {
          padding: 60px 0;
          text-align: center;
          color: #94a3b8;
          font-style: italic;
          font-size: 0.9rem;
        }
        .popup-footer {
          padding: 20px 24px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: #f8fafc;
        }
        .popup-btn {
          padding: 12px 28px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
        }
        .popup-btn.cancel {
          background: white;
          border: 1px solid #e2e8f0;
          color: #64748b;
        }
        .popup-btn.confirm {
          background: var(--accent-gradient);
          border: none;
          color: white;
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
        }
        .popup-btn.confirm:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(2, 132, 199, 0.3);
        }
      `}</style>
    </div>
  );
}
