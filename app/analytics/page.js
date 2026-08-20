"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

export default function AnalyticsReportPage() {
  const [activeTab, setActiveTab] = useState("ingredient");
  const [ingredientsList, setIngredientsList] = useState([]);
  const [selectedIngrId, setSelectedIngrId] = useState("");
  const [categoriesList, setCategoriesList] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("체지방감소");
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    fetch("/api/analytics/report?type=list")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.ingredients) {
          setIngredientsList(json.ingredients);
          if (json.ingredients.length > 0) {
            setSelectedIngrId(json.ingredients[0].id.toString());
          }
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/analytics/report?type=${activeTab}`;
      if (activeTab === "ingredient" && selectedIngrId) {
        url += `&ingredientId=${selectedIngrId}`;
      } else if (activeTab === "category") {
        url += `&category=${encodeURIComponent(selectedCategory)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setReportData(json);
        if (json.allCategories) {
          setCategoriesList(json.allCategories);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedIngrId, selectedCategory]);

  useEffect(() => {
    if (activeTab === "ingredient" && !selectedIngrId && ingredientsList.length > 0) return;
    fetchReport();
  }, [activeTab, selectedIngrId, selectedCategory, fetchReport]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto 24px" }} className="no-print">
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
                boxShadow: "0 2px 8px rgba(15,23,42,0.2)"
              }}
            >
              <i className="fa-solid fa-print" /> PDF / 인쇄 레포트 출력
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, background: "#e2e8f0", padding: 4, borderRadius: 10, overflowX: "auto" }}>
          {[
            { key: "ingredient", label: "원료별 시장 규모 & 생산 점유율", icon: "fa-flask" },
            { key: "category", label: "기능성 카테고리별 트렌드", icon: "fa-tags" },
            { key: "formulation", label: "제형 & 배합 인텔리전스", icon: "fa-capsules" },
            { key: "companies", label: "제조사 생산 포트폴리오", icon: "fa-building" }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                minWidth: 180,
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
                gap: 8
              }}
            >
              <i className={`fa-solid ${tab.icon}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {activeTab === "ingredient" && (
          <div>
            <div style={{ background: "#fff", padding: 18, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }} className="no-print">
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
                분석 대상 개별인정형 원료 선택 ({ingredientsList.length}종)
              </label>
              <select
                value={selectedIngrId}
                onChange={(e) => setSelectedIngrId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1.5px solid #0d9488",
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  background: "#f0fdfa",
                  outline: "none"
                }}
              >
                {ingredientsList.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} [{ing.recognitionNumber || "-"}] ({ing.company || "업체미상"})
                  </option>
                ))}
              </select>
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
                      <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700 }}>
                        인정번호: {reportData.ingredient.recognitionNumber || "-"}
                      </span>
                      <h2 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "8px 0 6px" }}>
                        {reportData.ingredient.name}
                      </h2>
                      <p style={{ opacity: 0.9, fontSize: "0.88rem", margin: 0 }}>
                        인정업체: <strong>{reportData.ingredient.company || "-"}</strong> · 등록일자: {reportData.ingredient.registeredDate || "-"}
                      </p>
                    </div>
                    {reportData.ingredient.categories && (
                      <div style={{ background: "rgba(255,255,255,0.15)", padding: "8px 14px", borderRadius: 8, textAlign: "right" }}>
                        <span style={{ fontSize: "0.72rem", opacity: 0.8, display: "block" }}>매핑 카테고리</span>
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
                    <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>10개년 누적 총 생산량</div>
                    <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0284c7", marginTop: 4 }}>
                      {reportData.stats?.totalAllYears?.toLocaleString() || 0}<span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#64748b" }}> KG</span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 4 }}>
                      2016년 ~ 2025년 누적 실적
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

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div style={{ background: "#fff", padding: "20px 24px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                      <i className="fa-solid fa-chart-simple" style={{ color: "#0d9488" }} />
                      연도별 총 생산량 추이 (2016~2025)
                    </h3>
                    <div style={{ display: "flex", alignItems: "flex-end", height: 180, gap: 10, paddingTop: 20 }}>
                      {(() => {
                        const maxVal = Math.max(...(reportData.yearlyProduction || []).map((y) => y.amount), 1);
                        return reportData.yearlyProduction?.map((y) => {
                          const heightPct = Math.max((y.amount / maxVal) * 100, y.amount > 0 ? 6 : 2);
                          return (
                            <div key={y.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                              <span style={{ fontSize: "0.68rem", color: y.amount > 0 ? "#0d9488" : "#cbd5e1", fontWeight: 700, marginBottom: 4 }}>
                                {y.amount > 0 ? (y.amount >= 1000 ? `${Math.round(y.amount / 1000)}k` : Math.round(y.amount)) : ""}
                              </span>
                              <div
                                style={{
                                  width: "100%",
                                  maxWidth: 32,
                                  height: `${heightPct}%`,
                                  background: y.amount > 0 ? "linear-gradient(180deg, #0d9488, #14b8a6)" : "#f1f5f9",
                                  borderRadius: "4px 4px 0 0"
                                }}
                              />
                              <span style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 6, fontWeight: 600 }}>{y.year.slice(2)}년</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div style={{ background: "#fff", padding: "20px 24px", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                      <i className="fa-solid fa-pie-chart" style={{ color: "#0284c7" }} />
                      제조사별 점유율 Top 5
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {reportData.topCompanies?.map((comp, idx) => (
                        <div key={comp.name}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: 3 }}>
                            <span>{idx + 1}. {comp.name}</span>
                            <span>{comp.share}% ({comp.amount.toLocaleString()} KG)</span>
                          </div>
                          <div style={{ width: "100%", height: 7, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${comp.share}%`,
                                height: "100%",
                                background: idx === 0 ? "#0284c7" : idx === 1 ? "#0d9488" : idx === 2 ? "#7c3aed" : "#f59e0b",
                                borderRadius: 4
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                      해당 원료 함유 완제품 생산실적 랭킹 (Top 20)
                    </h3>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>단위: KG</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                          <th style={{ padding: "10px 14px", textAlign: "center", width: 50 }}>순위</th>
                          <th style={{ padding: "10px 14px", textAlign: "left" }}>품목명(제품명) / 보고번호</th>
                          <th style={{ padding: "10px 14px", textAlign: "left", width: 140 }}>제조업소</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", width: 80 }}>제형</th>
                          <th style={{ padding: "10px 14px", textAlign: "right", width: 110, background: "#f0fdfa", color: "#0d9488", fontWeight: 800 }}>
                            총 합계
                          </th>
                          {["2025", "2024", "2023", "2022", "2021"].map((yr) => (
                            <th key={yr} style={{ padding: "10px 8px", textAlign: "right", width: 80 }}>
                              {yr}년
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.topProducts?.map((prod, idx) => (
                          <tr key={prod.prdlstReportNo} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 14px", textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>
                              {idx + 1}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <Link href={`/detail/${prod.prdlstReportNo}`} style={{ color: "#0284c7", fontWeight: 700, textDecoration: "none" }}>
                                {prod.prdlstNm}
                              </Link>
                              <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontFamily: "monospace" }}>{prod.prdlstReportNo}</div>
                            </td>
                            <td style={{ padding: "10px 14px", color: "#334155" }}>{prod.bsshNm || "-"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center", color: "#64748b" }}>{prod.dispos || "-"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800, color: "#0d9488", background: "#f0fdfa" }}>
                              {prod.total?.toLocaleString() || 0}
                            </td>
                            {["2025", "2024", "2023", "2022", "2021"].map((yr) => (
                              <td key={yr} style={{ padding: "10px 8px", textAlign: "right", color: prod.yearly[yr] ? "#0f172a" : "#cbd5e1", fontWeight: prod.yearly[yr] ? 600 : 400 }}>
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

        {activeTab === "category" && (
          <div>
            <div style={{ background: "#fff", padding: 18, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }} className="no-print">
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
                기능성 카테고리 선택 (20개 영역)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {categoriesList.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => setSelectedCategory(cat.name)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      border: "1px solid",
                      borderColor: selectedCategory === cat.name ? "#0d9488" : "#cbd5e1",
                      background: selectedCategory === cat.name ? "#0d9488" : "#fff",
                      color: selectedCategory === cat.name ? "#fff" : "#475569",
                      fontWeight: selectedCategory === cat.name ? 700 : 500,
                      fontSize: "0.82rem",
                      cursor: "pointer"
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 80, textAlign: "center", color: "#94a3b8" }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2.5rem", color: "#0d9488" }} />
                <p style={{ marginTop: 14 }}>카테고리 트렌드 데이터 분석 중...</p>
              </div>
            ) : reportData?.category ? (
              <div>
                <div style={{ background: "#fff", padding: 24, borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }}>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
                    [{reportData.category.name}] 기능성 영역 생산 트렌드
                  </h2>
                  <p style={{ color: "#64748b", fontSize: "0.86rem", margin: 0 }}>{reportData.category.description}</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div style={{ background: "#fff", padding: 22, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: "0 0 16px" }}>
                      연도별 생산량 추이 (2016~2025)
                    </h3>
                    <div style={{ display: "flex", alignItems: "flex-end", height: 160, gap: 10, paddingTop: 10 }}>
                      {(() => {
                        const maxVal = Math.max(...(reportData.yearlyTrend || []).map((y) => y.amount), 1);
                        return reportData.yearlyTrend?.map((y) => {
                          const heightPct = Math.max((y.amount / maxVal) * 100, y.amount > 0 ? 6 : 2);
                          return (
                            <div key={y.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                              <span style={{ fontSize: "0.65rem", color: "#0d9488", fontWeight: 700, marginBottom: 4 }}>
                                {y.amount > 0 ? `${Math.round(y.amount / 1000)}k` : ""}
                              </span>
                              <div
                                style={{
                                  width: "100%",
                                  maxWidth: 30,
                                  height: `${heightPct}%`,
                                  background: "linear-gradient(180deg, #0d9488, #14b8a6)",
                                  borderRadius: "4px 4px 0 0"
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
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: "0 0 16px" }}>
                      주요 생산 기업 Top 6
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {reportData.topCompanies?.map((comp, idx) => (
                        <div key={comp.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                          <span style={{ fontWeight: 600, color: "#334155" }}>{idx + 1}. {comp.name}</span>
                          <span style={{ fontWeight: 800, color: "#0284c7" }}>{comp.amount?.toLocaleString()} KG</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: "0 0 14px" }}>
                    이 카테고리에 속한 주요 개별인정형 원료
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {reportData.matchedIngredients?.map((ing) => (
                      <div
                        key={ing.id}
                        onClick={() => {
                          setSelectedIngrId(ing.id.toString());
                          setActiveTab("ingredient");
                        }}
                        style={{
                          padding: 12,
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ fontSize: "0.72rem", color: "#0d9488", fontWeight: 700 }}>{ing.recognitionNumber}</div>
                        <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#0f172a", marginTop: 2 }}>{ing.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4 }}>업체: {ing.company || "-"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === "formulation" && (
          <div>
            <div style={{ background: "#fff", padding: 24, borderRadius: 14, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", marginBottom: 20 }}>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>
                건강기능식품 제형(제품형태)별 분포 & 생산성 분석
              </h2>
              <p style={{ color: "#64748b", fontSize: "0.86rem", margin: 0 }}>
                시장 전체 완제품의 제형(정제, 캡슐, 분말, 액상, 젤리 등) 선호도 및 생산 품목 비중
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {reportData?.shapesDistribution?.map((shape, idx) => (
                <div key={shape.shape} style={{ background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderTop: `4px solid ${idx === 0 ? "#0d9488" : idx === 1 ? "#0284c7" : idx === 2 ? "#7c3aed" : "#f59e0b"}` }}>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>제형 {idx + 1}위</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>{shape.shape}</div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0d9488" }}>
                    {shape.count?.toLocaleString()}개 품목
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                            textDecoration: "none"
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