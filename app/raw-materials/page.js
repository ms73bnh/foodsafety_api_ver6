"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const SORT_OPTIONS = [
  { key: "id", label: "번호" },
  { key: "regDate", label: "등록일" },
];

export default function RawMaterialsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
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
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, sortBy, sortOrder]);

  useEffect(() => { fetchData(1); }, []);

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
    } catch (e) { setSyncMsg("네트워크 오류"); }
    finally { setSyncing(false); }
  };

  const sortIcon = (key) => {
    if (sortBy !== key) return " ⇅";
    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "28px 16px" }}>
      {/* 타이틀 */}
      <div style={{ maxWidth: 1100, margin: "0 auto 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: "1.55rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
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
              onClick={handleSync}
              disabled={syncing}
              style={{
                padding: "8px 16px", background: syncing ? "#94a3b8" : "#0d9488",
                color: "#fff", border: "none", borderRadius: 8, fontWeight: 700,
                fontSize: "0.85rem", cursor: syncing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6
              }}
            >
              <i className={`fa-solid ${syncing ? "fa-spinner fa-spin" : "fa-rotate"}`} />
              {syncing ? "동기화 중..." : "최신 정보 동기화"}
            </button>
          </div>
        </div>
      </div>

      {/* 검색바 */}
      <div style={{ maxWidth: 1100, margin: "0 auto 14px" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder="원료명, 업체명, 인정번호 검색..."
            style={{
              flex: 1, padding: "10px 16px", border: "1.5px solid #e2e8f0", borderRadius: 8,
              fontSize: "0.93rem", outline: "none", background: "#fff"
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 22px", background: "#0d9488", color: "#fff",
              border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.93rem"
            }}
          >
            <i className="fa-solid fa-search" /> 검색
          </button>
          {search && (
            <button type="button" onClick={() => { setInputVal(""); setSearch(""); fetchData(1, "", sortBy, sortOrder); }}
              style={{ padding: "10px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer" }}>
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </form>
      </div>

      {/* 테이블 */}
      <div style={{ maxWidth: 1100, margin: "0 auto", background: "#fff", borderRadius: 12, boxShadow: "0 1px 8px rgba(0,0,0,0.07)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem" }} />
            <p style={{ marginTop: 12 }}>데이터 불러오는 중...</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
            <i className="fa-solid fa-database" style={{ fontSize: "2.5rem", marginBottom: 12 }} />
            <p>데이터가 없습니다. 동기화 버튼을 눌러 데이터를 가져오세요.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                <th
                  onClick={() => handleSort("id")}
                  style={{ padding: "13px 16px", textAlign: "center", width: 60, fontSize: "0.83rem", color: "#475569", fontWeight: 700, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                >
                  번호{sortIcon("id")}
                </th>
                <th style={{ padding: "13px 16px", textAlign: "left", fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>제목</th>
                <th style={{ padding: "13px 16px", textAlign: "center", width: 140, fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>업체명</th>
                <th style={{ padding: "13px 16px", textAlign: "center", width: 140, fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>인정번호</th>
                <th
                  onClick={() => handleSort("regDate")}
                  style={{ padding: "13px 16px", textAlign: "center", width: 110, fontSize: "0.83rem", color: "#475569", fontWeight: 700, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                >
                  등록일{sortIcon("regDate")}
                </th>
                <th style={{ padding: "13px 16px", textAlign: "center", width: 160, fontSize: "0.83rem", color: "#475569", fontWeight: 700 }}>첨부파일</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: previewItem?.id === item.id ? "#f0fdfa" : (i % 2 === 0 ? "#fff" : "#fafafa"),
                    transition: "background 0.15s"
                  }}
                >
                  <td style={{ padding: "14px 16px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>{item.no || item.id}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span
                      onClick={() => setPreviewItem(item)}
                      style={{
                        fontWeight: 600, color: previewItem?.id === item.id ? "#0d9488" : "#0f172a",
                        cursor: "pointer", textDecoration: previewItem?.id === item.id ? "underline" : "none",
                        fontSize: "0.9rem", lineHeight: 1.5,
                        display: "block"
                      }}
                    >
                      {item.title}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "0.82rem", textAlign: "center" }}>{item.companyNm || "-"}</td>
                  <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "0.82rem", textAlign: "center", fontFamily: "monospace" }}>{item.recogNo || "-"}</td>
                  <td style={{ padding: "14px 16px", textAlign: "center", color: "#64748b", fontSize: "0.82rem" }}>{item.regDate || "-"}</td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      {item.localPdfPath || item.attachmentName ? (
                        <>
                          <button
                            onClick={() => setPreviewItem(item)}
                            style={{
                              padding: "5px 10px",
                              background: previewItem?.id === item.id ? "#0d9488" : "#e0f2fe",
                              color: previewItem?.id === item.id ? "#fff" : "#0369a1",
                              border: "1px solid #bae6fd", borderRadius: 6,
                              fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 4
                            }}
                          >
                            <i className="fa-solid fa-eye" /> 미리보기
                          </button>
                          <a
                            href={`/api/raw-materials/pdf/${item.id}?download=true`}
                            download
                            style={{
                              padding: "5px 10px", background: "#f0fdf4", color: "#15803d",
                              border: "1px solid #bbf7d0", borderRadius: 6, fontSize: "0.75rem",
                              fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 4
                            }}
                          >
                            <i className="fa-solid fa-download" /> 다운로드
                          </a>
                        </>
                      ) : (
                        <span style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>첨부없음</span>
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
            <button onClick={() => fetchData(Math.max(1, page - 1), search, sortBy, sortOrder)} disabled={page === 1}
              style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1 }}>
              이전
            </button>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const startPage = Math.max(1, Math.min(page - 5, totalPages - 9));
              const p = startPage + i;
              if (p > totalPages) return null;
              return (
                <button key={p} onClick={() => fetchData(p, search, sortBy, sortOrder)}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid", borderColor: page === p ? "#0d9488" : "#e2e8f0", background: page === p ? "#0d9488" : "#fff", color: page === p ? "#fff" : "#475569", fontWeight: page === p ? 700 : 500, cursor: "pointer" }}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => fetchData(Math.min(totalPages, page + 1), search, sortBy, sortOrder)} disabled={page === totalPages}
              style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.5 : 1 }}>
              다음
            </button>
          </div>
        )}
      </div>

      {/* 우측 슬라이드 드로어 PDF 미리보기 */}
      {previewItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}
            onClick={() => setPreviewItem(null)}
          />
          <div style={{
            position: "relative", width: "68vw", maxWidth: 1200, minWidth: 360,
            height: "100vh", background: "#fff", boxShadow: "-10px 0 30px rgba(0,0,0,0.2)",
            display: "flex", flexDirection: "column", zIndex: 1, animation: "slideInRight 0.25s ease-out"
          }}>
            {/* 드로어 헤더 */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                <i className="fa-solid fa-file-pdf" style={{ color: "#ef4444", fontSize: "1.4rem", flexShrink: 0 }} />
                <div style={{ overflow: "hidden" }}>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#0f172a", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {previewItem.title}
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    등록일: {previewItem.regDate} · 업체: {previewItem.companyNm || "-"} · 인정번호: {previewItem.recogNo || "-"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <a
                  href={`/api/raw-materials/pdf/${previewItem.id}?download=true`} download
                  style={{ padding: "7px 14px", background: "#0d9488", color: "#fff", borderRadius: 6, fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <i className="fa-solid fa-download" /> 다운로드
                </a>
                <a
                  href={`/api/raw-materials/pdf/${previewItem.id}`} target="_blank" rel="noreferrer"
                  style={{ padding: "7px 12px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" /> 새창
                </a>
                <button
                  onClick={() => setPreviewItem(null)}
                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", cursor: "pointer", color: "#64748b" }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
            {/* PDF iframe */}
            <div style={{ flex: 1, width: "100%", background: "#525659" }}>
              <iframe
                src={`/api/raw-materials/pdf/${previewItem.id}`}
                width="100%" height="100%"
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
      `}</style>
    </main>
  );
}