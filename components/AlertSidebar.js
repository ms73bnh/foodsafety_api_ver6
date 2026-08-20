'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './AlertSidebar.css';
import AlertDetailModal from './AlertDetailModal';

export default function AlertSidebar() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('recalls');
  const [data, setData] = useState({ recalls: [], inspections: [], adminActions: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // 상세보기 모달 상태
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/alerts');
      const json = await res.json();
      if (json.success) {
        setData({
          recalls: json.recalls?.rows || [],
          inspections: json.inspections?.rows || [],
          adminActions: json.admin_actions?.rows || []
        });
        setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      } else {
        setError(json.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAlerts = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/alerts', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        alert(json.message);
        await fetchAlerts();
      } else {
        alert(`동기화 실패: ${json.error}`);
      }
    } catch (err) {
      alert(`요청 오류: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleSidebar = () => setIsOpen(!isOpen);

  const openDetail = (alert) => {
    setSelectedAlert(alert);
    setIsModalOpen(true);
  };

  const renderSeeMore = (type) => (
    <div className="see-more-container">
      <Link href={`/alerts/${type}`} className="see-more-link">
        전체보기 <i className="fa-solid fa-circle-plus" style={{ marginLeft: '4px' }}></i>
      </Link>
    </div>
  );

  return (
    <>
      <button 
        className="floating-btn" 
        onClick={toggleSidebar}
        aria-label="식품안전 실시간 알림"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        <span>실시간 알림</span>
      </button>

      <div 
        className={`sidebar-overlay ${isOpen ? 'open' : ''}`} 
        onClick={toggleSidebar}
      ></div>

      <div className={`sidebar-panel ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div>
            <h2>식품안전 리포트</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              {lastUpdated && <div className="last-updated">최근 업데이트: {lastUpdated}</div>}
              <button 
                onClick={handleSyncAlerts} 
                className={`sidebar-sync-btn ${syncing ? 'loading' : ''}`}
                title="데이터 실시간 동기화"
              >
                <i className={`fa-solid fa-rotate ${syncing ? 'fa-spin' : ''}`}></i>
              </button>
            </div>
          </div>
          <button className="close-btn" onClick={toggleSidebar}>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="sidebar-tabs">
          <button 
            className={`tab-btn ${activeTab === 'recalls' ? 'active' : ''}`}
            onClick={() => setActiveTab('recalls')}
          >
            회수·판매중지
          </button>
          <button 
            className={`tab-btn ${activeTab === 'inspections' ? 'active' : ''}`}
            onClick={() => setActiveTab('inspections')}
          >
            검사부적합
          </button>
          <button 
            className={`tab-btn ${activeTab === 'adminActions' ? 'active' : ''}`}
            onClick={() => setActiveTab('adminActions')}
          >
            행정처분
          </button>
        </div>

        <div className="sidebar-content">
          {loading ? (
            Array(3).fill(0).map((_, i) => <div key={i} className="skeleton-card"></div>)
          ) : error ? (
             <div className="error-message">
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '8px' }}></i>
                {error}
             </div>
          ) : (
            activeTab === 'recalls' ? (
              <>
                {renderSeeMore('RECALL')}
                {data.recalls.length > 0 ? (
                  data.recalls.map((item, idx) => (
                    <div key={idx} className="sidebar-list-item" onClick={() => openDetail(item)}>
                      <div className="list-item-header">
                        <span className="summary-badge bg-recall">회수/판매중지</span>
                        <span className="list-item-date">{item._standard.date || item.regDate || '-'}</span>
                      </div>
                      <div className="list-item-title">{item._standard.title || item.prdtNm || item.PRDTNM || '제품명 미표시'}</div>
                      <div className="list-item-subtitle">{item._standard.subTitle || item.bsshNm || item.BSSHNM || '제조사 미상'}</div>
                      <div className="list-item-desc">{item._standard.desc || item.reason || item.RTRVLPRVNS || '상세내용 참고'}</div>
                    </div>
                  ))
                ) : (
                  <div className="no-data">최근 관련 알림이 없습니다.</div>
                )}
              </>
            ) : activeTab === 'inspections' ? (
              <>
                {renderSeeMore('INSPECTION')}
                {data.inspections.length > 0 ? (
                  data.inspections.map((item, idx) => (
                    <div key={idx} className="sidebar-list-item" onClick={() => openDetail(item)}>
                      <div className="list-item-header">
                        <span className="summary-badge bg-insp">검사부적합</span>
                        <span className="list-item-date">{item._standard.date || item.regDate || '-'}</span>
                      </div>
                      <div className="list-item-title">{item._standard.title || item.prdtNm || item.PRDTNM || '제품명 미표시'}</div>
                      <div className="list-item-subtitle">{item._standard.subTitle || item.bsshNm || item.BSSHNM || '제조사 미상'}</div>
                      <div className="list-item-desc">{item._standard.desc || item.reason || item.TEST_ITMNM || '상세내용 참고'}</div>
                    </div>
                  ))
                ) : (
                  <div className="no-data">최근 부적합 알림이 없습니다.</div>
                )}
              </>
            ) : (
              <>
                {renderSeeMore('ADMIN_ACTION')}
                {data.adminActions.length > 0 ? (
                  data.adminActions.map((item, idx) => (
                    <div key={idx} className="sidebar-list-item" onClick={() => openDetail(item)}>
                      <div className="list-item-header">
                        <span className="summary-badge bg-admin">행정처분</span>
                        <span className="list-item-date">{item._standard.date || item.regDate || '-'}</span>
                      </div>
                      <div className="list-item-title">{item._standard.title || item.prdtNm || item.PRCSCITYPOINT_BSSHNM || '업소명 미비'}</div>
                      <div className="list-item-subtitle">{item._standard.subTitle || item.bsshNm || item.DSPS_TYPECD_NM || '처분내용 미상'}</div>
                      <div className="list-item-desc">{item._standard.desc || item.reason || item.VILTCN || item.DSPSCN || '상세내용 미비'}</div>
                    </div>
                  ))
                ) : (
                  <div className="no-data">최근 행정처분 알림이 없습니다.</div>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/*Alert Detail Modal */}
      <AlertDetailModal 
        isOpen={isModalOpen}
        alert={selectedAlert}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
