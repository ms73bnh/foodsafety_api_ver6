'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AlertDetailModal from '@/components/AlertDetailModal';

const TYPE_MAP = {
  'RECALL': { title: '회수·판매중지', color: '#ef4444', icon: 'fa-box-open', badge: '회수/판매중지' },
  'INSPECTION': { title: '검사부적합', color: '#f59e0b', icon: 'fa-flask-vial', badge: '검사부적합' },
  'ADMIN_ACTION': { title: '행정처분', color: '#0284c7', icon: 'fa-gavel', badge: '행정처분' }
};

export default function AlertHistoryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const type = params.type;
  const page = parseInt(searchParams.get('page') || '1');
  const typeInfo = TYPE_MAP[type] || { title: '식품안전 리포트', color: 'var(--accent)', icon: 'fa-bell', badge: '알림' };

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);

  // 상세보기 모달 상태
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 신규: 정렬 상태 추가

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('type', type);
      queryParams.append('page', page);
      queryParams.append('sort', sortOrder);
      const res = await fetch(`/api/alerts?${queryParams.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.rows);
        setTotal(json.total);
        setLimit(json.limit);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [type, page, sortOrder]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handlePageChange = (newPage) => {
    router.push(`/alerts/${type}?page=${newPage}`);
  };

  const openDetail = (alert) => {
    setSelectedAlert(alert);
    setIsModalOpen(true);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="container animate-fade-in" style={{ padding: '40px 20px' }}>
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link href="/" className="btn" style={{ padding: '8px 12px', background: '#f1f5f9' }}>
          <i className="fa-solid fa-arrow-left"></i> 돌아가기
        </Link>
        <h1 className="title-gradient" style={{ margin: 0, fontSize: '2.2rem' }}>
          <i className={`fa-solid ${typeInfo.icon}`} style={{ marginRight: '15px', color: typeInfo.color }}></i>
          {typeInfo.title} 전체 내역
        </h1>
      </div>

      <div className="glass-panel" style={{ padding: '32px' }}>
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-muted)', marginRight: '12px' }}>
              총 <strong style={{ color: typeInfo.color, fontSize: '1.2rem' }}>{total.toLocaleString()}</strong>건의 데이터가 있습니다.
            </div>
            <select 
              value={sortOrder} 
              onChange={(e) => { setSortOrder(e.target.value); handlePageChange(1); }}
              className="btn"
              style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '6px 12px', fontSize: '0.85rem' }}
            >
              <option value="desc">최신 등록순</option>
              <option value="asc">과거 등록순</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '100px', textAlign: 'center' }}>
            <i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: typeInfo.color }}></i>
            <p style={{ marginTop: '20px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '40px', background: 'white' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '16px', fontWeight: 700, color: '#475569', width: '8%', textAlign: 'center' }}>번호</th>
                    <th style={{ padding: '16px', fontWeight: 700, color: '#475569', width: '12%' }}>분류</th>
                    <th style={{ padding: '16px', fontWeight: 700, color: '#475569', width: '30%' }}>{type === 'ADMIN_ACTION' ? '업소명 (처분)' : '제품명 (업체명)'}</th>
                    <th style={{ padding: '16px', fontWeight: 700, color: '#475569', width: '35%' }}>관련 내용 / 사유</th>
                    <th style={{ padding: '16px', fontWeight: 700, color: '#475569', width: '15%' }}>발생·등록일</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, idx) => {
                    const rowNumber = total - ((page - 1) * limit + idx);
                    return (
                      <tr 
                        key={idx} 
                        onClick={() => openDetail(item)}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '16px', color: '#64748b', textAlign: 'center' }}>{rowNumber}</td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ backgroundColor: typeInfo.color + '1A', color: typeInfo.color, padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, border: `1px solid ${typeInfo.color}33` }}>
                            {typeInfo.badge}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 800, color: '#1e293b', marginBottom: '4px', fontSize: '0.95rem' }}>
                            {item._standard.title || item.prdtNm || item.PRDTNM || item.PRCSCITYPOINT_BSSHNM || '제목 미표시'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                            {item._standard.subTitle || item.bsshNm || item.BSSHNM || item.DSPS_TYPECD_NM}
                          </div>
                        </td>
                        <td style={{ padding: '16px', color: '#475569', fontSize: '0.9rem', lineHeight: '1.4' }}>
                          {item._standard.desc || item.reason || item.RTRVLPRVNS || item.TEST_ITMNM || item.VILTCN || item.DSPSCN || '-'}
                        </td>
                        <td style={{ padding: '16px', color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>
                          {item._standard.date || item.regDate || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  className="btn" 
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                  style={{ opacity: page === 1 ? 0.5 : 1 }}
                >
                  이전
                </button>
                {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
                   let p = i + 1;
                   if (totalPages > 10 && page > 6) {
                      p = page - 5 + i;
                      if (p > totalPages) p = totalPages - (9 - i);
                   }
                   if (p <= 0) return null;
                   if (p > totalPages) return null;

                   return (
                    <button 
                      key={p}
                      className="btn"
                      onClick={() => handlePageChange(p)}
                      style={{ 
                        minWidth: '40px', 
                        background: page === p ? typeInfo.color : '#f1f5f9', 
                        color: page === p ? '#fff' : '#475569',
                        boxShadow: page === p ? `0 4px 12px ${typeInfo.color}44` : 'none'
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
                <button 
                  className="btn" 
                  disabled={page === totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  style={{ opacity: page === totalPages ? 0.5 : 1 }}
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <AlertDetailModal 
        isOpen={isModalOpen}
        alert={selectedAlert}
        onClose={() => setIsModalOpen(false)}
      />
    </main>
  );
}
