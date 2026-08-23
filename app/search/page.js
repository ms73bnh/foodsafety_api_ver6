"use client";

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MultiSelectPopup from '@/components/MultiSelectPopup';

function CompactTagField({ value, placeholder, accent = 'var(--accent)', onOpen, onRemove }) {
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];
  const visibleTags = tags.slice(0, 2);
  const hiddenCount = Math.max(0, tags.length - visibleTags.length);

  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="compact-tag-field"
      role="button"
      tabIndex={0}
      style={{ '--tag-accent': accent }}
      title={tags.length ? tags.join(', ') : placeholder}
    >
      <div className="compact-tag-strip">
        {tags.length ? (
          <>
            {visibleTags.map((tag) => (
              <span key={tag} className="compact-tag">
                <span>{tag}</span>
                <i
                  className="fa-solid fa-xmark"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(tag);
                  }}
                />
              </span>
            ))}
            {hiddenCount > 0 && <span className="compact-tag-more">+{hiddenCount}</span>}
          </>
        ) : (
          <span className="compact-tag-placeholder">{placeholder}</span>
        )}
      </div>
      <i className="fa-solid fa-plus compact-tag-plus" />
      {tags.length > 0 && (
        <div className="compact-tag-popover">
          {tags.map((tag) => (
            <span key={tag} className="compact-tag popover-tag">
              <span>{tag}</span>
              <i
                className="fa-solid fa-xmark"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(tag);
                }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    integrated: searchParams.get('integrated') || '',
    rawmtrlNm: searchParams.get('rawmtrlNm') || '',
    prdlstReportNo: searchParams.get('prdlstReportNo') || '',
    bsshNm: searchParams.get('bsshNm') || '',
    prdlstNm: searchParams.get('prdlstNm') || '',
    dispos: searchParams.get('dispos') || '',
    normalizedFunctionality: searchParams.get('search') || searchParams.get('normalizedFunctionality') || '',
    normalizedPackaging: searchParams.get('normalizedPackaging') || '',
    normalizedRawMaterials: searchParams.get('normalizedRawMaterials') || '',
    month: searchParams.get('month') || '',
    date: searchParams.get('date') || '',
    limit: searchParams.get('limit') || '15',
    sort: searchParams.get('sort') || 'prmsDt_desc'
  });

  // Drawer state
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // 기능성 완전 일치 검색 모드
  const [exactFunctionality, setExactFunctionality] = useState(
    searchParams.get('exactFunctionality') === 'true'
  );

  // Options for Popups
  const [availableOptions, setAvailableOptions] = useState({ functionalities: [], packagings: [], formulations: [] });
  const [funcPopupOpen, setFuncPopupOpen] = useState(false);
  const [packPopupOpen, setPackPopupOpen] = useState(false);
  const [formPopupOpen, setFormPopupOpen] = useState(false);

  // Initial fetch for options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch('/api/data/options');
        const result = await res.json();
        if (result.success) {
          setAvailableOptions({
            functionalities: result.functionalities,
            packagings: result.packagings,
            formulations: result.formulations
          });
        }
      } catch (e) {
        console.error('Failed to fetch options', e);
      }
    };
    fetchOptions();
  }, []);

  const EMPTY_FILTERS_CONST = { integrated: '', rawmtrlNm: '', prdlstReportNo: '', bsshNm: '', prdlstNm: '', dispos: '', normalizedFunctionality: '', normalizedPackaging: '', normalizedRawMaterials: '', month: '', date: '', limit: '15', sort: 'prmsDt_desc' };

  // ✅ 모든 데이터 fetch를 이 하나의 useEffect에서 처리 (레이스컨디션 방지)
  useEffect(() => {
    const p = Number(searchParams.get('page')) || 1;
    // URL에서 exactFunctionality도 함께 읽어 상태 동기화
    const exactFunc = searchParams.get('exactFunctionality') === 'true';
    setExactFunctionality(exactFunc);

    const newFilters = {
      integrated: (searchParams.get('integrated') || '').trim(),
      rawmtrlNm: (searchParams.get('rawmtrlNm') || '').trim(),
      prdlstReportNo: (searchParams.get('prdlstReportNo') || '').trim(),
      bsshNm: (searchParams.get('bsshNm') || '').trim(),
      prdlstNm: (searchParams.get('prdlstNm') || '').trim(),
      dispos: (searchParams.get('dispos') || '').trim(),
      normalizedFunctionality: (searchParams.get('search') || searchParams.get('normalizedFunctionality') || '').trim(),
      normalizedPackaging: (searchParams.get('normalizedPackaging') || '').trim(),
      normalizedRawMaterials: (searchParams.get('normalizedRawMaterials') || '').trim(),
      month: (searchParams.get('month') || '').trim(),
      date: (searchParams.get('date') || '').trim(),
      limit: searchParams.get('limit') || '15',
      sort: searchParams.get('sort') || 'prmsDt_desc'
    };
    setFilters(newFilters);
    setPage(p);

    // ✅ 파라미터 없을 때도 전체 데이터 fetch (빈 filters = 전체 조회)
    const fetchWithParams = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ ...newFilters, page: p });
        if (exactFunc) query.set('exactFunctionality', 'true'); // ✅ exactFunctionality URL에서 전달
        const res = await fetch(`/api/data?${query.toString()}`);
        const result = await res.json();
        if (result.success) {
          setData(result.data);
          setTotal(result.total);
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchWithParams();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ✅ handleSearch: URL 업데이트만 수행 → searchParams useEffect가 fetch 처리
  const handleSearch = (e) => {
    if (e) e.preventDefault();
    // shorthand 확장 ('비타민 C, D' → '비타민C, 비타민D')
    const expandedFunctionality = expandFunctionalityShorthand(filters.normalizedFunctionality).join(', ');
    const expandedFilters = { ...filters, normalizedFunctionality: expandedFunctionality };
    setFilters(expandedFilters);
    const params = { ...expandedFilters, page: '1' };
    // ✅ 현재 exactFunctionality 상태를 URL에 반영 → useEffect가 올바르게 읽음
    if (exactFunctionality) params.exactFunctionality = 'true';
    const query = new URLSearchParams(params);
    router.push(`/search?${query.toString()}`, { scroll: false });
    // fetch는 searchParams useEffect가 처리하므로 여기서 별도 호출 안 함
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    const params = { ...filters, page: newPage.toString() };
    if (exactFunctionality) params.exactFunctionality = 'true';
    const query = new URLSearchParams(params);
    router.push(`/search?${query.toString()}`, { scroll: false });
  };

  const EMPTY_FILTERS = { integrated: '', rawmtrlNm: '', prdlstReportNo: '', bsshNm: '', prdlstNm: '', dispos: '', normalizedFunctionality: '', normalizedPackaging: '', normalizedRawMaterials: '', month: '', date: '', limit: '15', sort: 'prmsDt_desc' };

  /**
   * '비타민 C, D' → ['비타민C', '비타민D'],  '비타민C, D' → ['비타민C', '비타민D']
   * 한글+영문 붙은 토큰('비타민C')에서도 한글 prefix를 추출해 다음 suffix에 적용.
   */
  const expandFunctionalityShorthand = (raw) => {
    if (!raw) return [];
    const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
    const expanded = [];
    let lastPrefix = '';
    for (const token of tokens) {
      const parts = token.split(/\s+/);
      if (parts.length === 1) {
        const singleToken = parts[0];
        if (/^[A-Za-z0-9]+$/.test(singleToken) && lastPrefix) {
          // 순수 영숫자 suffix (예: 'D', '3') → 이전 prefix와 결합
          expanded.push(lastPrefix + singleToken);
        } else {
          expanded.push(singleToken);
          // '비타민C' 처럼 한글+영문 혼합이면 한글 부분만 prefix로 추출
          const korMatch = singleToken.match(/^([\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]+)/);
          if (korMatch && korMatch[1].length < singleToken.length) {
            lastPrefix = korMatch[1]; // '비타민C' → lastPrefix='비타민'
          } else {
            lastPrefix = singleToken; // 순수 한글 → 그대로 prefix
          }
        }
      } else {
        // '비타민 C' → prefix='비타민', suffix='C'
        const prefix = parts.slice(0, -1).join(' ');
        const suffix = parts[parts.length - 1];
        expanded.push(prefix + suffix);
        lastPrefix = prefix;
      }
    }
    return expanded;
  };

  // ✅ handleClear: URL 초기화만 수행 → useEffect가 전체 데이터 fetch
  const handleClear = () => {
    setFilters(EMPTY_FILTERS);
    setExactFunctionality(false);
    setPage(1);
    router.push('/search', { scroll: false });
  };

  const handleOpenDrawer = async (item) => {
    setSelectedItem(item);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);
    try {
      const res = await fetch(`/api/detail/${encodeURIComponent(item.prdlstReportNo)}`);
      const result = await res.json();
      if (result.success) setDrawerData(result.data);
    } catch (e) {
      console.error(e);
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => {
      setSelectedItem(null);
      setDrawerData(null);
    }, 300);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && drawerOpen) closeDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  const handleDownload = (format) => {
    const query = new URLSearchParams({ ...filters, format });
    window.location.href = `/api/export?${query.toString()}`;
  };

  const removeFilterTag = (field, tag) => {
    const nextTags = filters[field]
      .split(',')
      .map(t => t.trim())
      .filter(t => t && t !== tag);
    setFilters({ ...filters, [field]: nextTags.join(', ') });
  };

  return (
    <main className="container search-page animate-fade-in">
      <div className="page-toolbar">
        <h1 className="title-gradient"><i className="fa-solid fa-database" style={{ marginRight: '12px' }}></i>데이터 정밀 검색</h1>
        <div className="page-actions">
          <button
            type="button"
            className="btn sync-btn"
            onClick={() => handleDownload('xlsx')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
          >
            <i className="fa-solid fa-file-excel"></i> 엑셀(XLSX) 다운로드
          </button>
          <button
            type="button"
            className="btn sync-btn"
            onClick={() => handleDownload('csv')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #64748b, #475569)', border: 'none', boxShadow: '0 4px 12px rgba(100, 116, 139, 0.2)' }}
          >
            <i className="fa-solid fa-file-csv"></i> CSV 다운로드
          </button>
        </div>
      </div>

      <div className="glass-panel search-panel" style={{ marginBottom: '32px' }}>
        <form onSubmit={handleSearch} className="search-form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            {/* 통합검색 레이블 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                <i className="fa-solid fa-bolt" style={{ marginRight: '6px' }}></i>통합검색(업체, 품목, 성분, 포장재질 등)
              </label>
            </div>
            <input
              type="text"
              placeholder="검색어를 입력하세요 (예: 비타민, 한미양행, HDPE, 캡슐...)"
              value={filters.integrated}
              onChange={e => setFilters({ ...filters, integrated: e.target.value })}
              style={{ width: '100%', padding: '12px 16px', fontSize: '1.1rem', backgroundColor: 'var(--surface-highlight)', borderColor: 'var(--accent)', transition: 'all 0.2s' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>품목제조번호</label>
            <input
              type="text"
              placeholder="제조번호 입력"
              value={filters.prdlstReportNo}
              onChange={e => setFilters({ ...filters, prdlstReportNo: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>업소명</label>
            <input
              type="text"
              placeholder="업소명 입력"
              value={filters.bsshNm}
              onChange={e => setFilters({ ...filters, bsshNm: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>품목명</label>
            <input
              type="text"
              placeholder="품목명 입력"
              value={filters.prdlstNm}
              onChange={e => setFilters({ ...filters, prdlstNm: e.target.value })}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>제형(제품형태)</label>
            <CompactTagField
              value={filters.dispos}
              placeholder="제형 선택"
              accent="#2563eb"
              onOpen={() => setFormPopupOpen(true)}
              onRemove={(tag) => removeFilterTag('dispos', tag)}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--accent-secondary)', fontWeight: 600 }}>
              기능성
              <span className="tooltip-trigger">
                <i className="fa-solid fa-circle-question" style={{ marginLeft: '4px' }}></i>
                <span className="tooltip">비타민C, 홍삼, 오메가3 등 정규화된 성분을 선택하세요.</span>
              </span>
            </label>
            
            <CompactTagField
              value={filters.normalizedFunctionality}
              placeholder="기능성 성분 선택"
              accent="#0d9488"
              onOpen={() => setFuncPopupOpen(true)}
              onRemove={(tag) => removeFilterTag('normalizedFunctionality', tag)}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>
              포장 재질
              <span className="tooltip-trigger">
                <i className="fa-solid fa-circle-question" style={{ marginLeft: '4px' }}></i>
                <span className="tooltip">HDPE, LDPE, PET, PTP, 유리 등 포장재질 키워드를 입력하세요.</span>
              </span>
            </label>
            <CompactTagField
              value={filters.normalizedPackaging}
              placeholder="포장 재질 선택"
              accent="#0284c7"
              onOpen={() => setPackPopupOpen(true)}
              onRemove={(tag) => removeFilterTag('normalizedPackaging', tag)}
            />
          </div>
          <div className="search-action-row">
            {/* 기능성 완전 일치 체크박스 - 항상 표시 */}
            <label
              htmlFor="exactFuncCheckbox"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                cursor: 'pointer', userSelect: 'none',
                fontSize: '0.8rem', fontWeight: 600,
                color: exactFunctionality ? '#0d9488' : '#94a3b8',
                padding: '0 12px', height: '45px', borderRadius: '8px',
                border: `1px solid ${exactFunctionality ? 'rgba(13,148,136,0.4)' : '#e2e8f0'}`,
                background: exactFunctionality ? 'rgba(13,148,136,0.06)' : '#f8fafc',
                transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <input
                id="exactFuncCheckbox"
                type="checkbox"
                checked={exactFunctionality}
                onChange={e => setExactFunctionality(e.target.checked)}
                style={{ width: '13px', height: '13px', accentColor: '#0d9488', cursor: 'pointer', flexShrink: 0 }}
              />
              <i className="fa-solid fa-bullseye" style={{ fontSize: '0.7rem' }} />
              기능성 완전 일치
              <span className="tooltip-trigger" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                <i className="fa-solid fa-circle-question" />
                <span className="tooltip" style={{ width: '230px', whiteSpace: 'normal', lineHeight: '1.6', textAlign: 'left', bottom: '130%' }}>
                  체크 시: 선택한 기능성 성분만 <strong>정확히</strong> 포함된 제품만 검색합니다.<br />
                  예) 홍삼+비타민D 선택 → 이 두 성분<strong>만</strong> 있는 제품<br />
                  미체크: 선택 성분이 포함된 모든 제품 (기본)
                </span>
              </span>
            </label>
            <button 
              type="submit" 
              className="btn sync-btn" 
              style={{ flex: 1, padding: '12px', fontSize: '1rem', background: 'var(--accent-gradient)', border: 'none', color: '#fff', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.3)', height: '45px', justifyContent: 'center', fontWeight: 'bold', minWidth: '100px' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}><i className="fa-solid fa-magnifying-glass"></i> 검색하기</span>
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleClear}
              style={{ flex: 1, padding: '12px', fontSize: '1rem', background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', height: '45px', justifyContent: 'center', minWidth: '80px' }}
            >
              <span style={{ whiteSpace: 'nowrap' }}><i className="fa-solid fa-arrow-rotate-left"></i> 초기화</span>
            </button>
          </div>
        </form>
      </div>

      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            총 <strong style={{ color: 'var(--accent)', fontSize: '1.3rem' }}>{total.toLocaleString()}</strong>건의 검색 결과
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={filters.limit}
              onChange={e => {
                const newLimit = e.target.value;
                setFilters({ ...filters, limit: newLimit });
                // Immediately trigger search with new limit
                const query = new URLSearchParams({ ...filters, limit: newLimit, page: '1' });
                router.push(`/search?${query.toString()}`);
              }}
              style={{ width: 'auto', background: '#fff', color: 'var(--text-color)', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <option value="15">15개씩 보기</option>
              <option value="25">25개씩 보기</option>
              <option value="30">30개씩 보기</option>
              <option value="50">50개씩 보기</option>
            </select>
            <select
              value={filters.sort}
              onChange={e => {
                const newSort = e.target.value;
                setFilters({ ...filters, sort: newSort });
                const query = new URLSearchParams({ ...filters, sort: newSort, page: '1' });
                router.push(`/search?${query.toString()}`);
              }}
              style={{ width: 'auto', background: '#fff', color: 'var(--text-color)', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <option value="prmsDt_desc">허가일자 최신순 (내림차순)</option>
              <option value="prmsDt_asc">허가일자 과거순 (오름차순)</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '16px', color: '#cbd5e1' }}></div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>데이터 로딩중...</div>
        ) : (
          <div className="table-container" style={{ fontSize: '0.8rem', overflowX: 'auto', minHeight: '320px' }}>
            <table style={{ tableLayout: 'fixed', minWidth: '1000px' }}>
              <thead>
                <tr>
                  <th style={{ width: '11%' }}>품목제조번호</th>
                  <th style={{ width: '14%' }}>업소명</th>
                  <th style={{ width: '17%' }}>품목명</th>
                  <th style={{ width: '8%' }}>제형</th>
                  <th style={{ width: '11%' }}>포장재질</th>
                  <th style={{ width: '14%' }}>소비기한</th>
                  <th style={{ width: '12%' }}>기능성</th>
                  <th style={{ width: '9%' }}>허가일자</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>상세</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id} className="table-row">
                    <td style={{ fontWeight: 600, color: 'var(--text-color)' }}>{item.prdlstReportNo}</td>
                    <td><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.bsshNm}</div></td>
                    <td>
                      <div className={(item.prdlstNm?.trim().length > 16) ? "hover-container" : ""}>
                         <div className="hover-static" style={{ color: 'var(--accent)', fontWeight: 600 }}>{item.prdlstNm}</div>
                         {(item.prdlstNm?.trim().length > 16) && <div className="hover-reveal">{item.prdlstNm}</div>}
                      </div>
                    </td>
                    <td><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.prdtShapCdNm || '-'}</div></td>
                    <td>
                      <div className={(item.normalizedPackaging?.trim().length > 12) ? "hover-container" : ""}>
                         <div className="hover-static" style={{ color: 'var(--accent)' }}>{item.normalizedPackaging || '-'}</div>
                         {(item.normalizedPackaging?.trim().length > 12) && <div className="hover-reveal">{item.normalizedPackaging}</div>}
                      </div>
                    </td>
                    <td><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--accent-secondary)' }}>{item.pogDaycnt || '-'}</div></td>
                    <td>
                      <div className={(item.normalizedFunctionality?.trim().length > 13) ? "hover-container" : ""}>
                         <div className="hover-static"><span className="badge badge-new" style={{ fontSize: '0.75rem' }}>{item.normalizedFunctionality || '-'}</span></div>
                         {(item.normalizedFunctionality?.trim().length > 13) && <div className="hover-reveal" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>{item.normalizedFunctionality}</div>}
                      </div>
                    </td>
                    <td>{item.prmsDt || '-'}</td>
                    <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                      <button 
                        onClick={() => handleOpenDrawer(item)} 
                        className="btn sync-btn" 
                        style={{ fontSize: '0.75rem', padding: '6px 12px', display: 'inline-flex', minWidth: '45px', borderRadius: '6px', lineHeight: '1', justifyContent: 'center', margin: '0 auto', whiteSpace: 'nowrap' }}
                      >
                         보기
                      </button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '32px' }}>검색 결과가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '32px' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              <strong>{page}</strong> / {Math.ceil(total / Number(filters.limit))} 페이지
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn sync-btn"
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
                style={{ padding: '8px 16px', opacity: page === 1 ? 0.5 : 1 }}
              >
                이전
              </button>

              {/* Page Numbers */}
              {Array.from({ length: Math.min(10, Math.ceil(total / Number(filters.limit))) }, (_, i) => {
                const p = i + 1;
                // Dynamic range calculation could be added here for many pages, 
                // but let's stick to first 10 for now or a simple window.
                return (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`btn ${page === p ? 'sync-btn' : ''}`}
                    style={{
                      minWidth: '40px',
                      padding: '8px',
                      background: page === p ? '' : '#f8fafc',
                      border: page === p ? '' : '1px solid #e2e8f0',
                      color: page === p ? '#fff' : 'var(--text-color)'
                    }}
                  >
                    {p}
                  </button>
                );
              })}

              {Math.ceil(total / Number(filters.limit)) > 10 && <span style={{ color: '#4b5563' }}>...</span>}

              <button
                className="btn sync-btn"
                disabled={page >= Math.ceil(total / Number(filters.limit))}
                onClick={() => handlePageChange(page + 1)}
                style={{ padding: '8px 16px', opacity: page >= Math.ceil(total / Number(filters.limit)) ? 0.5 : 1 }}
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Slide Overlay (Drawer) */}
      <div className={`overlay-backdrop ${drawerOpen ? 'open' : ''}`} onClick={closeDrawer}></div>
      <div className={`slide-panel ${drawerOpen ? 'open' : ''}`}>
        <div className="slide-header">
          <h2 style={{ fontSize: '1.25rem' }}>품목 상세 정보</h2>
          <button onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="slide-content">
          {drawerLoading ? (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
              <i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: 'var(--accent)' }}></i>
              <p style={{ marginTop: '20px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</p>
            </div>
          ) : drawerData ? (
            <div className="animate-fade-in">
              <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--primary)' }}>{drawerData.prdlstNm}</h1>
                <span className="badge badge-upd">{drawerData.prdlstReportNo}</span>
              </div>

              <div className="table-container" style={{ border: 'none' }}>
                <table className="detail-table">
                  <tbody>
                    <tr><th>업소명</th><td>{drawerData.bsshNm}</td></tr>
                    <tr><th>허가일자</th><td>{drawerData.prmsDt || '-'}</td></tr>
                    <tr><th>소비기한</th><td style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>{drawerData.pogDaycnt || '-'}</td></tr>
                    <tr><th>제형</th><td>{drawerData.dispos || '-'}</td></tr>
                    <tr><th>제품상태</th><td>{drawerData.prdtShapCdNm || '-'}</td></tr>
                    <tr><th>포장재질</th><td style={{ color: 'var(--accent)', fontWeight: 600 }}>{drawerData.normalizedPackaging || '-'} ({drawerData.frmlcMtrqlt || '-'})</td></tr>
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px', borderLeft: '4px solid var(--accent)', paddingLeft: '10px', color: 'var(--text-color)' }}>정규화 성분</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {drawerData.normalizedFunctionality?.split(',').map((f, i) => (
                    <span key={i} className="badge badge-new">{f.trim()}</span>
                  )) || '-'}
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px', borderLeft: '4px solid var(--accent-secondary)', paddingLeft: '10px', color: 'var(--text-color)' }}>기능성 내용</h4>
                <div className="glass-panel" style={{ padding: '16px', background: 'var(--bg-color)', fontSize: '0.9rem', lineHeight: '1.7', color: 'var(--text-color)' }}>
                  {drawerData.primaryFnclty}
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>기타 정보</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-color)' }}><strong>보존방법:</strong> {drawerData.cstdyMthd}</p>
                <p style={{ fontSize: '0.85rem', marginTop: '8px', color: 'var(--text-color)' }}><strong>섭취방법:</strong> {drawerData.ntkMthd}</p>
              </div>

              <div style={{ marginTop: '32px', textAlign: 'center' }}>
                <Link
                  href={`/detail/${drawerData.prdlstReportNo}`}
                  className="btn sync-btn"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  상세 페이지로 이동 <i className="fa-solid fa-arrow-up-right-from-square"></i>
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
              상세 정보를 불러올 수 없거나,<br />기본 정보가 부족합니다.
            </div>
          )}
        </div>
      </div>

      <MultiSelectPopup 
        isOpen={funcPopupOpen}
        title="기능성"
        options={availableOptions.functionalities}
        selected={filters.normalizedFunctionality ? filters.normalizedFunctionality.split(',').map(s => s.trim()) : []}
        onConfirm={(selected) => {
          setFilters({ ...filters, normalizedFunctionality: selected.join(', ') });
          setFuncPopupOpen(false);
        }}
        onClose={() => setFuncPopupOpen(false)}
      />

      <MultiSelectPopup 
        isOpen={packPopupOpen}
        title="포장 재질"
        options={availableOptions.packagings}
        selected={filters.normalizedPackaging ? filters.normalizedPackaging.split(',').map(s => s.trim()) : []}
        onConfirm={(selected) => {
          setFilters({ ...filters, normalizedPackaging: selected.join(', ') });
          setPackPopupOpen(false);
        }}
        onClose={() => setPackPopupOpen(false)}
      />

      <MultiSelectPopup 
        isOpen={formPopupOpen}
        title="제형(제품형태)"
        options={availableOptions.formulations}
        selected={filters.dispos ? filters.dispos.split(',').map(s => s.trim()) : []}
        onConfirm={(selected) => {
          setFilters({ ...filters, dispos: selected.join(', ') });
          setFormPopupOpen(false);
        }}
        onClose={() => setFormPopupOpen(false)}
      />

    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="container">데이터 로딩 중...</div>}>
      <SearchContent />
    </Suspense>
  );
}

