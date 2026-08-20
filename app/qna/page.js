"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const CATEGORIES = ['전체', '일반문의', '데이터수정요청', '시스템오류', '기타'];

export default function QnAPage() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [category, setCategory] = useState('전체');
  const [status, setStatus] = useState(''); // '', 'pending', 'answered'
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // 모달 상태
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPost, setDetailPost] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState(null); // { id, title }
  const [inputPassword, setInputPassword] = useState('');

  // 작성 폼
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: '일반문의',
    authorName: '',
    authorCompany: '',
    isSecret: false,
    password: ''
  });
  const [saving, setSaving] = useState(false);

  // 관리자 답변 폼
  const [answerText, setAnswerText] = useState('');
  const [answering, setAnswering] = useState(false);

  // 사용자 정보 조회
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          setUser(data.user);
          setForm(prev => ({
            ...prev,
            authorName: data.user.name,
            authorCompany: data.user.companyNm
          }));
        }
      })
      .catch(() => {});
  }, []);

  // 검색어 디바운스
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // 게시글 목록 가져오기
  const fetchPosts = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: p.toString(),
        limit: limit.toString(),
        category: category !== '전체' ? category : '',
        status,
        search: debouncedSearch
      });
      const res = await fetch(`/api/qna?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
        setTotal(data.total);
        setPage(p);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [category, status, debouncedSearch, limit]);

  useEffect(() => {
    fetchPosts(1);
  }, [fetchPosts]);

  // 상세 보기 열기
  const handleOpenDetail = async (post, password = '') => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const url = password 
        ? `/api/qna/${post.id}?password=${encodeURIComponent(password)}` 
        : `/api/qna/${post.id}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setDetailPost(json.data);
        setAnswerText(json.data.answer || '');
        setPasswordPrompt(null);
        setInputPassword('');
      } else {
        if (json.isSecret) {
          setDetailOpen(false);
          setPasswordPrompt({ id: post.id, title: post.title });
        } else {
          alert(json.error || '조회 실패');
          setDetailOpen(false);
        }
      }
    } catch (e) {
      alert('오류가 발생했습니다: ' + e.message);
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // 질문 등록
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/qna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (json.success) {
        alert('문의가 등록되었습니다.');
        setCreateOpen(false);
        setForm({
          title: '',
          content: '',
          category: '일반문의',
          authorName: user?.name || '',
          authorCompany: user?.companyNm || '',
          isSecret: false,
          password: ''
        });
        fetchPosts(1);
      } else {
        alert(json.error || '등록 실패');
      }
    } catch (e) {
      alert('네트워크 오류');
    } finally {
      setSaving(false);
    }
  };

  // 관리자 답변 등록
  const handleAnswerSubmit = async () => {
    if (!detailPost) return;
    setAnswering(true);
    try {
      const res = await fetch(`/api/qna/${detailPost.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'answer', answer: answerText })
      });
      const json = await res.json();
      if (json.success) {
        alert('답변이 저장되었습니다.');
        setDetailPost(json.data);
        fetchPosts(page);
      } else {
        alert(json.error || '답변 저장 실패');
      }
    } catch (e) {
      alert('네트워크 오류');
    } finally {
      setAnswering(false);
    }
  };

  // 글 삭제
  const handleDelete = async () => {
    if (!detailPost || !confirm('이 문의글을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/qna/${detailPost.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        alert('삭제되었습니다.');
        setDetailOpen(false);
        setDetailPost(null);
        fetchPosts(page);
      } else {
        alert(json.error || '삭제 실패');
      }
    } catch (e) {
      alert('오류 발생');
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const isAdmin = user && user.role === 'ADMIN';

  return (
    <main className="container animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="title-gradient" style={{ margin: '0 0 6px', fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-comments" style={{ color: '#0284c7' }}></i> Q&A 문의 / 요청 게시판
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
            식품안전 데이터 문의, 시스템 수정 요청, 기타 의견을 자유롭게 남겨주세요.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #0284c7, #0d9488)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)'
          }}
        >
          <i className="fa-solid fa-pen-to-square"></i> 문의 작성하기
        </button>
      </div>

      {/* 필터 및 검색 바 */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {/* 카테고리 탭 */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: category === cat ? '#0284c7' : '#e2e8f0',
                  background: category === cat ? 'linear-gradient(135deg, #0284c7, #0d9488)' : '#fff',
                  color: category === cat ? '#fff' : '#64748b',
                  fontSize: '0.85rem',
                  fontWeight: category === cat ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 답변 상태 및 검색 */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '0.85rem',
                outline: 'none',
                background: '#fff'
              }}
            >
              <option value="">전체 상태</option>
              <option value="pending">답변 대기</option>
              <option value="answered">답변 완료</option>
            </select>

            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
              <input
                type="text"
                placeholder="제목, 내용, 작성자 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  padding: '8px 14px 8px 34px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.85rem',
                  width: '220px',
                  outline: 'none',
                  background: '#fff'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 게시글 목록 테이블 */}
      <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
              <th style={{ padding: '14px 16px', width: '70px', textAlign: 'center' }}>번호</th>
              <th style={{ padding: '14px 16px', width: '130px' }}>카테고리</th>
              <th style={{ padding: '14px 16px' }}>제목</th>
              <th style={{ padding: '14px 16px', width: '130px' }}>작성자</th>
              <th style={{ padding: '14px 16px', width: '110px', textAlign: 'center' }}>상태</th>
              <th style={{ padding: '14px 16px', width: '110px', textAlign: 'center' }}>등록일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> 목록을 불러오는 중입니다...
                </td>
              </tr>
            ) : posts.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8' }}>
                  <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}></i>
                  등록된 문의가 없습니다.
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr
                  key={post.id}
                  onClick={() => handleOpenDetail(post)}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>{post.id}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: post.category === '데이터수정요청' ? '#eff6ff' : post.category === '시스템오류' ? '#fef2f2' : '#f0fdf4',
                      color: post.category === '데이터수정요청' ? '#1d4ed8' : post.category === '시스템오류' ? '#dc2626' : '#16a34a'
                    }}>
                      {post.category}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>
                    {post.isSecret && (
                      <i className="fa-solid fa-lock" style={{ color: '#eab308', marginRight: '6px', fontSize: '0.8rem' }}></i>
                    )}
                    {post.title}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#64748b' }}>
                    {post.authorName} {post.authorCompany ? <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({post.authorCompany})</span> : null}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    {post.isAnswered ? (
                      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 700 }}>
                        <i className="fa-solid fa-check" style={{ marginRight: '3px' }}></i>답변완료
                      </span>
                    ) : (
                      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '12px', background: '#fef3c7', color: '#b45309', fontSize: '0.75rem', fontWeight: 700 }}>
                        답변대기
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 페이징 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '18px', borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={() => fetchPosts(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
            >
              이전
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => fetchPosts(p)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: page === p ? '#0284c7' : '#e2e8f0',
                  background: page === p ? '#0284c7' : '#fff',
                  color: page === p ? '#fff' : '#475569',
                  fontWeight: page === p ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => fetchPosts(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* ─── 새 문의 작성 모달 ─── */}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)' }} onClick={() => setCreateOpen(false)} />
          <div style={{ position: 'relative', width: '600px', maxWidth: '92vw', background: '#fff', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                <i className="fa-solid fa-pen-to-square" style={{ marginRight: '8px', color: '#0284c7' }}></i> 새 문의 작성
              </h3>
              <button onClick={() => setCreateOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>카테고리</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                  >
                    {CATEGORIES.filter(c => c !== '전체').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>작성자</label>
                  <input
                    type="text"
                    value={form.authorName}
                    onChange={e => setForm({ ...form, authorName: e.target.value })}
                    placeholder="이름 (익명 가능)"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>제목 *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="문의할 내용의 제목을 입력해주세요"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>내용 *</label>
                <textarea
                  required
                  rows="5"
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  placeholder="상세 문의 내용을 작성해주세요..."
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', resize: 'vertical' }}
                ></textarea>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', flexWrap: 'nowrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.isSecret}
                    onChange={e => setForm({ ...form, isSecret: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>🔒 비밀글 설정</span>
                </label>
                {form.isSecret && !user && (
                  <input
                    type="password"
                    placeholder="비밀글 조회용 비밀번호"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  style={{ padding: '10px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '10px 22px', border: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #0284c7, #0d9488)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {saving ? '등록 중...' : '문의 등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 비밀글 비밀번호 입력 모달 ─── */}
      {passwordPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.5)' }} onClick={() => setPasswordPrompt(null)} />
          <div style={{ position: 'relative', width: '380px', background: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', zIndex: 1 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem', color: '#0f172a' }}>🔒 비밀글 확인</h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 16px' }}>작성 시 설정한 비밀번호를 입력해주세요.</p>
            <input
              type="password"
              placeholder="비밀번호 입력"
              value={inputPassword}
              onChange={e => setInputPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleOpenDetail(passwordPrompt, inputPassword); }}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px', outline: 'none' }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setPasswordPrompt(null)} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>취소</button>
              <button onClick={() => handleOpenDetail(passwordPrompt, inputPassword)} style={{ padding: '8px 18px', border: 'none', borderRadius: '6px', background: '#0284c7', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 상세 보기 드로어 ─── */}
      {detailOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setDetailOpen(false)} />
          <div style={{ position: 'relative', width: '560px', maxWidth: '95vw', height: '100vh', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', zIndex: 1 }}>
            {/* 드로어 헤더 */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', marginBottom: '6px' }}>
                  {detailPost?.category}
                </span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                  {detailPost?.isSecret && <i className="fa-solid fa-lock" style={{ color: '#eab308', marginRight: '6px' }}></i>}
                  {detailPost?.title}
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  작성자: <strong style={{ color: '#475569' }}>{detailPost?.authorName}</strong> {detailPost?.authorCompany ? `(${detailPost?.authorCompany})` : ''} · {detailPost?.createdAt ? new Date(detailPost.createdAt).toLocaleString() : ''}
                </p>
              </div>
              <button onClick={() => setDetailOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* 드로어 바디 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i> 로딩 중...
                </div>
              ) : (
                <>
                  {/* 질문 내용 */}
                  <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.9rem', color: '#334155' }}>
                    {detailPost?.content}
                  </div>

                  {/* 관리자 답변 영역 */}
                  <div style={{ borderTop: '2px dashed #e2e8f0', paddingTop: '20px' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="fa-solid fa-reply-all" style={{ color: '#0d9488' }}></i> 관리자 답변
                    </h4>

                    {detailPost?.isAnswered ? (
                      <div style={{ background: '#f0fdf4', padding: '18px', borderRadius: '10px', border: '1px solid #86efac', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.9rem', color: '#166534' }}>
                        <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 700, marginBottom: '8px' }}>
                          ✓ {detailPost.answeredBy || '관리자'} ({detailPost.answeredAt ? new Date(detailPost.answeredAt).toLocaleString() : ''})
                        </div>
                        {detailPost.answer}
                      </div>
                    ) : (
                      <div style={{ padding: '20px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.85rem', textAlign: 'center' }}>
                        <i className="fa-solid fa-hourglass-half" style={{ marginRight: '6px' }}></i> 관리자의 답변을 준비 중입니다.
                      </div>
                    )}

                    {/* 관리자 전용 답변 작성/수정 폼 */}
                    {isAdmin && (
                      <div style={{ marginTop: '16px', padding: '16px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '6px' }}>
                          <i className="fa-solid fa-shield-halved" style={{ marginRight: '4px' }}></i> 관리자 답변 작성 및 수정
                        </label>
                        <textarea
                          rows="4"
                          value={answerText}
                          onChange={e => setAnswerText(e.target.value)}
                          placeholder="답변 내용을 작성해주세요..."
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #93c5fd', fontSize: '0.85rem', outline: 'none', background: '#fff', marginBottom: '10px' }}
                        ></textarea>
                        <button
                          onClick={handleAnswerSubmit}
                          disabled={answering}
                          style={{ padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                        >
                          {answering ? '저장 중...' : '답변 저장하기'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 드로어 푸터 */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {(isAdmin || (user && user.id === detailPost?.authorId)) && (
                <button
                  onClick={handleDelete}
                  style={{ padding: '8px 14px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  <i className="fa-solid fa-trash-can" style={{ marginRight: '6px' }}></i>삭제
                </button>
              )}
              <button
                onClick={() => setDetailOpen(false)}
                style={{ marginLeft: 'auto', padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
