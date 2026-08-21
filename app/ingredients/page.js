"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatFormattedText } from '@/lib/normalizer';

const CATEGORY_LIST = [
  "장건강","혈행개선","눈건강","뇌건강","간건강","혈압","체지방감소","혈당조절",
  "뼈관절","피부건강","수면정신","면역","홍삼인삼","남성건강","여성건강",
  "배변활동","근육/운동","혈액","구강케어","전해질균형","항산화","위건강",
  "키성장","배뇨기능","콜레스테롤","모발","에너지활력","호흡기","멀티비타민"
];

const SIGNAL_MAP = {
  "호흡기":   { label: "신규급증", color: "#dc2626" },
  "근육/운동": { label: "신규급증", color: "#dc2626" },
  "모발":     { label: "신규급증", color: "#dc2626" },
  "구강케어": { label: "급성장",  color: "#d97706" },
  "키성장":   { label: "급성장",  color: "#d97706" },
  "수면정신": { label: "주목",    color: "#7c3aed" },
  "위건강":   { label: "주목",    color: "#7c3aed" },
};

const EMPTY_FORM = {
  recognitionNumber: '', name: '', company: '', functionalityText: '',
  dailyIntake: '', precautions: '', registeredDate: '', detailContent: ''
};

export default function IngredientsPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [limit] = useState(20);

  // 동기화 & 변경이력 모달 상태
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // CRUD Modal state
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'view' | 'delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 맵핑된 완제품 정보 상태
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedTotal, setRelatedTotal] = useState(0);

  const [sortBy, setSortBy] = useState('registeredDate');
  const [sortOrder, setSortOrder] = useState('desc');

  const [debouncedSearch, setDebouncedSearch] = useState('');

  // 300ms 디바운스 적용
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ 
        page: p.toString(), 
        limit: limit.toString(), 
        search: debouncedSearch, 
        category,
        sortBy,
        sortOrder
      });
      const res = await fetch(`/api/ingredients?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setTotal(json.total);
        setPages(json.pages);
        setPage(p);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [debouncedSearch, category, limit, sortBy, sortOrder]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const renderSortIcon = (field) => {
    if (sortBy !== field) {
      return <i className="fas fa-sort" style={{ marginLeft: 4, color: '#cbd5e1', fontSize: '0.7rem' }} />;
    }
    return sortOrder === 'asc' 
      ? <i className="fas fa-sort-up" style={{ marginLeft: 4, color: '#0284c7', fontSize: '0.75rem' }} />
      : <i className="fas fa-sort-down" style={{ marginLeft: 4, color: '#0284c7', fontSize: '0.75rem' }} />;
  };

  const openCreate = () => { setForm(EMPTY_FORM); setError(''); setModal('create'); };
  const openEdit = (item) => { setSelected(item); setForm({ ...item }); setError(''); setModal('edit'); };
  
  const openView = async (item) => {
    setSelected(item);
    setModal('view');
    setRelatedLoading(true);
    setRelatedProducts([]);
    setRelatedTotal(0);
    try {
      const res = await fetch(`/api/ingredients/${item.id}/products?limit=10`);
      const json = await res.json();
      if (json.success) {
        setRelatedProducts(json.products);
        setRelatedTotal(json.total);
      }
    } catch (e) {
      console.error('Failed to fetch related products:', e);
    }
    setRelatedLoading(false);
  };

  const openDelete = (item) => { setSelected(item); setModal('delete'); };
  const closeModal = () => { setModal(null); setSelected(null); setError(''); setSuccessMsg(''); setRelatedProducts([]); };

  const handleSave = async () => {
    setError(''); setSaving(true);
    try {
      const isEdit = modal === 'edit';
      const url = isEdit ? `/api/ingredients/${selected.id}` : '/api/ingredients';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(isEdit ? '수정되었습니다.' : '등록되었습니다.');
        await fetchData(page);
        setTimeout(() => closeModal(), 1000);
      } else {
        setError(json.error || '저장 중 오류가 발생했습니다.');
      }
    } catch (e) { setError('네트워크 오류가 발생했습니다.'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ingredients/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        await fetchData(page);
        closeModal();
      } else {
        setError(json.error || '삭제 중 오류가 발생했습니다.');
      }
    } catch (e) { setError('네트워크 오류'); }
    setSaving(false);
  };

  const handleSync = async () => {
    if (!confirm('식약처 최신 개별인정형 원료 공시 데이터를 동기화하고 변경사항을 감지하시겠습니까?')) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/ingredients/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSyncMsg(json.message);
        await fetchData(1);
      } else {
        alert(json.error || '동기화 중 오류가 발생했습니다.');
      }
    } catch (e) {
      alert('동기화 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenHistory = async () => {
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/ingredients/history?type=INGREDIENT');
      const json = await res.json();
      if (json.success) {
        setHistoryLogs(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getCategoryTags = (cats) => {
    if (!cats) return [];
    return cats.split(',').map(c => c.trim()).filter(Boolean);
  };

  const getSignal = (cats) => {
    if (!cats) return null;
    const tags = cats.split(',').map(c => c.trim());
    for (const tag of tags) {
      if (SIGNAL_MAP[tag]) return SIGNAL_MAP[tag];
    }
    return null;
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
            개별인정형 원료 DB
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
            식약처 개별인정형 기능성 원료 목록 — 총 <strong style={{ color: '#0284c7' }}>{total.toLocaleString()}</strong>건 (기본: 최신 등록순 정렬)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {syncMsg && (
            <span style={{ fontSize: '0.82rem', color: '#0d9488', fontWeight: 600 }}>{syncMsg}</span>
          )}
          <button
            onClick={handleOpenHistory}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8,
              fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <i className="fa-solid fa-clock-rotate-left" style={{ color: '#0284c7' }} />
            변경 이력 확인
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: syncing ? '#94a3b8' : '#0d9488', color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: '0.82rem', cursor: syncing ? 'not-allowed' : 'pointer', boxShadow: '0 2px 6px rgba(13,148,136,0.25)'
            }}
          >
            <i className={`fa-solid ${syncing ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
            {syncing ? '동기화 중...' : '최신 공시 동기화'}
          </button>
          <button onClick={openCreate} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: '#0284c7', color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 2px 6px rgba(2,132,199,0.25)'
          }}>
            <i className="fas fa-plus" /> 원료 추가
          </button>
        </div>
      </div>

      {/* 검색 & 필터 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="원료명, 인정번호, 업체명, 기능성 내용 검색..."
            style={{ paddingLeft: 38, borderRadius: 8, border: '1px solid #e2e8f0', padding: '9px 12px 9px 38px', width: '100%', fontSize: '0.82rem' }}
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ flex: '0 0 160px', borderRadius: 8, border: '1px solid #e2e8f0', padding: '9px 12px', fontSize: '0.82rem', background: '#fff' }}
        >
          <option value="">전체 카테고리</option>
          {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* 테이블 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', minHeight: '320px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th onClick={() => handleSort('registeredDate')} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  등록연도/일자 {renderSortIcon('registeredDate')}
                </th>
                <th onClick={() => handleSort('recognitionNumber')} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  인정번호 {renderSortIcon('recognitionNumber')}
                </th>
                <th onClick={() => handleSort('name')} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  원료명 {renderSortIcon('name')}
                </th>
                <th onClick={() => handleSort('company')} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  업체명 {renderSortIcon('company')}
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                  기능성 카테고리
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                  기능성 내용
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: '0.8rem' }}>불러오는 중...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: '0.8rem' }}>데이터가 없습니다.</td></tr>
              ) : data.map(item => {
                const cats = getCategoryTags(item.categories);
                const signal = getSignal(item.categories);
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{item.registeredDate || '-'}</td>
                    <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{item.recognitionNumber}</td>
                    
                    {/* 원료명 (호버 툴팁 적용) */}
                    <td style={{ padding: '10px 14px', minWidth: 160, maxWidth: 220 }}>
                      <div className={item.name.length > 20 ? "hover-container" : ""} style={{ display: 'flex', alignItems: 'center' }}>
                        <button onClick={() => openView(item)} className="hover-static" style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#0284c7', textAlign: 'left', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190, padding: 0 }}>
                          {item.name}
                        </button>
                        {item.name.length > 20 && <div className="hover-reveal" style={{ fontSize: '0.78rem' }}>{item.name}</div>}
                        {signal && (
                          <span style={{ marginLeft: 6, padding: '2px 5px', background: signal.color + '18', color: signal.color, borderRadius: 4, fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {signal.label}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 업체명 (호버 툴팁 적용) */}
                    <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#475569', maxWidth: 120 }}>
                      <div className={(item.company && item.company.length > 10) ? "hover-container" : ""}>
                        <div className="hover-static" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.company || '-'}
                        </div>
                        {item.company && item.company.length > 10 && <div className="hover-reveal" style={{ fontSize: '0.78rem' }}>{item.company}</div>}
                      </div>
                    </td>

                    <td style={{ padding: '10px 14px', minWidth: 160 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {cats.slice(0, 3).map(c => {
                          const sig = SIGNAL_MAP[c];
                          return (
                            <span key={c} style={{ padding: '2px 6px', background: sig ? sig.color + '15' : '#eff6ff', color: sig ? sig.color : '#0284c7', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {c}
                            </span>
                          );
                        })}
                        {cats.length > 3 && <span style={{ padding: '2px 5px', background: '#f1f5f9', color: '#64748b', borderRadius: 4, fontSize: '0.65rem' }}>+{cats.length - 3}</span>}
                      </div>
                    </td>

                    {/* 기능성 내용 (호버 툴팁 적용) */}
                    <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#475569', maxWidth: 220 }}>
                      <div className={(item.functionalityText && item.functionalityText.length > 25) ? "hover-container" : ""}>
                        <div className="hover-static" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.functionalityText || '-'}
                        </div>
                        {item.functionalityText && item.functionalityText.length > 25 && (
                          <div className="hover-reveal" style={{ fontSize: '0.78rem', whiteSpace: 'normal', width: 280, lineHeight: 1.4 }}>
                            {item.functionalityText}
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(item)} style={{ padding: '4px 10px', background: '#f1f5f9', color: '#0284c7', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                          수정
                        </button>
                        <button onClick={() => openDelete(item)} style={{ padding: '4px 10px', background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
          <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
            총 {total.toLocaleString()}건 중 {((page - 1) * limit + 1)}–{Math.min(page * limit, total)}번
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => fetchData(page - 1)} disabled={page <= 1} style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: page <= 1 ? '#cbd5e1' : '#0f172a', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.78rem' }}>이전</button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const n = Math.max(1, page - 2) + i;
              if (n > pages) return null;
              return (
                <button key={n} onClick={() => fetchData(n)} style={{ padding: '5px 10px', border: '1px solid', borderColor: n === page ? '#0284c7' : '#e2e8f0', borderRadius: 6, background: n === page ? '#0284c7' : '#fff', color: n === page ? '#fff' : '#0f172a', cursor: 'pointer', fontSize: '0.78rem', fontWeight: n === page ? 700 : 400 }}>{n}</button>
              );
            })}
            <button onClick={() => fetchData(page + 1)} disabled={page >= pages} style={{ padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: page >= pages ? '#cbd5e1' : '#0f172a', cursor: page >= pages ? 'not-allowed' : 'pointer', fontSize: '0.78rem' }}>다음</button>
          </div>
        </div>
      </div>

      {/* 모달 오버레이 */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={closeModal}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

            {/* 상세 보기 */}
            {modal === 'view' && selected && (
              <div>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontWeight: 700, fontSize: '1.15rem', color: '#0f172a' }}>{selected.name}</h2>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>인정번호: {selected.recognitionNumber}</span>
                  </div>
                  <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    {[['등록일/연도', selected.registeredDate], ['업체명', selected.company]].map(([k, v]) => (
                      <div key={k}>
                        <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginBottom: 2, textTransform: 'uppercase' }}>{k}</p>
                        <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{v || '-'}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>기능성 카테고리</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {getCategoryTags(selected.categories).map(c => {
                        const sig = SIGNAL_MAP[c];
                        return (
                          <span key={c} style={{ padding: '3px 10px', background: sig ? sig.color + '15' : '#eff6ff', color: sig ? sig.color : '#0284c7', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600 }}>{c}</span>
                        );
                      })}
                    </div>
                  </div>
                  {[['기능성 내용', selected.functionalityText], ['일일섭취량', selected.dailyIntake], ['섭취시 주의사항', selected.precautions]].map(([k, v]) => v ? (
                    <div key={k} style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>{k}</p>
                      <p style={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.7, background: '#f8fafc', padding: '10px 14px', borderRadius: 8, whiteSpace: 'pre-line' }}>
                        {formatFormattedText(v)}
                      </p>
                    </div>
                  ) : null)}

                  {/* 맵핑된 완제품 정보 출력 (declarations) */}
                  <div style={{ marginTop: 20, borderTop: '1px dashed #cbd5e1', paddingTop: 16 }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>해당 원료 함유 완제품 품목제조신고 내역</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>
                        검색 결과: 총 <strong style={{ color: '#0284c7' }}>{relatedTotal}</strong>건
                      </span>
                    </h3>

                    {relatedLoading ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>연관 완제품 품목을 검색 중...</div>
                    ) : relatedProducts.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', background: '#f8fafc', borderRadius: 8 }}>
                        이 원료가 명확하게 포함된 완제품 품목이 검색되지 않았습니다.
                      </div>
                    ) : (
                      <div>
                        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>신고번호</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>품목(제품명)</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>제조업체</th>
                                <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', width: 80 }}>인허가일자</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relatedProducts.map(p => (
                                <tr key={p.prdlstReportNo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#64748b' }}>{p.prdlstReportNo}</td>
                                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                                    <Link href={`/search?integrated=${encodeURIComponent(p.prdlstNm)}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                                      {p.prdlstNm}
                                    </Link>
                                  </td>
                                  <td style={{ padding: '6px 10px', color: '#475569' }}>{p.bsshNm}</td>
                                  <td style={{ padding: '6px 10px', textAlign: 'center', color: '#64748b' }}>{p.prmsDt || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 6, textAlign: 'right' }}>
                          ※ 원료명 단어 매칭 기반 검색 결과로, 실제 함량정보 및 원재료 매핑에 따라 차이가 있을 수 있습니다.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                  <div>
                    {selected.recognitionNumber && (
                      <Link
                        href={`/raw-materials?search=${encodeURIComponent(selected.recognitionNumber)}`}
                        style={{
                          padding: '7px 12px',
                          background: '#f0fdfa',
                          color: '#0d9488',
                          border: '1px solid #99f6e4',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <i className="fa-solid fa-file-pdf" style={{ color: '#ef4444' }} /> 원료별 정보 공시(PDF) 확인
                      </Link>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(selected)} style={{ padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>수정</button>
                    <button onClick={closeModal} style={{ padding: '8px 16px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>닫기</button>
                  </div>
                </div>
              </div>
            )}

            {/* 생성/수정 폼 */}
            {(modal === 'create' || modal === 'edit') && (
              <div>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                    {modal === 'create' ? '개별인정형 원료 등록' : '원료 정보 수정'}
                  </h2>
                  <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>
                <div style={{ padding: '20px 24px' }}>
                  {error && <div style={{ background: '#fff5f5', border: '1px solid #fecaca', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: '0.8rem' }}>{error}</div>}
                  {successMsg && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: '0.8rem' }}>{successMsg}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[['인정번호 *', 'recognitionNumber', '예: 제2024-15호'], ['원료명 *', 'name', '예: OOO 추출물'], ['업체명', 'company', ''], ['등록연도/일자', 'registeredDate', '예: 2024-05-12']].map(([label, key, ph]) => (
                      <div key={key}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>{label}</label>
                        <input value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem', outline: 'none' }} />
                      </div>
                    ))}
                  </div>
                  {[['기능성 내용', 'functionalityText', 3], ['일일섭취량', 'dailyIntake', 2], ['섭취시 주의사항', 'precautions', 2], ['상세내용', 'detailContent', 3]].map(([label, key, rows]) => (
                    <div key={key} style={{ marginTop: 10 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>{label}</label>
                      <textarea value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} rows={rows}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.8rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
                    </div>
                  ))}
                  <p style={{ marginTop: 10, fontSize: '0.72rem', color: '#94a3b8' }}>
                    카테고리는 기능성 내용 텍스트를 기반으로 자동 매핑됩니다.
                  </p>
                </div>
                <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#f8fafc', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                  <button onClick={closeModal} style={{ padding: '8px 16px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.8rem', cursor: 'pointer' }}>취소</button>
                  <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? '저장 중...' : (modal === 'create' ? '등록' : '저장')}
                  </button>
                </div>
              </div>
            )}

            {/* 삭제 확인 */}
            {modal === 'delete' && selected && (
              <div style={{ padding: 28, textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, background: '#fff5f5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <i className="fas fa-trash-alt" style={{ color: '#dc2626', fontSize: '1.2rem' }} />
                </div>
                <h3 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6, fontSize: '1rem' }}>원료 삭제</h3>
                <p style={{ color: '#64748b', marginBottom: 12, lineHeight: 1.5, fontSize: '0.82rem' }}>
                  <strong style={{ color: '#0f172a' }}>{selected.name}</strong> ({selected.recognitionNumber})을<br />삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </p>
                {error && <p style={{ color: '#dc2626', fontSize: '0.78rem', marginBottom: 10 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  <button onClick={closeModal} style={{ padding: '8px 20px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>취소</button>
                  <button onClick={handleDelete} disabled={saving} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                    {saving ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 📌 변경 이력 확인 팝업 모달 */}
      {showHistoryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 960, maxHeight: "88vh", borderRadius: 16, boxShadow: "0 20px 40px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fa-solid fa-clock-rotate-left" style={{ color: "#0284c7" }} />
                  개별인정형 원료 변경 이력 모니터링
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#64748b" }}>식약처 공시 크롤링 동기화 시 감지된 원료의 항목별(섭취량, 주의사항, 업체명 등) 변경 이력</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", cursor: "pointer", color: "#64748b" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {historyLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem", color: "#0284c7" }} />
                  <p style={{ marginTop: 10 }}>변경 이력 불러오는 중...</p>
                </div>
              ) : historyLogs.length === 0 ? (
                <div style={{ padding: 50, textAlign: "center", color: "#94a3b8" }}>
                  <i className="fa-solid fa-clipboard-check" style={{ fontSize: "2.5rem", marginBottom: 12, color: "#cbd5e1" }} />
                  <p style={{ fontSize: "0.92rem", fontWeight: 600 }}>아직 기록된 변경 이력이 없습니다.</p>
                  <p style={{ fontSize: "0.82rem", color: "#94a3b8" }}>최신 공시 동기화 실행 시 변경사항이 자동으로 감지되어 기록됩니다.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {historyLogs.map((log) => {
                    const isCreated = log.type && log.type.includes("CREATED");
                    const name = log.details?.name || log.prdlstReportNo;
                    const recogNo = log.details?.recogNo || log.prdlstReportNo;

                    return (
                      <div key={log.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{
                              background: isCreated ? "#dcfce7" : "#dbeafe",
                              color: isCreated ? "#15803d" : "#1d4ed8",
                              padding: "3px 10px", borderRadius: 6, fontSize: "0.74rem", fontWeight: 800,
                              whiteSpace: "nowrap", flexShrink: 0
                            }}>
                              {isCreated ? "신규 등록" : "항목 변경"}
                            </span>
                            <strong style={{ fontSize: "0.95rem", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {name}
                            </strong>
                            <span style={{ fontSize: "0.8rem", color: "#0d9488", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                              [{recogNo}]
                            </span>
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {new Date(log.loggedAt).toLocaleString("ko-KR")}
                          </span>
                        </div>

                        {/* 신규 등록 요약 */}
                        {isCreated && log.details && (
                          <div style={{ fontSize: "0.82rem", color: "#334155", background: "#fff", padding: "10px 14px", borderRadius: 8, border: "1px solid #f1f5f9", display: "flex", flexWrap: "wrap", gap: 16 }}>
                            {log.details.company && <div><strong>업체명:</strong> {log.details.company}</div>}
                            {log.details.registeredDate && <div><strong>등록일자:</strong> {log.details.registeredDate}</div>}
                            {log.details.functionalityText && (
                              <div style={{ width: "100%", color: "#475569", lineHeight: 1.5 }}>
                                <strong>기능성:</strong> {log.details.functionalityText}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 항목 변경 내용 */}
                        {!isCreated && log.details?.changedFields && (
                          <div style={{ fontSize: "0.82rem", color: "#334155", marginTop: 8, background: "#fff", padding: "12px 14px", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                              <span style={{ fontWeight: 700, color: "#d97706" }}>변경 항목:</span>
                              {log.details.changedFields.map(f => (
                                <span key={f} style={{ background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: "0.74rem" }}>
                                  {f}
                                </span>
                              ))}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <div style={{ background: "#fef2f2", padding: "8px 12px", borderRadius: 6, border: "1px solid #fee2e2" }}>
                                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#ef4444", display: "block", marginBottom: 4 }}>[변경 전]</span>
                                {typeof log.details.before === "object" && log.details.before !== null ? (
                                  Object.entries(log.details.before).map(([k, v]) => (
                                    <div key={k} style={{ fontSize: "0.8rem", color: "#7f1d1d", marginBottom: 2 }}>
                                      <strong>{k}:</strong> {String(v || '-')}
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ fontSize: "0.8rem", color: "#7f1d1d" }}>{String(log.details.before)}</div>
                                )}
                              </div>
                              <div style={{ background: "#f0fdf4", padding: "8px 12px", borderRadius: 6, border: "1px solid #dcfce7" }}>
                                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#16a34a", display: "block", marginBottom: 4 }}>[변경 후]</span>
                                {typeof log.details.after === "object" && log.details.after !== null ? (
                                  Object.entries(log.details.after).map(([k, v]) => (
                                    <div key={k} style={{ fontSize: "0.8rem", color: "#14532d", marginBottom: 2 }}>
                                      <strong>{k}:</strong> {String(v || '-')}
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ fontSize: "0.8rem", color: "#14532d" }}>{String(log.details.after)}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "right" }}>
              <button onClick={() => setShowHistoryModal(false)} style={{ padding: "8px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer" }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
