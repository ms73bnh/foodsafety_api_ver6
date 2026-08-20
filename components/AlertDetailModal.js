'use client';

import React from 'react';

const RECALL_FIELDS = [
  { key: 'PRDTNM', label: '제품명' },
  { key: 'RTRVLPRVNS', label: '회수사유' },
  { key: 'BSSHNM', label: '제조업체명' },
  { key: 'ADDR', label: '업체주소' },
  { key: 'TELNO', label: '전화번호' },
  { key: 'BRCDNO', label: '바코드번호' },
  { key: 'FRMLCUNIT', label: '포장단위' },
  { key: 'MNFDT', label: '제조일자' },
  { key: 'RTRVLPLANDOC_RTRVLMTHD', label: '회수방법' },
  { key: 'DISTBTMLMT', label: '유통/소비기한' },
  { key: 'PRDLST_TYPE', label: '식품분류' },
  { key: 'PRDLST_CD_NM', label: '품목유형' },
  { key: 'PRDLST_CD', label: '품목코드' },
  { key: 'CRET_DTM', label: '등록일' },
  { key: 'RTRVLDSUSE_SEQ', label: '회수일련번호' },
  { key: 'PRDLST_REPORT_NO', label: '품목제조보고번호' },
  { key: 'RTRVL_GRDCD_NM', label: '회수등급' },
  { key: 'LCNS_NO', label: '업체인허가번호' },
];

const INSPECTION_FIELDS = [
  { key: 'PRDTNM', label: '제품명' },
  { key: 'BSSHNM', label: '업소명' },
  { key: 'TEST_ITMNM', label: '부적합항목' },
  { key: 'STDR_STND', label: '기준규격' },
  { key: 'TESTANALS_RSLT', label: '검사결과' },
  { key: 'MNFDT', label: '제조일자' },
  { key: 'DISTBTMLMT', label: '유통/소비기한' },
  { key: 'ADDR', label: '영업자주소' },
  { key: 'INSTT_NM', label: '검사기관' },
  { key: 'REGSTR_TELNO', label: '검사기관 전화번호' },
  { key: 'REPORTR_TELNO', label: '보고자 전화번호' },
  { key: 'BRCDNO', label: '바코드번호' },
  { key: 'FRMLCUNIT', label: '포장단위' },
  { key: 'PRDLST_CD_NM', label: '식품유형' },
  { key: 'CRET_DTM', label: '등록일' },
  { key: 'RTRVLDSUSE_SEQ', label: '회수폐기일련번호' },
  { key: 'PRDLST_REPORT_NO', label: '품목제조보고번호' },
  { key: 'LCNS_NO', label: '업체인허가번호' },
];

const ADMIN_FIELDS = [
  { key: 'PRCSCITYPOINT_BSSHNM', label: '업소명' },
  { key: 'DSPS_TYPECD_NM', label: '처분유형' },
  { key: 'DSPSCN', label: '처분내용' },
  { key: 'VILTCN', label: '위반내용' },
  { key: 'LAWORD_CD_NM', label: '위반법령' },
  { key: 'INDUTY_CD_NM', label: '업종' },
  { key: 'DSPS_DCSNDT', label: '처분확정일자' },
  { key: 'DSPS_BGNDT', label: '처분시작일' },
  { key: 'DSPS_ENDDT', label: '처분종료일' },
  { key: 'ADDR', label: '주소' },
  { key: 'TELNO', label: '전화번호' },
  { key: 'PRSDNT_NM', label: '대표자명' },
  { key: 'PUBLIC_DT', label: '공개기한' },
  { key: 'DSPS_INSTTCD_NM', label: '처분기관명' },
  { key: 'LAST_UPDT_DTM', label: '최종수정일' },
  { key: 'LCNS_NO', label: '인허가번호' },
  { key: 'DSPSDTLS_SEQ', label: '행정처분전산키' },
];

export default function AlertDetailModal({ isOpen, alert, onClose }) {
  if (!isOpen || !alert) return null;

  const type = alert._standard?.type || alert.type;
  let fields = [];
  let titleColor = 'var(--accent)';
  let typeLabel = '';

  if (type === 'RECALL') {
    fields = RECALL_FIELDS;
    titleColor = '#ef4444';
    typeLabel = '회수·판매중지';
  } else if (type === 'INSPECTION') {
    fields = INSPECTION_FIELDS;
    titleColor = '#f59e0b';
    typeLabel = '검사부적합';
  } else if (type === 'ADMIN_ACTION') {
    fields = ADMIN_FIELDS;
    titleColor = '#0284c7';
    typeLabel = '행정처분';
  }

  const imgUrl = alert._standard?.img || alert.IMG_FILE_PATH || alert.DOWNLOAD_URL;

  return (
    <div className="alert-modal-overlay" onClick={onClose}>
      <div className="alert-modal-content animate-scale-up" onClick={e => e.stopPropagation()}>
        <div className="alert-modal-header" style={{ borderLeft: `6px solid ${titleColor}` }}>
          <div className="type-badge" style={{ backgroundColor: titleColor }}>{typeLabel}</div>
          <h2>{alert._standard?.title}</h2>
          <button className="close-x" onClick={onClose}>&times;</button>
        </div>

        <div className="alert-modal-body">
          {imgUrl && (
            <div className="detail-img-section">
              <img src={imgUrl} alt={alert._standard?.title} onError={(e) => e.target.style.display = 'none'} />
            </div>
          )}

          <div className="detail-table-container">
            <table className="detail-info-table">
              <tbody>
                {fields.map(f => (
                  <tr key={f.key}>
                    <th>{f.label}</th>
                    <td>{alert[f.key] || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="alert-modal-footer">
          <button className="btn-confirm" onClick={onClose} style={{ backgroundColor: titleColor }}>확인</button>
        </div>
      </div>

      <style jsx>{`
        .alert-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          z-index: 9000;
          padding: 50px 20px;
          overflow-y: auto;
        }
        .alert-modal-content {
          background: white;
          width: 100%;
          max-width: 650px;
          max-height: 85vh;
          border-radius: 20px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .alert-modal-header {
          padding: 24px 30px;
          position: relative;
          background: #f8fafc;
        }
        .type-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .alert-modal-header h2 {
          margin: 0;
          font-size: 1.4rem;
          color: #1e293b;
          font-weight: 800;
          line-height: 1.3;
        }
        .close-x {
          position: absolute;
          right: 20px;
          top: 20px;
          background: none;
          border: none;
          font-size: 1.8rem;
          color: #94a3b8;
          cursor: pointer;
        }
        .alert-modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 30px;
        }
        .detail-img-section {
          width: 100%;
          text-align: center;
          margin-bottom: 24px;
          background: #f8fafc;
          border-radius: 12px;
          padding: 20px;
        }
        .detail-img-section img {
          max-width: 100%;
          max-height: 300px;
          border-radius: 8px;
        }
        .detail-info-table {
          width: 100%;
          border-collapse: collapse;
        }
        .detail-info-table th {
          width: 130px;
          padding: 12px 15px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          font-size: 0.85rem;
          color: #64748b;
          font-weight: 600;
        }
        .detail-info-table td {
          padding: 12px 15px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.9rem;
          color: #334155;
          line-height: 1.5;
        }
        .alert-modal-footer {
          padding: 20px 30px;
          background: #f8fafc;
          text-align: right;
        }
        .btn-confirm {
          padding: 10px 24px;
          border-radius: 10px;
          color: white;
          border: none;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .btn-confirm:hover {
          transform: translateY(-2px);
        }
        
        .animate-scale-up {
          animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
