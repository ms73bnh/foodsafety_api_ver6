"use client";

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

export default function DetailPage({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const prdlstReportNo = params.id;
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/detail/${encodeURIComponent(prdlstReportNo)}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) setData(result.data);
        else setError(result.error);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [prdlstReportNo]);

  if (loading) return <div className="container" style={{ textAlign: 'center', marginTop: '50px' }}>불러오는 중...</div>;
  if (error) return <div className="container" style={{ color: 'red' }}>오류 발생: {error}</div>;
  if (!data) return <div className="container">데이터를 찾을 수 없습니다.</div>;

  return (
    <main className="container animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <Link href="/search" className="btn" style={{ background: 'var(--table-header)', color: 'var(--text-color)', fontSize: '0.9rem', border: '1px solid var(--surface-border)' }}>
          ← 목록으로 돌아가기
        </Link>
      </div>
      
      <div className="glass-panel" style={{ marginTop: '24px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '8px', color: 'var(--primary)' }}>{data.prdlstNm}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>품목제조번호: {data.prdlstReportNo} / {data.bsshNm}</p>

        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--surface-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ width: '180px', padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>제품명</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.prdlstNm || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>신고번호</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.prdlstReportNo || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>업소명</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.bsshNm || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>허가일자</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.prmsDt || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--accent-secondary)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>소비기한</th>
                <td style={{ padding: '16px', color: 'var(--text-color)', fontWeight: 'bold' }}>{data.pogDaycnt || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>제형 (제품형태)</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.dispos || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--accent)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>기능성 내용</th>
                <td style={{ padding: '16px', color: 'var(--text-color)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{data.primaryFnclty || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--accent)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>정규화 성분</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>
                  {data.normalizedFunctionality ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {data.normalizedFunctionality.split(',').map((f, i) => (
                        <span key={i} className="badge badge-new" style={{ fontSize: '0.8rem' }}>{f.trim()}</span>
                      ))}
                    </div>
                  ) : '-'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>섭취량/섭취방법</th>
                <td style={{ padding: '16px', color: 'var(--text-color)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{data.ntkMthd || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>보존 및 유통기준</th>
                <td style={{ padding: '16px', color: 'var(--text-color)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{data.cstdyMthd || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>섭취시 주의사항</th>
                <td style={{ padding: '16px', color: 'var(--text-color)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{data.iftknAtntMatrCn || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>기준 및 규격</th>
                <td style={{ padding: '16px', color: 'var(--text-color)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{data.stdrStnd || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>제품형태명</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.prdtShapCdNm || '-'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>포장재질</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.frmlcMtrqlt || '-'}</td>
              </tr>
              <tr>
                <th style={{ padding: '16px', background: '#f8fafc', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>포장방법</th>
                <td style={{ padding: '16px', color: 'var(--text-color)' }}>{data.frmlcMthd || '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
