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
  const [roles, setRoles] = useState([]);
  const [menuConfig, setMenuConfig] = useState(null); // null = 아직 로딩 안됨
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    const fetchMenuConfig = async () => {
      try {
        const res = await fetch('/api/menu-visibility');
        const data = await res.json();
        setMenuConfig(data.config || []);
      } catch (e) {
        setMenuConfig(null);
      }
    };
    const fetchRoles = async () => {
      try {
        const res = await fetch('/api/roles');
        const data = await res.json();
        if (data.success && Array.isArray(data.roles)) {
          setRoles(data.roles);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchMe();
    fetchMenuConfig();
    fetchRoles();
  }, [pathname, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // 메뉴 항목이 현재 사용자에게 표시되어야 하는지 확인
  const isMenuVisible = (key) => {
    if (!menuConfig) return true; // 로딩 전엔 기본 표시
    const item = menuConfig.find(m => m.key === key);
    if (!item) return true; // 설정 없으면 기본 표시
    if (!item.enabled) return false;
    const role = user?.role || 'GUEST';
    return item.visibleTo.includes(role);
  };

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

  const mobileMenuSections = [
    {
      title: '메인',
      items: [
        isMenuVisible('dashboard') && { href: '/', label: '대시보드', icon: 'fa-chart-line', active: pathname === '/' },
        isMenuVisible('production') && { href: '/production', label: '생산 실적 분석', icon: 'fa-boxes-stacked', active: pathname.startsWith('/production'), color: '#0d9488' },
        isMenuVisible('analytics') && { href: '/analytics', label: '통합 분석 레포트', icon: 'fa-chart-pie', active: pathname === '/analytics', color: '#0284c7' },
      ].filter(Boolean),
    },
    {
      title: '데이터 검색',
      items: [
        isMenuVisible('search') && { href: '/search', label: '건강기능식품 검색', icon: 'fa-capsules', active: pathname === '/search' },
        isMenuVisible('general-search') && { href: '/general-search', label: '일반식품 검색', icon: 'fa-bowl-food', active: pathname === '/general-search', color: '#6366f1' },
      ].filter(Boolean),
    },
    {
      title: '업체',
      items: [
        isMenuVisible('companies') && { href: '/companies', label: '업체별 현황', icon: 'fa-building', active: pathname === '/companies' },
        isMenuVisible('companies-compare') && { href: '/companies/compare', label: '업체 상호 비교', icon: 'fa-code-compare', active: pathname === '/companies/compare' },
      ].filter(Boolean),
    },
    {
      title: '개별인정형',
      items: [
        isMenuVisible('categories') && { href: '/categories', label: '기능성 카테고리', icon: 'fa-tags', active: pathname === '/categories', color: '#7c3aed' },
        isMenuVisible('ingredients') && { href: '/ingredients', label: '개별인정원료', icon: 'fa-flask', active: pathname === '/ingredients', color: '#0d9488' },
        isMenuVisible('guidelines') && { href: '/guidelines', label: '기능성 평가 가이드라인', icon: 'fa-book-bookmark', active: pathname === '/guidelines' },
        isMenuVisible('raw-materials') && { href: '/raw-materials', label: '원료별 정보 공시', icon: 'fa-flask-vial', active: pathname === '/raw-materials', color: '#059669' },
        isMenuVisible('committee') && { href: '/committee', label: '심의위원회 회의록 (AI Q&A)', icon: 'fa-robot', active: pathname === '/committee' },
      ].filter(Boolean),
    },
    {
      title: '기타',
      items: [
        isMenuVisible('qna') && { href: '/qna', label: 'Q&A', icon: 'fa-comments', active: pathname === '/qna' },
        isAdminUser && { href: '/manage', label: '시스템 관리', icon: 'fa-database', active: pathname.startsWith('/manage') },
      ].filter(Boolean),
    },
  ].filter(section => section.items.length > 0);


  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', background: '#fff' };
  const labelStyle = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container" style={{ maxWidth: '1600px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            title="메뉴 열기"
            aria-label="메뉴 열기"
          >
            <i className="fa-solid fa-bars"></i>
          </button>

          <Link
            href="/"
            className="navbar-brand"
            style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
          >
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #0d9488, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
              <i className="fa-solid fa-leaf"></i>
            </div>
            건강기능식품 데이터 인사이트
          </Link>

          <div className="desktop-nav-menu" style={{ display: 'flex', gap: '6px', margin: '0 20px', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {isMenuVisible('dashboard') && (
              <Link href="/" className={`navbar-item ${pathname === '/' ? 'active' : ''}`}><i className="fa-solid fa-chart-line" style={{ marginRight: '6px' }}></i>대시보드</Link>
            )}
            {(isMenuVisible('search') || isMenuVisible('general-search')) && (
              <div className="navbar-dropdown-container">
                <span className={`navbar-item dropdown-trigger ${pathname === '/search' || pathname === '/general-search' ? 'active' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ marginRight: '6px' }}></i>데이터 검색<i className="fa-solid fa-chevron-down" style={{ marginLeft: '4px', fontSize: '0.65rem' }}></i>
                </span>
                <div className="navbar-dropdown-menu">
                  {isMenuVisible('search') && (
                    <Link href="/search" className="dropdown-link">
                      <i className="fa-solid fa-capsules" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>건강기능식품 검색
                    </Link>
                  )}
                  {isMenuVisible('general-search') && (
                    <Link href="/general-search" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                      <i className="fa-solid fa-bowl-food" style={{ marginRight: '6px', color: '#6366f1' }}></i>일반식품 검색
                    </Link>
                  )}
                </div>
              </div>
            )}
            {(isMenuVisible('companies') || isMenuVisible('companies-compare')) && (
              <div className="navbar-dropdown-container">
                <span className={`navbar-item dropdown-trigger ${pathname.startsWith('/companies') ? 'active' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  <i className="fa-solid fa-building" style={{ marginRight: '6px' }}></i>업체별 정보<i className="fa-solid fa-chevron-down" style={{ marginLeft: '4px', fontSize: '0.65rem' }}></i>
                </span>
                <div className="navbar-dropdown-menu">
                  {isMenuVisible('companies') && (
                    <Link href="/companies" className="dropdown-link">
                      <i className="fa-solid fa-building" style={{ marginRight: '6px', color: '#0284c7' }}></i>업체별 현황
                    </Link>
                  )}
                  {isMenuVisible('companies-compare') && (
                    <Link href="/companies/compare" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                      <i className="fa-solid fa-code-compare" style={{ marginRight: '6px', color: 'var(--accent)' }}></i>업체 상호 비교
                    </Link>
                  )}
                </div>
              </div>
            )}
            {isMenuVisible('production') && (
              <Link href="/production" className={`navbar-item ${pathname.startsWith('/production') ? 'active' : ''}`} style={{ color: '#0d9488' }}><i className="fa-solid fa-boxes-stacked" style={{ marginRight: '6px' }}></i>생산 실적 분석</Link>
            )}
            {isMenuVisible('analytics') && (
              <Link href="/analytics" className={`navbar-item ${pathname === '/analytics' ? 'active' : ''}`} style={{ color: '#0284c7', fontWeight: 700 }}><i className="fa-solid fa-chart-pie" style={{ marginRight: '6px' }}></i>통합 분석 레포트</Link>
            )}
            {(isMenuVisible('categories') || isMenuVisible('ingredients') || isMenuVisible('guidelines') || isMenuVisible('raw-materials') || isMenuVisible('committee')) && (
              <div className="navbar-dropdown-container">
                <span className={`navbar-item dropdown-trigger ${pathname === '/categories' || pathname === '/ingredients' || pathname === '/guidelines' || pathname === '/raw-materials' || pathname === '/committee' ? 'active' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  <i className="fa-solid fa-flask" style={{ marginRight: '6px' }}></i>개별인정형<i className="fa-solid fa-chevron-down" style={{ marginLeft: '4px', fontSize: '0.65rem' }}></i>
                </span>
                <div className="navbar-dropdown-menu">
                  {isMenuVisible('categories') && (
                    <Link href="/categories" className="dropdown-link">
                      <i className="fa-solid fa-tags" style={{ marginRight: '6px', color: '#7c3aed' }}></i>기능성 카테고리
                    </Link>
                  )}
                  {isMenuVisible('ingredients') && (
                    <Link href="/ingredients" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                      <i className="fa-solid fa-flask" style={{ marginRight: '6px', color: '#0d9488' }}></i>개별인정원료
                    </Link>
                  )}
                  {isMenuVisible('guidelines') && (
                    <Link href="/guidelines" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                      <i className="fa-solid fa-book-bookmark" style={{ marginRight: '6px', color: '#0284c7' }}></i>기능성 평가 가이드라인
                    </Link>
                  )}
                  {isMenuVisible('raw-materials') && (
                    <Link href="/raw-materials" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9' }}>
                      <i className="fa-solid fa-flask-vial" style={{ marginRight: '6px', color: '#059669' }}></i>원료별 정보 공시
                    </Link>
                  )}
                  {isMenuVisible('committee') && (
                    <Link href="/committee" className="dropdown-link" style={{ borderTop: '1px solid #f1f5f9', background: '#f0fdfa' }}>
                      <i className="fa-solid fa-robot" style={{ marginRight: '6px', color: '#0284c7' }}></i>심의위원회 회의록 (AI Q&A)
                    </Link>
                  )}
                </div>
              </div>
            )}
            {isMenuVisible('qna') && (
              <Link href="/qna" className={`navbar-item ${pathname === '/qna' ? 'active' : ''}`}>
                <i className="fa-solid fa-comments" style={{ marginRight: '6px', color: '#0284c7' }}></i>Q&A
              </Link>
            )}
            {isAdminUser && (
              <Link href="/manage" className={`navbar-item ${pathname.startsWith('/manage') ? 'active' : ''}`} style={{ fontWeight: 'bold', background: 'rgba(2, 132, 199, 0.06)' }}>
                <i className="fa-solid fa-database" style={{ marginRight: '6px' }}></i>시스템 관리
              </Link>
            )}
          </div>

          <div className="navbar-user-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
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

      {mobileMenuOpen && (
        <div className="mobile-menu-layer">
          <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <aside className="mobile-menu-drawer" aria-label="모바일 메뉴">
            <div className="mobile-menu-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #0d9488, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  <i className="fa-solid fa-leaf"></i>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>데이터 인사이트</div>
                  {user && <div style={{ color: '#64748b', fontSize: '0.74rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name} · {user.companyNm || user.role}</div>}
                </div>
              </div>
              <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)} title="메뉴 닫기" aria-label="메뉴 닫기">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="mobile-menu-content">
              {mobileMenuSections.map(section => (
                <section key={section.title} className="mobile-menu-section">
                  <div className="mobile-menu-section-title">{section.title}</div>
                  {section.items.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`mobile-menu-link ${item.active ? 'active' : ''}`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <i className={`fa-solid ${item.icon}`} style={{ color: item.color || '#0284c7' }}></i>
                      <span>{item.label}</span>
                      {item.active && <i className="fa-solid fa-check" style={{ marginLeft: 'auto', color: '#0d9488', fontSize: '0.76rem' }}></i>}
                    </Link>
                  ))}
                </section>
              ))}
            </div>

            <div className="mobile-menu-footer">
              {user ? (
                <>
                  <button onClick={() => { setMobileMenuOpen(false); openProfile(); }} className="mobile-menu-footer-button">
                    <i className="fa-solid fa-user"></i>
                    내 프로필
                  </button>
                  <button onClick={handleLogout} className="mobile-menu-footer-button danger">
                    <i className="fa-solid fa-right-from-bracket"></i>
                    로그아웃
                  </button>
                </>
              ) : (
                !loading && <Link href="/login" className="mobile-menu-footer-button" onClick={() => setMobileMenuOpen(false)}><i className="fa-solid fa-lock"></i> 로그인</Link>
              )}
            </div>
          </aside>
        </div>
      )}

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
                    {(() => {
                      const roleObj = roles.find(r => r.key === user?.role);
                      const label = roleObj ? roleObj.label : (user?.role === 'ADMIN' ? '관리자' : user?.role === 'SALES' ? '영업담당자' : '일반 사용자');
                      const color = roleObj?.color || (user?.role === 'ADMIN' ? '#1d4ed8' : user?.role === 'SALES' ? '#c2410c' : '#16a34a');
                      return (
                        <span style={{ display: 'inline-block', padding: '2px 8px', background: `${color}18`, color: color, border: `1px solid ${color}44`, borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, marginTop: '4px' }}>
                          {label}
                        </span>
                      );
                    })()}
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
        .mobile-menu-button {
          display: none;
          width: 38px;
          height: 38px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          color: #0f172a;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1rem;
        }
        .mobile-menu-layer {
          position: fixed;
          inset: 0;
          z-index: 10000;
        }
        .mobile-menu-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.38);
          backdrop-filter: blur(2px);
        }
        .mobile-menu-drawer {
          position: relative;
          width: min(86vw, 340px);
          height: 100vh;
          background: #fff;
          box-shadow: 12px 0 36px rgba(15, 23, 42, 0.22);
          display: flex;
          flex-direction: column;
          animation: mobileMenuIn 0.2s ease-out;
        }
        @keyframes mobileMenuIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .mobile-menu-header {
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: #f8fafc;
        }
        .mobile-menu-close {
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 9px;
          background: #e2e8f0;
          color: #475569;
          cursor: pointer;
          flex-shrink: 0;
        }
        .mobile-menu-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        .mobile-menu-section {
          padding: 8px 0 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .mobile-menu-section:last-child {
          border-bottom: none;
        }
        .mobile-menu-section-title {
          color: #94a3b8;
          font-size: 0.72rem;
          font-weight: 800;
          padding: 0 8px 6px;
        }
        .mobile-menu-link {
          min-height: 44px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          color: #334155;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 700;
        }
        .mobile-menu-link.active {
          background: #f0fdfa;
          color: #0f766e;
        }
        .mobile-menu-footer {
          border-top: 1px solid #e2e8f0;
          padding: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          background: #f8fafc;
        }
        .mobile-menu-footer-button {
          min-height: 40px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #fff;
          color: #334155;
          font-size: 0.82rem;
          font-weight: 800;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
        }
        .mobile-menu-footer-button.danger {
          color: #dc2626;
        }
        @media (max-width: 768px) {
          .mobile-menu-button {
            display: inline-flex;
            flex-shrink: 0;
          }
          .desktop-nav-menu {
            display: none !important;
          }
          .navbar-brand {
            flex: 1;
            min-width: 0;
            font-size: 0.9rem !important;
          }
          .navbar-brand > div {
            width: 30px !important;
            height: 30px !important;
          }
          .navbar-user-actions {
            gap: 8px !important;
          }
          .navbar-user-actions .sync-btn {
            display: none !important;
          }
          .navbar-user-actions > div > div:first-child {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
