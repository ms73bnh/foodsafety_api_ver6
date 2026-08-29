"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const DEFAULT_ROLES = [
  { key: 'ADMIN', label: '관리자', color: '#1d4ed8' },
  { key: 'SALES', label: '영업담당자', color: '#c2410c' },
  { key: 'USER', label: '일반사용자', color: '#16a34a' }
];

export default function MenuManagePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [config, setConfig] = useState([]);
  const [msg, setMsg] = useState({ text: '', error: false });
  const [rebuildStatus, setRebuildStatus] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildLog, setRebuildLog] = useState([]);

  useEffect(() => {
    const init = async () => {
      const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
      if (!me.success || me.user?.role !== 'ADMIN') { router.push('/'); return; }
      const rolesRes = await fetch('/api/roles').then(r => r.json()).catch(() => ({ roles: DEFAULT_ROLES }));
      if (rolesRes.success && Array.isArray(rolesRes.roles)) {
        setRoles(rolesRes.roles);
      }
      const menuRes = await fetch('/api/menu-visibility').then(r => r.json()).catch(() => ({ config: [] }));
      setConfig(menuRes.config || []);
      const status = await fetch('/api/committee/rebuild').then(r => r.json()).catch(() => null);
      setRebuildStatus(status);
      setLoading(false);
    };
    init();
  }, [router]);

  const toggleEnabled = (key) => {
    setConfig(prev => prev.map(item => item.key === key ? { ...item, enabled: !item.enabled } : item));
  };

  const toggleRole = (key, role) => {
    setConfig(prev => prev.map(item => {
      if (item.key !== key) return item;
      const visibleTo = item.visibleTo.includes(role)
        ? item.visibleTo.filter(r => r !== role)
        : [...item.visibleTo, role];
      return { ...item, visibleTo };
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg({ text: '', error: false });
    try {
      const res = await fetch('/api/menu-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();
      if (json.success) setMsg({ text: '저장되었습니다. 사용자들의 메뉴가 즉시 변경됩니다.', error: false });
      else setMsg({ text: json.error || '저장 실패', error: true });
    } catch (e) {
      setMsg({ text: '네트워크 오류', error: true });
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!confirm('기본 설정으로 초기화하시겠습니까?')) return;
    const res = await fetch('/api/menu-visibility', { method: 'DELETE' });
    const json = await res.json();
    if (json.config) { setConfig(json.config); setMsg({ text: '기본값으로 초기화되었습니다.', error: false }); }
  };

  const handleRebuild = async () => {
    if (!confirm('모든 회의록을 재크롤링하고 PDF 내용을 추출합니다. 회의 수에 따라 수분이 소요됩니다. 진행하시겠습니까?')) return;
    setRebuilding(true);
    setRebuildLog([]);
    let offset = 0;
    let totalProcessed = 0;

    try {
      while (true) {
        const res = await fetch('/api/committee/rebuild', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: 3, offset, mode: 'missing' }),
        });
        const data = await res.json();
        if (data.error) {
          setRebuildLog(prev => [...prev, `오류: ${data.error}`]);
          break;
        }
        totalProcessed += data.processed || 0;
        if (data.results) {
          data.results.forEach(r => {
            setRebuildLog(prev => [...prev, `[${r.id}] ${r.title.substring(0, 30)}... | 본문:${r.hasRaw ? '✓' : '✗'} PDF:${r.hasPdf ? '✓' : '✗'}`]);
          });
        }
        if (data.done || data.processed === 0) {
          setRebuildLog(prev => [...prev, `완료! 총 ${totalProcessed}건 처리됨`]);
          break;
        }
        offset = data.nextOffset || (offset + 3);
        // 다음 배치 전 1초 대기 (API 부하 완화)
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      setRebuildLog(prev => [...prev, `오류: ${e.message}`]);
    }

    // 상태 갱신
    const status = await fetch('/api/committee/rebuild').then(r => r.json()).catch(() => null);
    setRebuildStatus(status);
    setRebuilding(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#0284c7' }}></i>
    </div>
  );

  const groups = [...new Set(config.map(i => i.group))];

  const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' };
  const h2Style = { fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <Link href="/manage" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.85rem' }}>
          <i className="fa-solid fa-arrow-left" style={{ marginRight: '6px' }}></i>시스템 관리
        </Link>
        <span style={{ color: '#cbd5e1' }}>/</span>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          <i className="fa-solid fa-bars" style={{ marginRight: '10px', color: '#0284c7' }}></i>메뉴 & 권한 관리
        </h1>
      </div>

      {/* 메뉴 가시성 설정 */}
      <div style={cardStyle}>
        <h2 style={h2Style}><i className="fa-solid fa-eye" style={{ color: '#0284c7' }}></i>메뉴 노출 설정</h2>
        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px' }}>
          체크 해제된 메뉴는 해당 권한의 사용자에게 표시되지 않습니다. 관리자(ADMIN) 전용 메뉴(시스템 관리)는 항상 노출됩니다.
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>메뉴</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>활성화</th>
              {roles.map(r => (
                <th key={r.key} style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', color: r.color || '#64748b', fontWeight: 600 }}>
                  {r.label}
                  <div style={{ fontSize: '0.68rem', fontWeight: 400, opacity: 0.8 }}>({r.key})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.map((item, idx) => (
              <tr key={item.key} style={{ borderBottom: '1px solid #f1f5f9', background: item.enabled ? '#fff' : '#fafafa', opacity: item.enabled ? 1 : 0.6 }}>
                <td style={{ padding: '10px 12px' }}>
                  {item.group && <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginRight: '6px' }}>└</span>}
                  <span style={{ fontWeight: item.group ? 400 : 600, color: '#0f172a' }}>{item.label}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '8px' }}>{item.path}</span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => toggleEnabled(item.key)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0284c7' }}
                    />
                  </label>
                </td>
                {roles.map(role => (
                  <td key={role.key} style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={item.visibleTo?.includes(role.key)}
                      disabled={!item.enabled}
                      onChange={() => toggleRole(item.key, role.key)}
                      style={{ width: '16px', height: '16px', cursor: item.enabled ? 'pointer' : 'default', accentColor: role.color || '#0284c7' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {msg.text && (
          <div style={{ marginTop: '16px', padding: '10px 14px', background: msg.error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${msg.error ? '#fca5a5' : '#86efac'}`, borderRadius: '8px', fontSize: '0.82rem', color: msg.error ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={handleReset} style={{ padding: '10px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
            기본값으로 초기화
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #0284c7, #0d9488)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>저장 중...</> : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: '6px' }}></i>설정 저장</>}
          </button>
        </div>
      </div>

      {/* 회의록 데이터 재구축 */}
      <div style={cardStyle}>
        <h2 style={h2Style}><i className="fa-solid fa-database" style={{ color: '#7c3aed' }}></i>심의위원회 데이터 재구축</h2>

        {rebuildStatus && (
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { label: '전체 회의', value: rebuildStatus.total, color: '#0284c7' },
              { label: '본문 있음', value: rebuildStatus.hasContent, color: '#16a34a' },
              { label: 'PDF 있음', value: rebuildStatus.hasPdf, color: '#7c3aed' },
              { label: '수집 필요', value: rebuildStatus.pending, color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: '1 1 120px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value ?? '-'}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '14px 18px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', fontSize: '0.8rem', color: '#713f12', marginBottom: '16px' }}>
          <strong>재구축 내용:</strong> 게시물 본문 텍스트(rawContent) 재수집과 PDF 첨부파일 텍스트 추출. 임베딩은 RAG 청킹 화면에서 배치 처리합니다.<br/>
          HWP 파일은 바이너리 포맷으로 추출 불가 (URL만 보관). 회의 수에 따라 수분 이상 소요될 수 있습니다.
        </div>

        <button onClick={handleRebuild} disabled={rebuilding} style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #7c3aed, #0284c7)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: rebuilding ? 0.7 : 1 }}>
          {rebuilding ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>재구축 진행 중...</> : <><i className="fa-solid fa-rotate" style={{ marginRight: '6px' }}></i>누락 데이터 재구축 시작</>}
        </button>

        {rebuildLog.length > 0 && (
          <div style={{ marginTop: '16px', background: '#0f172a', borderRadius: '8px', padding: '16px', maxHeight: '240px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>
            {rebuildLog.map((line, i) => (
              <div key={i} style={{ marginBottom: '4px', color: line.startsWith('완료') ? '#86efac' : line.startsWith('오류') ? '#fca5a5' : '#94a3b8' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
