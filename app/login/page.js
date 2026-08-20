"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true); // true = Login, false = Register

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [companyNm, setCompanyNm] = useState('');
  const [deptNm, setDeptNm] = useState('');
  const [positionNm, setPositionNm] = useState('');
  const [titleNm, setTitleNm] = useState('');

  // UI State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 이미 로그인된 사용자인지 확인
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.success && data.user) {
          router.push('/'); // 대시보드로 이동
        }
      } catch (err) {
        // 무시
      }
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return setErrorMsg('아이디와 비밀번호를 입력해주세요.');

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg('로그인 성공! 대시보드로 이동합니다.');
        sessionStorage.setItem('welcome_user', data.user?.name || data.user?.username || '');
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        setErrorMsg(data.error || '로그인에 실패했습니다.');
      }
    } catch (err) {
      setErrorMsg('네트워크 요쳥 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    // 유효성 검사
    if (!username || !password || !passwordConfirm || !name || !companyNm || !deptNm || !positionNm || !titleNm) {
      return setErrorMsg('모든 필수 항목을 입력해주세요.');
    }

    if (password !== passwordConfirm) {
      return setErrorMsg('비밀번호가 일치하지 않습니다.');
    }

    if (password.length < 4) {
      return setErrorMsg('비밀번호는 최소 4자 이상이어야 합니다.');
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          name,
          companyNm,
          deptNm,
          positionNm,
          titleNm
        })
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg('가입 신청 완료! 관리자 승인 후 로그인하실 수 있습니다.');
        // 폼 초기화
        setUsername('');
        setPassword('');
        setPasswordConfirm('');
        setName('');
        setCompanyNm('');
        setDeptNm('');
        setPositionNm('');
        setTitleNm('');
        // 로그인 폼으로 스위칭
        setTimeout(() => {
          setIsLogin(true);
          setSuccessMsg('');
        }, 4000);
      } else {
        setErrorMsg(data.error || '가입 신청 중 오류가 발생했습니다.');
      }
    } catch (err) {
      setErrorMsg('네트워크 요청 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card glass-panel animate-fade-in">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #0d9488, #0284c7)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', marginBottom: '12px', boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)' }}>
            <i className="fa-solid fa-shield-halved fa-lg"></i>
          </div>
          <h2 className="title-gradient" style={{ fontSize: '1.6rem', marginBottom: '4px' }}>
            건강기능식품 데이터 인사이트
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {isLogin ? '계정에 로그인하여 서비스를 이용하세요.' : '신규 사용자의 가입 신청을 진행합니다.'}
          </p>
        </div>

        {errorMsg && (
          <div className="alert alert-danger" style={{ marginBottom: '16px', padding: '12px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', color: '#b91c1c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: '16px', padding: '12px', background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '8px', color: '#15803d', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-circle-check"></i>
            <div>{successMsg}</div>
          </div>
        )}

        {isLogin ? (
          /* 로그인 폼 */
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label>아이디</label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                placeholder="아이디를 입력하세요" 
                required 
              />
            </div>
            <div>
              <label>비밀번호</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="비밀번호를 입력하세요" 
                required 
              />
            </div>
            <button 
              type="submit" 
              className="btn sync-btn" 
              style={{ width: '100%', padding: '14px', borderRadius: '10px', marginTop: '8px', display: 'flex', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : '로그인'}
            </button>
          </form>
        ) : (
          /* 회원가입 폼 */
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label>아이디</label>
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder="사용할 ID" 
                  required 
                />
              </div>
              <div>
                <label>성명</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="사용자 실명" 
                  required 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label>비밀번호</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="4자 이상" 
                  required 
                />
              </div>
              <div>
                <label>비밀번호 확인</label>
                <input 
                  type="password" 
                  value={passwordConfirm} 
                  onChange={(e) => setPasswordConfirm(e.target.value)} 
                  placeholder="비밀번호 재입력" 
                  required 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label>회사명</label>
                <input 
                  type="text" 
                  value={companyNm} 
                  onChange={(e) => setCompanyNm(e.target.value)} 
                  placeholder="예: 그린푸드" 
                  required 
                />
              </div>
              <div>
                <label>부서명</label>
                <input 
                  type="text" 
                  value={deptNm} 
                  onChange={(e) => setDeptNm(e.target.value)} 
                  placeholder="예: 품질관리부" 
                  required 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label>직급</label>
                <input 
                  type="text" 
                  value={positionNm} 
                  onChange={(e) => setPositionNm(e.target.value)} 
                  placeholder="예: 대리" 
                  required 
                />
              </div>
              <div>
                <label>직책</label>
                <input 
                  type="text" 
                  value={titleNm} 
                  onChange={(e) => setTitleNm(e.target.value)} 
                  placeholder="예: 담당자" 
                  required 
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn sync-btn" 
              style={{ width: '100%', padding: '14px', borderRadius: '10px', marginTop: '12px', display: 'flex', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : '가입 신청하기'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>
            {isLogin ? '처음이신가요?' : '이미 계정이 있으신가요?'}
          </span>
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); setSuccessMsg(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? '회원가입 신청' : '로그인으로 돌아가기'}
          </button>
        </div>

        {isLogin && (
          <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-lock" style={{ marginRight: '5px', opacity: 0.6 }}></i>
            비밀번호를 잊으셨나요?{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>문의 : 조민식 과장</span>
          
          </div>
        )}
      </div>

      <style jsx>{`
        .login-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: calc(100vh - 120px);
          padding: 20px;
        }
        .login-card {
          width: 100%;
          max-width: 460px;
          background: #ffffff;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
          border: 1px solid var(--surface-border);
          padding: 36px;
        }
        .login-card:hover {
          transform: none; /* 로그인 카드에선 이동 애니메이션 배제 */
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
          border-color: var(--surface-border);
        }
      `}</style>
    </div>
  );
}
