"use client";

import { useState, useEffect } from 'react';
import { downloadGeneralExport, getGeneralExportKey } from '@/lib/generalDownload';

// 일반식품 로우데이터 (I1250)
export default function RawGeneralTable() {
  const [rawGeneralData, setRawGeneralData] = useState([]);
  const [rawGeneralTotal, setRawGeneralTotal] = useState(0);
  const [rawGeneralPage, setRawGeneralPage] = useState(1);
  const [rawGeneralLoading, setRawGeneralLoading] = useState(false);
  const [rawGeneralSearchQuery, setRawGeneralSearchQuery] = useState('');
  const [rawGeneralExportState, setRawGeneralExportState] = useState({ active: false, message: '' });
  const [rawGeneralExportResume, setRawGeneralExportResume] = useState({});

  const fetchRawGeneralData = async (page = rawGeneralPage, q = rawGeneralSearchQuery) => {
    setRawGeneralLoading(true);
    try {
      const res = await fetch(`/api/data-general?page=${page}&limit=20&integrated=${encodeURIComponent(q)}`);
      const result = await res.json();
      if (result.success) {
        setRawGeneralData(result.data);
        setRawGeneralTotal(result.total);
      } else if (res.status === 403) {
        alert(result.error || '접근 권한이 없습니다.');
      }
    } catch (e) { console.error(e); }
    setRawGeneralLoading(false);
  };

  useEffect(() => { fetchRawGeneralData(rawGeneralPage, rawGeneralSearchQuery); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rawGeneralPage]);

  const handleRawGeneralSearch = (e) => {
    if (e.key === 'Enter') {
      if (rawGeneralPage === 1) fetchRawGeneralData(1, rawGeneralSearchQuery);
      else setRawGeneralPage(1);
    }
  };

  const totalGeneralPages = Math.ceil(rawGeneralTotal / 20);

  const handleRawGeneralExport = async () => {
    if (rawGeneralExportState.active) return;

    const filters = { integrated: rawGeneralSearchQuery, sort: 'prmsDt_desc' };
    const format = 'xlsx';
    const key = getGeneralExportKey(filters, format);
    const resumeOffset = rawGeneralExportResume[key] || 0;

    setRawGeneralExportState({
      active: true,
      message: resumeOffset > 0
        ? `${resumeOffset.toLocaleString()}행부터 이어받는 중...`
        : 'Excel 다운로드 준비 중...',
    });

    try {
      const result = await downloadGeneralExport({
        filters,
        format,
        resumeOffset,
        onProgress: ({ offset, total, fileIndex }) => {
          setRawGeneralExportState({
            active: true,
            message: `${fileIndex}번째 Excel 파일 다운로드 중 (${offset.toLocaleString()} / ${total.toLocaleString()}행)`,
          });
        },
        onResumeOffset: (offset) => {
          setRawGeneralExportResume(prev => {
            if (!offset) {
              const next = { ...prev };
              delete next[key];
              return next;
            }
            return { ...prev, [key]: offset };
          });
        },
      });

      setRawGeneralExportState({
        active: false,
        message: `${result.fileCount.toLocaleString()}개 Excel 파일, 총 ${result.total.toLocaleString()}행 다운로드를 완료했습니다.`,
      });
    } catch (error) {
      setRawGeneralExportState({
        active: false,
        message: `실패 지점이 저장되었습니다. 다시 누르면 이어받습니다. (${error.message})`,
      });
      alert(error.message);
    }
  };

  return (
         <div className="animate-fade-in">
            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
               <div>
                  <h3 style={{ color: 'var(--text-color)' }}><i className="fa-solid fa-wheat-awn" style={{ marginRight: '8px', color: 'var(--accent)' }}></i>일반식품 로우데이터</h3>
                  <p style={{ color: 'var(--text-muted)' }}>DB에 저장된 일반식품 품목제조보고(I1250) 원본 데이터를 조회·추출합니다. 총 <strong>{rawGeneralTotal.toLocaleString()}</strong>건</p>
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
                  <button onClick={handleRawGeneralExport} disabled={rawGeneralExportState.active} className="btn sync-btn" style={{ opacity: rawGeneralExportState.active ? 0.7 : 1 }}><i className={`fa-solid ${rawGeneralExportState.active ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '8px' }}></i>Excel 다운로드</button>
               </div>
               {rawGeneralExportState.message && (
                  <div style={{ flexBasis: '100%', padding: '10px 12px', borderRadius: '8px', background: '#fff', border: '1px solid var(--border, #e2e8f0)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{rawGeneralExportState.message}</div>
               )}
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
  );
}
