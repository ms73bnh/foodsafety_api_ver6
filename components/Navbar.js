"use client";
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';


export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState('info'); // 'info' | 'password'
  const [infoForm, setInfoForm] = useState({ name: '', companyNm: '', deptNm: '', positionNm: '', titleNm: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ text: '', error: false });
  const drawerRef = useRef(null);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          if (pathname === '/manage' && data.user.role !== 'ADMIN') {
            alert('관리자만 접근할 수 있는 페이지입니다.');
            router.push('/');
          }
          if (pathname === '/general-search' && data.user.role !== 'ADMIN' && data.user.role !== 'SALES') {
            alert('영업(SALES) 이상 권한이 필요한 페이지입니다.');
            router.push('/');
          }
        } else {
          if (pathname !== '/login') router.push('/login');
        }
      } catch (err) {
        if (pathname !== '/login') router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, [pathname, router]);

  // 드로어 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);



  if (pathname === '/login') return null;

  const handleLogout = async () => {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) { setUser(null); window.location.href = '/login'; }
    } catch (e) { alert('로그아웃 실패: ' + e.message); }
  };

  const handleSync = async () => {
    if (syncing) return;
    if (!confirm('전체 데이터를 동기화하시겠습니까?')) return;
    setSyncing(true);
    let currentIdx = 1, totalAdded = 0, totalUpdated = 0, keepGoing = true;
    try {
      while (keepGoing) {
        const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startIdx: currentIdx, limit: 1000 }) });
        const data = await res.json();
        if (data.success) {
          totalAdded += data.addedCount; totalUpdated += data.updatedCount;
          if (!data.fetchedRows || data.fetchedRows === 0) { keepGoing = false; alert(`🎉 동기화 완료!\n신규 추가: ${totalAdded}건\n업데이트: ${totalUpdated}건`); }
          else currentIdx += data.fetchedRows;
        } else { keepGoing = false; alert(`동기화 오류: ${data.error}`); }
      }
    } catch (err) { alert(`요청 실패: ${err.message}`); }
    setSyncing(false);
  };

  const openProfile = () => {
    if (!user) return;
    setInfoForm({ name: user.name || '', companyNm: user.companyNm || '', deptNm: user.deptNm || '', positionNm: user.positionNm || '', titleNm: user.titleNm || '' });
    setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setProfileMsg({ text: '', error: false });
    setProfileTab('info');
    setProfileOpen(true);
  };

  const handleSaveInfo = async () => {
    setProfileSaving(true); setProfileMsg({ text: '', error: false });
    try {
      const res = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'info', ...infoForm }) });
      const json = await res.json();
      if (json.success) {
        setUser(prev => ({ ...prev, ...json.user }));
        setProfileMsg({ text: '✓ 기본정보가 저장되었습니다.', error: false });
      } else {
        setProfileMsg({ text: json.error || '저장 실패', error: true });
      }
    } catch (e) { setProfileMsg({ text: '네트워크 오류', error: true }); }
    setProfileSaving(false);
  };

  const handleSavePw = async () => {
    if (!pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword) {
      return setProfileMsg({ text: '모든 항목을 입력해주세요.', error: true });
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      return setProfileMsg({ text: '새 비밀번호와 확인이 일치하지 않습니다.', error: true });
    }
    if (pwForm.newPassword.length < 6) {
      return setProfileMsg({ text: '새 비밀번호는 최소 6자 이상이어야 합니다.', error: true });
    }
    setProfileSaving(true); setProfileMsg({ text: '', error: false });
    try {
      const res = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'password', ...pwForm }) });
      const json = await res.json();
      if (json.success) {
        setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setProfileMsg({ text: '✓ 비밀번호가 변경되었습니다.', error: false });
      } else {
        setProfileMsg({ text: json.error || '변경 실패', error: true });
      }
    } catch (e) { setProfileMsg({ text: '네트워크 오류', error: true }); }
    setProfileSaving(false);
  };

  const isAdminUser = user && user.role === 'ADMIN';
  const isSalesOrAboveUser = user && (user.role === 'ADMIN' || user.role === 'SALES');


  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', background: '#fff' };
  const labelStyle = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container" style={{ maxWidth: '1600px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link
            href="/"
            style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
          >
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #0d9488, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
              <i className="fa-solid fa-leaf"></i>
            </div>
            건강기능식품 데이터 인사이트
          </Link>

          <div style={{ display: 'flex', gap: '6px', margin: '0 20px', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Link href="/" className={`navbar-item ${pathname === '/' ? 'active' : ''}`}><i className="fa-solid fa-chart-line" style={{ marginRight: '6px' }}></i>대시보드</Link>
            <div className="navbar-dropdown-container">
              <span className={`navbar-item dropdown-trigger ${pathname === '/search' || pathname === '/general-search' ? 'active' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                <i className="fa-solid fa-magnifying-glass" style={{ marginRight: '6px' }}></i>데이터 검색<i className="fa-solid fa-chevron-down" style={{ marginLeft: '4px', fontSize: '0.65rem' }}></i>
              </span>
              <div className="navbar-dropdown-menu">
                <Link href="/search" className="dropdown-link">
                  <i className="fa-solid fa-capsules" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>건강기능식품 검색
                </Link>
                {isSalesOrAboveUser && (
                  <Link href="/general-search" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <i className="fa-solid fa-bowl-food" style={{ marginRight: '6px', color: '#6366f1' }}></i>일반식품 검색
                  </Link>
                )}
              </div>
            </div>
            <div className="navbar-dropdown-container">
              <span className={`navbar-item dropdown-trigger ${pathname.startsWith('/companies') ? 'active' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                <i className="fa-solid fa-building" style={{ marginRight: '6px' }}></i>업체별 정보<i className="fa-solid fa-chevron-down" style={{ marginLeft: '4px', fontSize: '0.65rem' }}></i>
              </span>
              <div className="navbar-dropdown-menu">
                <Link href="/companies" className="dropdown-link">
                  <i className="fa-solid fa-building" style={{ marginRight: '6px', color: '#0284c7' }}></i>업체별 현황
                </Link>
                <Link href="/companies/compare" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <i className="fa-solid fa-code-compare" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>업체 상호 비교
                </Link>
              </div>
            </div>
            <Link href="/production" className={`navbar-item ${pathname.startsWith('/production') ? 'active' : ''}`} style={{ color: '#0d9488' }}><i className="fa-solid fa-boxes-stacked" style={{ marginRight: '6px' }}></i>생산 실적 분석</Link>
            <Link href="/analytics" className={`navbar-item ${pathname === '/analytics' ? 'active' : ''}`} style={{ color: '#0284c7', fontWeight: 700 }}><i className="fa-solid fa-chart-pie" style={{ marginRight: '6px' }}></i>통합 분석 레포트</Link>
            <div className="navbar-dropdown-container">
              <span className={`navbar-item dropdown-trigger ${pathname === '/categories' || pathname === '/ingredients' || pathname === '/guidelines' || pathname === '/raw-materials' ? 'active' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                <i className="fa-solid fa-flask" style={{ marginRight: '6px' }}></i>개별인정형<i className="fa-solid fa-chevron-down" style={{ marginLeft: '4px', fontSize: '0.65rem' }}></i>
              </span>
              <div className="navbar-dropdown-menu">
                <Link href="/categories" className="dropdown-link">
                  <i className="fa-solid fa-tags" style={{ marginRight: '6px', color: '#7c3aed' }}></i>기능성 카테고리
                </Link>
                <Link href="/ingredients" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <i className="fa-solid fa-flask" style={{ marginRight: '6px', color: '#0d9488' }}></i>개별인정원료
                </Link>
                <Link href="/guidelines" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <i className="fa-solid fa-book-bookmark" style={{ marginRight: '6px', color: '#0284c7' }}></i>기능성 평가 가이드라인
                </Link>
                <Link href="/raw-materials" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <i className="fa-solid fa-flask-vial" style={{ marginRight: '6px', color: '#059669' }}></i>원료별 정보 공시
                </Link>
              </div>
            </div>
            <Link href="/qna" className={`navbar-item ${pathname === '/qna' ? 'active' : ''}`}>
              <i className="fa-solid fa-comments" style={{ marginRight: '6px', color: '#0284c7' }}></i>Q&A
            </Link>
            {isAdminUser && (
              <Link href="/manage" className={`navbar-item ${pathname === '/manage' ? 'active' : ''}`} style={{ fontWeight: 'bold', background: 'rgba(2, 132, 199, 0.06)' }}>
                <i className="fa-solid fa-database" style={{ marginRight: '6px' }}></i>시스템 관리
              </Link>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
            {isAdminUser && (
              <button onClick={handleSync} className={`sync-btn ${syncing ? 'loading' : ''}`} style={{ background: 'linear-gradient(135deg, #0d9488, #0284c7)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <i className={`fa-solid fa-rotate ${syncing ? 'fa-spin' : ''}`}></i> {syncing ? '동기화 중...' : '수동 동기화'}
              </button>
            )}

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid var(--surface-border)', paddingLeft: '14px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-color)', whiteSpace: 'nowrap' }}>
                    {user.name} <span style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)' }}>{user.positionNm || user.role}</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--accent)', whiteSpace: 'nowrap', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.companyNm} / {user.deptNm || '소속 없음'}
                  </div>
                </div>

                {/* ★ 아바타 — 클릭 시 프로필 드로어 오픈 */}
                <button
                  onClick={openProfile}
                  title="내 프로필 / 비밀번호 변경"
                  style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#f1f5f9', border: '2px solid var(--surface-border)', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', padding: 0, transition: 'border-color 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#0284c7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(2,132,199,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--surface-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="Profile" style={{ width: '100%', height: '100%' }} />
                </button>

                <button onClick={handleLogout} title="로그아웃" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', fontSize: '1.05rem', transition: 'color 0.2s', flexShrink: 0 }}
                  onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}>
                  <i className="fa-solid fa-right-from-bracket"></i>
                </button>
              </div>
            ) : (
              !loading && (
                <Link href="/login" className="btn sync-btn" style={{ padding: '8px 16px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  <i className="fa-solid fa-lock" style={{ marginRight: '6px' }}></i> 로그인
                </Link>
              )
            )}
          </div>
        </div>
      </nav>

      {/* ─── 프로필 드로어 (오른쪽 슬라이드 패널) ─── */}
      {profileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
          {/* dim 레이어 */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }} onClick={() => setProfileOpen(false)} />

          {/* 드로어 패널 */}
          <div ref={drawerRef} style={{ position: 'relative', width: '400px', maxWidth: '95vw', height: '100vh', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.25s ease' }}>
            {/* 헤더 */}
            <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #f8fafc, #eff6ff)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', border: '3px solid #0284c7', flexShrink: 0 }}>
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} alt="Profile" style={{ width: '100%', height: '100%' }} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', margin: 0 }}>{user?.name}</p>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0' }}>{user?.username}</p>
                    <span style={{ display: 'inline-block', padding: '2px 8px', background: user?.role === 'ADMIN' ? '#dbeafe' : user?.role === 'SALES' ? '#fff7ed' : '#f0fdf4', color: user?.role === 'ADMIN' ? '#1d4ed8' : user?.role === 'SALES' ? '#c2410c' : '#16a34a', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, marginTop: '4px' }}>
                      {user?.role === 'ADMIN' ? '관리자' : user?.role === 'SALES' ? '영업담당자' : '일반 사용자'}
                    </span>
                  </div>
                </div>
                <button onClick={() => setProfileOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* 탭 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              {[['info', <><i className="fa-solid fa-user" style={{ marginRight: '6px' }}></i>기본정보 수정</>],
                ['password', <><i className="fa-solid fa-lock" style={{ marginRight: '6px' }}></i>비밀번호 변경</>]
              ].map(([key, label]) => (
                <button key={key} onClick={() => { setProfileTab(key); setProfileMsg({ text: '', error: false }); }}
                  style={{ flex: 1, padding: '14px 8px', border: 'none', background: 'none', fontWeight: profileTab === key ? 700 : 500, color: profileTab === key ? '#0284c7' : '#64748b', borderBottom: `2px solid ${profileTab === key ? '#0284c7' : 'transparent'}`, cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.2s' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* 컨텐츠 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {profileMsg.text && (
                <div style={{ marginBottom: '16px', padding: '10px 14px', background: profileMsg.error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${profileMsg.error ? '#fca5a5' : '#86efac'}`, borderRadius: '8px', fontSize: '0.82rem', color: profileMsg.error ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                  {profileMsg.text}
                </div>
              )}

              {profileTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 4px' }}>아이디와 권한은 관리자만 변경할 수 있습니다.</p>
                  {[
                    { label: '성명 *', key: 'name', placeholder: '홍길동' },
                    { label: '회사명', key: 'companyNm', placeholder: '(주)식품회사' },
                    { label: '부서명', key: 'deptNm', placeholder: '연구개발팀' },
                    { label: '직급', key: 'positionNm', placeholder: '과장' },
                    { label: '직책', key: 'titleNm', placeholder: '팀장' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label style={labelStyle}>{label}</label>
                      <input
                        type="text" value={infoForm[key] || ''} placeholder={placeholder}
                        onChange={e => setInfoForm(f => ({ ...f, [key]: e.target.value }))}
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#0284c7'}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                      />
                    </div>
                  ))}
                </div>
              )}

              {profileTab === 'password' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ padding: '12px 14px', background: '#eff6ff', borderRadius: '8px', fontSize: '0.78rem', color: '#1d4ed8', border: '1px solid #bfdbfe', marginBottom: '4px' }}>
                    <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }}></i>
                    비밀번호는 최소 6자 이상이어야 하며, 현재 비밀번호 확인 후 변경됩니다.
                  </div>
                  {[
                    { label: '현재 비밀번호', key: 'currentPassword', placeholder: '현재 사용 중인 비밀번호' },
                    { label: '새 비밀번호', key: 'newPassword', placeholder: '6자 이상의 새 비밀번호' },
                    { label: '새 비밀번호 확인', key: 'confirmPassword', placeholder: '새 비밀번호를 다시 입력' },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label style={labelStyle}>{label}</label>
                      <input
                        type="password" value={pwForm[key] || ''} placeholder={placeholder}
                        onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = '#0284c7'}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 푸터 버튼 */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', background: '#f8fafc' }}>
              <button onClick={() => setProfileOpen(false)} style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                닫기
              </button>
              <button
                onClick={profileTab === 'info' ? handleSaveInfo : handleSavePw}
                disabled={profileSaving}
                style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #0284c7, #0d9488)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: profileSaving ? 0.7 : 1 }}
              >
                {profileSaving ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>저장 중...</> :
                  profileTab === 'info' ? <><i className="fa-solid fa-floppy-disk" style={{ marginRight: '6px' }}></i>기본정보 저장</> :
                    <><i className="fa-solid fa-key" style={{ marginRight: '6px' }}></i>비밀번호 변경</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .navbar-dropdown-container {
          position: relative;
          display: inline-block;
        }
        .navbar-dropdown-menu {
          display: none;
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          background-color: #ffffff;
          min-width: 230px;
          white-space: nowrap;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          z-index: 1050;
          padding: 6px 0;
          margin-top: 4px;
        }
        .navbar-dropdown-container:hover .navbar-dropdown-menu {
          display: block;
        }
        .dropdown-link {
          display: flex;
          align-items: center;
          padding: 10px 16px;
          color: var(--text-color);
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 500;
          white-space: nowrap;
          transition: background-color 0.2s, color 0.2s;
          text-align: left;
        }
        .dropdown-link:hover {
          background-color: rgba(2, 132, 199, 0.06);
          color: var(--accent);
        }
      `}</style>
    </>
  );
}
