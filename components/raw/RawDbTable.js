"use client";

import { useState, useEffect, useCallback } from 'react';

// kind: 'declarations' (건강기능식품 I0490) | 'production' (생산실적 I0310)
const META = {
  declarations: {
    title: '건강기능식품 로우데이터',
    code: 'I0490',
    desc: '건강기능식품 품목제조신고',
    icon: 'fa-capsules',
    endpoint: '/api/data',
    exportType: 'declaration',
  },
  production: {
    title: '생산실적 로우데이터',
    code: 'I0310',
    desc: '건강기능식품 생산실적보고',
    icon: 'fa-industry',
    endpoint: '/api/production/raw',
    exportType: 'production',
  },
};

export default function RawDbTable({ kind = 'declarations' }) {
  const meta = META[kind];
  const rawSubTab = kind;
  const [rawData, setRawData] = useState([]);
  const [rawTotal, setRawTotal] = useState(0);
  const [rawPage, setRawPage] = useState(1);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawSearchQuery, setRawSearchQuery] = useState('');

  const fetchRawData = useCallback(async (page = rawPage, q = rawSearchQuery) => {
    setRawLoading(true);
    try {
      const res = await fetch(`${meta.endpoint}?page=${page}&limit=20&query=${encodeURIComponent(q)}`);
      const result = await res.json();
      if (result.success) {
        setRawData(result.data);
        setRawTotal(result.total);
      } else if (res.status === 403) {
        alert(result.error || '접근 권한이 없습니다.');
      }
    } catch (e) { console.error(e); }
    setRawLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.endpoint, rawPage]);

  useEffect(() => { fetchRawData(rawPage, rawSearchQuery); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rawPage, kind]);

  const handleRawSearch = (e) => {
    if (e.key === 'Enter') {
      if (rawPage === 1) fetchRawData(1, rawSearchQuery);
      else setRawPage(1);
    }
  };

  const handleRawExport = () => {
    window.location.href = `/api/export-raw?type=${meta.exportType}&q=${encodeURIComponent(rawSearchQuery)}`;
  };

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

  return (
         <div className="animate-fade-in">
            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
               <div>
                  <h3 style={{ color: 'var(--text-color)' }}><i className={`fa-solid ${meta.icon}`} style={{marginRight: '8px', color: 'var(--accent)'}}></i>{meta.title}</h3>
                  <p style={{ color: 'var(--text-muted)' }}>DB에 저장된 {meta.desc}({meta.code}) 원본 데이터를 조회·추출합니다. 총 <strong>{rawTotal.toLocaleString()}</strong>건</p>
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
  );
}
