"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MultiSelectPopup from '@/components/MultiSelectPopup';

function GeneralSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActualAdmin, setIsActualAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Data state
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    integrated: searchParams.get('integrated') || '',
    prdlstReportNo: searchParams.get('prdlstReportNo') || '',
    bsshNm: searchParams.get('bsshNm') || '',
    prdlstNm: searchParams.get('prdlstNm') || '',
    prdlstDcnm: searchParams.get('prdlstDcnm') || '',
    normalizedPackaging: searchParams.get('normalizedPackaging') || '',
    limit: searchParams.get('limit') || '15',
    sort: searchParams.get('sort') || 'prmsDt_desc'
  });

  // Sync state
  const [lastSyncIndex, setLastSyncIndex] = useState(0);
  const [totalApiCount, setTotalApiCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // Drawer state
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Options for popups
  const [availableOptions, setAvailableOptions] = useState({ categories: [], packagings: [], formulations: [] });
  const [catPopupOpen, setCatPopupOpen] = useState(false);
  const [packPopupOpen, setPackPopupOpen] = useState(false);
  const [formPopupOpen, setFormPopupOpen] = useState(false);

  // Check Admin Role
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const d = await res.json();
        if (d.success && d.user && (d.user.role === 'ADMIN' || d.user.role === 'SALES')) {
          setIsAdmin(true);
          if (d.user.role === 'ADMIN') setIsActualAdmin(true);
        } else {
          alert('영업(SALES) 이상 권한이 필요한 페이지입니다.');
          router.push('/');
        }
      } catch (err) {
        router.push('/login');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Load sync status
  useEffect(() => {
    if (!isAdmin) return;
    const fetchSyncStatus = async () => {
      try {
        const res = await fetch('/api/sync-general');
        const result = await res.json();
        if (result.success) {
          setLastSyncIndex(result.lastIndex);
        }
      } catch (e) {
        console.error('Failed to fetch sync status', e);
      }
    };
    fetchSyncStatus();
  }, [isAdmin]);

  // Initial fetch for options
  useEffect(() => {
    if (!isAdmin) return;
    const fetchOptions = async () => {
      try {
        const res = await fetch('/api/data-general/options');
        const result = await res.json();
        if (result.success) {
          setAvailableOptions({
            categories: result.categories,
            packagings: result.packagings,
            formulations: result.formulations
          });
        }
      } catch (e) {
        console.error('Failed to fetch options', e);
      }
    };
    fetchOptions();
  }, [isAdmin]);

  // Sync effect when searchParams change
  useEffect(() => {
    if (!isAdmin) return;
    const p = Number(searchParams.get('page')) || 1;

    const newFilters = {
      integrated: (searchParams.get('integrated') || '').trim(),
      prdlstReportNo: (searchParams.get('prdlstReportNo') || '').trim(),
      bsshNm: (searchParams.get('bsshNm') || '').trim(),
      prdlstNm: (searchParams.get('prdlstNm') || '').trim(),
      prdlstDcnm: (searchParams.get('prdlstDcnm') || '').trim(),
      normalizedPackaging: (searchParams.get('normalizedPackaging') || '').trim(),
      limit: searchParams.get('limit') || '15',
      sort: searchParams.get('sort') || 'prmsDt_desc'
    };
    setFilters(newFilters);
    setPage(p);

    let cancelled = false;
    const fetchWithParams = async () => {
      setLoading(true);
      setFetchError(null);
      setData([]);
      setTotal(0);
      setHasMore(false);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55_000);
      try {
        const query = new URLSearchParams({ ...newFilters, page: p });
        const res = await fetch(`/api/data-general?${query.toString()}`, { signal: controller.signal });
        if (cancelled) return;
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        const result = await res.json();
        if (cancelled) return;
        if (result.success) {
          setData(result.data);
          setTotal(result.total);
          setHasMore(result.hasMore || false);
        } else {
          setFetchError(result.error || '검색 중 오류가 발생했습니다.');
        }
      } catch (e) {
        if (cancelled) return;
        if (e.name === 'AbortError') {
          setFetchError('검색 시간이 초과되었습니다. 검색어를 더 구체적으로 입력하거나 잠시 후 다시 시도해주세요.');
        } else {
          setFetchError('검색 중 오류가 발생했습니다: ' + e.message);
        }
        console.error(e);
      } finally {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    };
    fetchWithParams();
    return () => { cancelled = true; };
  }, [searchParams, isAdmin]);

  // Auto Sync loop — 병렬 5개 청크
  useEffect(() => {
    let active = true;
    const PARALLEL = 5;
    const CHUNK = 1000;

    if (autoSync && syncing) {
      const runParallelSync = async (baseIdx) => {
        setSyncProgress(`병렬 동기화 중... (${baseIdx.toLocaleString()} ~ ${(baseIdx + PARALLEL * CHUNK - 1).toLocaleString()})`);

        const requests = Array.from({ length: PARALLEL }, (_, i) =>
          fetch('/api/sync-general', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startIdx: baseIdx + i * CHUNK, limit: CHUNK })
          }).then(r => r.json()).catch(err => ({ success: false, error: err.message }))
        );

        const results = await Promise.all(requests);
        if (!active) return;

        const succeeded = results.filter(d => d.success);
        const failed = results.filter(d => !d.success);
        const totalAdded = succeeded.reduce((s, d) => s + (d.addedCount || 0), 0);
        const totalUpdated = succeeded.reduce((s, d) => s + (d.updatedCount || 0), 0);
        const anyTotal = succeeded.find(d => d.total)?.total;
        if (anyTotal) setTotalApiCount(anyTotal);

        // 모든 청크가 실패했을 때만 중단 (일부 실패는 데이터 끝에 도달한 것으로 처리)
        if (succeeded.length === 0) {
          const errMsg = failed[0]?.error || '알 수 없는 오류';
          setAutoSync(false);
          setSyncing(false);
          setSyncProgress(`⚠️ API 오류로 동기화 중단: ${errMsg}`);
          alert(`동기화 중단\n\n${errMsg}\n\n잠시 후 다시 시도하세요.`);
          return;
        }

        // 데이터가 실제로 있었던 청크만으로 판단 (INFO-200은 정상 종료)
        const hasAnyData = succeeded.some(d => d.fetchedRows > 0);

        // 다음 배치 시작점은 항상 baseIdx + PARALLEL*CHUNK (범위 건너뜀 방지)
        const nextBaseIdx = baseIdx + PARALLEL * CHUNK;
        setLastSyncIndex(nextBaseIdx - 1);

        if (!hasAnyData) {
          setAutoSync(false);
          setSyncing(false);
          setSyncProgress('✅ 동기화 완료: 모든 데이터를 불러왔습니다.');
          alert('모든 데이터를 누적 동기화 완료했습니다.');
          return;
        }

        setSyncProgress(`완료: +${totalAdded}건 추가, +${totalUpdated}건 업데이트 (현재 인덱스: ${(nextBaseIdx - 1).toLocaleString()})`);

        setTimeout(() => {
          if (active && autoSync) runParallelSync(nextBaseIdx);
        }, 1000);
      };

      runParallelSync(lastSyncIndex + 1);
    }
    return () => { active = false; };
  }, [autoSync, syncing]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && drawerOpen) closeDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  if (authLoading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '100px 0' }}>
        <i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: '#6366f1' }}></i>
        <p style={{ marginTop: '20px', color: 'var(--text-muted)' }}>권한을 확인 중입니다...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    const params = { ...filters, page: '1' };
    const query = new URLSearchParams(params);
    router.push(`/general-search?${query.toString()}`, { scroll: false });
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    const params = { ...filters, page: newPage.toString() };
    const query = new URLSearchParams(params);
    router.push(`/general-search?${query.toString()}`, { scroll: false });
  };

  const handleClear = () => {
    const empty = { integrated: '', prdlstReportNo: '', bsshNm: '', prdlstNm: '', prdlstDcnm: '', normalizedPackaging: '', limit: '15', sort: 'prmsDt_desc' };
    setFilters(empty);
    setPage(1);
    router.push('/general-search', { scroll: false });
  };

  const handleSingleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncProgress('동기화 진행 중 (1,000건)...');
    try {
      const res = await fetch('/api/sync-general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1000 })
      });
      const d = await res.json();
      if (d.success) {
        setLastSyncIndex(d.lastIndex);
        if (d.total) setTotalApiCount(d.total);
        setSyncProgress(`완료: +${d.addedCount}건 추가, +${d.updatedCount}건 업데이트 (현재 인덱스: ${d.lastIndex.toLocaleString()})`);
        alert(`1,000건 동기화 성공!\n추가: ${d.addedCount}건, 업데이트: ${d.updatedCount}건`);
      } else {
        setSyncProgress(`⚠️ API 오류: ${d.error}`);
        alert(`동기화 실패\n\n${d.error}\n\n잠시 후 다시 시도하세요.`);
      }
    } catch (e) {
      setSyncProgress(`에러: ${e.message}`);
      alert(`요청 실패: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleResetIndex = async () => {
    const input = prompt('인덱스를 재설정할 번호를 입력하세요 (예: 270000):', lastSyncIndex);
    if (input === null) return;
    const val = parseInt(input, 10);
    if (isNaN(val) || val < 0) return alert('유효한 숫자를 입력하세요.');
    try {
      const res = await fetch('/api/sync-general', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastIndex: val })
      });
      const d = await res.json();
      if (d.success) {
        setLastSyncIndex(d.lastIndex);
        setSyncProgress(`인덱스가 ${d.lastIndex.toLocaleString()}으로 재설정되었습니다.`);
      } else {
        alert('재설정 실패: ' + d.error);
      }
    } catch (e) {
      alert('오류: ' + e.message);
    }
  };

  const handleAutoSyncToggle = () => {
    if (autoSync) {
      setAutoSync(false);
      setSyncing(false);
      setSyncProgress('동기화 중지됨.');
    } else {
      if (confirm('자동 연속 동기화를 시작하시겠습니까?\n5개 청크(5,000건)를 병렬로 반복 가져옵니다.')) {
        setAutoSync(true);
        setSyncing(true);
      }
    }
  };

  const handleOpenDrawer = async (item) => {
    setSelectedItem(item);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerData(null);
    try {
      const res = await fetch(`/api/detail-general/${encodeURIComponent(item.prdlstReportNo)}`);
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

  const handleDownload = (format) => {
    const query = new URLSearchParams({ ...filters, format });
    window.location.href = `/api/export-general?${query.toString()}`;
  };

  return (
    <main className="container general-theme">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <h1 className="title-gradient"><i className="fa-solid fa-wheat-awn" style={{ marginRight: '12px' }}></i>일반식품 품목 보고 검색</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
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

      {/* Sync Control Center — ADMIN 전용 */}
      {isActualAdmin && <div className="glass-panel" style={{ marginBottom: '32px', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #ddd6fe' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', color: '#4c1d95', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <i className="fa-solid fa-cloud-arrow-down"></i> 일반식품 API 증분 동기화 센터
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#5b21b6', margin: 0 }}>
              마지막으로 호출한 인덱스 번호는 <strong>{lastSyncIndex.toLocaleString()}</strong> 입니다. (호출 시점 이후의 데이터만 누적 동기화)
            </p>
            {syncProgress && (
              <p style={{ fontSize: '0.8rem', color: '#6d28d9', marginTop: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-spinner fa-spin"></i> {syncProgress}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleResetIndex}
              disabled={syncing}
              className="btn"
              style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', padding: '8px 14px', fontSize: '0.8rem', fontWeight: '600' }}
              title="lastIndex를 수동으로 재설정"
            >
              <i className="fa-solid fa-rotate-left"></i> 인덱스 재설정
            </button>
            <button
              onClick={handleSingleSync}
              disabled={syncing}
              className="btn"
              style={{ background: '#fff', border: '1px solid #c084fc', color: '#6b21a8', padding: '8px 14px', fontSize: '0.8rem', fontWeight: '600' }}
            >
              <i className="fa-solid fa-download"></i> 1,000건 동기화
            </button>
            <button
              onClick={handleAutoSyncToggle}
              className="btn"
              style={{
                background: autoSync ? '#ef4444' : '#7c3aed',
                color: '#fff',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: '600',
                boxShadow: autoSync ? '0 4px 10px rgba(239, 68, 68, 0.2)' : '0 4px 10px rgba(124, 58, 237, 0.2)'
              }}
            >
              <i className={`fa-solid ${autoSync ? 'fa-circle-stop' : 'fa-play'}`}></i> {autoSync ? '자동 동기화 중지' : '자동 연속 동기화'}
            </button>
          </div>
        </div>
      </div>}

      <div className="glass-panel" style={{ marginBottom: '32px' }}>
        <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', color: '#6366f1', fontWeight: 'bold' }}>
              <span><i className="fa-solid fa-bolt" style={{ marginRight: '6px' }}></i>통합검색 (품목제조번호, 업소명, 제품명, 유형 등)</span>
            </label>
            <input
              type="text"
              placeholder="제품명, 업소명, 품목제조번호 검색 (예: 불고기간장소스, 매일식품, 2024년...)"
              value={filters.integrated}
              onChange={e => setFilters({ ...filters, integrated: e.target.value })}
              style={{ width: '100%', padding: '12px 16px', fontSize: '1.05rem', backgroundColor: 'var(--surface-highlight)', borderColor: '#6366f1' }}
            />
          </div>
          <div>
            <label>품목제조번호</label>
            <input
              type="text"
              placeholder="품목제조번호 입력"
              value={filters.prdlstReportNo}
              onChange={e => setFilters({ ...filters, prdlstReportNo: e.target.value })}
            />
          </div>
          <div>
            <label>업소명</label>
            <input
              type="text"
              placeholder="업소명 입력"
              value={filters.bsshNm}
              onChange={e => setFilters({ ...filters, bsshNm: e.target.value })}
            />
          </div>
          <div>
            <label>제품명</label>
            <input
              type="text"
              placeholder="제품명 입력"
              value={filters.prdlstNm}
              onChange={e => setFilters({ ...filters, prdlstNm: e.target.value })}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <label style={{ color: '#6366f1' }}>품목유형</label>
            <div 
              onClick={() => setCatPopupOpen(true)}
              className="tag-input-container"
              style={{ 
                minHeight: '45px', 
                padding: '8px 12px', 
                border: '1px solid rgba(99, 102, 241, 0.2)', 
                borderRadius: '8px', 
                backgroundColor: '#fff',
                cursor: 'pointer',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                alignItems: 'center'
              }}
            >
              {filters.prdlstDcnm ? (
                filters.prdlstDcnm.split(',').map((tag, idx) => (
                  <span key={idx} className="selected-tag">
                    {tag.trim()}
                    <i 
                      className="fa-solid fa-xmark remove-tag" 
                      onClick={(e) => {
                        e.stopPropagation();
                        const newTags = filters.prdlstDcnm.split(',')
                          .map(t => t.trim())
                          .filter(t => t !== tag.trim());
                        setFilters({ ...filters, prdlstDcnm: newTags.join(', ') });
                      }}
                    ></i>
                  </span>
                ))
              ) : (
                <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>예: 소스, 과자...</span>
              )}
              <i className="fa-solid fa-plus" style={{ marginLeft: 'auto', color: '#6366f1', fontSize: '0.8rem' }}></i>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <label style={{ color: '#6366f1' }}>포장재질</label>
            <input
              type="text"
              placeholder="포장재질 선택"
              value={filters.normalizedPackaging}
              onClick={() => setPackPopupOpen(true)}
              readOnly
              style={{ borderColor: 'rgba(99, 102, 241, 0.2)', cursor: 'pointer', backgroundColor: '#fff' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
            <button 
              type="submit" 
              className="btn sync-btn" 
              style={{ flex: 1, padding: '12px', fontSize: '1rem', border: 'none', color: '#fff', height: '45px', justifyContent: 'center', fontWeight: 'bold' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}><i className="fa-solid fa-magnifying-glass"></i> 검색하기</span>
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleClear}
              style={{ flex: 1, padding: '12px', fontSize: '1rem', background: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', height: '45px', justifyContent: 'center' }}
            >
              <span style={{ whiteSpace: 'nowrap' }}><i className="fa-solid fa-arrow-rotate-left"></i> 초기화</span>
            </button>
          </div>
        </form>
      </div>

      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            총 <strong style={{ color: '#6366f1', fontSize: '1.3rem' }}>{total.toLocaleString()}</strong>건의 검색 결과
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={filters.limit}
              onChange={e => {
                const newLimit = e.target.value;
                setFilters({ ...filters, limit: newLimit });
                const query = new URLSearchParams({ ...filters, limit: newLimit, page: '1' });
                router.push(`/general-search?${query.toString()}`);
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
                router.push(`/general-search?${query.toString()}`);
              }}
              style={{ width: 'auto', background: '#fff', color: 'var(--text-color)', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <option value="prmsDt_desc">허가일자 최신순</option>
              <option value="prmsDt_asc">허가일자 과거순</option>
            </select>
          </div>
        </div>

        {fetchError && (
          <div style={{ margin: '0 0 16px', padding: '16px 20px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: '2px', flexShrink: 0 }}></i>
            <span>{fetchError}</span>
          </div>
        )}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>데이터 로딩중...</div>
        ) : (
          <div className="table-container" style={{ fontSize: '0.8rem', overflowX: 'auto', minHeight: '320px' }}>
            <table style={{ tableLayout: 'fixed', minWidth: '1000px' }}>
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>품목제조번호</th>
                  <th style={{ width: '16%' }}>업소명</th>
                  <th style={{ width: '22%' }}>제품명</th>
                  <th style={{ width: '12%' }}>품목유형</th>
                  <th style={{ width: '13%' }}>포장재질</th>
                  <th style={{ width: '15%' }}>소비기한</th>
                  <th style={{ width: '10%' }}>허가일자</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>상세</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id} className="table-row">
                    <td style={{ fontWeight: 600 }}>{item.prdlstReportNo}</td>
                    <td><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.bsshNm}</div></td>
                    <td>
                      <div className={(item.prdlstNm?.trim().length > 20) ? "hover-container" : ""}>
                         <div className="hover-static" style={{ color: '#6366f1', fontWeight: 600 }}>{item.prdlstNm}</div>
                         {(item.prdlstNm?.trim().length > 20) && <div className="hover-reveal">{item.prdlstNm}</div>}
                      </div>
                    </td>
                    <td>{item.prdlstDcnm || '-'}</td>
                    <td>
                      <div className={(item.normalizedPackaging?.trim().length > 12) ? "hover-container" : ""}>
                         <div className="hover-static" style={{ color: '#a855f7' }}>{item.normalizedPackaging || '-'}</div>
                         {(item.normalizedPackaging?.trim().length > 12) && <div className="hover-reveal">{item.normalizedPackaging}</div>}
                      </div>
                    </td>
                    <td><div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.pogDaycnt || '-'}</div></td>
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
                    <td colSpan="8" style={{ textAlign: 'center', padding: '32px' }}>검색 결과가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {(data.length > 0 || page > 1) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '32px' }}>
            {total > 0 && (
              <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                <strong>{page}</strong> / {Math.ceil(total / Number(filters.limit))} 페이지
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn sync-btn"
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
                style={{ padding: '8px 16px', opacity: page === 1 ? 0.5 : 1 }}
              >
                이전
              </button>

              {Array.from({ length: Math.min(10, Math.ceil(total / Number(filters.limit))) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`btn ${page === p ? 'sync-btn' : ''}`}
                    style={{ minWidth: '40px', padding: '8px', background: page === p ? '' : '#f8fafc', border: page === p ? '' : '1px solid #e2e8f0', color: page === p ? '#fff' : 'var(--text-color)' }}
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
          <h2 style={{ fontSize: '1.25rem', color: '#4f46e5' }}>일반식품 상세 정보</h2>
          <button onClick={closeDrawer} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="slide-content">
          {drawerLoading ? (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
              <i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: '#6366f1' }}></i>
              <p style={{ marginTop: '20px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</p>
            </div>
          ) : drawerData ? (
            <div className="animate-fade-in">
              <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.4rem', marginBottom: '8px', color: '#4f46e5' }}>{drawerData.prdlstNm}</h1>
                <span className="badge badge-new" style={{ fontSize: '0.8rem' }}>보고번호: {drawerData.prdlstReportNo}</span>
              </div>

              <div className="table-container" style={{ border: 'none' }}>
                <table className="detail-table">
                  <tbody>
                    <tr><th>업소명</th><td>{drawerData.bsshNm}</td></tr>
                    <tr><th>허가일자</th><td>{drawerData.prmsDt || '-'}</td></tr>
                    <tr><th>소비기한</th><td style={{ color: '#a855f7', fontWeight: 600 }}>{drawerData.pogDaycnt || '-'}</td></tr>
                    <tr><th>품목유형</th><td>{drawerData.prdlstDcnm || '-'}</td></tr>
                    <tr><th>업종</th><td>{drawerData.indutyCdNm || '-'}</td></tr>
                    <tr><th>제품형태</th><td>{drawerData.dispos || '-'}</td></tr>
                    <tr><th>포장재질</th><td style={{ color: '#6366f1', fontWeight: 600 }}>{drawerData.normalizedPackaging || '-'} ({drawerData.frmlcMtrqlt || '-'})</td></tr>
                    <tr><th>고열량저영양</th><td>{drawerData.hiengLntrtDvsNm || '-'}</td></tr>
                    <tr><th>어린이인증</th><td>{drawerData.childCrtfcYn || '-'}</td></tr>
                    <tr><th>생산종료여부</th><td>{drawerData.production || '-'}</td></tr>
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px', borderLeft: '4px solid #6366f1', paddingLeft: '10px', color: '#4f46e5', fontSize: '0.95rem' }}>용법 및 용도</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-color)', lineHeight: '1.6' }}><strong>용법:</strong> {drawerData.usage || '-'}</p>
                <p style={{ fontSize: '0.85rem', marginTop: '8px', color: 'var(--text-color)', lineHeight: '1.6' }}><strong>용도:</strong> {drawerData.prpos || '-'}</p>
              </div>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px', borderLeft: '4px solid #a855f7', paddingLeft: '10px', color: '#7e22ce', fontSize: '0.95rem' }}>최종 수정일자</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-color)' }}>{drawerData.lastUpdtDtm || '-'}</p>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
              상세 정보를 불러올 수 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* Select Popups */}
      <MultiSelectPopup 
        isOpen={catPopupOpen}
        title="품목유형"
        options={availableOptions.categories}
        selected={filters.prdlstDcnm ? filters.prdlstDcnm.split(',').map(s => s.trim()) : []}
        onConfirm={(selected) => {
          setFilters({ ...filters, prdlstDcnm: selected.join(', ') });
          setCatPopupOpen(false);
        }}
        onClose={() => setCatPopupOpen(false)}
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
        title="제품형태"
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

export default function GeneralSearchPage() {
  return (
    <Suspense fallback={<div className="container">데이터 로딩 중...</div>}>
      <GeneralSearchContent />
    </Suspense>
  );
}
