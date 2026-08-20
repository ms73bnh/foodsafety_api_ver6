"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

export default function AnalyticsReportPage() {
  const [activeTab, setActiveTab] = useState("ingredient"); // 'ingredient' | 'insight' | 'companies'
  
  // 1. 원료 선택 & 자동완성 상태
  const [ingredientsList, setIngredientsList] = useState([]);
  const [selectedIngrId, setSelectedIngrId] = useState("");
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // 2. 심층 인텔리전스 검색어 상태
  const [insightKeyword, setInsightKeyword] = useState("루바브");
  const [insightInput, setInsightInput] = useState("루바브");

  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [hoveredBar, setHoveredBar] = useState(null);

  // 외부 클릭 시 자동완성 닫기
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. 원료 목록 로드 (드롭다운/자동완성용)
  useEffect(() => {
    fetch("/api/analytics/report?type=list")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.ingredients) {
          setIngredientsList(json.ingredients);
          if (json.ingredients.length > 0) {
            const first = json.ingredients[0];
            setSelectedIngrId(first.id.toString());
            setAutocompleteQuery(`${first.name} [${first.recognitionNumber || "-"}] ${first.company ? `(${first.company})` : ""}`);
          }
        }
      })
      .catch((e) => console.error(e));
  }, []);

  // 2. 리포트 데이터 로드
  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/analytics/report?type=${activeTab}`;
      if (activeTab === "ingredient" && selectedIngrId) {
        url += `&ingredientId=${selectedIngrId}`;
      } else if (activeTab === "insight") {
        url += `&search=${encodeURIComponent(insightKeyword)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setReportData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedIngrId, insightKeyword]);

  useEffect(() => {
    if (activeTab === "ingredient" && !selectedIngrId && ingredientsList.length > 0) return;
    fetchReport();
  }, [activeTab, selectedIngrId, insightKeyword, fetchReport]);

  const handleSelectIngredient = (ing) => {
    setSelectedIngrId(ing.id.toString());
    setAutocompleteQuery(`${ing.name} [${ing.recognitionNumber || "-"}] ${ing.company ? `(${ing.company})` : ""}`);
    setIsDropdownOpen(false);
  };

  const handleInsightSearch = (e) => {
    e.preventDefault();
    if (insightInput.trim()) {
      setInsightKeyword(insightInput.trim());
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // 자동완성 필터링
  const filteredIngredients = ingredientsList.filter((ing) => {
    if (!autocompleteQuery) return true;
    const q = autocompleteQuery.toLowerCase();
    return (
      (ing.name && ing.name.toLowerCase().includes(q)) ||
      (ing.recognitionNumber && ing.recognitionNumber.toLowerCase().includes(q)) ||
      (ing.company && ing.company.toLowerCase().includes(q))
    );
  });

  const YEARS_10 = ["2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"];

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "32px 20px" }}>
      {/* 상단 헤더 & 컨트롤 */}
      <div style={{ maxWidth: 1280, margin: "0 auto 24px" }} className="no-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ background: "linear-gradient(135deg, #0d9488, #0284c7)", color: "#fff", padding: "3px 10px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 800 }}>
                3-Way Data Intelligence
              </span>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>품목신고 × 개별인정원료 × 생산실적 연계 분석</span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              <i className="fa-solid fa-chart-pie" style={{ color: "#0d9488", marginRight: 10 }} />
              통합 분석 레포트
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handlePrint}
              style={{
                padding: "9px 18px",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: "0.86rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(15,23,42,0.2)",
              }}
            >
              <i className="fa-solid fa-print" /> PDF / 인쇄 레포트 출력
            </button>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div style={{ display: "flex", gap: 8, background: "#e2e8f0", padding: 4, borderRadius: 10, overflowX: "auto" }}>
          {[
            { key: "ingredient", label: "원료별 시장 규모 & 생산 점유율", icon: "fa-flask" },
            { key: "insight", label: "기능성 소재 & 품목 인텔리전스 (심층 분석)", icon: "fa-magnifying-glass-chart" },
            { key: "companies", label: "제조사 생산 포트폴리오", icon: "fa-building" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: "10px 14px",
                border: "none",
                borderRadius: 8,
                background: activeTab === tab.key ? "#fff" : "transparent",
                color: activeTab === tab.key ? "#0d9488" : "#64748b",
                fontWeight: activeTab === tab.key ? 800 : 600,
                fontSize: "0.88rem",
                cursor: "pointer",
                boxShadow: activeTab === tab.key ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.15s",
              }}
            >
              <i className={`fa-solid ${tab.icon}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 영역 */}
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* ========================================================
            TAB 1: 원료별 시장 규모 & 생산 점유율 리포트
        ======================================================== */}
        {activeTab === "ingredient" && (
          <div>
            {/* 원료 자동완성 검색 바 */}
            <div style={{ background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }} className="no-print">
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                <i className="fa-solid fa-magnifying-glass" style={{ color: "#0d9488", marginRight: 6 }} />
                개별인정형 원료 검색 및 선택 (원료명, 인정번호, 업체명 자동완성)
              </label>

              <div ref={dropdownRef} style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                  <input
                    type="text"
                    value={autocompleteQuery}
                    onChange={(e) => {
                      setAutocompleteQuery(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="원료명(예: 루바브, 아쉬와간다, 루테인), 인정번호(제2020-1호), 업체명 입력..."
                    style={{
                      width: "100%",
                      padding: "12px 42px 12px 16px",
                      borderRadius: 8,
                      border: "1.5px solid #0d9488",
                      fontSize: "0.94rem",
                      fontWeight: 700,
                      color: "#0f172a",
                      background: "#f0fdfa",
                      outline: "none",
                    }}
                  />
                  {autocompleteQuery && (
                    <button
                      onClick={() => {
                        setAutocompleteQuery("");
                        setIsDropdownOpen(true);
                      }}
                      style={{
                        position: "absolute",
                        right: 14,
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                      }}
                    >
                      <i className="fa-solid fa-circle-xmark" />
                    </button>
                  )}
                </div>

                {/* 드롭다운 결과 목록 */}
                {isDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      maxHeight: 320,
                      overflowY: "auto",
                      background: "#fff",
                      borderRadius: 8,
                      boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                      border: "1px solid #e2e8f0",
                      zIndex: 100,
                    }}
                  >
                    {filteredIngredients.length > 0 ? (
                      filteredIngredients.slice(0, 40).map((ing) => (
                        <div
                          key={ing.id}
                          onClick={() => handleSelectIngredient(ing)}
                          style={{
                            padding: "10px 16px",
                            borderBottom: "1px solid #f1f5f9",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: selectedIngrId === ing.id.toString() ? "#f0fdfa" : "#fff",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = selectedIngrId === ing.id.toString() ? "#f0fdfa" : "#fff")}
                        >
                          <div>
                            <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.9rem" }}>{ing.name}</span>
                            <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "#0d9488", fontWeight: 700 }}>
                              [{ing.recognitionNumber || "-"}]
                            </span>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                            {ing.company ? <span style={{ color: "#0284c7" }}>🏢 {ing.company}</span> : <span style={{ color: "#94a3b8" }}>-</span>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: 18, textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
                        검색 결과가 없습니다.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 빠른 추천 원료 태그 */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>추천 원료:</span>
                {["루바브뿌리추출물", "아쉬와간다추출물", "인삼가수분해농축액", "모로오렌지추출물", "Lactobacillus gasseri BNR17", "감태추출물", "콜레우스포스콜리추출물"].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setAutocompleteQuery(tag);
                      setIsDropdownOpen(true);
                    }}
                    style={{
                      padding: "3px 9px",
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      fontSize: "0.74rem",
                      color: "#334155",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
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
                {/* 1. 원료 헤더 요약 카드 */}
                <div style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", borderRadius: 14, padding: "24px 28px", color: "#fff", marginBottom: 20, boxShadow: "0 4px 14px rgba(13,148,136,0.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <span style={{ background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: 4, fontSize: "0.78rem", fontWeight: 700 }}>
                        인정번호: {reportData.ingredient.recognitionNumber || "-"}
                      </span>
                      <h2 style={{ fontSize: "1.65rem", fontWeight: 800, margin: "8px 0 6px" }}>
                        {reportData.ingredient.name}
                      </h2>
                      <p style={{ opacity: 0.95, fontSize: "0.9rem", margin: 0 }}>
                        인정업체: <strong>{reportData.ingredient.company || "-"}</strong> · 등록연도/일자: {reportData.ingredient.registeredDate || "-"}
                      </p>
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

                {/* 2. 핵심 KPI 4종 지표 카드 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 }}>
                  <div style={{ background: "#fff", padding: "18px 20px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderLeft: "4px solid #0d9488" }}>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>총 함유 완제품 품목수</div>
                    <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
                      {reportData.stats?.totalProductsCount?.toLocaleString() || 0}<span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#64748b" }}>개 품목</span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#0d9488", marginTop: 4 }}>
                      실제 생산 품목: {reportData.stats?.activeProductionProducts || 0}개
                    </div>
                  </div>

                  <div style={{ background: "#fff", padding: "18px 20px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderLeft: "4px solid #0284c7" }}>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>10개년 누적 총 생산량 (KG)</div>
                    <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0284c7", marginTop: 4 }}>
                      {reportData.stats?.totalAllYears?.toLocaleString() || 0}<span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#64748b" }}> KG</span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 4 }}>
                      2016년 ~ 2025년 누적 생산 실적
                    </div>
                  </div>

                  <div style={{ background: "#fff", padding: "18px 20px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderLeft: "4px solid #7c3aed" }}>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>연평균 생산 성장률 (CAGR)</div>
                    <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#7c3aed", marginTop: 4 }}>
                      {reportData.stats?.cagr > 0 ? `+${reportData.stats.cagr}%` : `${reportData.stats?.cagr || 0}%`}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 4 }}>
                      유효 생산 구간 기준
                    </div>
                  </div>

                  <div style={{ background: "#fff", padding: "18px 20px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderLeft: "4px solid #f59e0b" }}>
                    <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>최대 생산 제조사 (1위)</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {reportData.topCompanies?.[0]?.name || "데이터 없음"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#f59e0b", fontWeight: 700, marginTop: 4 }}>
                      점유율 {reportData.topCompanies?.[0]?.share || 0}% ({reportData.topCompanies?.[0]?.amount?.toLocaleString() || 0} KG)
                    </div>
                  </div>
                </div>

                {/* 3. 연도별 생산량 추이 (그래프 + 10개년 데이터 테이블) & 제조사 점유율 */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
                  {/* 연도별 생산량 바 차트 + 하단 테이블 */}
                  <div style={{ background: "#fff", padding: "20px 24px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                        <i className="fa-solid fa-chart-simple" style={{ color: "#0d9488" }} />
                        연도별 총 생산량 추이 (2016~2025)
                      </h3>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0d9488", background: "#f0fdfa", padding: "3px 8px", borderRadius: 4 }}>
                        단위: KG
                      </span>
                    </div>

                    {/* 바 차트 */}
                    <div style={{ display: "flex", alignItems: "flex-end", height: 180, gap: 10, paddingTop: 20, position: "relative" }}>
                      {(() => {
                        const maxVal = Math.max(...(reportData.yearlyProduction || []).map((y) => y.amount), 1);
                        return reportData.yearlyProduction?.map((y) => {
                          const heightPct = Math.max((y.amount / maxVal) * 100, y.amount > 0 ? 6 : 2);
                          const isHovered = hoveredBar === y.year;
                          return (
                            <div
                              key={y.year}
                              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}
                              onMouseEnter={() => setHoveredBar(y.year)}
                              onMouseLeave={() => setHoveredBar(null)}
                            >
                              {/* 툴팁 */}
                              {isHovered && (
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: `${Math.min(heightPct + 35, 90)}%`,
                                    background: "#0f172a",
                                    color: "#fff",
                                    padding: "4px 8px",
                                    borderRadius: 4,
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    zIndex: 10,
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                                  }}
                                >
                                  {y.year}년: {y.amount?.toLocaleString()} KG
                                </div>
                              )}

                              {/* 전체 숫자 라벨 */}
                              <span style={{ fontSize: "0.68rem", color: y.amount > 0 ? "#0d9488" : "#cbd5e1", fontWeight: 700, marginBottom: 4 }}>
                                {y.amount > 0 ? y.amount.toLocaleString() : ""}
                              </span>

                              <div
                                style={{
                                  width: "100%",
                                  maxWidth: 32,
                                  height: `${heightPct}%`,
                                  background: isHovered
                                    ? "linear-gradient(180deg, #0284c7, #0369a1)"
                                    : y.amount > 0
                                    ? "linear-gradient(180deg, #0d9488, #14b8a6)"
                                    : "#f1f5f9",
                                  borderRadius: "4px 4px 0 0",
                                  transition: "all 0.2s ease",
                                  cursor: "pointer",
                                }}
                              />
                              <span style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 6, fontWeight: 600 }}>{y.year.slice(2)}년</span>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* 차트 하단 10개년 연도별 생산량(KG) 테이블 */}
                    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #f1f5f9", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", textAlign: "center" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc", color: "#64748b" }}>
                            <th style={{ padding: "6px 4px", border: "1px solid #e2e8f0" }}>연도</th>
                            {reportData.yearlyProduction?.map((y) => (
                              <th key={y.year} style={{ padding: "6px 4px", border: "1px solid #e2e8f0" }}>
                                {y.year.slice(2)}년
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: "6px 4px", fontWeight: 800, background: "#f8fafc", color: "#0d9488", border: "1px solid #e2e8f0" }}>
                              생산량(KG)
                            </td>
                            {reportData.yearlyProduction?.map((y) => (
                              <td key={y.year} style={{ padding: "6px 4px", fontWeight: y.amount > 0 ? 700 : 400, color: y.amount > 0 ? "#0f172a" : "#94a3b8", border: "1px solid #e2e8f0" }}>
                                {y.amount > 0 ? y.amount.toLocaleString() : "-"}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 제조사 점유율 Top 5 */}
                  <div style={{ background: "#fff", padding: "20px 24px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                      <i className="fa-solid fa-pie-chart" style={{ color: "#0284c7" }} />
                      제조사별 점유율 Top 5
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {reportData.topCompanies?.map((comp, idx) => (
                        <div key={comp.name}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                            <span title={comp.name} style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {idx + 1}. {comp.name}
                            </span>
                            <span style={{ color: "#0284c7" }}>
                              {comp.share}% ({comp.amount?.toLocaleString()} KG)
                            </span>
                          </div>
                          <div style={{ width: "100%", height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${comp.share}%`,
                                height: "100%",
                                background: idx === 0 ? "#0284c7" : idx === 1 ? "#0d9488" : idx === 2 ? "#7c3aed" : "#f59e0b",
                                borderRadius: 4,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      {(!reportData.topCompanies || reportData.topCompanies.length === 0) && (
                        <p style={{ color: "#94a3b8", fontSize: "0.82rem", textAlign: "center", padding: 20 }}>생산 이력이 없습니다.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. 해당 원료 함유 상위 완제품 생산실적 매트릭스 테이블 (10개년 전체 & 제형 열까지 틀고정) */}
                <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                        해당 원료 함유 완제품 생산실적 랭킹 (Top 50)
                      </h3>
                      <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "2px 0 0" }}>
                        ※ 제형 열까지 좌측 고정 / 우측 2025~2016년 생산량(KG) 가로 스크롤
                      </p>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#0d9488", fontWeight: 700, background: "#f0fdfa", padding: "4px 10px", borderRadius: 6 }}>
                      단위: KG
                    </span>
                  </div>

                  <div style={{ overflowX: "auto", maxHeight: 560 }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", color: "#475569", position: "sticky", top: 0, zIndex: 10 }}>
                          {/* 틀고정 1: 순위 */}
                          <th style={{ position: "sticky", left: 0, zIndex: 12, background: "#f8fafc", padding: "12px 10px", textAlign: "center", width: 45, minWidth: 45, borderBottom: "2px solid #cbd5e1" }}>
                            순위
                          </th>
                          {/* 틀고정 2: 품목명 */}
                          <th style={{ position: "sticky", left: 45, zIndex: 12, background: "#f8fafc", padding: "12px 14px", textAlign: "left", width: 220, minWidth: 220, borderBottom: "2px solid #cbd5e1" }}>
                            품목명(제품명) / 보고번호
                          </th>
                          {/* 틀고정 3: 제조업소 */}
                          <th style={{ position: "sticky", left: 265, zIndex: 12, background: "#f8fafc", padding: "12px 12px", textAlign: "left", width: 140, minWidth: 140, borderBottom: "2px solid #cbd5e1" }}>
                            제조업소
                          </th>
                          {/* 틀고정 4: 제형 */}
                          <th style={{ position: "sticky", left: 405, zIndex: 12, background: "#f8fafc", padding: "12px 10px", textAlign: "center", width: 75, minWidth: 75, borderBottom: "2px solid #cbd5e1", borderRight: "2px solid #cbd5e1" }}>
                            제형
                          </th>

                          {/* 스크롤 영역: 총 합계 + 10개년 */}
                          <th style={{ padding: "12px 12px", textAlign: "right", width: 110, minWidth: 110, background: "#f0fdfa", color: "#0d9488", fontWeight: 800, borderBottom: "2px solid #cbd5e1" }}>
                            총 합계
                          </th>
                          {YEARS_10.map((yr) => (
                            <th key={yr} style={{ padding: "12px 10px", textAlign: "right", width: 85, minWidth: 85, borderBottom: "2px solid #cbd5e1" }}>
                              {yr}년
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.topProducts?.map((prod, idx) => (
                          <tr key={prod.prdlstReportNo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            {/* 틀고정 1: 순위 */}
                            <td style={{ position: "sticky", left: 0, zIndex: 5, background: idx % 2 === 0 ? "#fff" : "#fcfcfd", padding: "10px 10px", textAlign: "center", color: "#94a3b8", fontWeight: 700, borderBottom: "1px solid #f1f5f9" }}>
                              {idx + 1}
                            </td>

                            {/* 틀고정 2: 품목명 */}
                            <td
                              title={prod.prdlstNm}
                              style={{
                                position: "sticky",
                                left: 45,
                                zIndex: 5,
                                background: idx % 2 === 0 ? "#fff" : "#fcfcfd",
                                padding: "10px 14px",
                                maxWidth: 220,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <Link
                                href={`/detail/${prod.prdlstReportNo}`}
                                style={{ color: "#0284c7", fontWeight: 700, textDecoration: "none" }}
                                title={prod.prdlstNm}
                              >
                                {prod.prdlstNm}
                              </Link>
                              <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontFamily: "monospace" }}>{prod.prdlstReportNo}</div>
                            </td>

                            {/* 틀고정 3: 제조업소 */}
                            <td
                              title={prod.bsshNm || "-"}
                              style={{
                                position: "sticky",
                                left: 265,
                                zIndex: 5,
                                background: idx % 2 === 0 ? "#fff" : "#fcfcfd",
                                padding: "10px 12px",
                                maxWidth: 140,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: "#334155",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {prod.bsshNm || "-"}
                            </td>

                            {/* 틀고정 4: 제형 */}
                            <td
                              style={{
                                position: "sticky",
                                left: 405,
                                zIndex: 5,
                                background: idx % 2 === 0 ? "#fff" : "#fcfcfd",
                                padding: "10px 10px",
                                textAlign: "center",
                                color: "#64748b",
                                borderBottom: "1px solid #f1f5f9",
                                borderRight: "2px solid #cbd5e1",
                              }}
                            >
                              {prod.dispos || "-"}
                            </td>

                            {/* 스크롤 영역: 총 합계 */}
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#0d9488", background: "#f0fdfa", borderBottom: "1px solid #f1f5f9" }}>
                              {prod.total?.toLocaleString() || 0}
                            </td>

                            {/* 10개년 생산량 */}
                            {YEARS_10.map((yr) => (
                              <td
                                key={yr}
                                style={{
                                  padding: "10px 10px",
                                  textAlign: "right",
                                  color: prod.yearly[yr] ? "#0f172a" : "#cbd5e1",
                                  fontWeight: prod.yearly[yr] ? 600 : 400,
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                {prod.yearly[yr] ? prod.yearly[yr].toLocaleString() : "-"}
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

        {/* ========================================================
            TAB 2: 기능성 소재 & 품목 인텔리전스 (심층 분석)
        ======================================================== */}
        {activeTab === "insight" && (
          <div>
            {/* 검색 폼 */}
            <div style={{ background: "#fff", padding: 22, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }} className="no-print">
              <form onSubmit={handleInsightSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                    <i className="fa-solid fa-magnifying-glass-chart" style={{ color: "#0284c7", marginRight: 6 }} />
                    분석할 소재/기능성 키워드 입력
                  </label>
                  <input
                    type="text"
                    value={insightInput}
                    onChange={(e) => setInsightInput(e.target.value)}
                    placeholder="예: 루바브, 체지방, 갱년기, 수면, 관절, 혈당, 간건강 등..."
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1.5px solid #0284c7",
                      fontSize: "0.92rem",
                      fontWeight: 700,
                      outline: "none",
                      background: "#f0f9ff",
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    marginTop: 22,
                    padding: "11px 22px",
                    background: "#0284c7",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(2,132,199,0.3)",
                  }}
                >
                  심층 인텔리전스 분석
                </button>
              </form>

              {/* 빠른 추천 키워드 */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>추천 키워드:</span>
                {["루바브", "체지방", "여성갱년기", "수면", "간건강", "관절", "눈건강", "혈당", "콜레스테롤"].map((kw) => (
                  <button
                    key={kw}
                    onClick={() => {
                      setInsightInput(kw);
                      setInsightKeyword(kw);
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 14,
                      border: "1px solid #cbd5e1",
                      background: insightKeyword === kw ? "#0284c7" : "#fff",
                      color: insightKeyword === kw ? "#fff" : "#475569",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 80, textAlign: "center", color: "#94a3b8" }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2.5rem", color: "#0284c7" }} />
                <p style={{ marginTop: 14, fontWeight: 600 }}>[{insightKeyword}] 심층 연계 데이터 분석 중...</p>
              </div>
            ) : reportData?.type === "insight" ? (
              <div>
                {/* 1. 분석 개요 카드 */}
                <div style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", borderRadius: 14, padding: "24px 28px", color: "#fff", marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <span style={{ background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>
                        소재 & 품목 통합 인텔리전스
                      </span>
                      <h2 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "8px 0 4px" }}>
                        &apos;{reportData.keyword}&apos; 연계 시장 & 품목 분석
                      </h2>
                      <p style={{ opacity: 0.9, fontSize: "0.86rem", margin: 0 }}>
                        개별인정원료 매핑: <strong>{reportData.stats?.ingredientCount}건</strong> · 완제품 품목: <strong>{reportData.stats?.productCount}건</strong> · 총 생산량: <strong>{reportData.stats?.totalAmount?.toLocaleString()} KG</strong>
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. 연도별 생산량 추이 + 주요 제조사 점유율 */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div style={{ background: "#fff", padding: 22, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                        연도별 총 생산량 추이 (2016~2025)
                      </h3>
                      <span style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 700 }}>단위: KG</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", height: 160, gap: 10, paddingTop: 10 }}>
                      {(() => {
                        const maxVal = Math.max(...(reportData.yearlyTrend || []).map((y) => y.amount), 1);
                        return reportData.yearlyTrend?.map((y) => {
                          const heightPct = Math.max((y.amount / maxVal) * 100, y.amount > 0 ? 6 : 2);
                          return (
                            <div key={y.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                              <span style={{ fontSize: "0.64rem", color: "#0284c7", fontWeight: 700, marginBottom: 4 }}>
                                {y.amount > 0 ? y.amount.toLocaleString() : ""}
                              </span>
                              <div
                                style={{
                                  width: "100%",
                                  maxWidth: 30,
                                  height: `${heightPct}%`,
                                  background: "linear-gradient(180deg, #0284c7, #38bdf8)",
                                  borderRadius: "4px 4px 0 0",
                                }}
                              />
                              <span style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 6 }}>{y.year.slice(2)}년</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div style={{ background: "#fff", padding: 22, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: "0 0 14px" }}>
                      주요 생산 기업 (Top 8)
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {reportData.topCompanies?.map((comp, idx) => (
                        <div key={comp.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                          <span style={{ fontWeight: 600, color: "#334155", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {idx + 1}. {comp.name}
                          </span>
                          <span style={{ fontWeight: 800, color: "#0284c7" }}>
                            {comp.share}% ({comp.amount?.toLocaleString()} KG)
                          </span>
                        </div>
                      ))}
                      {(!reportData.topCompanies || reportData.topCompanies.length === 0) && (
                        <p style={{ color: "#94a3b8", fontSize: "0.82rem", textAlign: "center" }}>생산 이력이 없습니다.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. 완제품 품목 허가일자 & 10개년 생산실적 타임라인 매트릭스 */}
                <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                        &apos;{reportData.keyword}&apos; 연계 완제품 품목 리스트 & 생산실적
                      </h3>
                      <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "2px 0 0" }}>
                        허가일자, 제조사, 제형 및 2025~2016년 생산량 타임라인
                      </p>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#0284c7", fontWeight: 700 }}>단위: KG</span>
                  </div>

                  <div style={{ overflowX: "auto", maxHeight: 500 }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", color: "#475569", position: "sticky", top: 0, zIndex: 10 }}>
                          <th style={{ position: "sticky", left: 0, zIndex: 12, background: "#f8fafc", padding: "10px", textAlign: "center", width: 45, borderBottom: "2px solid #cbd5e1" }}>
                            순위
                          </th>
                          <th style={{ position: "sticky", left: 45, zIndex: 12, background: "#f8fafc", padding: "10px 14px", textAlign: "left", width: 200, minWidth: 200, borderBottom: "2px solid #cbd5e1" }}>
                            품목명(제품명)
                          </th>
                          <th style={{ position: "sticky", left: 245, zIndex: 12, background: "#f8fafc", padding: "10px 12px", textAlign: "left", width: 140, minWidth: 140, borderBottom: "2px solid #cbd5e1" }}>
                            제조업소
                          </th>
                          <th style={{ position: "sticky", left: 385, zIndex: 12, background: "#f8fafc", padding: "10px", textAlign: "center", width: 95, minWidth: 95, borderBottom: "2px solid #cbd5e1", borderRight: "2px solid #cbd5e1" }}>
                            허가일자
                          </th>

                          <th style={{ padding: "10px 12px", textAlign: "right", width: 100, background: "#f0f9ff", color: "#0284c7", fontWeight: 800, borderBottom: "2px solid #cbd5e1" }}>
                            총 합계
                          </th>
                          {YEARS_10.map((yr) => (
                            <th key={yr} style={{ padding: "10px 8px", textAlign: "right", width: 80, borderBottom: "2px solid #cbd5e1" }}>
                              {yr}년
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.productList?.map((prod, idx) => (
                          <tr key={prod.prdlstReportNo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ position: "sticky", left: 0, zIndex: 5, background: idx % 2 === 0 ? "#fff" : "#fcfcfd", padding: "9px 10px", textAlign: "center", color: "#94a3b8", fontWeight: 700, borderBottom: "1px solid #f1f5f9" }}>
                              {idx + 1}
                            </td>
                            <td
                              title={prod.prdlstNm}
                              style={{
                                position: "sticky",
                                left: 45,
                                zIndex: 5,
                                background: idx % 2 === 0 ? "#fff" : "#fcfcfd",
                                padding: "9px 14px",
                                maxWidth: 200,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <Link href={`/detail/${prod.prdlstReportNo}`} style={{ color: "#0284c7", fontWeight: 700, textDecoration: "none" }} title={prod.prdlstNm}>
                                {prod.prdlstNm}
                              </Link>
                              <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{prod.prdlstReportNo}</div>
                            </td>
                            <td
                              title={prod.bsshNm || "-"}
                              style={{
                                position: "sticky",
                                left: 245,
                                zIndex: 5,
                                background: idx % 2 === 0 ? "#fff" : "#fcfcfd",
                                padding: "9px 12px",
                                maxWidth: 140,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: "#334155",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {prod.bsshNm || "-"}
                            </td>
                            <td style={{ position: "sticky", left: 385, zIndex: 5, background: idx % 2 === 0 ? "#fff" : "#fcfcfd", padding: "9px 10px", textAlign: "center", color: "#64748b", fontSize: "0.75rem", borderBottom: "1px solid #f1f5f9", borderRight: "2px solid #cbd5e1" }}>
                              {prod.prmsDt || "-"}
                            </td>

                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 800, color: "#0284c7", background: "#f0f9ff", borderBottom: "1px solid #f1f5f9" }}>
                              {prod.total?.toLocaleString() || 0}
                            </td>
                            {YEARS_10.map((yr) => (
                              <td key={yr} style={{ padding: "9px 8px", textAlign: "right", color: prod.yearly[yr] ? "#0f172a" : "#cbd5e1", fontWeight: prod.yearly[yr] ? 600 : 400, borderBottom: "1px solid #f1f5f9" }}>
                                {prod.yearly[yr] ? prod.yearly[yr].toLocaleString() : "-"}
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

        {/* ========================================================
            TAB 3: 제조사 생산 포트폴리오
        ======================================================== */}
        {activeTab === "companies" && (
          <div>
            <div style={{ background: "#fff", padding: 24, borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }}>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
                주요 건강기능식품 제조업체 생산 랭킹 (2025년 기준)
              </h2>
              <p style={{ color: "#64748b", fontSize: "0.86rem", margin: 0 }}>
                최신 생산실적 기준 상위 OEM/ODM 제조사 생산량 비교
              </p>
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
                  {reportData?.ranking?.map((comp, idx) => (
                    <tr key={comp.company} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: "#94a3b8" }}>{idx + 1}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>{comp.company}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#0284c7" }}>
                        {comp.amount?.toLocaleString()} KG
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <Link
                          href={`/companies/${encodeURIComponent(comp.company)}`}
                          style={{
                            padding: "5px 12px",
                            background: "#e0f2fe",
                            color: "#0369a1",
                            borderRadius: 6,
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
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