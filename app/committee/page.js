"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const QUICK_QUESTIONS = [
  "제202차 건강기능식품심의위원회 회의 결과를 요약해줘",
  "최근 심의에서 불인정 처분을 받은 원료 목록과 내용은?",
  "피치세라마이드(PF3)와 삼칠숙지황복합추출물의 심의 결과는?",
  "최근 '기능성 추가'로 인정받은 개별인정형 원료들은 무엇이 있어?",
];

export default function CommitteePage() {
  // 데이터 및 탭 상태
  const [agendas, setAgendas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, approved: 0, supplement: 0, rejected: 0, other: 0 });
  const [meetingsCount, setMeetingsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  
  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  // AI 챗봇 상태
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "안녕하세요! 식약처 **건강기능식품심의위원회 AI 도우미**입니다.\n\n역대 회의록의 **인정 / 보완 / 불인정 사유**, **기능성 추가 내역**, **심사 기준** 등에 대해 무엇이든 질문해 주세요.",
      references: [],
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [remaining, setRemaining] = useState(20); // 오늘 남은 질문 횟수
  const [cooldown, setCooldown] = useState(0);    // 쿨다운 카운트다운(초)
  const cooldownRef = useRef(null);
  const chatEndRef = useRef(null);

  // 안건 데이터 조회
  const fetchAgendas = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: p.toString(),
        limit: "15",
        search,
        result: resultFilter,
      });
      const res = await fetch(`/api/committee/agendas?${params}`);
      const json = await res.json();
      if (json.success) {
        setAgendas(json.data || []);
        setTotal(json.total || 0);
        setPage(p);
        setPages(json.pages || 1);
        if (json.stats) setStats(json.stats);
        if (json.meetingsCount) setMeetingsCount(json.meetingsCount);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, resultFilter]);

  useEffect(() => {
    fetchAgendas(1);
  }, [fetchAgendas]);

  // 동기화 실행
  const handleSync = async () => {
    if (!confirm("식약처 건강기능식품심의위원회 최신 회의록을 수집하고 Gemini 임베딩을 생성하시겠습니까?")) return;
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/committee/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSyncMsg(json.message);
        await fetchAgendas(1);
      } else {
        alert(json.error || "동기화 중 오류가 발생했습니다.");
      }
    } catch (e) {
      alert("동기화 오류: " + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // 챗봇 스크롤 자동 이동
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 쿨다운 타이머 시작 (2초)
  const startCooldown = () => {
    setCooldown(2);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // 챗봇 질문 전송 (RAG 스트리밍)
  const handleSendChat = async (questionText) => {
    const q = questionText || chatInput;
    if (!q || !q.trim() || chatLoading || cooldown > 0) return;

    setChatInput("");
    const newMessages = [
      ...messages,
      { role: "user", content: q },
      { role: "assistant", content: "", references: [] },
    ];
    setMessages(newMessages);
    setChatLoading(true);

    try {
      const response = await fetch("/api/committee/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      // 429 Rate Limit 처리
      if (response.status === 429) {
        const errJson = await response.json();
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `⚠️ ${errJson.error || "질문 횟수 한도에 도달했습니다."}`,
          };
          return updated;
        });
        setRemaining(0);
        return;
      }

      if (!response.ok) throw new Error("서버 응답 오류");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";
      let refs = [];
      let headerChecked = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        if (!headerChecked && chunk.includes("__REF__:")) {
          const parts = chunk.split("\n\n");
          for (const p of parts) {
            if (p.startsWith("__REF__:")) {
              try {
                const parsed = JSON.parse(p.substring(8));
                // 새 포맷: { refs, remaining }
                refs = parsed.refs ?? parsed;
                if (typeof parsed.remaining === "number") {
                  setRemaining(parsed.remaining);
                }
              } catch (e) {}
            } else {
              streamedText += p;
            }
          }
          headerChecked = true;
        } else {
          streamedText += chunk;
        }

        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: streamedText,
            references: refs,
          };
          return updated;
        });
      }

      // 전송 성공 후 쿨다운 시작
      startCooldown();
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `답변 생성 중 오류가 발생했습니다: ${err.message}`,
        };
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  const getResultBadge = (res) => {
    if (res === "인정") {
      return <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 800 }}>인정</span>;
    } else if (res === "보완") {
      return <span style={{ background: "#fef3c7", color: "#b45309", padding: "3px 8px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 800 }}>보완</span>;
    } else if (res === "불인정") {
      return <span style={{ background: "#fee2e2", color: "#dc2626", padding: "3px 8px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 800 }}>불인정</span>;
    }
    return <span style={{ background: "#f1f5f9", color: "#64748b", padding: "3px 8px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 800 }}>{res}</span>;
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #0284c7, #0369a1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "1.2rem", boxShadow: "0 2px 8px rgba(2,132,199,0.3)" }}>
              <i className="fa-solid fa-users-rectangle" />
            </div>
            <h1 style={{ fontSize: "1.65rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              건강기능식품심의위원회 회의록 & AI 심의 도우미
            </h1>
          </div>
          <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
            식약처 주요위원회 심의 결과(인정 / 보완 / 불인정) 공시 데이터 및 Gemini 3.6 Flash RAG 질의응답 (무료 · 1인 일 20회 한도)
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {syncMsg && (
            <span style={{ fontSize: "0.82rem", color: "#0d9488", fontWeight: 600 }}>{syncMsg}</span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
              background: syncing ? "#94a3b8" : "#0d9488", color: "#fff", border: "none", borderRadius: 10,
              fontWeight: 700, fontSize: "0.84rem", cursor: syncing ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(13,148,136,0.25)", transition: "all 0.2s"
            }}
          >
            <i className={`fa-solid ${syncing ? "fa-spinner fa-spin" : "fa-rotate"}`} />
            {syncing ? "회의록 수집 & 임베딩 중..." : "최신 회의록 동기화"}
          </button>
        </div>
      </div>

      {/* KPI 통계 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { label: "총 수집 회의", value: meetingsCount + "회차", color: "#0284c7", icon: "fa-calendar-check" },
          { label: "총 심의 안건", value: stats.total + "건", color: "#475569", icon: "fa-list-check" },
          { label: "인정 (승인)", value: stats.approved + "건", color: "#16a34a", icon: "fa-circle-check" },
          { label: "보완 처분", value: stats.supplement + "건", color: "#d97706", icon: "fa-triangle-exclamation" },
          { label: "불인정 (반려)", value: stats.rejected + "건", color: "#dc2626", icon: "fa-circle-xmark" },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: "#fff", padding: "16px 20px", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.03)", borderLeft: `4px solid ${kpi.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>{kpi.label}</span>
              <i className={`fa-solid ${kpi.icon}`} style={{ color: kpi.color, fontSize: "0.9rem", opacity: 0.8 }} />
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: kpi.color, marginTop: 4 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* 메인 2단 레이아웃 (좌측: AI 챗봇 / 우측: 회의록 및 안건 브라우저) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr", gap: 24, alignItems: "start" }}>
        
        {/* 🤖 1. AI 심의 도우미 Q&A 챗봇 */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", height: "760px", overflow: "hidden" }}>
          {/* 챗봇 헤더 */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "linear-gradient(135deg, #0f172a, #1e293b)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fa-solid fa-robot" style={{ color: "#38bdf8", fontSize: "1.1rem" }} />
              <div>
                <strong style={{ fontSize: "0.95rem" }}>심의위원회 RAG AI 도우미</strong>
                <span style={{ marginLeft: 8, fontSize: "0.68rem", background: "rgba(56,189,248,0.2)", color: "#38bdf8", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>Gemini 3.6 Flash</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <span style={{ fontSize: "0.7rem", color: remaining > 5 ? "#4ade80" : remaining > 0 ? "#fbbf24" : "#f87171", fontWeight: 700 }}>
                오늘 남은 질문: {remaining}회
              </span>
              <span style={{ fontSize: "0.66rem", color: "#94a3b8" }}>일 최대 20회 (무료)</span>
            </div>
          </div>

          {/* 챗봇 메시지 영역 */}
          <div style={{ flex: 1, padding: "18px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, background: "#f8fafc" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "92%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontSize: "0.85rem",
                  lineHeight: 1.6,
                  whiteSpace: "pre-line",
                  background: msg.role === "user" ? "#0284c7" : "#fff",
                  color: msg.role === "user" ? "#fff" : "#1e293b",
                  border: msg.role === "user" ? "none" : "1px solid #e2e8f0",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)"
                }}>
                  {msg.content || (chatLoading && i === messages.length - 1 ? "회의록 검색 및 답변 생성 중..." : "")}
                </div>

                {/* 인용된 회의록 참고자료 카드 */}
                {msg.references && msg.references.length > 0 && (
                  <div style={{ width: "95%", marginTop: 8, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", fontSize: "0.78rem" }}>
                    <div style={{ fontWeight: 800, color: "#0284c7", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <i className="fa-solid fa-book-bookmark" /> 답변 근거 회의록 자료:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {msg.references.slice(0, 3).map((ref, rIdx) => (
                        <div key={rIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "6px 10px", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                          <div>
                            <strong style={{ color: "#0f172a" }}>{ref.ingredientName}</strong>
                            <span style={{ marginLeft: 6, color: "#64748b" }}>({ref.meetingNo || ref.meetingDate})</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {getResultBadge(ref.result)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* 추천 질문 바 */}
          <div style={{ padding: "8px 16px", background: "#fff", borderTop: "1px solid #f1f5f9", display: "flex", gap: 6, overflowX: "auto", whiteSpace: "nowrap" }}>
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendChat(q)}
                disabled={chatLoading}
                style={{
                  padding: "4px 10px", background: "#f0fdfa", color: "#0d9488", border: "1px solid #ccfbf1",
                  borderRadius: 14, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", flexShrink: 0
                }}
              >
                💡 {q}
              </button>
            ))}
          </div>

          {/* 챗봇 입력창 */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", background: "#fff" }}>
            {/* 남은 횟수 & 쿨다운 안내 */}
            {(cooldown > 0 || remaining <= 5) && (
              <div style={{ marginBottom: 6, fontSize: "0.74rem", display: "flex", justifyContent: "space-between" }}>
                {cooldown > 0 && (
                  <span style={{ color: "#64748b" }}>
                    <i className="fa-solid fa-clock" style={{ marginRight: 4 }} />
                    다음 질문까지 {cooldown}초 대기
                  </span>
                )}
                {remaining <= 5 && remaining > 0 && (
                  <span style={{ color: "#d97706", fontWeight: 700, marginLeft: "auto" }}>
                    ⚠️ 오늘 {remaining}회 남음
                  </span>
                )}
                {remaining === 0 && (
                  <span style={{ color: "#dc2626", fontWeight: 700, marginLeft: "auto" }}>
                    오늘 질문 한도 소진 — 내일 다시 이용 가능합니다
                  </span>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                placeholder="심의위원회 회의록 관련 질문을 입력하세요... (예: 피치세라마이드 보완 사유)"
                disabled={chatLoading || cooldown > 0 || remaining === 0}
                style={{ flex: 1, padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: "0.84rem", outline: "none", opacity: remaining === 0 ? 0.5 : 1 }}
              />
              <button
                onClick={() => handleSendChat()}
                disabled={chatLoading || !chatInput.trim() || cooldown > 0 || remaining === 0}
                style={{
                  padding: "10px 18px",
                  background: chatLoading || !chatInput.trim() || cooldown > 0 || remaining === 0 ? "#94a3b8" : "#0284c7",
                  color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: "0.85rem",
                  cursor: chatLoading || !chatInput.trim() || cooldown > 0 || remaining === 0 ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap"
                }}
              >
                {chatLoading ? <i className="fa-solid fa-spinner fa-spin" /> : cooldown > 0 ? <i className="fa-solid fa-clock" /> : <i className="fa-solid fa-paper-plane" />}
                {cooldown > 0 ? `${cooldown}초` : "전송"}
              </button>
            </div>
          </div>
        </div>

        {/* 📋 2. 회의록 및 안건 브라우저 */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fa-solid fa-list" style={{ color: "#0284c7" }} />
              심의 안건별 결과 목록
            </h2>

            {/* 필터 탭 */}
            <div style={{ display: "flex", gap: 4, background: "#f1f5f9", padding: 3, borderRadius: 8 }}>
              {[
                { label: "전체", val: "" },
                { label: "인정", val: "인정" },
                { label: "보완", val: "보완" },
                { label: "불인정", val: "불인정" },
              ].map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setResultFilter(tab.val)}
                  style={{
                    padding: "5px 12px",
                    border: "none",
                    borderRadius: 6,
                    fontSize: "0.76rem",
                    fontWeight: resultFilter === tab.val ? 800 : 500,
                    background: resultFilter === tab.val ? "#fff" : "transparent",
                    color: resultFilter === tab.val ? "#0284c7" : "#64748b",
                    cursor: "pointer",
                    boxShadow: resultFilter === tab.val ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 검색창 */}
          <div style={{ marginBottom: 14, position: "relative" }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.8rem" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="원료명(예: 하고초, 피치세라마이드), 회의명 검색..."
              style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.82rem", outline: "none" }}
            />
          </div>

          {/* 안건 목록 테이블 */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", maxHeight: "560px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 5 }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#64748b", fontWeight: 700, width: "110px" }}>회차/일시</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#64748b", fontWeight: 700 }}>원료·성분명 / 안건 내용</th>
                  <th style={{ padding: "10px 10px", textAlign: "center", color: "#64748b", fontWeight: 700, width: "70px" }}>결과</th>
                  <th style={{ padding: "10px 10px", textAlign: "center", color: "#64748b", fontWeight: 700, width: "80px" }}>원문/PDF</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>안건 목록을 불러오는 중...</td></tr>
                ) : agendas.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>등록된 안건 데이터가 없습니다. 상단의 [최신 회의록 동기화] 버튼을 눌러주세요.</td></tr>
                ) : (
                  agendas.map((ag) => (
                    <tr key={ag.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                      <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{ag.meeting?.meetingNo || "심의회의"}</div>
                        <div style={{ color: "#94a3b8", fontSize: "0.7rem" }}>{ag.meeting?.meetingDate || "-"}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <strong style={{ color: "#0f172a", fontSize: "0.85rem" }}>{ag.ingredientName}</strong>
                          {ag.agendaType && (
                            <span style={{ background: "#f1f5f9", color: "#475569", padding: "1px 6px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 600 }}>
                              {ag.agendaType}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", lineHeight: 1.4 }}>
                          {ag.rawName}
                        </div>
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {getResultBadge(ag.result)}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {ag.meeting?.sourceUrl && (
                          <a
                            href={ag.meeting.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "4px 8px", background: "#f1f5f9", color: "#0284c7", border: "1px solid #cbd5e1",
                              borderRadius: 6, fontSize: "0.7rem", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4
                            }}
                          >
                            <i className="fa-solid fa-arrow-up-right-from-square" /> 공시
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>총 {total}건 안건</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => fetchAgendas(page - 1)} disabled={page <= 1} style={{ padding: "4px 10px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: "0.75rem", color: page <= 1 ? "#cbd5e1" : "#0f172a" }}>이전</button>
              <span style={{ padding: "4px 10px", fontSize: "0.75rem", fontWeight: 700, color: "#0284c7" }}>{page} / {pages}</span>
              <button onClick={() => fetchAgendas(page + 1)} disabled={page >= pages} style={{ padding: "4px 10px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", cursor: page >= pages ? "not-allowed" : "pointer", fontSize: "0.75rem", color: page >= pages ? "#cbd5e1" : "#0f172a" }}>다음</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
