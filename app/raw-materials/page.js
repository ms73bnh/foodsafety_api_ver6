"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatFormattedText } from "@/lib/normalizer";

const SORT_OPTIONS = [
  { key: "no", label: "번호" },
  { key: "regDate", label: "등록일" },
];

export default function RawMaterialsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [sortBy, setSortBy] = useState("no");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(false);

  // 모달 상태
  const [detailModalItem, setDetailModalItem] = useState(null);
  const [previewPdfItem, setPreviewPdfItem] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const limit = 15;

  const fetchData = useCallback(async (p = 1, s = search, sb = sortBy, so = sortOrder) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: p, limit, search: s, sortBy: sb, sortOrder: so });
      const res = await fetch(`/api/raw-materials?${qs}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
        setTotal(json.total);
        setTotalPages(json.totalPages);
        setPage(p);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, sortOrder]);

  useEffect(() => {
    fetchData(1);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(inputVal);
    fetchData(1, inputVal, sortBy, sortOrder);
  };

  const handleSort = (key) => {
    const newOrder = sortBy === key && sortOrder === "desc" ? "asc" : "desc";
    setSortBy(key);
    setSortOrder(newOrder);
    fetchData(1, search, key, newOrder);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/raw-materials/sync", { method: "POST" });
      const json = await res.json();
      setSyncMsg(json.message || (json.success ? "동기화 완료" : json.error || "오류 발생"));
      if (json.success) fetchData(1);
    } catch (e) {
      setSyncMsg("네트워크 오류");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenHistory = async () => {
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/ingredients/history?type=RAW_MATERIAL");
      const json = await res.json();
      if (json.success) {
        setHistoryLogs(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const sortIcon = (key) => {
    if (sortBy !== key) return " ⇅";
    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "28px 20px" }}>
      {/* 타이틀 및 헤더 */}
      <div style={{ maxWidth: 1400, margin: "0 auto 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: "1.65rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              <i className="fa-solid fa-flask-vial" style={{ color: "#0d9488", marginRight: 10 }} />
              원료별 정보 공시
            </h1>
            <p style={{ color: "#64748b", fontSize: "0.88rem", margin: "4px 0 0" }}>
              식품안전나라 건강기능식품 개별인정원료 정보 공시 게시판 · 총 {total.toLocaleString()}건
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {syncMsg && (
              <span style={{ fontSize: "0.82rem", color: "#0d9488", fontWeight: 600 }}>{syncMsg}</span>
            )}
            <button
              onClick={handleOpenHistory}
              style={{
                padding: "8px 14px",
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}
            >
              <i className="fa-solid fa-clock-rotate-left" style={{ color: "#0284c7" }} />
              변경 이력 확인
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                padding: "8px 16px",
                background: syncing ? "#94a3b8" : "#0d9488",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: syncing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 6px rgba(13,148,136,0.25)"
              }}
            >
              <i className={`fa-solid ${syncing ? "fa-spinner fa-spin" : "fa-rotate"}`} />
              {syncing ? "동기화 중..." : "최신 정보 동기화"}
            </button>
          </div>
        </div>
      </div>

      {/* 검색바 */}
      <div style={{ maxWidth: 1400, margin: "0 auto 14px" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="원료명, 업체명, 인정번호, 기능성 내용 검색..."
            style={{
              flex: 1,
              padding: "10px 16px",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              fontSize: "0.93rem",
              outline: "none",
              background: "#fff",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 22px",
              background: "#0d9488",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.93rem",
            }}
          >
            <i className="fa-solid fa-search" /> 검색
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setInputVal("");
                setSearch("");
                fetchData(1, "", sortBy, sortOrder);
              }}
              style={{
                padding: "10px 14px",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </form>
      </div>

      {/* 테이블 목록 */}
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem" }} />
            <p style={{ marginTop: 12 }}>데이터 불러오는 중...</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
            <i className="fa-solid fa-database" style={{ fontSize: "2.5rem", marginBottom: 12 }} />
            <p>데이터가 없습니다.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                <th
                  onClick={() => handleSort("no")}
                  style={{
                    padding: "13px 16px",
                    textAlign: "center",
                    width: 70,
                    fontSize: "0.83rem",
                    color: "#475569",
                    fontWeight: 700,
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  번호{sortIcon("no")}
                </th>
                <th style={{ padding: "13px 16px", textAlign: "left", fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>
                  제목 (원료명)
                </th>
                <th style={{ padding: "13px 16px", textAlign: "center", width: 160, fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>
                  업체명
                </th>
                <th style={{ padding: "13px 16px", textAlign: "center", width: 140, fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>
                  인정번호
                </th>
                <th
                  onClick={() => handleSort("regDate")}
                  style={{
                    padding: "13px 16px",
                    textAlign: "center",
                    width: 110,
                    fontSize: "0.83rem",
                    color: "#475569",
                    fontWeight: 700,
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  등록일{sortIcon("regDate")}
                </th>
                <th style={{ padding: "13px 16px", textAlign: "center", width: 175, minWidth: 175, fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>
                  첨부파일
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: detailModalItem?.id === item.id ? "#f0fdfa" : i % 2 === 0 ? "#fff" : "#fafafa",
                    transition: "background 0.15s",
                    cursor: "pointer",
                  }}
                  onClick={() => setDetailModalItem(item)}
                >
                  <td style={{ padding: "14px 16px", textAlign: "center", color: "#94a3b8", fontSize: "0.84rem", fontWeight: 600 }}>
                    {item.no != null ? item.no : item.id}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#0f172a",
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                        display: "block",
                      }}
                    >
                      {item.title}
                    </span>
                    {item.functionalityText && (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 4,
                          fontSize: "0.76rem",
                          color: "#0d9488",
                          background: "#ccfbf1",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        기능성: {item.functionalityText.length > 55 ? item.functionalityText.substring(0, 55) + "..." : item.functionalityText}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "0.82rem", textAlign: "center" }}>
                    {item.companyNm || "-"}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "0.82rem", textAlign: "center", fontFamily: "monospace" }}>
                    {item.recogNo || "-"}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center", color: "#64748b", fontSize: "0.82rem" }}>
                    {item.regDate || "-"}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                      {item.localPdfPath || item.attachmentName ? (
                        <>
                          <button
                            onClick={() => setPreviewPdfItem(item)}
                            style={{
                              padding: "5px 8px",
                              background: "#e0f2fe",
                              color: "#0369a1",
                              border: "1px solid #bae6fd",
                              borderRadius: 6,
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <i className="fa-solid fa-eye" /> 미리보기
                          </button>
                          <a
                            href={`/api/raw-materials/pdf/${item.id}?download=true`}
                            download
                            style={{
                              padding: "5px 8px",
                              background: "#f0fdf4",
                              color: "#15803d",
                              border: "1px solid #bbf7d0",
                              borderRadius: 6,
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <i className="fa-solid fa-download" /> 다운
                          </a>
                        </>
                      ) : (
                        <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>첨부없음</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "18px", borderTop: "1px solid #f1f5f9" }}>
            <button
              onClick={() => fetchData(Math.max(1, page - 1), search, sortBy, sortOrder)}
              disabled={page === 1}
              style={{
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                background: "#fff",
                cursor: page === 1 ? "not-allowed" : "pointer",
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              이전
            </button>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const startPage = Math.max(1, Math.min(page - 5, totalPages - 9));
              const p = startPage + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => fetchData(p, search, sortBy, sortOrder)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: page === p ? "#0d9488" : "#e2e8f0",
                    background: page === p ? "#0d9488" : "#fff",
                    color: page === p ? "#fff" : "#475569",
                    fontWeight: page === p ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => fetchData(Math.min(totalPages, page + 1), search, sortBy, sortOrder)}
              disabled={page === totalPages}
              style={{
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                background: "#fff",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                opacity: page === totalPages ? 0.5 : 1,
              }}
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* 📌 게시글 세부 내용 팝업 모달 */}
      {detailModalItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
            onClick={() => setDetailModalItem(null)}
          />
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 780,
              maxHeight: "88vh",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              zIndex: 1,
              animation: "modalFadeIn 0.2s ease-out",
            }}
          >
            {/* 모달 헤더 */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ background: "#0d9488", color: "#fff", padding: "2px 8px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 700 }}>
                    No. {detailModalItem.no || detailModalItem.id}
                  </span>
                  {detailModalItem.recogNo && (
                    <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 700, fontFamily: "monospace" }}>
                      인정번호: {detailModalItem.recogNo}
                    </span>
                  )}
                  {detailModalItem.companyNm && (
                    <span style={{ background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600 }}>
                      업체명: {detailModalItem.companyNm}
                    </span>
                  )}
                </div>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.4 }}>
                  {detailModalItem.title}
                </h2>
                <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: "0.8rem", color: "#64748b" }}>
                  <span><i className="fa-regular fa-calendar" style={{ marginRight: 4 }} /> 등록일: {detailModalItem.regDate || "-"}</span>
                  {detailModalItem.viewCnt && <span><i className="fa-regular fa-eye" style={{ marginRight: 4 }} /> 조회수: {detailModalItem.viewCnt}</span>}
                </div>
              </div>
              <button
                onClick={() => setDetailModalItem(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* 모달 본문 상세 내용 */}
            {/* 모달 본문 상세 내용 */}
            <div style={{ padding: "22px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 1. 기능성 내용 */}
              <div style={{ background: "#f0fdfa", border: "1.5px solid #99f6e4", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#0f766e", fontWeight: 700, fontSize: "0.88rem", marginBottom: 6 }}>
                  <i className="fa-solid fa-circle-check" /> 기능성 내용
                </div>
                <div style={{ color: "#134e4a", fontSize: "0.93rem", fontWeight: 600, lineHeight: 1.7, whiteSpace: "pre-line" }}>
                  {formatFormattedText(detailModalItem.functionalityText || (detailModalItem.content && detailModalItem.content.includes("기능성내용") ? detailModalItem.content : "공시된 기능성 내용 정보가 없습니다."))}
                </div>
              </div>

              {/* 2. 일일섭취량 */}
              {detailModalItem.dailyIntake && (
                <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#1d4ed8", fontWeight: 700, fontSize: "0.88rem", marginBottom: 6 }}>
                    <i className="fa-solid fa-capsules" /> 일일섭취량
                  </div>
                  <div style={{ color: "#1e3a8a", fontSize: "0.92rem", lineHeight: 1.7, whiteSpace: "pre-line", fontWeight: 600 }}>
                    {formatFormattedText(detailModalItem.dailyIntake)}
                  </div>
                </div>
              )}

              {/* 3. 섭취 시 주의사항 */}
              {detailModalItem.precautions && (
                <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#b45309", fontWeight: 700, fontSize: "0.88rem", marginBottom: 6 }}>
                    <i className="fa-solid fa-triangle-exclamation" /> 섭취 시 주의사항
                  </div>
                  <div style={{ color: "#78350f", fontSize: "0.9rem", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                    {formatFormattedText(detailModalItem.precautions)}
                  </div>
                </div>
              )}

              {/* 4. 전체 본문 원문 */}
              {detailModalItem.content && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ color: "#475569", fontWeight: 700, fontSize: "0.84rem", marginBottom: 8 }}>
                    <i className="fa-solid fa-file-lines" style={{ marginRight: 6 }} /> 식약처 공시 원문 텍스트
                  </div>
                  <div style={{ color: "#334155", fontSize: "0.84rem", lineHeight: 1.7, whiteSpace: "pre-line", maxHeight: 180, overflowY: "auto", background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #f1f5f9" }}>
                    {formatFormattedText(detailModalItem.content)}
                  </div>
                </div>
              )}
            </div>

            {/* 모달 하단 버튼 바 */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {detailModalItem.localPdfPath || detailModalItem.attachmentName ? (
                  <>
                    <button
                      onClick={() => setPreviewPdfItem(detailModalItem)}
                      style={{
                        padding: "8px 16px",
                        background: "#0d9488",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: "0 2px 6px rgba(13,148,136,0.3)",
                      }}
                    >
                      <i className="fa-solid fa-file-pdf" /> PDF 원문 미리보기
                    </button>
                    <a
                      href={`/api/raw-materials/pdf/${detailModalItem.id}?download=true`}
                      download
                      style={{
                        padding: "8px 14px",
                        background: "#f0fdf4",
                        color: "#15803d",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <i className="fa-solid fa-download" /> PDF 다운로드
                    </a>
                  </>
                ) : (
                  <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>첨부된 PDF 파일이 없습니다.</span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {detailModalItem.recogNo && (
                  <Link
                    href={`/ingredients?search=${encodeURIComponent(detailModalItem.recogNo)}`}
                    style={{
                      padding: "8px 14px",
                      background: "#f1f5f9",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: "0.83rem",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <i className="fa-solid fa-flask" style={{ color: "#7c3aed" }} /> 개별인정형 DB에서 보기
                  </Link>
                )}
                <button
                  onClick={() => setDetailModalItem(null)}
                  style={{
                    padding: "8px 16px",
                    background: "#e2e8f0",
                    color: "#475569",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📌 변경 이력 확인 팝업 모달 */}
      {showHistoryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 960, maxHeight: "88vh", borderRadius: 16, boxShadow: "0 20px 40px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalFadeIn 0.2s ease-out" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fa-solid fa-clock-rotate-left" style={{ color: "#0284c7" }} />
                  공시 정보 변경 이력 모니터링
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#64748b" }}>식약처 공시 게시글 동기화 시 감지된 신규 등록 및 변경 이력</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", cursor: "pointer", color: "#64748b" }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {historyLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem", color: "#0284c7" }} />
                  <p style={{ marginTop: 10 }}>변경 이력 불러오는 중...</p>
                </div>
              ) : historyLogs.length === 0 ? (
                <div style={{ padding: 50, textAlign: "center", color: "#94a3b8" }}>
                  <i className="fa-solid fa-clipboard-check" style={{ fontSize: "2.5rem", marginBottom: 12, color: "#cbd5e1" }} />
                  <p style={{ fontSize: "0.92rem", fontWeight: 600 }}>아직 기록된 변경 이력이 없습니다.</p>
                  <p style={{ fontSize: "0.82rem", color: "#94a3b8" }}>동기화 실행 시 최신 공시의 변경사항이 자동으로 감지되어 기록됩니다.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {historyLogs.map((log) => {
                    const isCreated = log.type && log.type.includes("CREATED");
                    const title = log.details?.title || log.details?.name || log.prdlstReportNo;
                    const recogNo = log.details?.recogNo || (log.prdlstReportNo?.startsWith("제") ? log.prdlstReportNo : "");

                    return (
                      <div key={log.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{
                              background: isCreated ? "#dcfce7" : "#dbeafe",
                              color: isCreated ? "#15803d" : "#1d4ed8",
                              padding: "3px 10px", borderRadius: 6, fontSize: "0.74rem", fontWeight: 800,
                              whiteSpace: "nowrap", flexShrink: 0
                            }}>
                              {isCreated ? "신규 등록" : "항목 변경"}
                            </span>
                            <strong style={{ fontSize: "0.95rem", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {title}
                            </strong>
                            {recogNo && (
                              <span style={{ fontSize: "0.8rem", color: "#0d9488", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                                [{recogNo}]
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {new Date(log.loggedAt).toLocaleString("ko-KR")}
                          </span>
                        </div>

                        {/* 신규 등록 요약 */}
                        {isCreated && log.details && (
                          <div style={{ fontSize: "0.82rem", color: "#334155", background: "#fff", padding: "10px 14px", borderRadius: 8, border: "1px solid #f1f5f9", display: "flex", flexWrap: "wrap", gap: 16 }}>
                            {log.details.companyNm && <div><strong>업체명:</strong> {log.details.companyNm}</div>}
                            {log.details.regDate && <div><strong>등록일자:</strong> {log.details.regDate}</div>}
                            {log.details.action && <div style={{ color: "#0d9488" }}>{log.details.action}</div>}
                          </div>
                        )}

                        {/* 항목 변경 내용 */}
                        {!isCreated && log.details?.changedFields && (
                          <div style={{ fontSize: "0.82rem", color: "#334155", marginTop: 8, background: "#fff", padding: "12px 14px", borderRadius: 8, border: "1px solid #f1f5f9" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                              <span style={{ fontWeight: 700, color: "#d97706" }}>변경 항목:</span>
                              {log.details.changedFields.map(f => (
                                <span key={f} style={{ background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: "0.74rem" }}>
                                  {f}
                                </span>
                              ))}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <div style={{ background: "#fef2f2", padding: "8px 12px", borderRadius: 6, border: "1px solid #fee2e2" }}>
                                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#ef4444", display: "block", marginBottom: 4 }}>[변경 전]</span>
                                {typeof log.details.before === "object" && log.details.before !== null ? (
                                  Object.entries(log.details.before).map(([k, v]) => (
                                    <div key={k} style={{ fontSize: "0.8rem", color: "#7f1d1d", marginBottom: 2 }}>
                                      <strong>{k}:</strong> {String(v || '-')}
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ fontSize: "0.8rem", color: "#7f1d1d" }}>{String(log.details.before)}</div>
                                )}
                              </div>
                              <div style={{ background: "#f0fdf4", padding: "8px 12px", borderRadius: 6, border: "1px solid #dcfce7" }}>
                                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#16a34a", display: "block", marginBottom: 4 }}>[변경 후]</span>
                                {typeof log.details.after === "object" && log.details.after !== null ? (
                                  Object.entries(log.details.after).map(([k, v]) => (
                                    <div key={k} style={{ fontSize: "0.8rem", color: "#14532d", marginBottom: 2 }}>
                                      <strong>{k}:</strong> {String(v || '-')}
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ fontSize: "0.8rem", color: "#14532d" }}>{String(log.details.after)}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "right" }}>
              <button onClick={() => setShowHistoryModal(false)} style={{ padding: "8px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.84rem", cursor: "pointer" }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📌 우측 슬라이드 드로어 PDF 미리보기 */}
      {previewPdfItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}
            onClick={() => setPreviewPdfItem(null)}
          />
          <div
            style={{
              position: "relative",
              width: "68vw",
              maxWidth: 1200,
              minWidth: 360,
              height: "100vh",
              background: "#fff",
              boxShadow: "-10px 0 30px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              zIndex: 1,
              animation: "slideInRight 0.25s ease-out",
            }}
          >
            {/* 드로어 헤더 */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                <i className="fa-solid fa-file-pdf" style={{ color: "#ef4444", fontSize: "1.4rem", flexShrink: 0 }} />
                <div style={{ overflow: "hidden" }}>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#0f172a", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {previewPdfItem.title}
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    등록일: {previewPdfItem.regDate} · 업체: {previewPdfItem.companyNm || "-"} · 인정번호: {previewPdfItem.recogNo || "-"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <a
                  href={`/api/raw-materials/pdf/${previewPdfItem.id}?download=true`}
                  download
                  style={{
                    padding: "7px 14px",
                    background: "#0d9488",
                    color: "#fff",
                    borderRadius: 6,
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <i className="fa-solid fa-download" /> 다운로드
                </a>
                <a
                  href={`/api/raw-materials/pdf/${previewPdfItem.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "7px 12px",
                    background: "#f1f5f9",
                    color: "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" /> 새창
                </a>
                <button
                  onClick={() => setPreviewPdfItem(null)}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem",
                    cursor: "pointer",
                    color: "#64748b",
                  }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
            {/* PDF iframe */}
            <div style={{ flex: 1, width: "100%", background: "#525659" }}>
              <iframe
                src={`/api/raw-materials/pdf/${previewPdfItem.id}`}
                width="100%"
                height="100%"
                style={{ border: "none" }}
                title="PDF 미리보기"
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes modalFadeIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </main>
  );
}