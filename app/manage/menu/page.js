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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#0284c7' }}></i>
    </div>
  );

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
            {config.map((item) => (
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
    </div>
  );
}
