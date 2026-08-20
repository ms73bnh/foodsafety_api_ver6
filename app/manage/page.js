"use client";

import { useState, useEffect, Suspense } from 'react';
import RichTextEditor from '@/components/RichTextEditor';
import { useRouter, useSearchParams } from 'next/navigation';

function ManagePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // ?�증 �?권한 가삭제  
  const [currentUser, setCurrentUser] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  // 기존 ?�태
  const [logs, setLogs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(null);

  // Banner State
  const [banners, setBanners] = useState([]);
  const [bTitle, setBTitle] = useState('');
  const [bImageUrl, setBImageUrl] = useState('');
  const [bLinkUrl, setBLinkUrl] = useState('');

  // Tabs & Raw Data State
  const [activeTab, setActiveTab] = useState(() => {
    // SSR 안전: 초기값은 'sync', useEffect에서 쿼리 반영
    return 'sync';
  }); // sync, raw, rawgeneral, banner, users, audit, notices
  const [rawSubTab, setRawSubTab] = useState('declarations'); // declarations, production
  const [rawData, setRawData] = useState([]);
  const [rawTotal, setRawTotal] = useState(0);
  const [rawPage, setRawPage] = useState(1);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawSearchQuery, setRawSearchQuery] = useState('');

  // 일반식품 RAW 데이터 상태
  const [rawGeneralData, setRawGeneralData] = useState([]);
  const [rawGeneralTotal, setRawGeneralTotal] = useState(0);
  const [rawGeneralPage, setRawGeneralPage] = useState(1);
  const [rawGeneralLoading, setRawGeneralLoading] = useState(false);
  const [rawGeneralSearchQuery, setRawGeneralSearchQuery] = useState('');

  // ?�규 ?�태: ?�용삭제관�?  
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // ?�용삭제?�정 모달 ?�태
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  // 공지사항 관리 상태
  const [notices, setNotices] = useState([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', isActive: true, startAt: '', endAt: '' });
  const [editingNotice, setEditingNotice] = useState(null);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [showNoticeForm, setShowNoticeForm] = useState(false);

  // ?�규 ?�태: ?�업 ?�력 로그 (Audit Logs)
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  // 관리자 권한 ?�인
  useEffect(() => {
    const verifyAdmin = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.success || !data.user) {
          router.push('/login');
        } else if (data.user.role !== 'ADMIN') {
          alert('관리자만 접근할 수 있는 페이지입니다.');
          router.push('/');
        } else {
          setCurrentUser(data.user);
          setPageLoading(false);
        }
      } catch (err) {
        console.error(err);
        router.push('/login');
      }
    };
    verifyAdmin();
  }, [router]);

  // URL ?tab=users 등으로 직접 탭 진입 처리
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  // 기존 API ?�치 ?�수삭제
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBanners = async () => {
    try {
      const res = await fetch('/api/banners');
      const data = await res.json();
      if (data.success) setBanners(data.data);
    } catch(e) { /* ignore */ }
  };

  const fetchRawData = async () => {
    setRawLoading(true);
    try {
      const endpoint = rawSubTab === 'declarations' ? '/api/data' : '/api/production/raw';
      const res = await fetch(`${endpoint}?page=${rawPage}&limit=20&query=${rawSearchQuery}`);
      const result = await res.json();
      if (result.success) {
        setRawData(result.data);
        setRawTotal(result.total);
      }
    } catch (e) { console.error(e); }
    setRawLoading(false);
  };

  const fetchRawGeneralData = async () => {
    setRawGeneralLoading(true);
    try {
      const res = await fetch(`/api/data-general?page=${rawGeneralPage}&limit=20&integrated=${rawGeneralSearchQuery}`);
      const result = await res.json();
      if (result.success) {
        setRawGeneralData(result.data);
        setRawGeneralTotal(result.total);
      }
    } catch (e) { console.error(e); }
    setRawGeneralLoading(false);
  };

  // ?�규 API ?�치 ?�수: ?�용삭제?�보 조회
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
    setUsersLoading(false);
  };

  // 공지사항 조회
  const fetchNotices = async () => {
    setNoticesLoading(true);
    try {
      const res = await fetch('/api/notices');
      const data = await res.json();
      if (data.success) setNotices(data.data);
    } catch (e) { console.error(e); }
    setNoticesLoading(false);
  };

  const handleSaveNotice = async () => {
    if (!noticeForm.title || !noticeForm.content) return alert('제목과 내용은 필수입니다.');
    setNoticeSaving(true);
    try {
      const url = editingNotice ? `/api/notices/${editingNotice.id}` : '/api/notices';
      const method = editingNotice ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noticeForm),
      });
      const data = await res.json();
      if (data.success) {
        setNoticeForm({ title: '', content: '', isActive: true, startAt: '', endAt: '' });
        setEditingNotice(null);
        setShowNoticeForm(false);
        fetchNotices();
      } else {
        console.error('[NOTICE SAVE ERROR]', data);
        alert('저장 오류: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (e) {
      console.error('[NOTICE SAVE CATCH]', e);
      alert('오류: ' + e.message);
    }
    setNoticeSaving(false);
  };

  const handleToggleNotice = async (id, isActive) => {
    await fetch(`/api/notices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    fetchNotices();
  };

  const handleDeleteNotice = async (id) => {
    if (!confirm('이 공지사항을 삭제하시겠습니까?')) return;
    await fetch(`/api/notices/${id}`, { method: 'DELETE' });
    fetchNotices();
  };

  const handleEditNotice = (n) => {
    setNoticeForm({
      title: n.title,
      content: n.content,
      isActive: n.isActive,
      startAt: n.startAt ? n.startAt.slice(0, 16) : '',
      endAt: n.endAt ? n.endAt.slice(0, 16) : '',
    });
    setEditingNotice(n);
    setShowNoticeForm(true);
  };

  // ?�규 API ?�치 ?�수: ?�업 ?�력 로그 조회
  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/audit-logs?page=${auditPage}&limit=20&query=${auditSearchQuery}&action=${auditActionFilter}`);
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data);
        setAuditTotal(data.total);
      }
    } catch (e) {
      console.error(e);
    }
    setAuditLoading(false);
  };

  // 삭제변�삭제삭제�절삭제API ?�출
  useEffect(() => {
    if (pageLoading) return;
    if (activeTab === 'sync') {
      fetchLogs();
    } else if (activeTab === 'banner') {
      fetchBanners();
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'notices') {
      fetchNotices();
    }
  }, [activeTab, pageLoading, auditPage, auditActionFilter]);

  // RAW ?�이삭제변�?감시
  useEffect(() => {
    if (pageLoading) return;
    if (activeTab === 'raw') fetchRawData();
  }, [activeTab, rawPage, rawSubTab, pageLoading]);

  // ?�반?�품 RAW ?�이삭제변�?감시
  useEffect(() => {
    if (pageLoading) return;
    if (activeTab === 'rawgeneral') fetchRawGeneralData();
  }, [activeTab, rawGeneralPage, pageLoading]);

  // 검삭제?�어
  const handleRawSearch = (e) => {
    if (e.key === 'Enter') {
      setRawPage(1);
      fetchRawData();
    }
  };

  const handleRawGeneralSearch = (e) => {
    if (e.key === 'Enter') {
      setRawGeneralPage(1);
      fetchRawGeneralData();
    }
  };

  const handleAuditSearch = (e) => {
    if (e.key === 'Enter') {
      setAuditPage(1);
      fetchAuditLogs();
    }
  };

  // ?�용삭제권한 ?�션 ?�어 (?�인/?�인취소, 권한변�? 삭제��)
  const handleApproveUser = async (id, currentApproved) => {
    const actionText = currentApproved ? '승인 취소' : '가입을 승인';
    if (!confirm(`해당 사용자의 ${actionText}하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: !currentApproved })
      });
      const data = await res.json();
      if (data.success) {
        alert(currentApproved ? '승인이 취소되었습니다.' : '가입이 승인되었습니다.');
        fetchUsers();
        window.dispatchEvent(new CustomEvent('pending-approval-changed'));
      } else {
        alert(data.error || '처리 중 오류가 발생했습니다.');
      }
    } catch (err) {
      alert('오류가 발생했습니다: ' + err.message);
    }
  };

  // ?�용삭제?�보 ?�정 모달 ?�기
  const handleOpenEdit = (u) => {
    setEditForm({
      name: u.name || '',
      companyNm: u.companyNm || '',
      deptNm: u.deptNm || '',
      positionNm: u.positionNm || '',
      titleNm: u.titleNm || '',
      role: u.role,
      isApproved: u.isApproved,
      newPassword: ''
    });
    setShowPasswordReset(false);
    setEditingUser(u);
  };

  // ?�용삭제?�보 ?�삭제  
  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    try {
      const body = {
        name: editForm.name,
        companyNm: editForm.companyNm,
        deptNm: editForm.deptNm,
        positionNm: editForm.positionNm,
        titleNm: editForm.titleNm,
        role: editForm.role,
        isApproved: editForm.isApproved
      };
      if (showPasswordReset && editForm.newPassword) {
        if (editForm.newPassword.length < 4) {
          alert('비밀번호는 최소 4자 이상이어야 합니다.');
          setEditSaving(false);
          return;
        }
        body.password = editForm.newPassword;
      }
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        alert('사용자 정보가 수정되었습니다.');
        setEditingUser(null);
        fetchUsers();
      } else {
        alert(data.error || '사용자 정보 수정 중 오류가 발생했습니다.');
      }
    } catch (err) {
      alert('오류: ' + err.message);
    }
    setEditSaving(false);
  };

  const handleChangeRole = async (id, currentRole) => {
    const targetRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    if (!confirm(`권한을 ${targetRole}(으)로 변경하겠습니까?`)) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole })
      });
      const data = await res.json();
      if (data.success) {
        alert('권한 변경이 완료되었습니다.');
        fetchUsers();
      } else {
        alert(data.error || '권한 변경 중 오류가 발생했습니다.');
      }
    } catch (err) {
      alert('오류가 발생했습니다: ' + err.message);
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (!confirm(`정말로 사용자 [${username}] 계정을 완전히 삭제(탈퇴) 처리하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        alert('사용자가 정상적으로 삭제되었습니다.');
        fetchUsers();
      } else {
        alert(data.error || '사용자 삭제 중 오류가 발생했습니다.');
      }
    } catch (err) {
      alert('오류가 발생했습니다: ' + err.message);
    }
  };

  // 배너 관삭제?�션
  const handleAddBanner = async (e) => {
    e.preventDefault();
    if (!bTitle) return alert('배너 제목은 필수입니다.');
    try {
      const res = await fetch('/api/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: bTitle, imageUrl: bImageUrl, linkUrl: bLinkUrl })
      });
      const data = await res.json();
      if (data.success) {
        setBTitle(''); setBImageUrl(''); setBLinkUrl('');
        fetchBanners();
      } else {
        alert(data.error || '배너 등록 중 오류가 발생했습니다.');
      }
    } catch (err) {
      alert('오류가 발생했습니다: ' + err.message);
    }
  };

  const toggleBanner = async (id, isActive) => {
    await fetch(`/api/banners/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive })
    });
    fetchBanners();
  };

  const deleteBanner = async (id) => {
    if(!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/banners/${id}`, { method: 'DELETE' });
    fetchBanners();
  };

  // ?�동 ?�기삭제?�행
  const handleManualSync = async () => {
    if (!confirm('수만 건의 데이터를 동기화합니다. 완료될 때까지 페이지를 닫지 마세요. 진행하시겠습니까?')) return;
    
    setSyncing(true);
    setProgress({ startIdx: 1, added: 0, updated: 0 });
    
    let currentIdx = 1;
    const limit = 1000; 
    let totalAdded = 0;
    let totalUpdated = 0;
    let keepGoing = true;

    try {
      while(keepGoing) {
         console.log(`[CLIENT DEBUG] Syncing from: ${currentIdx}, Limit: ${limit}`);
         setProgress({ startIdx: currentIdx, added: totalAdded, updated: totalUpdated });

         const res = await fetch('/api/sync', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ startIdx: currentIdx, limit })
          });
          const data = await res.json();

          if (data.success) {
             totalAdded += data.addedCount;
             totalUpdated += data.updatedCount;

             if (!data.fetchedRows || data.fetchedRows === 0) {
                keepGoing = false;
                alert('동기화가 완료되었습니다. 추가: ' + totalAdded + '건, 업데이트: ' + totalUpdated + '건');
             } else {
                currentIdx += limit;
             }
          } else {
             keepGoing = false;
             alert('동기화 처리 오류가 발생했습니다.');
          }
      }
    } catch (e) {
      alert('동기화 처리 오류가 발생했습니다.');
    }
    
    setProgress(null);
    setSyncing(false);
    fetchLogs();
  };

  const handleRawExport = () => {
    const type = rawSubTab === 'declarations' ? 'declaration' : 'production';
    window.location.href = `/api/export-raw?type=${type}&q=${rawSearchQuery}`;
  };

  const totalGeneralPages = Math.ceil(rawGeneralTotal / 20);

  const handleRawGeneralExport = () => {
    window.location.href = `/api/export-general?format=xlsx&integrated=${rawGeneralSearchQuery}`;
  };

  // ?�이�?번호 계산 (Raw Data삭제
  const totalPages = Math.ceil(rawTotal / 20);
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, rawPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  // ?�이�?번호 계산 (Audit Logs삭제
  const totalAuditPages = Math.ceil(auditTotal / 20);
  const getAuditPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, auditPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalAuditPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  if (pageLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
        <i className="fa-solid fa-spinner fa-spin fa-2xl" style={{ color: 'var(--accent)' }}></i>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>권한을 확인하는 중입니다...</p>
      </div>
    );
  }

  return (
    <main className="container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
         <div>
            <h1 className="title-gradient"><i className="fa-solid fa-gears" style={{marginRight: '12px'}}></i>시스템 관리 센터</h1>
            <p style={{ color: 'var(--text-muted)' }}>데이터 동기화, 원본 데이터 분석 및 외부 배너 설정을 관리합니다.</p>
         </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', flexWrap: 'wrap' }}>
         <button onClick={() => { setActiveTab('sync'); }} className={`btn ${activeTab === 'sync' ? 'sync-btn' : ''}`} style={{ background: activeTab === 'sync' ? '' : 'transparent', border: 'none', color: activeTab === 'sync' ? '#fff' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            <i className="fa-solid fa-tower-broadcast" style={{marginRight: '8px'}}></i> 동기화 및 로그
         </button>
         <button onClick={() => { setActiveTab('raw'); }} className={`btn ${activeTab === 'raw' ? 'sync-btn' : ''}`} style={{ background: activeTab === 'raw' ? '' : 'transparent', border: 'none', color: activeTab === 'raw' ? '#fff' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            <i className="fa-solid fa-list-check" style={{marginRight: '8px'}}></i> Raw 데이터 보기
         </button>
         <button onClick={() => { setActiveTab('rawgeneral'); setRawGeneralPage(1); }} className={`btn ${activeTab === 'rawgeneral' ? 'sync-btn' : ''}`} style={{ background: activeTab === 'rawgeneral' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent', border: 'none', color: activeTab === 'rawgeneral' ? '#fff' : '#6366f1', fontSize: '0.9rem', fontWeight: 600 }}>
            <i className="fa-solid fa-wheat-awn" style={{marginRight: '8px'}}></i> 품목제조보고 RAW
         </button>
         <button onClick={() => { setActiveTab('banner'); }} className={`btn ${activeTab === 'banner' ? 'sync-btn' : ''}`} style={{ background: activeTab === 'banner' ? '' : 'transparent', border: 'none', color: activeTab === 'banner' ? '#fff' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            <i className="fa-solid fa-rectangle-ad" style={{marginRight: '8px'}}></i> 배너 관리         </button>
         <button onClick={() => { setActiveTab('users'); }} className={`btn ${activeTab === 'users' ? 'sync-btn' : ''}`} style={{ background: activeTab === 'users' ? '' : 'transparent', border: 'none', color: activeTab === 'users' ? '#fff' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            <i className="fa-solid fa-users-gear" style={{marginRight: '8px'}}></i> 사용자 승인 및 권한
         </button>
         <button onClick={() => { setActiveTab('audit'); }} className={`btn ${activeTab === 'audit' ? 'sync-btn' : ''}`} style={{ background: activeTab === 'audit' ? '' : 'transparent', border: 'none', color: activeTab === 'audit' ? '#fff' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            <i className="fa-solid fa-clipboard-list" style={{marginRight: '8px'}}></i> 작업 이력 로그
         </button>
         <button onClick={() => { setActiveTab('notices'); setShowNoticeForm(false); setEditingNotice(null); }} className={`btn ${activeTab === 'notices' ? 'sync-btn' : ''}`} style={{ background: activeTab === 'notices' ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'transparent', border: 'none', color: activeTab === 'notices' ? '#fff' : '#f59e0b', fontSize: '0.9rem', fontWeight: 600 }}>
            <i className="fa-solid fa-bullhorn" style={{marginRight: '8px'}}></i> 팝업 공지 관리
         </button>
      </div>

      {/* 1. Sync & Logs Tab */}
      {activeTab === 'sync' && (
         <div className="animate-fade-in">
            <div className="glass-panel" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
               <div>
                  <h3 style={{ color: 'var(--text-color)' }}>수동 전체 동기화 실행</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>식품안전나라 API에서 데이터를 1,000건씩 순차적으로 가져와 DB를 갱신합니다.</p>
                  {progress && (
                     <div style={{ marginTop: '12px', padding: '12px 16px', background: 'var(--surface-highlight)', borderRadius: '8px', fontSize: '0.9rem', border: '1px solid var(--accent)', color: 'var(--primary)' }}>
                        <i className="fa-solid fa-spinner fa-spin" style={{marginRight: '8px'}}></i>
                        진행 현황: <strong>{progress.startIdx.toLocaleString()}</strong>번부터 1000개 가져오는 중... (현재 누적 추가: {progress.added.toLocaleString()}건, 업데이트: {progress.updated.toLocaleString()}건)
                     </div>
                  )}
               </div>
               <button 
                  className="btn btn-primary" 
                  onClick={handleManualSync}
                  disabled={syncing}
                  style={{ background: 'var(--accent-gradient)', color: '#fff', border: 'none', fontWeight: 700, padding: '12px 28px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.3)', transition: 'all 0.3s ease' }}
               >
                  {syncing ? <><i className="fa-solid fa-spinner fa-spin" style={{marginRight: '8px'}}></i> 동기화 진행 중..</> : <><i className="fa-solid fa-tower-broadcast" style={{marginRight: '8px'}}></i> 식품안전나라 전체 데이터 동기화 시작</>}
               </button>
            </div>

            <div className="glass-panel">
               <h3 style={{ color: 'var(--text-color)', marginBottom: '16px' }}><i className="fa-solid fa-clock-rotate-left" style={{marginRight: '8px', color: 'var(--accent)'}}></i>최근 동기화 로그 (최대 20건)</h3>
               <div className="table-container">
                  <table>
                     <thead>
                        <tr>
                           <th>시간</th>
                           <th>상태</th>
                           <th>신규 추가</th>
                           <th>업데이트</th>
                           <th>오류 메시지</th>
                        </tr>
                     </thead>
                     <tbody>
                        {logs.map(log => (
                           <tr key={log.id} className="table-row">
                              <td style={{ color: 'var(--text-muted)' }}>{new Date(log.executedAt).toLocaleString()}</td>
                              <td>
                                 <span className={`status-badge ${log.status === 'SUCCESS' ? 'status-success' : 'status-error'}`}>
                                    {log.status === 'SUCCESS' ? <i className="fa-solid fa-check-circle"></i> : <i className="fa-solid fa-circle-xmark"></i>} {log.status}
                                 </span>
                              </td>
                              <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{log.addedCount}건</td>
                              <td style={{ color: 'var(--accent-secondary)', fontWeight: 700 }}>{log.updatedCount}건</td>
                              <td style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{log.errorMessage || '-'}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}

      {/* 2. Raw Data View Tab */}
      {activeTab === 'raw' && (
         <div className="animate-fade-in">
            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
               <div>
                  <h3 style={{ color: 'var(--text-color)' }}><i className="fa-solid fa-database" style={{marginRight: '8px', color: 'var(--accent)'}}></i>데이터베이스 전수 조사</h3>
                  <p style={{ color: 'var(--text-muted)' }}>DB에 저장된 원본 항목들을 확인합니다.</p>
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                     <button onClick={() => { setRawSubTab('declarations'); setRawPage(1); }} className={`btn ${rawSubTab === 'declarations' ? 'sync-btn' : ''}`} style={{ padding: '6px 16px', fontSize: '0.8rem', background: rawSubTab === 'declarations' ? '' : '#f1f5f9', color: rawSubTab === 'declarations' ? '#fff' : '#64748b' }}>품목제조신고 (I0490)</button>
                     <button onClick={() => { setRawSubTab('production'); setRawPage(1); }} className={`btn ${rawSubTab === 'production' ? 'sync-btn' : ''}`} style={{ padding: '6px 16px', fontSize: '0.8rem', background: rawSubTab === 'production' ? '' : '#f1f5f9', color: rawSubTab === 'production' ? '#fff' : '#64748b' }}>생산실적보고 (I0310)</button>
                  </div>
               </div>
               <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                     <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                     <input 
                       type="text" 
                       placeholder="업체/품목 검색 (Enter)"
                       value={rawSearchQuery}
                       onChange={e => setRawSearchQuery(e.target.value)}
                       onKeyDown={handleRawSearch}
                       style={{ padding: '8px 12px 8px 32px', fontSize: '0.85rem', width: '200px' }}
                     />
                  </div>
                  <button onClick={handleRawExport} className="btn sync-btn"><i className="fa-solid fa-file-excel" style={{marginRight: '8px'}}></i> Excel 다운로드</button>
               </div>
            </div>

            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
               <div className="table-container" style={{ height: '700px', overflow: 'auto', position: 'relative' }}>
                  {rawSubTab === 'declarations' ? (
                     <table style={{ minWidth: '8000px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                           <tr style={{ background: '#f8fafc' }}>
                              <th style={{ width: '60px', left: 0, position: 'sticky', zIndex: 11, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>번호</th>
                              <th style={{ width: '220px', left: '60px', position: 'sticky', zIndex: 11, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderRight: '2px solid #e2e8f0' }}>업소명(고정)</th>
                              <th style={{ width: '280px', left: '280px', position: 'sticky', zIndex: 11, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderRight: '2px solid #e2e8f0' }}>제품명(고정)</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>품목제조번호</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>허가일자</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>소비기한</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>인허가번호</th>
                              <th style={{ width: '120px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>제품형태</th>
                              <th style={{ width: '250px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>주된기능성</th>
                              <th style={{ width: '300px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>섭취방법</th>
                              <th style={{ width: '300px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>보관방법</th>
                              <th style={{ width: '400px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>섭취시주의사항</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>유형(CDNM)</th>
                              <th style={{ width: '300px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>기준규격</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>고열량저영양</th>
                              <th style={{ width: '130px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>생산종료</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>어린이기호식품</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>제품형태코드</th>
                              <th style={{ width: '200px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>포장재질(RAW)</th>
                              <th style={{ width: '150px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>업종</th>
                              <th style={{ width: '200px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>최종수정일자</th>
                              <th style={{ width: '300px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>기능성원료</th>
                              <th style={{ width: '300px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>기타원재료</th>
                              <th style={{ width: '200px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>캡슐원재료</th>
                              <th style={{ width: '200px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>성상방법</th>
                              <th style={{ width: '200px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: 'var(--accent)' }}>정규화포장</th>
                              <th style={{ width: '300px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: 'var(--accent)' }}>정규화기능성</th>
                              <th style={{ width: '300px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: 'var(--accent)' }}>정규화원재료</th>
                              <th style={{ width: '200px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: 'var(--text-muted)' }}>생성시간</th>
                              <th style={{ width: '200px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: 'var(--text-muted)' }}>수정시간</th>
                           </tr>
                        </thead>
                     <tbody style={{ background: '#fff' }}>
                        {rawLoading ? (
                           <tr><td colSpan="30" style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin fa-2xl"></i></td></tr>
                        ) : rawData.length > 0 ? (
                           rawData.map((item, idx) => (
                              <tr key={item.id} className="table-row">
                                 <td style={{ left: 0, position: 'sticky', background: '#fff', zIndex: 5, color: 'var(--text-muted)', borderBottom: '1px solid #f1f5f9' }}>{(rawPage-1)*20 + idx + 1}</td>
                                 <td style={{ left: '60px', position: 'sticky', background: '#fff', zIndex: 5, borderRight: '2px solid #f1f5f9', fontWeight: 600, color: 'var(--text-color)', borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.bsshNm}>{item.bsshNm}</div>
                                 </td>
                                 <td style={{ left: '280px', position: 'sticky', background: '#fff', zIndex: 5, borderRight: '2px solid #f1f5f9', color: 'var(--accent)', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.prdlstNm}>{item.prdlstNm}</div>
                                 </td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.prdlstReportNo}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.prmsDt}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', color: 'var(--accent-secondary)', fontWeight: 700 }}>{item.pogDaycnt || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.lcnsNo || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.dispos}>{item.dispos || '-'}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.primaryFnclty}>{item.primaryFnclty}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.ntkMthd}>{item.ntkMthd}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.cstdyMthd}>{item.cstdyMthd}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.iftknAtntMatrCn}>{item.iftknAtntMatrCn}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.prdlstCdnm || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.stdrStnd}>{item.stdrStnd}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.hiengLntrtDvsNm || '-'}</td>
                                 <td style={{ textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{item.production || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.childCrtfcYn || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.prdtShapCdNm || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.frmlcMtrqlt || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.indutyCdNm || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.lastUpdtDtm || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.indvRawmtrlNm}>{item.indvRawmtrlNm}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.etcRawmtrlNm}>{item.etcRawmtrlNm}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.capRawmtrlNm}>{item.capRawmtrlNm}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.frmlcMthd || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: 'var(--accent)' }}>{item.normalizedPackaging || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: 'var(--accent)' }}>{item.normalizedFunctionality || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: 'var(--accent)' }}>{item.normalizedRawMaterials || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(item.createdAt).toLocaleString()}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(item.updatedAt).toLocaleString()}</td>
                              </tr>
                           ))
                        ) : (
                           <tr><td colSpan="30" style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>데이터가 없습니다.</td></tr>
                        )}
                     </tbody>
                  </table>
               ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                           <tr>
                              <th style={{ padding: '16px' }}>번호</th>
                              <th style={{ padding: '16px' }}>연도</th>
                              <th style={{ padding: '16px' }}>품목제조번호</th>
                              <th style={{ padding: '16px' }}>제품명</th>
                              <th style={{ padding: '16px' }}>업체명</th>
                              <th style={{ padding: '16px' }}>생산량(KG)</th>
                              <th style={{ padding: '16px' }}>품목유형</th>
                              <th style={{ padding: '16px' }}>생성일자</th>
                           </tr>
                        </thead>
                        <tbody style={{ background: '#fff' }}>
                           {rawLoading ? (
                              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin fa-2xl"></i></td></tr>
                           ) : rawData.length > 0 ? (
                              rawData.map((item, idx) => (
                                 <tr key={item.id} className="table-row">
                                    <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{(rawPage-1)*20 + idx + 1}</td>
                                    <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{item.evlYr}년</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>{item.prdlstReportNo}</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', color: 'var(--accent)', fontWeight: 600 }}>{item.prdlstNm}</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>{item.bsshNm}</td>
                                    <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{item.prdctnQy?.toLocaleString() || 0}</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.hItemNm}</td>
                                    <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(item.createdAt).toLocaleDateString()}</td>
                                 </tr>
                              ))
                           ) : (
                              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>데이터가 없습니다.</td></tr>
                           )}
                        </tbody>
                     </table>
                  )}
               </div>

               {totalPages > 0 && (
                 <div style={{ padding: '16px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
                   <button onClick={() => setRawPage(1)} className="btn-page" disabled={rawPage === 1} title="처음으로"><i className="fa-solid fa-angles-left"></i></button>
                   <button onClick={() => setRawPage(p => Math.max(1, p - 1))} className="btn-page" disabled={rawPage === 1} title="이전"><i className="fa-solid fa-angle-left"></i></button>
                   
                   {getPageNumbers().map(p => (
                     <button 
                       key={p} 
                       onClick={() => setRawPage(p)} 
                       className={`btn-page ${rawPage === p ? 'active' : ''}`}
                     >
                       {p}
                     </button>
                   ))}
                   
                   <button onClick={() => setRawPage(p => Math.min(totalPages, p + 1))} className="btn-page" disabled={rawPage === totalPages} title="다음"><i className="fa-solid fa-angle-right"></i></button>
                   <button onClick={() => setRawPage(totalPages)} className="btn-page" disabled={rawPage === totalPages} title="맨 끝으로"><i className="fa-solid fa-angles-right"></i></button>
                   
                   <div style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rawPage} / {totalPages} 페이지</div>
                 </div>
               )}
            </div>
         </div>
      )}

      {/* 3. Banner Management Tab */}
      {activeTab === 'banner' && (
         <div className="animate-fade-in">
            <div className="glass-panel">
               <h3 style={{ marginBottom: '16px', color: 'var(--text-color)' }}>커스텀 배너 및 링크 관리</h3>
               
               <form onSubmit={handleAddBanner} style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                     <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px', color: 'var(--text-muted)', fontWeight: 600 }}>배너 식별 제목 (필수)</label>
                     <input type="text" value={bTitle} onChange={e=>setBTitle(e.target.value)} placeholder="예: 구인구직 사이트" style={{ width: '100%', padding: '10px', background: '#fff' }} required />
                  </div>
                  <div style={{ flex: '2 1 300px' }}>
                     <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px', color: 'var(--text-muted)', fontWeight: 600 }}>이미지 URL <span style={{ fontWeight: 400, color: '#94a3b8' }}>(선택 — 없으면 텍스트 배너로 표시)</span></label>
                     <input type="url" value={bImageUrl} onChange={e=>setBImageUrl(e.target.value)} placeholder="https://... (비워두면 텍스트 배너)" style={{ width: '100%', padding: '10px', background: '#fff' }} />
                  </div>
                  <div style={{ flex: '2 1 300px' }}>
                     <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px', color: 'var(--text-muted)', fontWeight: 600 }}>타겟 링크 URL (선택)</label>
                     <input type="url" value={bLinkUrl} onChange={e=>setBLinkUrl(e.target.value)} placeholder="클릭 시 이동할 주소" style={{ width: '100%', padding: '10px', background: '#fff' }} />
                  </div>
                  <button type="submit" className="btn sync-btn" style={{ padding: '10px 24px' }}>추가하기</button>
               </form>

               <div className="table-container">
                  <table>
                     <thead>
                        <tr>
                           <th style={{ width: '30%' }}>제목</th>
                           <th style={{ width: '40%' }}>미리보기 이미지</th>
                           <th style={{ width: '15%', textAlign: 'center' }}>상태</th>
                           <th style={{ width: '15%', textAlign: 'center' }}>관리</th>
                        </tr>
                     </thead>
                     <tbody>
                        {banners.map(b => (
                           <tr key={b.id} className="table-row">
                              <td>
                                 <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>{b.title}</div>
                                 {b.linkUrl && <a href={b.linkUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'underline' }}>링크 확인</a>}
                              </td>
                              <td>
                                 {b.imageUrl ? (
                                   <img src={b.imageUrl} alt="banner" style={{ maxHeight: '50px', borderRadius: '4px', maxWidth: '200px', objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                                 ) : (
                                   <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>텍스트 배너 (이미지 없음)</span>
                                 )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                 <button onClick={() => toggleBanner(b.id, b.isActive)} className="btn" style={{ padding: '6px 12px', fontSize: '0.75rem', background: b.isActive ? 'rgba(16, 185, 129, 0.1)' : '#f1f5f9', color: b.isActive ? '#059669' : 'var(--text-muted)', border: b.isActive ? '1px solid #10b981' : '1px solid #e2e8f0' }}>
                                    {b.isActive ? <><i className="fa-solid fa-circle-check"></i> 활성</> : <><i className="fa-solid fa-circle-minus"></i> 비활성</>}
                                 </button>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                 <button onClick={() => deleteBanner(b.id)} className="btn" style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(244, 63, 94, 0.1)', color: '#e11d48', border: '1px solid #f43f5e' }}>삭제</button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}

      {/* 4. User Approval & Management Tab */}
      {activeTab === 'users' && (
         <div className="animate-fade-in">

            {/* ?�?�?� ?�용삭제?�보 ?�정 모달 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?� */}
            {editingUser && (
               <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                           <h3 style={{ color: 'var(--text-color)', margin: 0 }}>
                              <i className="fa-solid fa-user-pen" style={{ marginRight: '8px', color: 'var(--accent)' }}></i>사용자 정보 수정
                           </h3>
                           <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>아이디: <strong>{editingUser.username}</strong></p>
                        </div>
                        <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>
                           <i className="fa-solid fa-xmark"></i>
                        </button>
                     </div>

                     {/* 삭제?�드삭제*/}
                     {[
                        { label: '이름', key: 'name', placeholder: '홍길동' },
                        { label: '회사명', key: 'companyNm', placeholder: '(주)식품회사' },
                        { label: '부서명', key: 'deptNm', placeholder: '연구개발팀' },
                        { label: '직급', key: 'positionNm', placeholder: '과장' },
                        { label: '직책', key: 'titleNm', placeholder: '팀장' },
                     ].map(({ label, key, placeholder }) => (
                        <div key={key} style={{ marginBottom: '14px' }}>
                           <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '5px' }}>{label}</label>
                           <input
                              type="text"
                              value={editForm[key] || ''}
                              placeholder={placeholder}
                              onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                           />
                        </div>
                     ))}

                     {/* 권한 & ?�인 */}
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                        <div>
                           <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '5px' }}>권한</label>
                           <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}>
                              <option value="USER">USER (일반)</option>
                              <option value="SALES">SALES (영업담당자)</option>
                              <option value="ADMIN">ADMIN (관리자)</option>
                           </select>
                        </div>
                        <div>
                           <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '5px' }}>가입 승인 상태</label>
                           <select value={editForm.isApproved ? 'true' : 'false'} onChange={e => setEditForm({ ...editForm, isApproved: e.target.value === 'true' })} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}>
                              <option value="true">승인 완료</option>
                              <option value="false">미인증</option>
                           </select>
                        </div>
                     </div>

                     {/* 비�?번호 초기삭제?�션 */}
                     <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <div>
                              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)' }}>
                                 <i className="fa-solid fa-key" style={{ marginRight: '6px', color: '#f59e0b' }}></i>비밀번호 초기화</p>
                              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                 보안상 암호화된 비밀번호는 단방향 암호화로 원본 확인 불가 (PBKDF2-SHA512)
                              </p>
                           </div>
                           <button
                              onClick={() => setShowPasswordReset(!showPasswordReset)}
                              style={{ padding: '6px 12px', fontSize: '0.78rem', background: showPasswordReset ? '#fee2e2' : '#eff6ff', color: showPasswordReset ? '#dc2626' : 'var(--accent)', border: '1px solid ' + (showPasswordReset ? '#fca5a5' : '#93c5fd'), borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                           >
                              {showPasswordReset ? '취소' : '비밀번호 변경'}
                           </button>
                        </div>
                        {showPasswordReset && (
                           <div style={{ marginTop: '12px' }}>
                              <input
                                 type="text"
                                 value={editForm.newPassword || ''}
                                 placeholder="새 비밀번호 입력 (최소 4자)"
                                 onChange={e => setEditForm({ ...editForm, newPassword: e.target.value })}
                                 style={{ width: '100%', padding: '9px 12px', border: '1px solid #fbbf24', borderRadius: '8px', fontSize: '0.9rem', background: '#fffbeb', boxSizing: 'border-box' }}
                              />
                              <p style={{ fontSize: '0.75rem', color: '#d97706', margin: '6px 0 0' }}>
                                 <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '4px' }}></i>
                                 저장 시 해당 사용자의 기존 비밀번호가 무효화됩니다.
                              </p>
                           </div>
                        )}
                     </div>

                     <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setEditingUser(null)} style={{ flex: 1, padding: '11px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>취소</button>
                        <button
                           onClick={handleSaveEdit}
                           disabled={editSaving}
                           style={{ flex: 2, padding: '11px', background: 'linear-gradient(135deg, #0d9488, #0284c7)', color: '#fff', border: 'none', borderRadius: '8px', cursor: editSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem', opacity: editSaving ? 0.7 : 1 }}
                        >
                           {editSaving ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>저장 중...</> : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: '6px' }}></i>변경사항 저장</>}
                        </button>
                     </div>
                  </div>
               </div>
            )}
            {/* ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?� */}

            <div className="glass-panel">
               <h3 style={{ marginBottom: '16px', color: 'var(--text-color)' }}>
                  <i className="fa-solid fa-users" style={{ marginRight: '8px', color: 'var(--accent)' }}></i>사용자 가입 승인 및 관리
               </h3>
               <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
                  회원가입을 신청한 사용자 목록입니다. 가입 승인 처리 후 로그인 및 기능 사용이 가능합니다.
               </p>

               <div className="table-container">
                  <table>
                     <thead>
                        <tr>
                           <th>아이디</th>
                           <th>이름</th>
                           <th>회사명</th>
                           <th>부서</th>
                           <th>직급 / 직책</th>
                           <th style={{ textAlign: 'center' }}>권한</th>
                           <th style={{ textAlign: 'center' }}>승인 상태</th>
                           <th style={{ textAlign: 'center' }}>가입신청일</th>
                           <th style={{ textAlign: 'center' }}>관리기능</th>
                        </tr>
                     </thead>
                     <tbody>
                        {usersLoading ? (
                           <tr><td colSpan="9" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin fa-xl"></i></td></tr>
                        ) : users.length > 0 ? (
                           users.map(u => {
                              const isSelf = currentUser && currentUser.username === u.username;
                              return (
                                 <tr key={u.id} className="table-row">
                                    <td style={{ fontWeight: 600, color: 'var(--text-color)' }}>{u.username} {isSelf && <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>나</span>}</td>
                                    <td>{u.name}</td>
                                    <td style={{ fontWeight: 600 }}>{u.companyNm}</td>
                                    <td>{u.deptNm}</td>
                                    <td style={{ color: 'var(--text-muted)' }}>{u.positionNm} / {u.titleNm}</td>
                                    <td style={{ textAlign: 'center' }}>
                                       <span className={`badge ${u.role === 'ADMIN' ? 'badge-upd' : u.role === 'SALES' ? 'badge-sales' : 'badge-new'}`} style={{ textTransform: 'uppercase' }}>
                                          {u.role === 'ADMIN' ? 'ADMIN (관리자)' : u.role === 'SALES' ? 'SALES (영업)' : 'USER (일반)'}
                                       </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                       <span className={`status-badge ${u.isApproved ? 'status-success' : 'status-error'}`} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                                          {u.isApproved ? '승인 완료' : '미인증'}
                                       </span>
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                    <td style={{ textAlign: 'center' }}>
                                       <div style={{ display: 'inline-flex', gap: '5px' }}>
                                          {/* ?�보 ?�정 */}
                                          <button
                                             onClick={() => handleOpenEdit(u)}
                                             className="btn"
                                             style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(2,132,199,0.08)', color: '#0369a1', border: '1px solid #7dd3fc', cursor: 'pointer' }}
                                             title="정보 수정 및 비밀번호 초기화"
                                          >
                                             <i className="fa-solid fa-pen-to-square"></i> 수정
                                          </button>

                                          {/* ?�인 / ?�인취소 */}
                                          <button
                                             onClick={() => handleApproveUser(u.id, u.isApproved)}
                                             className="btn"
                                             disabled={isSelf}
                                             style={{ padding: '6px 10px', fontSize: '0.75rem', background: u.isApproved ? '#f1f5f9' : 'rgba(22, 163, 74, 0.1)', color: u.isApproved ? 'var(--text-muted)' : '#166534', border: '1px solid ' + (u.isApproved ? '#e2e8f0' : '#16a34a'), cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.5 : 1 }}
                                          >
                                             {u.isApproved ? '승인 취소' : '승인'}
                                          </button>

                                          {/* 삭제 */}
                                          <button
                                             onClick={() => handleDeleteUser(u.id, u.username)}
                                             className="btn"
                                             disabled={isSelf}
                                             style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(220, 38, 38, 0.1)', color: '#991b1b', border: '1px solid #fca5a5', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.5 : 1 }}
                                          >
                                             삭제
                                          </button>
                                       </div>
                                    </td>
                                 </tr>
                              );
                           })
                        ) : (
                           <tr><td colSpan="9" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>가입한 사용자가 없습니다.</td></tr>
                        )}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}

      {/* 2-2. 품목제조보고 RAW 데이터 (일반식품 I1250) */}
      {activeTab === 'rawgeneral' && (
         <div className="animate-fade-in">
            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #ddd6fe' }}>
               <div>
                  <h3 style={{ color: '#4c1d95' }}><i className="fa-solid fa-wheat-awn" style={{ marginRight: '8px' }}></i>품목제조보고 RAW 데이터 (일반식품 I1250)</h3>
                  <p style={{ color: '#5b21b6' }}>DB에 저장된 일반식품 품목제조보고 원본 데이터를 조회합니다. 총 <strong>{rawGeneralTotal.toLocaleString()}</strong>건</p>
               </div>
               <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                     <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                     <input
                       type="text"
                       placeholder="업체/품목 검색 (Enter)"
                       value={rawGeneralSearchQuery}
                       onChange={e => setRawGeneralSearchQuery(e.target.value)}
                       onKeyDown={handleRawGeneralSearch}
                       style={{ padding: '8px 12px 8px 32px', fontSize: '0.85rem', width: '220px' }}
                     />
                  </div>
                  <button onClick={handleRawGeneralExport} className="btn sync-btn" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}><i className="fa-solid fa-file-excel" style={{ marginRight: '8px' }}></i>Excel 다운로드</button>
               </div>
            </div>

            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
               <div className="table-container" style={{ height: '700px', overflow: 'auto', position: 'relative' }}>
                  <table style={{ minWidth: '2800px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                     <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr style={{ background: '#f5f3ff' }}>
                           <th style={{ width: '60px', left: 0, position: 'sticky', zIndex: 11, background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>번호</th>
                           <th style={{ width: '200px', left: '60px', position: 'sticky', zIndex: 11, background: '#f5f3ff', borderBottom: '1px solid #ddd6fe', borderRight: '2px solid #ddd6fe' }}>업소명(고정)</th>
                           <th style={{ width: '250px', left: '260px', position: 'sticky', zIndex: 11, background: '#f5f3ff', borderBottom: '1px solid #ddd6fe', borderRight: '2px solid #ddd6fe', color: '#6366f1' }}>식품명(고정)</th>
                           <th style={{ width: '160px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>품목제조번호</th>
                           <th style={{ width: '130px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>허가일자</th>
                           <th style={{ width: '180px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>소비기한</th>
                           <th style={{ width: '130px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>품목유형명</th>
                           <th style={{ width: '120px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>업종</th>
                           <th style={{ width: '180px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>식품형태</th>
                           <th style={{ width: '200px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe', color: '#6366f1' }}>포장재질(정규화)</th>
                           <th style={{ width: '250px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>포장재질(원문)</th>
                           <th style={{ width: '300px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>용법</th>
                           <th style={{ width: '200px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>용도</th>
                           <th style={{ width: '120px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>고열량저영양</th>
                           <th style={{ width: '120px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>생산종료</th>
                           <th style={{ width: '130px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>어린이인증</th>
                           <th style={{ width: '150px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe', color: 'var(--text-muted)' }}>최종수정일자</th>
                        </tr>
                     </thead>
                     <tbody style={{ background: '#fff' }}>
                        {rawGeneralLoading ? (
                           <tr><td colSpan="17" style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin fa-2xl"></i></td></tr>
                        ) : rawGeneralData.length > 0 ? (
                           rawGeneralData.map((item, idx) => (
                              <tr key={item.id} className="table-row">
                                 <td style={{ left: 0, position: 'sticky', background: '#fff', zIndex: 5, color: 'var(--text-muted)', borderBottom: '1px solid #f1f5f9' }}>{(rawGeneralPage - 1) * 20 + idx + 1}</td>
                                 <td style={{ left: '60px', position: 'sticky', background: '#fff', zIndex: 5, borderRight: '2px solid #f1f5f9', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.bsshNm}>{item.bsshNm}</div>
                                 </td>
                                 <td style={{ left: '260px', position: 'sticky', background: '#fff', zIndex: 5, borderRight: '2px solid #f1f5f9', color: '#6366f1', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.prdlstNm}>{item.prdlstNm}</div>
                                 </td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.prdlstReportNo}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.prmsDt}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', color: '#a855f7', fontWeight: 700 }}>{item.pogDaycnt || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.prdlstDcnm || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', color: 'var(--text-muted)' }}>{item.indutyCdNm || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.dispos}>{item.dispos || '-'}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', color: '#6366f1', fontWeight: 600 }}>{item.normalizedPackaging || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.frmlcMtrqlt}>{item.frmlcMtrqlt || '-'}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.usage}>{item.usage || '-'}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.prpos}>{item.prpos || '-'}</div></td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.hiengLntrtDvsNm || '-'}</td>
                                 <td style={{ textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{item.production || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9' }}>{item.childCrtfcYn || '-'}</td>
                                 <td style={{ borderBottom: '1px solid #f1f5f9', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.lastUpdtDtm || '-'}</td>
                              </tr>
                           ))
                        ) : (
                           <tr><td colSpan="17" style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>데이터가 없습니다. 먼저 일반식품 동기화를 진행하세요.</td></tr>
                        )}
                     </tbody>
                  </table>
               </div>

               {totalGeneralPages > 0 && (
                 <div style={{ padding: '16px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
                   <button onClick={() => setRawGeneralPage(1)} className="btn-page" disabled={rawGeneralPage === 1} title="처음으로"><i className="fa-solid fa-angles-left"></i></button>
                   <button onClick={() => setRawGeneralPage(p => Math.max(1, p - 1))} className="btn-page" disabled={rawGeneralPage === 1} title="이전"><i className="fa-solid fa-angle-left"></i></button>
                   {Array.from({ length: Math.min(5, totalGeneralPages) }, (_, i) => {
                     const startPage = Math.max(1, rawGeneralPage - 2);
                     const p = startPage + i;
                     if (p > totalGeneralPages) return null;
                     return <button key={p} onClick={() => setRawGeneralPage(p)} className={`btn-page ${rawGeneralPage === p ? 'active' : ''}`}>{p}</button>;
                   })}
                   <button onClick={() => setRawGeneralPage(p => Math.min(totalGeneralPages, p + 1))} className="btn-page" disabled={rawGeneralPage === totalGeneralPages} title="다음"><i className="fa-solid fa-angle-right"></i></button>
                   <button onClick={() => setRawGeneralPage(totalGeneralPages)} className="btn-page" disabled={rawGeneralPage === totalGeneralPages} title="맨 끝으로"><i className="fa-solid fa-angles-right"></i></button>
                   <div style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rawGeneralPage} / {totalGeneralPages} 페이지</div>
                 </div>
               )}
            </div>
         </div>
      )}

      {/* 5. Audit Trail Logs Tab (?�규) */}
      {activeTab === 'audit' && (
         <div className="animate-fade-in">
            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
               <div>
                  <h3 style={{ color: 'var(--text-color)' }}>
                     <i className="fa-solid fa-clipboard-list" style={{ marginRight: '8px', color: 'var(--accent)' }}></i>작업 이력 감사 로그
                  </h3>
                  <p style={{ color: 'var(--text-muted)' }}>추가, 삭제, 수정 등 어떤 항목을 변경하거나 작업을 실행하는지 모니터링합니다.</p>
               </div>
               
               <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* ?�션 ?�삭제?�터 */}
                  <select 
                     value={auditActionFilter} 
                     onChange={(e) => { setAuditActionFilter(e.target.value); setAuditPage(1); }}
                     style={{ padding: '8px 12px', fontSize: '0.85rem', width: '160px' }}
                  >
                     <option value="">모든 액션</option>
                     <option value="LOGIN_SUCCESS">로그인 성공</option>
                     <option value="LOGIN_FAILURE">로그인 실패</option>
                     <option value="LOGOUT">로그아웃</option>
                     <option value="REGISTER_REQUEST">가입신청</option>
                     <option value="SYNC_EXECUTE">수동 동기화</option>
                     <option value="USER_UPDATE">사용자 정보 갱신</option>
                     <option value="USER_DELETE">사용자 계정 삭제</option>
                     <option value="BANNER_ADD">배너 추가</option>
                     <option value="BANNER_TOGGLE">배너 활성 상태 변경</option>
                     <option value="BANNER_DELETE">배너 삭제</option>
                  </select>

                  {/* ?�용?�명 검삭제*/}
                  <div style={{ position: 'relative' }}>
                     <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem' }}></i>
                     <input 
                       type="text" 
                       placeholder="사용자/내용 검색 (Enter)"
                       value={auditSearchQuery}
                       onChange={e => setAuditSearchQuery(e.target.value)}
                       onKeyDown={handleAuditSearch}
                       style={{ padding: '8px 12px 8px 32px', fontSize: '0.85rem', width: '200px' }}
                     />
                  </div>
               </div>
            </div>

            <div className="glass-panel">
               <div className="table-container">
                  <table>
                     <thead>
                        <tr>
                           <th style={{ width: '80px', textAlign: 'center' }}>번호</th>
                           <th style={{ width: '200px' }}>발생 일시</th>
                           <th style={{ width: '150px' }}>사용자 ID</th>
                           <th style={{ width: '100px', textAlign: 'center' }}>권한</th>
                           <th style={{ width: '180px' }}>발생 페이지/API</th>
                           <th style={{ width: '180px' }}>액션 분류</th>
                           <th>상세 내역</th>
                           <th style={{ width: '140px' }}>IP 주소</th>
                        </tr>
                     </thead>
                     <tbody>
                        {auditLoading ? (
                           <tr><td colSpan="8" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin fa-xl"></i></td></tr>
                        ) : auditLogs.length > 0 ? (
                           auditLogs.map((item, idx) => (
                              <tr key={item.id} className="table-row">
                                 <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{(auditPage - 1) * 20 + idx + 1}</td>
                                 <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(item.createdAt).toLocaleString()}</td>
                                 <td style={{ fontWeight: 600, color: 'var(--text-color)' }}>{item.username}</td>
                                 <td style={{ textAlign: 'center' }}>
                                    <span className={`badge ${item.role === 'ADMIN' ? 'badge-upd' : item.role === 'SALES' ? 'badge-sales' : 'badge-new'}`} style={{ fontSize: '0.7rem' }}>
                                       {item.role === 'ADMIN' ? 'ADMIN' : item.role === 'SALES' ? 'SALES' : 'USER'}
                                    </span>
                                 </td>
                                 <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.page}</td>
                                 <td style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent-secondary)' }}>{item.action}</td>
                                 <td>
                                    <div style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{item.details}</div>
                                 </td>
                                 <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.ipAddress}</td>
                              </tr>
                           ))
                        ) : (
                           <tr><td colSpan="8" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>감사 로그 이력이 존재하지 않습니다.</td></tr>
                        )}
                     </tbody>
                  </table>
               </div>

               {totalAuditPages > 0 && (
                 <div style={{ padding: '16px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
                   <button onClick={() => setAuditPage(1)} className="btn-page" disabled={auditPage === 1} title="처음으로"><i className="fa-solid fa-angles-left"></i></button>
                   <button onClick={() => setAuditPage(p => Math.max(1, p - 1))} className="btn-page" disabled={auditPage === 1} title="이전"><i className="fa-solid fa-angle-left"></i></button>
                   
                   {getAuditPageNumbers().map(p => (
                     <button 
                       key={p} 
                       onClick={() => setAuditPage(p)} 
                       className={`btn-page ${auditPage === p ? 'active' : ''}`}
                     >
                       {p}
                     </button>
                   ))}
                   
                   <button onClick={() => setAuditPage(p => Math.min(totalAuditPages, p + 1))} className="btn-page" disabled={auditPage === totalAuditPages} title="다음"><i className="fa-solid fa-angle-right"></i></button>
                   <button onClick={() => setAuditPage(totalAuditPages)} className="btn-page" disabled={auditPage === totalAuditPages} title="맨 끝으로"><i className="fa-solid fa-angles-right"></i></button>
                   
                   <div style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{auditPage} / {totalAuditPages} 페이지</div>
                 </div>
               )}
            </div>
         </div>
      )}

      {/* 6. 팝업 공지 관리 탭 */}
      {activeTab === 'notices' && (
        <div className="animate-fade-in">
          <div className="glass-panel" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ color: 'var(--text-color)', margin: 0 }}>
                  <i className="fa-solid fa-bullhorn" style={{ marginRight: '8px', color: '#f59e0b' }}></i>팝업 공지사항 관리
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  로그인한 사용자에게 팝업으로 표시되는 공지사항을 관리합니다.
                </p>
              </div>
              <button
                onClick={() => { setShowNoticeForm(!showNoticeForm); setEditingNotice(null); setNoticeForm({ title: '', content: '', isActive: true, startAt: '', endAt: '' }); }}
                className="btn sync-btn"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', padding: '10px 20px' }}
              >
                <i className="fa-solid fa-plus" style={{ marginRight: '8px' }}></i>새 공지 작성
              </button>
            </div>

            {/* 공지 작성/수정 폼 */}
            {showNoticeForm && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 16px', color: '#92400e', fontSize: '0.95rem' }}>
                  <i className="fa-solid fa-pen" style={{ marginRight: '8px' }}></i>
                  {editingNotice ? '공지 수정' : '새 공지 작성'}
                </h4>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '5px' }}>제목 (필수)</label>
                  <input
                    type="text"
                    value={noticeForm.title}
                    onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })}
                    placeholder="공지 제목을 입력하세요"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', background: '#fff' }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '5px' }}>내용 (필수)</label>
                  <RichTextEditor
                    key={editingNotice ? `edit-${editingNotice.id}` : 'new'}
                    value={noticeForm.content}
                    onChange={html => setNoticeForm(prev => ({ ...prev, content: html }))}
                    placeholder="공지 내용을 입력하세요. 글자 크기·색상·굵기 등 서식을 적용할 수 있습니다."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '5px' }}>활성화 상태</label>
                    <select
                      value={noticeForm.isActive ? 'true' : 'false'}
                      onChange={e => setNoticeForm({ ...noticeForm, isActive: e.target.value === 'true' })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '0.9rem', background: '#fff' }}
                    >
                      <option value="true">활성 (표시)</option>
                      <option value="false">비활성 (숨김)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '5px' }}>표시 시작일 (선택)</label>
                    <input
                      type="datetime-local"
                      value={noticeForm.startAt}
                      onChange={e => setNoticeForm({ ...noticeForm, startAt: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '0.85rem', background: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '5px' }}>표시 종료일 (선택)</label>
                    <input
                      type="datetime-local"
                      value={noticeForm.endAt}
                      onChange={e => setNoticeForm({ ...noticeForm, endAt: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '0.85rem', background: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowNoticeForm(false); setEditingNotice(null); }} style={{ padding: '9px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>취소</button>
                  <button
                    onClick={handleSaveNotice}
                    disabled={noticeSaving}
                    style={{ padding: '9px 24px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', border: 'none', borderRadius: '8px', cursor: noticeSaving ? 'not-allowed' : 'pointer', fontSize: '0.85rem', color: '#fff', fontWeight: 700, opacity: noticeSaving ? 0.7 : 1 }}
                  >
                    {noticeSaving ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>저장 중...</> : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: '6px' }}></i>{editingNotice ? '수정 저장' : '공지 등록'}</>}
                  </button>
                </div>
              </div>
            )}

            {/* 공지 목록 */}
            {noticesLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-spinner fa-spin fa-xl"></i>
              </div>
            ) : notices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '12px' }}>
                <i className="fa-solid fa-bullhorn" style={{ fontSize: '2rem', opacity: 0.3, display: 'block', marginBottom: '12px' }}></i>
                등록된 공지사항이 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {notices.map(n => (
                  <div key={n.id} style={{
                    border: `1px solid ${n.isActive ? '#fcd34d' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    padding: '16px 20px',
                    background: n.isActive ? '#fffbeb' : '#f8fafc',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'flex-start',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-color)' }}>{n.title}</span>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                          background: n.isActive ? 'rgba(16,185,129,0.1)' : '#f1f5f9',
                          color: n.isActive ? '#059669' : '#94a3b8',
                          border: n.isActive ? '1px solid #10b981' : '1px solid #e2e8f0',
                        }}>
                          {n.isActive ? '활성' : '비활성'}
                        </span>
                        {n.startAt && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>시작: {new Date(n.startAt).toLocaleDateString()}</span>}
                        {n.endAt && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>종료: {new Date(n.endAt).toLocaleDateString()}</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {n.content}
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                        등록일: {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => handleEditNotice(n)} className="btn" style={{ padding: '6px 12px', fontSize: '0.78rem', background: 'rgba(2,132,199,0.08)', color: '#0369a1', border: '1px solid #7dd3fc' }}>
                        <i className="fa-solid fa-pen-to-square"></i> 수정
                      </button>
                      <button onClick={() => handleToggleNotice(n.id, n.isActive)} className="btn" style={{ padding: '6px 12px', fontSize: '0.78rem', background: n.isActive ? '#f1f5f9' : 'rgba(22,163,74,0.1)', color: n.isActive ? '#64748b' : '#166534', border: n.isActive ? '1px solid #e2e8f0' : '1px solid #16a34a' }}>
                        {n.isActive ? '비활성화' : '활성화'}
                      </button>
                      <button onClick={() => handleDeleteNotice(n.id)} className="btn" style={{ padding: '6px 12px', fontSize: '0.78rem', background: 'rgba(220,38,38,0.1)', color: '#991b1b', border: '1px solid #fca5a5' }}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .btn-page {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: var(--text-color);
          cursor: pointer;
          font-weight: 600;
          font-size: 0.8rem;
          transition: all 0.2s;
        }
        .btn-page:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .btn-page.active {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }
        .btn-page:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .table-container table th {
          font-size: 0.75rem;
          padding: 10px 12px;
        }
        .table-container table td {
          font-size: 0.75rem;
          padding: 8px 12px;
        }
        input, select {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          outline: none;
        }
        .status-badge {
          border-radius: 6px;
          font-weight: 700;
          display: inline-block;
        }
        .status-success {
          background: rgba(22, 163, 74, 0.1);
          color: #166534;
        }
        .status-error {
          background: rgba(220, 38, 38, 0.1);
          color: #991b1b;
        }
      `}</style>
    </main>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={null}>
      <ManagePageInner />
    </Suspense>
  );
}
