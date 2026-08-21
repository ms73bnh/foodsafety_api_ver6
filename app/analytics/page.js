"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";

const YEARS_10 = ["2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"];
const COLORS = ["#0284c7", "#0d9488", "#7c3aed", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#f97316"];

// ─── 심층 데이터 시트 모달 ─────────────────────────────────────────────────
function SheetModal({ data, selectedCompanies, onClose }) {
  const [sortCol, setSortCol] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

  const filteredProducts = useMemo(() => {
    if (!data?.allProducts) return [];
    let list = data.allProducts;
    if (selectedCompanies.size > 0 && selectedCompanies.size < (data.companies?.length || 0)) {
      list = list.filter(p => selectedCompanies.has(p.bsshNm || "기타"));
    }
    return [...list].sort((a, b) => {
      const va = sortCol === "total" ? a.total : (a.yearly?.[sortCol] || 0);
      const vb = sortCol === "total" ? b.total : (b.yearly?.[sortCol] || 0);
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [data, selectedCompanies, sortCol, sortDir]);

  const filteredYearly = useMemo(() => {
    if (!data?.yearlyProduction) return [];
    if (selectedCompanies.size === 0 || selectedCompanies.size === (data.companies?.length || 0)) {
      return data.yearlyProduction;
    }
    return YEARS_10.slice().reverse().map(yr => {
      const total = filteredProducts.reduce((acc, p) => acc + (p.yearly?.[yr] || 0), 0);
      return { year: yr, amount: Math.round(total * 100) / 100 };
    });
  }, [data, selectedCompanies, filteredProducts]);

  const filteredCompanies = useMemo(() => {
    if (!data?.companies) return [];
    if (selectedCompanies.size === 0) return data.companies;
    return data.companies.filter(c => selectedCompanies.has(c.name));
  }, [data, selectedCompanies]);

  const totalSelected = filteredYearly.reduce((acc, y) => acc + y.amount, 0);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const handleExportCSV = () => {
    const headers = ["순위", "품목보고번호", "품목명", "제조업소", "허가일자", "총합계(KG)", ...YEARS_10.map(y => y + "년(KG)")];
    const rows = filteredProducts.map((p, i) => [
      i + 1, p.prdlstReportNo, p.prdlstNm, p.bsshNm, p.prmsDt, p.total,
      ...YEARS_10.map(yr => p.yearly?.[yr] || 0)
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => '"' + (v || "") + '"').join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (data?.ingredient?.name || "분석결과") + "_심층시트.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }) => (
    <span style={{ marginLeft: 3, opacity: sortCol === col ? 1 : 0.3, fontSize: "0.65rem" }}>
      {sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : "▼"}
    </span>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ background: "#ffffff", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#334155", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
            ← 3-Pane으로 돌아가기
          </button>
          <div>
            <span style={{ color: "#0d9488", fontWeight: 900, fontSize: "1.1rem" }}>📊 심층 데이터 시트</span>
            <span style={{ color: "#64748b", fontSize: "0.85rem", marginLeft: 10, fontWeight: 600 }}>
              {data?.ingredient?.name} {selectedCompanies.size > 0 && selectedCompanies.size < (data?.companies?.length || 0) ? "· " + selectedCompanies.size + "개 제조사 필터" : "· 전체 제조사"}
            </span>
          </div>
        </div>
        <button onClick={handleExportCSV} style={{ padding: "8px 18px", background: "linear-gradient(135deg, #0d9488, #0284c7)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(13,148,136,0.25)" }}>
          📥 CSV 다운로드
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", background: "#f8fafc" }}>
        {/* 연도별 총 생산량 추이 */}
        <div style={{ marginBottom: 28, background: "#ffffff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <h3 style={{ color: "#0f172a", fontSize: "0.95rem", fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#0d9488" }}>📈</span> 연도별 총 생산량 추이 (2016~2025)
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.82rem", minWidth: "100%" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: "10px 14px", color: "#475569", textAlign: "left", border: "1px solid #e2e8f0", fontWeight: 700 }}>구분</th>
                  {filteredYearly.map(y => (
                    <th key={y.year} style={{ padding: "10px 12px", color: "#475569", textAlign: "right", border: "1px solid #e2e8f0", minWidth: 85, fontWeight: 700 }}>{y.year}년</th>
                  ))}
                  <th style={{ padding: "10px 12px", color: "#0d9488", textAlign: "right", border: "1px solid #e2e8f0", fontWeight: 900, background: "rgba(13, 148, 136, 0.06)" }}>합계</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "11px 14px", color: "#0d9488", fontWeight: 800, border: "1px solid #e2e8f0", background: "rgba(13, 148, 136, 0.04)" }}>생산량(KG)</td>
                  {filteredYearly.map(y => (
                    <td 
                      key={y.year} 
                      title={y.amount > 0 ? `${y.amount.toLocaleString()} KG` : '-'}
                      style={{ padding: "11px 12px", color: y.amount > 0 ? "#0f172a" : "#cbd5e1", fontWeight: y.amount > 0 ? 700 : 400, textAlign: "right", border: "1px solid #e2e8f0", background: "#ffffff", cursor: y.amount > 0 ? "default" : "inherit" }}
                    >
                      {y.amount > 0 ? Math.round(y.amount).toLocaleString() : "-"}
                    </td>
                  ))}
                  <td 
                    title={`${totalSelected.toLocaleString()} KG`}
                    style={{ padding: "11px 12px", color: "#0d9488", fontWeight: 900, textAlign: "right", border: "1px solid #e2e8f0", background: "rgba(13, 148, 136, 0.08)", cursor: "default" }}
                  >
                    {Math.round(totalSelected).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 주요 OEM/ODM 제조사 랭킹 */}
        {filteredCompanies.length > 0 && (
          <div style={{ marginBottom: 28, background: "#ffffff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <h3 style={{ color: "#0f172a", fontSize: "0.95rem", fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#0284c7" }}>🏭</span> 주요 OEM/ODM 제조사 생산 랭킹 (선택된 {filteredCompanies.length}개사)
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.82rem", minWidth: 650, width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{ padding: "10px 12px", color: "#475569", textAlign: "center", border: "1px solid #e2e8f0", width: 55, fontWeight: 700 }}>순위</th>
                    <th style={{ padding: "10px 14px", color: "#475569", textAlign: "left", border: "1px solid #e2e8f0", fontWeight: 700 }}>제조업소명</th>
                    <th style={{ padding: "10px 12px", color: "#475569", textAlign: "right", border: "1px solid #e2e8f0", width: 100, fontWeight: 700 }}>품목 수</th>
                    <th style={{ padding: "10px 12px", color: "#475569", textAlign: "right", border: "1px solid #e2e8f0", width: 140, fontWeight: 700 }}>총 생산량(KG)</th>
                    <th style={{ padding: "10px 14px", color: "#475569", textAlign: "right", border: "1px solid #e2e8f0", width: 150, fontWeight: 700 }}>시장 점유율(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map((c, i) => (
                    <tr key={c.name} style={{ background: i % 2 === 0 ? "#ffffff" : "#fbfcfe" }}>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "#64748b", fontWeight: 800, border: "1px solid #e2e8f0" }}>{i + 1}</td>
                      <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 700, border: "1px solid #e2e8f0" }}>{c.name}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b", border: "1px solid #e2e8f0", fontWeight: 600 }}>{c.productCount.toLocaleString()}개</td>
                      <td 
                        title={c.total > 0 ? `${c.total.toLocaleString()} KG` : ''}
                        style={{ padding: "10px 12px", textAlign: "right", color: "#0d9488", fontWeight: 800, border: "1px solid #e2e8f0", cursor: c.total > 0 ? "default" : "inherit" }}
                      >
                        {c.total > 0 ? Math.round(c.total).toLocaleString() : "-"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", border: "1px solid #e2e8f0" }}>
                        <span style={{ color: "#d97706", fontWeight: 800 }}>{c.share}%</span>
                        <div style={{ marginTop: 4, height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: Math.min(c.share, 100) + "%", height: "100%", background: COLORS[i % COLORS.length], borderRadius: 3 }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 완제품 허가일자 타임라인 & 10개년 생산실적 매트릭스 */}
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ color: "#0f172a", fontSize: "0.95rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#7c3aed" }}>📋</span> 완제품 허가일자 타임라인 & 10개년 생산실적 매트릭스 ({filteredProducts.length}건)
            </h3>
            <span style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 600 }}>* 컬럼 클릭 시 정렬 / 허가일자 열까지 고정</span>
          </div>
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 480px)" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "0.78rem", minWidth: 1350, width: "100%" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, zIndex: 10 }}>
                  <th style={{ position: "sticky", left: 0, zIndex: 15, background: "#f1f5f9", padding: "10px 10px", textAlign: "center", width: 50, minWidth: 50, border: "1px solid #e2e8f0", color: "#475569", fontWeight: 700 }}>순위</th>
                  <th style={{ position: "sticky", left: 50, zIndex: 15, background: "#f1f5f9", padding: "10px 14px", textAlign: "left", width: 250, minWidth: 250, border: "1px solid #e2e8f0", color: "#475569", fontWeight: 700 }}>품목명 / 보고번호</th>
                  <th style={{ position: "sticky", left: 300, zIndex: 15, background: "#f1f5f9", padding: "10px 12px", textAlign: "left", width: 170, minWidth: 170, border: "1px solid #e2e8f0", color: "#475569", fontWeight: 700 }}>제조업소</th>
                  <th style={{ position: "sticky", left: 470, zIndex: 15, background: "#f1f5f9", padding: "10px 10px", textAlign: "center", width: 100, minWidth: 100, border: "1px solid #e2e8f0", borderRight: "2px solid #0d9488", color: "#475569", fontWeight: 700 }}>허가일자</th>
                  <th onClick={() => handleSort("total")} style={{ padding: "10px 12px", textAlign: "right", width: 110, minWidth: 110, background: "rgba(13, 148, 136, 0.08)", color: "#0d9488", fontWeight: 800, border: "1px solid #e2e8f0", cursor: "pointer", whiteSpace: "nowrap" }}>
                    총합계<SortIcon col="total" />
                  </th>
                  {YEARS_10.map(yr => (
                    <th key={yr} onClick={() => handleSort(yr)} style={{ padding: "10px 8px", textAlign: "right", width: 75, minWidth: 75, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#475569", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 700 }}>
                      {yr}년<SortIcon col={yr} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((prod, idx) => {
                  const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                  return (
                    <tr key={prod.prdlstReportNo}>
                      <td style={{ position: "sticky", left: 0, zIndex: 5, background: rowBg, padding: "9px 10px", textAlign: "center", color: "#64748b", fontWeight: 700, border: "1px solid #e2e8f0" }}>{idx + 1}</td>
                      <td title={prod.prdlstNm} style={{ position: "sticky", left: 50, zIndex: 5, background: rowBg, padding: "9px 14px", maxWidth: 250, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", border: "1px solid #e2e8f0" }}>
                        <Link href={"/detail/" + prod.prdlstReportNo} style={{ color: "#0284c7", fontWeight: 800, textDecoration: "none" }} title={prod.prdlstNm}>{prod.prdlstNm}</Link>
                        <div style={{ fontSize: "0.66rem", color: "#94a3b8", fontFamily: "monospace" }}>{prod.prdlstReportNo}</div>
                      </td>
                      <td title={prod.bsshNm || "-"} style={{ position: "sticky", left: 300, zIndex: 5, background: rowBg, padding: "9px 12px", maxWidth: 170, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#334155", fontWeight: 600, border: "1px solid #e2e8f0" }}>{prod.bsshNm || "-"}</td>
                      <td style={{ position: "sticky", left: 470, zIndex: 5, background: rowBg, padding: "9px 10px", textAlign: "center", color: "#64748b", fontSize: "0.72rem", border: "1px solid #e2e8f0", borderRight: "2px solid #0d9488" }}>{prod.prmsDt || "-"}</td>
                      <td 
                        title={prod.total > 0 ? `${prod.total.toLocaleString()} KG` : '0 KG'}
                        style={{ padding: "9px 12px", textAlign: "right", fontWeight: 800, color: "#0d9488", background: "rgba(13, 148, 136, 0.04)", border: "1px solid #e2e8f0", cursor: "default" }}
                      >
                        {prod.total > 0 ? Math.round(prod.total).toLocaleString() : "-"}
                      </td>
                      {YEARS_10.map(yr => (
                        <td 
                          key={yr} 
                          title={prod.yearly?.[yr] ? `${prod.yearly[yr].toLocaleString()} KG` : '-'}
                          style={{ padding: "9px 8px", textAlign: "right", color: prod.yearly?.[yr] ? "#0f172a" : "#cbd5e1", fontWeight: prod.yearly?.[yr] ? 700 : 400, border: "1px solid #e2e8f0", cursor: prod.yearly?.[yr] ? "default" : "inherit" }}
                        >
                          {prod.yearly?.[yr] ? Math.round(prod.yearly[yr]).toLocaleString() : "-"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={15} style={{ padding: 40, textAlign: "center", color: "#94a3b8", border: "1px solid #e2e8f0" }}>선택된 조건에 해당하는 데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3-Pane 드릴다운 컴포넌트 ─────────────────────────────────────────────
function DrilldownPane({ ingredientsList }) {
  const [selectedIngr, setSelectedIngr] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState(new Set());
  const [drillData, setDrillData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [hoveredBar, setHoveredBar] = useState(null);

  const QUICK_TAGS = ["체지방", "여성갱년기", "수면", "간건강", "관절", "눈건강", "혈당", "콜레스테롤", "루바브", "아쉬와간다"];

  const filteredIngr = useMemo(() => {
    if (!searchQuery) return ingredientsList;
    const q = searchQuery.toLowerCase();
    return ingredientsList.filter(ing =>
      (ing.name && ing.name.toLowerCase().includes(q)) ||
      (ing.recognitionNumber && ing.recognitionNumber.toLowerCase().includes(q)) ||
      (ing.company && ing.company.toLowerCase().includes(q)) ||
      (ing.functionalityText && ing.functionalityText.toLowerCase().includes(q)) ||
      (ing.categories && ing.categories.toLowerCase().includes(q))
    );
  }, [ingredientsList, searchQuery]);

  const handleSelectIngr = useCallback(async (ing) => {
    setSelectedIngr(ing);
    setSelectedCompanies(new Set());
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/report?type=drilldown&ingredientId=" + ing.id);
      const json = await res.json();
      if (json.success) {
        setDrillData(json);
        setSelectedCompanies(new Set((json.companies || []).map(c => c.name)));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleCompany = (name) => {
    setSelectedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllCompanies = () => {
    if (!drillData?.companies) return;
    if (selectedCompanies.size === drillData.companies.length) {
      setSelectedCompanies(new Set());
    } else {
      setSelectedCompanies(new Set(drillData.companies.map(c => c.name)));
    }
  };

  const filteredProducts = useMemo(() => {
    if (!drillData?.allProducts) return [];
    if (selectedCompanies.size === 0 || selectedCompanies.size === (drillData.companies?.length || 0)) return drillData.allProducts;
    return drillData.allProducts.filter(p => selectedCompanies.has(p.bsshNm || "기타"));
  }, [drillData, selectedCompanies]);

  const filteredYearly = useMemo(() => {
    if (!drillData?.yearlyProduction) return [];
    if (selectedCompanies.size === 0 || selectedCompanies.size === (drillData.companies?.length || 0)) return drillData.yearlyProduction;
    return YEARS_10.slice().reverse().map(yr => {
      const total = filteredProducts.reduce((acc, p) => acc + (p.yearly?.[yr] || 0), 0);
      return { year: yr, amount: Math.round(total * 100) / 100 };
    });
  }, [drillData, selectedCompanies, filteredProducts]);

  const filteredTotal = filteredYearly.reduce((acc, y) => acc + y.amount, 0);
  const filteredTopCompanies = useMemo(() => {
    if (!drillData?.companies) return [];
    return drillData.companies.filter(c => selectedCompanies.has(c.name)).slice(0, 5);
  }, [drillData, selectedCompanies]);

  const maxBar = Math.max(...filteredYearly.map(y => y.amount), 1);

  const paneStyle = { background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", overflow: "hidden", display: "flex", flexDirection: "column" };
  const paneTitleStyle = { padding: "14px 18px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", fontWeight: 800, fontSize: "0.88rem", color: "#0f172a", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 };

  return (
    <>
      {showSheet && drillData && (
        <SheetModal data={drillData} selectedCompanies={selectedCompanies} onClose={() => setShowSheet(false)} />
      )}

      <div style={{ marginBottom: 16, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, marginRight: 4 }}>빠른 검색:</span>
        {QUICK_TAGS.map(tag => (
          <button key={tag} onClick={() => setSearchQuery(tag)}
            style={{ padding: "4px 10px", borderRadius: 14, border: "1.5px solid", borderColor: searchQuery === tag ? "#0d9488" : "#e2e8f0", background: searchQuery === tag ? "#f0fdfa" : "#fff", color: searchQuery === tag ? "#0d9488" : "#64748b", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
            {tag}
          </button>
        ))}
        {searchQuery && (
          <button onClick={() => setSearchQuery("")}
            style={{ padding: "4px 10px", borderRadius: 14, border: "1px solid #fca5a5", background: "#fff1f2", color: "#ef4444", fontSize: "0.74rem", fontWeight: 700, cursor: "pointer" }}>
            ✕ 초기화
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "28% 27% 45%", gap: 16, alignItems: "stretch", minHeight: 600 }}>

        {/* PANE 1 */}
        <div style={paneStyle}>
          <div style={paneTitleStyle}>
            <i className="fa-solid fa-flask" style={{ color: "#0d9488" }} />
            1단계: 개별인정원료 선택
            <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>{filteredIngr.length}건</span>
          </div>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.8rem" }} />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="소재명, 기능성, 업체명..."
                style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: "0.82rem", outline: "none", background: "#f8fafc", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 520 }}>
            {filteredIngr.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>검색 결과가 없습니다.</div>}
            {filteredIngr.map(ing => {
              const isSelected = selectedIngr?.id === ing.id;
              return (
                <div key={ing.id} onClick={() => handleSelectIngr(ing)}
                  style={{ padding: "11px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: isSelected ? "#f0fdfa" : "#fff", borderLeft: isSelected ? "3px solid #0d9488" : "3px solid transparent", transition: "all 0.12s" }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "#fff"; }}>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", color: isSelected ? "#0d9488" : "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={ing.name}>{ing.name}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                    {ing.recognitionNumber && <span style={{ fontSize: "0.7rem", color: "#0284c7", fontWeight: 700, background: "#e0f2fe", padding: "1px 6px", borderRadius: 3 }}>{ing.recognitionNumber}</span>}
                    {ing.company && <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }} title={ing.company}>🏢 {ing.company}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANE 2 */}
        <div style={paneStyle}>
          <div style={paneTitleStyle}>
            <i className="fa-solid fa-building" style={{ color: "#0284c7" }} />
            2단계: 제조사 선택
            {drillData && <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>{selectedCompanies.size}/{drillData.companies?.length || 0} 선택</span>}
          </div>
          {!selectedIngr && !loading && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#94a3b8", padding: 20 }}>
              <i className="fa-solid fa-arrow-left" style={{ fontSize: "1.8rem", marginBottom: 10, opacity: 0.4 }} />
              <p style={{ fontSize: "0.82rem", textAlign: "center", fontWeight: 600 }}>좌측에서 소재를 선택하면<br />제조사 목록이 표시됩니다</p>
            </div>
          )}
          {loading && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#94a3b8", gap: 10 }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem", color: "#0d9488" }} />
              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>데이터 집계 중...</span>
            </div>
          )}
          {drillData && !loading && (
            <>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={toggleAllCompanies}
                  style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #0d9488", borderRadius: 6, background: selectedCompanies.size === drillData.companies?.length ? "#0d9488" : "#fff", color: selectedCompanies.size === drillData.companies?.length ? "#fff" : "#0d9488", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer" }}>
                  {selectedCompanies.size === drillData.companies?.length ? "✓ 전체 선택됨" : "전체 선택"}
                </button>
                <button onClick={() => setSelectedCompanies(new Set())}
                  style={{ flex: 1, padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc", color: "#64748b", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer" }}>
                  전체 해제
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", maxHeight: 480 }}>
                {(drillData.companies || []).map((comp, idx) => {
                  const isChecked = selectedCompanies.has(comp.name);
                  const shareMax = drillData.companies[0]?.total || 1;
                  return (
                    <label key={comp.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: isChecked ? "#f0fdfa" : "#fff", transition: "background 0.1s" }}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleCompany(comp.name)}
                        style={{ marginTop: 2, accentColor: "#0d9488", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: "0.83rem", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }} title={comp.name}>{comp.name}</span>
                          <span style={{ fontSize: "0.7rem", color: "#0d9488", fontWeight: 800, flexShrink: 0 }}>{comp.share}%</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#64748b", marginTop: 1 }}>
                          <span>{comp.productCount}개 품목</span>
                          <span title={comp.total > 0 ? `${comp.total.toLocaleString()} KG` : ''} style={{ color: "#0284c7", cursor: comp.total > 0 ? "default" : "inherit" }}>
                            {comp.total > 0 ? Math.round(comp.total).toLocaleString() : "-"} KG
                          </span>
                        </div>
                        <div style={{ marginTop: 5, height: 3, background: "#f1f5f9", borderRadius: 2 }}>
                          <div style={{ width: Math.min((comp.total / shareMax) * 100, 100) + "%", height: "100%", background: COLORS[idx % COLORS.length], borderRadius: 2, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    </label>
                  );
                })}
                {(!drillData.companies || drillData.companies.length === 0) && (
                  <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>생산 이력이 있는 제조사가 없습니다.</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* PANE 3 */}
        <div style={paneStyle}>
          <div style={paneTitleStyle}>
            <i className="fa-solid fa-chart-pie" style={{ color: "#7c3aed" }} />
            3단계: 실시간 분석 브리핑
            {drillData && (
              <button onClick={() => setShowSheet(true)}
                style={{ marginLeft: "auto", padding: "5px 12px", background: "linear-gradient(135deg, #0d9488, #0284c7)", color: "#fff", border: "none", borderRadius: 6, fontWeight: 800, fontSize: "0.76rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, boxShadow: "0 2px 8px rgba(13,148,136,0.3)" }}>
                <i className="fa-solid fa-table" />
                심층 데이터 시트
              </button>
            )}
          </div>
          {!selectedIngr && !loading && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#94a3b8", gap: 14 }}>
              <div style={{ textAlign: "center" }}>
                <i className="fa-solid fa-chart-pie" style={{ fontSize: "2.5rem", opacity: 0.2, marginBottom: 12 }} />
                <p style={{ fontSize: "0.85rem", fontWeight: 600, lineHeight: 1.7 }}>1단계에서 소재를 선택하고<br />2단계에서 제조사를 필터링하면<br />분석 브리핑이 여기에 표시됩니다</p>
              </div>
            </div>
          )}
          {loading && (
            <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2.5rem", color: "#0d9488" }} />
                <p style={{ marginTop: 10, fontWeight: 600, color: "#64748b", fontSize: "0.82rem" }}>3-Way 데이터 집계 중...</p>
              </div>
            </div>
          )}
          {drillData && !loading && (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
              <div style={{ background: "linear-gradient(135deg, #0d9488, #0284c7)", borderRadius: 10, padding: "16px 18px", color: "#fff", marginBottom: 14 }}>
                <div style={{ fontSize: "0.7rem", opacity: 0.8, marginBottom: 4 }}>{drillData.ingredient?.recognitionNumber || ""}</div>
                <div style={{ fontWeight: 900, fontSize: "1.1rem", lineHeight: 1.3 }}>{drillData.ingredient?.name}</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.85, marginTop: 4 }}>{drillData.ingredient?.company || "-"} · {drillData.ingredient?.registeredDate || "-"}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {[
                  { label: "선택 품목 수", value: filteredProducts.length, unit: "개", color: "#0d9488" },
                  { label: "누적 생산량(KG)", value: Math.round(filteredTotal).toLocaleString(), tooltip: `${filteredTotal.toLocaleString()} KG`, unit: "KG", color: "#0284c7" },
                  { label: "선택 제조사", value: selectedCompanies.size, unit: "개사", color: "#7c3aed" },
                  { label: "CAGR", value: drillData.stats?.cagr > 0 ? "+" + drillData.stats.cagr : drillData.stats?.cagr || 0, unit: "%", color: "#f59e0b" },
                ].map(kpi => (
                  <div key={kpi.label} title={kpi.tooltip || ""} style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", borderLeft: "3px solid " + kpi.color, cursor: kpi.tooltip ? "default" : "inherit" }}>
                    <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700 }}>{kpi.label}</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 900, color: kpi.color, marginTop: 2 }}>
                      {kpi.value}<span style={{ fontSize: "0.75rem", fontWeight: 500, color: "#64748b" }}> {kpi.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "14px", marginBottom: 14 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#0f172a", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                  <span>연도별 생산량 추이</span>
                  <span style={{ fontSize: "0.7rem", color: "#0d9488", fontWeight: 700 }}>단위: KG</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", height: 100, gap: 4 }}>
                  {filteredYearly.map(y => {
                    const h = Math.max((y.amount / maxBar) * 100, y.amount > 0 ? 5 : 2);
                    const isHov = hoveredBar === y.year;
                    return (
                      <div key={y.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}
                        onMouseEnter={() => setHoveredBar(y.year)} onMouseLeave={() => setHoveredBar(null)}>
                        {isHov && (
                          <div style={{ position: "absolute", bottom: h + 8 + "%", left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "#fff", padding: "3px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 800, whiteSpace: "nowrap", zIndex: 5, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                            {y.year}년: {Math.round(y.amount).toLocaleString()} KG ({y.amount.toLocaleString()} KG)
                          </div>
                        )}
                        <div style={{ width: "100%", height: h + "%", background: isHov ? "#0284c7" : y.amount > 0 ? "#0d9488" : "#e2e8f0", borderRadius: "2px 2px 0 0", transition: "all 0.15s" }} />
                        <span style={{ fontSize: "0.6rem", color: "#94a3b8", marginTop: 2 }}>{y.year.slice(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {filteredTopCompanies.length > 0 && (
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "14px" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>주요 제조사 점유율</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filteredTopCompanies.map((comp, idx) => (
                      <div key={comp.name}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", fontWeight: 700, color: "#334155", marginBottom: 3 }}>
                          <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={comp.name}>{idx + 1}. {comp.name}</span>
                          <span style={{ color: COLORS[idx % COLORS.length] }}>{comp.share}% ({Math.round(comp.total).toLocaleString()} KG)</span>
                        </div>
                        <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3 }}>
                          <div style={{ width: Math.min(comp.share, 100) + "%", height: "100%", background: COLORS[idx % COLORS.length], borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────
export default function AnalyticsReportPage() {
  const [activeTab, setActiveTab] = useState("drilldown");
  const [ingredientsList, setIngredientsList] = useState([]);
  const [selectedIngrId, setSelectedIngrId] = useState("");
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [hoveredBar, setHoveredBar] = useState(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetch("/api/analytics/report?type=list")
      .then(res => res.json())
      .then(json => {
        if (json.success && json.ingredients) {
          setIngredientsList(json.ingredients);
          if (json.ingredients.length > 0) {
            const first = json.ingredients[0];
            setSelectedIngrId(first.id.toString());
            setAutocompleteQuery(first.name + " [" + (first.recognitionNumber || "-") + "] " + (first.company ? "(" + first.company + ")" : ""));
          }
        }
      }).catch(e => console.error(e));
  }, []);

  const fetchReport = useCallback(async () => {
    if (activeTab !== "ingredient" && activeTab !== "companies") return;
    setLoading(true);
    try {
      let url = "/api/analytics/report?type=" + activeTab;
      if (activeTab === "ingredient" && selectedIngrId) url += "&ingredientId=" + selectedIngrId;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setReportData(json);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeTab, selectedIngrId]);

  useEffect(() => {
    if (activeTab === "drilldown") return;
    if (activeTab === "ingredient" && !selectedIngrId && ingredientsList.length > 0) return;
    fetchReport();
  }, [activeTab, selectedIngrId, fetchReport]);

  const handleSelectIngredient = (ing) => {
    setSelectedIngrId(ing.id.toString());
    setAutocompleteQuery(ing.name + " [" + (ing.recognitionNumber || "-") + "] " + (ing.company ? "(" + ing.company + ")" : ""));
    setIsDropdownOpen(false);
  };

  const filteredIngredients = ingredientsList.filter(ing => {
    if (!autocompleteQuery) return true;
    const q = autocompleteQuery.toLowerCase();
    return (ing.name && ing.name.toLowerCase().includes(q)) || (ing.recognitionNumber && ing.recognitionNumber.toLowerCase().includes(q)) || (ing.company && ing.company.toLowerCase().includes(q));
  });

  const YEARS_10 = ["2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"];
  const COLORS_LOCAL = ["#0284c7", "#0d9488", "#7c3aed", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#f97316"];

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto 24px" }} className="no-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ background: "linear-gradient(135deg, #0d9488, #0284c7)", color: "#fff", padding: "3px 10px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 800 }}>3-Way Data Intelligence</span>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>품목신고 × 개별인정원료 × 생산실적 연계 분석</span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              <i className="fa-solid fa-chart-pie" style={{ color: "#0d9488", marginRight: 10 }} />통합 분석 레포트
            </h1>
          </div>
          <button onClick={() => window.print()} style={{ padding: "9px 18px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.86rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(15,23,42,0.2)" }}>
            <i className="fa-solid fa-print" /> PDF / 인쇄 레포트 출력
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, background: "#e2e8f0", padding: 4, borderRadius: 10, overflowX: "auto" }}>
          {[
            { key: "drilldown", label: "소재 인텔리전스 (3-Pane 드릴다운)", icon: "fa-layer-group" },
            { key: "ingredient", label: "원료별 시장 규모 & 생산 점유율", icon: "fa-flask" },
            { key: "companies", label: "제조사 생산 포트폴리오", icon: "fa-building" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ flex: 1, minWidth: 200, padding: "10px 14px", border: "none", borderRadius: 8, background: activeTab === tab.key ? "#fff" : "transparent", color: activeTab === tab.key ? "#0d9488" : "#64748b", fontWeight: activeTab === tab.key ? 800 : 600, fontSize: "0.88rem", cursor: "pointer", boxShadow: activeTab === tab.key ? "0 2px 6px rgba(0,0,0,0.06)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s" }}>
              <i className={"fa-solid " + tab.icon} />{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {activeTab === "drilldown" && <DrilldownPane ingredientsList={ingredientsList} />}

        {activeTab === "ingredient" && (
          <div>
            <div style={{ background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }} className="no-print">
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                <i className="fa-solid fa-magnifying-glass" style={{ color: "#0d9488", marginRight: 6 }} />개별인정형 원료 검색 및 선택 (원료명, 인정번호, 업체명 자동완성)
              </label>
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                  <input type="text" value={autocompleteQuery}
                    onChange={e => { setAutocompleteQuery(e.target.value); setIsDropdownOpen(true); }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="원료명(예: 루바브, 아쉬와간다, 루테인), 인정번호(제2020-1호), 업체명 입력..."
                    style={{ width: "100%", padding: "12px 42px 12px 16px", borderRadius: 8, border: "1.5px solid #0d9488", fontSize: "0.94rem", fontWeight: 700, color: "#0f172a", background: "#f0fdfa", outline: "none" }} />
                  {autocompleteQuery && (
                    <button onClick={() => { setAutocompleteQuery(""); setIsDropdownOpen(true); }} style={{ position: "absolute", right: 14, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.9rem" }}>
                      <i className="fa-solid fa-circle-xmark" />
                    </button>
                  )}
                </div>
                {isDropdownOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 320, overflowY: "auto", background: "#fff", borderRadius: 8, boxShadow: "0 10px 25px rgba(0,0,0,0.15)", border: "1px solid #e2e8f0", zIndex: 100 }}>
                    {filteredIngredients.length > 0 ? filteredIngredients.slice(0, 40).map(ing => (
                      <div key={ing.id} onClick={() => handleSelectIngredient(ing)}
                        style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: selectedIngrId === ing.id.toString() ? "#f0fdfa" : "#fff" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={e => (e.currentTarget.style.background = selectedIngrId === ing.id.toString() ? "#f0fdfa" : "#fff")}>
                        <div>
                          <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.9rem" }}>{ing.name}</span>
                          <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "#0d9488", fontWeight: 700 }}>[{ing.recognitionNumber || "-"}]</span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                          {ing.company ? <span style={{ color: "#0284c7" }}>🏢 {ing.company}</span> : <span style={{ color: "#94a3b8" }}>-</span>}
                        </div>
                      </div>
                    )) : <div style={{ padding: 18, textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>검색 결과가 없습니다.</div>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>추천 원료:</span>
                {["루바브뿌리추출물", "아쉬와간다추출물", "인삼가수분해농축액", "모로오렌지추출물", "감태추출물", "콜레우스포스콜리추출물"].map(tag => (
                  <button key={tag} onClick={() => { setAutocompleteQuery(tag); setIsDropdownOpen(true); }}
                    style={{ padding: "3px 9px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: "0.74rem", color: "#334155", cursor: "pointer", fontWeight: 600 }}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 80, textAlign: "center", color: "#94a3b8" }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2.5rem", color: "#0d9488" }} />
                <p style={{ marginTop: 14, fontWeight: 600 }}>3-Way 통합 데이터 집계 및 분석 레포트 생성 중...</p>
              </div>
            ) : reportData?.ingredient ? (
              <div id="print-area">
                <div style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", borderRadius: 14, padding: "24px 28px", color: "#fff", marginBottom: 20, boxShadow: "0 4px 14px rgba(13,148,136,0.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <span style={{ background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: 4, fontSize: "0.78rem", fontWeight: 700 }}>인정번호: {reportData.ingredient.recognitionNumber || "-"}</span>
                      <h2 style={{ fontSize: "1.65rem", fontWeight: 800, margin: "8px 0 6px" }}>{reportData.ingredient.name}</h2>
                      <p style={{ opacity: 0.95, fontSize: "0.9rem", margin: 0 }}>인정업체: <strong>{reportData.ingredient.company || "-"}</strong> · 등록연도/일자: {reportData.ingredient.registeredDate || "-"}</p>
                    </div>
                    {reportData.ingredient.categories && (
                      <div style={{ background: "rgba(255,255,255,0.18)", padding: "8px 14px", borderRadius: 8, textAlign: "right" }}>
                        <span style={{ fontSize: "0.72rem", opacity: 0.85, display: "block" }}>매핑 카테고리</span>
                        <strong style={{ fontSize: "0.95rem" }}>{reportData.ingredient.categories}</strong>
                      </div>
                    )}
                  </div>
                  {reportData.ingredient.functionalityText && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.2)", fontSize: "0.88rem", lineHeight: 1.6 }}>
                      <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                      <strong>기능성:</strong> {reportData.ingredient.functionalityText}
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 }}>
                  {[
                    { label: "총 함유 완제품 품목수", value: reportData.stats?.totalProductsCount?.toLocaleString() || 0, unit: "개 품목", sub: "실제 생산 품목: " + (reportData.stats?.activeProductionProducts || 0) + "개", color: "#0d9488" },
                    { label: "10개년 누적 총 생산량 (KG)", value: reportData.stats?.totalAllYears?.toLocaleString() || 0, unit: " KG", sub: "2016년 ~ 2025년 누적 생산 실적", color: "#0284c7" },
                    { label: "연평균 생산 성장률 (CAGR)", value: reportData.stats?.cagr > 0 ? "+" + reportData.stats.cagr : reportData.stats?.cagr || 0, unit: "%", sub: "유효 생산 구간 기준", color: "#7c3aed" },
                    { label: "최대 생산 제조사 (1위)", value: reportData.topCompanies?.[0]?.name || "데이터 없음", unit: "", sub: "점유율 " + (reportData.topCompanies?.[0]?.share || 0) + "% (" + (reportData.topCompanies?.[0]?.amount?.toLocaleString() || 0) + " KG)", color: "#f59e0b", isText: true },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ background: "#fff", padding: "18px 20px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderLeft: "4px solid " + kpi.color }}>
                      <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>{kpi.label}</div>
                      <div style={{ fontSize: kpi.isText ? "1.1rem" : "1.7rem", fontWeight: 800, color: kpi.color, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {kpi.value}<span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#64748b" }}>{kpi.unit}</span>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: kpi.color, marginTop: 4 }}>{kpi.sub}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div style={{ background: "#fff", padding: "20px 24px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                        <i className="fa-solid fa-chart-simple" style={{ color: "#0d9488", marginRight: 6 }} />연도별 총 생산량 추이 (2016~2025)
                      </h3>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0d9488", background: "#f0fdfa", padding: "3px 8px", borderRadius: 4 }}>단위: KG</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", height: 180, gap: 10, paddingTop: 20, position: "relative" }}>
                      {(() => {
                        const maxVal = Math.max(...(reportData.yearlyProduction || []).map(y => y.amount), 1);
                        return reportData.yearlyProduction?.map(y => {
                          const heightPct = Math.max((y.amount / maxVal) * 100, y.amount > 0 ? 6 : 2);
                          const isHovered = hoveredBar === y.year;
                          return (
                            <div key={y.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}
                              onMouseEnter={() => setHoveredBar(y.year)} onMouseLeave={() => setHoveredBar(null)}>
                              {isHovered && (
                                <div style={{ position: "absolute", bottom: Math.min(heightPct + 35, 90) + "%", background: "#0f172a", color: "#fff", padding: "4px 8px", borderRadius: 4, fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap", zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                                  {y.year}년: {y.amount?.toLocaleString()} KG
                                </div>
                              )}
                              <span style={{ fontSize: "0.68rem", color: y.amount > 0 ? "#0d9488" : "#cbd5e1", fontWeight: 700, marginBottom: 4 }}>{y.amount > 0 ? y.amount.toLocaleString() : ""}</span>
                              <div style={{ width: "100%", maxWidth: 32, height: heightPct + "%", background: isHovered ? "linear-gradient(180deg, #0284c7, #0369a1)" : y.amount > 0 ? "linear-gradient(180deg, #0d9488, #14b8a6)" : "#f1f5f9", borderRadius: "4px 4px 0 0", transition: "all 0.2s ease", cursor: "pointer" }} />
                              <span style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 6, fontWeight: 600 }}>{y.year.slice(2)}년</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #f1f5f9", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", textAlign: "center" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc", color: "#64748b" }}>
                            <th style={{ padding: "6px 4px", border: "1px solid #e2e8f0" }}>연도</th>
                            {reportData.yearlyProduction?.map(y => <th key={y.year} style={{ padding: "6px 4px", border: "1px solid #e2e8f0" }}>{y.year.slice(2)}년</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: "6px 4px", fontWeight: 800, background: "#f8fafc", color: "#0d9488", border: "1px solid #e2e8f0" }}>생산량(KG)</td>
                            {reportData.yearlyProduction?.map(y => (
                              <td key={y.year} style={{ padding: "6px 4px", fontWeight: y.amount > 0 ? 700 : 400, color: y.amount > 0 ? "#0f172a" : "#94a3b8", border: "1px solid #e2e8f0" }}>
                                {y.amount > 0 ? y.amount.toLocaleString() : "-"}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div style={{ background: "#fff", padding: "20px 24px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                      <i className="fa-solid fa-pie-chart" style={{ color: "#0284c7" }} />제조사별 점유율 Top 5
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {reportData.topCompanies?.map((comp, idx) => (
                        <div key={comp.name}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                            <span title={comp.name} style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{idx + 1}. {comp.name}</span>
                            <span style={{ color: "#0284c7" }}>{comp.share}% ({comp.amount?.toLocaleString()} KG)</span>
                          </div>
                          <div style={{ width: "100%", height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: comp.share + "%", height: "100%", background: COLORS_LOCAL[idx % COLORS_LOCAL.length], borderRadius: 4 }} />
                          </div>
                        </div>
                      ))}
                      {(!reportData.topCompanies || reportData.topCompanies.length === 0) && <p style={{ color: "#94a3b8", fontSize: "0.82rem", textAlign: "center", padding: 20 }}>생산 이력이 없습니다.</p>}
                    </div>
                  </div>
                </div>

                <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>해당 원료 함유 완제품 생산실적 랭킹 (Top 50)</h3>
                      <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "2px 0 0" }}>※ 제조업소 열까지 좌측 고정 / 우측 2025~2016년 생산량(KG) 가로 스크롤</p>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#0d9488", fontWeight: 700, background: "#f0fdfa", padding: "4px 10px", borderRadius: 6 }}>단위: KG</span>
                  </div>
                  <div style={{ overflowX: "auto", maxHeight: 560 }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", color: "#475569", position: "sticky", top: 0, zIndex: 10 }}>
                          <th style={{ position: "sticky", left: 0, zIndex: 12, background: "#f8fafc", padding: "12px 10px", textAlign: "center", width: 45, minWidth: 45, borderBottom: "2px solid #cbd5e1" }}>순위</th>
                          <th style={{ position: "sticky", left: 45, zIndex: 12, background: "#f8fafc", padding: "12px 14px", textAlign: "left", width: 240, minWidth: 240, borderBottom: "2px solid #cbd5e1" }}>품목명(제품명) / 보고번호</th>
                          <th style={{ position: "sticky", left: 285, zIndex: 12, background: "#f8fafc", padding: "12px 12px", textAlign: "left", width: 170, minWidth: 170, borderBottom: "2px solid #cbd5e1", borderRight: "2px solid #0d9488" }}>제조업소</th>
                          <th style={{ padding: "12px 12px", textAlign: "right", width: 110, minWidth: 110, background: "#f0fdfa", color: "#0d9488", fontWeight: 800, borderBottom: "2px solid #cbd5e1" }}>총 합계</th>
                          {YEARS_10.map(yr => <th key={yr} style={{ padding: "12px 10px", textAlign: "right", width: 85, minWidth: 85, borderBottom: "2px solid #cbd5e1" }}>{yr}년</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.topProducts?.map((prod, idx) => (
                          <tr key={prod.prdlstReportNo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ position: "sticky", left: 0, zIndex: 5, background: idx % 2 === 0 ? "#fff" : "#fcfcfd", padding: "10px 10px", textAlign: "center", color: "#94a3b8", fontWeight: 700, borderBottom: "1px solid #f1f5f9" }}>{idx + 1}</td>
                            <td title={prod.prdlstNm} style={{ position: "sticky", left: 45, zIndex: 5, background: idx % 2 === 0 ? "#fff" : "#fcfcfd", padding: "10px 14px", maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderBottom: "1px solid #f1f5f9" }}>
                              <Link href={"/detail/" + prod.prdlstReportNo} style={{ color: "#0284c7", fontWeight: 700, textDecoration: "none" }} title={prod.prdlstNm}>{prod.prdlstNm}</Link>
                              <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontFamily: "monospace" }}>{prod.prdlstReportNo}</div>
                            </td>
                            <td title={prod.bsshNm || "-"} style={{ position: "sticky", left: 285, zIndex: 5, background: idx % 2 === 0 ? "#fff" : "#fcfcfd", padding: "10px 12px", maxWidth: 170, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#334155", borderBottom: "1px solid #f1f5f9", borderRight: "2px solid #0d9488" }}>{prod.bsshNm || "-"}</td>
                            <td 
                              title={prod.total ? `${prod.total.toLocaleString()} KG` : '0 KG'}
                              style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#0d9488", background: "#f0fdfa", borderBottom: "1px solid #f1f5f9", cursor: "default" }}
                            >
                              {prod.total ? Math.round(prod.total).toLocaleString() : "0"}
                            </td>
                            {YEARS_10.map(yr => (
                              <td 
                                key={yr} 
                                title={prod.yearly[yr] ? `${prod.yearly[yr].toLocaleString()} KG` : '-'}
                                style={{ padding: "10px 10px", textAlign: "right", color: prod.yearly[yr] ? "#0f172a" : "#cbd5e1", fontWeight: prod.yearly[yr] ? 600 : 400, borderBottom: "1px solid #f1f5f9", cursor: prod.yearly[yr] ? "default" : "inherit" }}
                              >
                                {prod.yearly[yr] ? Math.round(prod.yearly[yr]).toLocaleString() : "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === "companies" && (
          <div>
            <div style={{ background: "#fff", padding: 24, borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }}>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>주요 건강기능식품 제조업체 생산 랭킹 (2025년 기준)</h2>
              <p style={{ color: "#64748b", fontSize: "0.86rem", margin: 0 }}>최신 생산실적 기준 상위 OEM/ODM 제조사 생산량 비교</p>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", textAlign: "center", width: 60 }}>순위</th>
                    <th style={{ padding: "12px 16px", textAlign: "left" }}>제조업체명</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", width: 180 }}>2025년 생산량(KG)</th>
                    <th style={{ padding: "12px 16px", textAlign: "center", width: 140 }}>상세 분석</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} style={{ padding: 40, textAlign: "center" }}><i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2rem", color: "#0d9488" }} /></td></tr>
                  ) : reportData?.ranking?.map((comp, idx) => (
                    <tr key={comp.company} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: "#94a3b8" }}>{idx + 1}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>{comp.company}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#0284c7" }}>{comp.amount?.toLocaleString()} KG</td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <Link href={"/companies/" + encodeURIComponent(comp.company)} style={{ padding: "5px 12px", background: "#e0f2fe", color: "#0369a1", borderRadius: 6, fontSize: "0.75rem", fontWeight: 700, textDecoration: "none" }}>
                          업체 현황 보기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          main { padding: 0 !important; }
          #print-area { width: 100% !important; }
        }
      `}</style>
    </main>
  );
}
