"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

const QUICK_QUESTIONS = [
  "제202차 건강기능식품심의위원회 회의 결과를 요약해줘",
  "최근 심의에서 불인정 처분을 받은 원료 목록과 내용은?",
  "피치세라마이드(PF3)와 삼칠숙지황복합추출물의 심의 결과는?",
  "최근 '기능성 추가'로 인정받은 개별인정형 원료들은 무엇이 있어?",
];

const decodeTextEntities = (value) => String(value ?? "")
  .replace(/&amp;/gi, "&")
  .replace(/&middot;|&bull;|&#183;|&#x00b7;/gi, "·")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");

const cleanCommitteeText = (value) => decodeTextEntities(value)
  .replace(/\)\s*·\s*/g, ") ")
  .replace(/^\s*[·ㆍ•]\s*/g, "")
  .replace(/\s*[·ㆍ•]\s*$/g, "")
  .replace(/\s+/g, " ")
  .trim();

const oneLineClampStyle = {
  display: "block",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const twoLineClampStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  wordBreak: "keep-all",
  overflowWrap: "anywhere",
};

// ── 공통 중앙 페이지네이션 컴포넌트 (1, 2, 3... 번호형) ──
function CenteredPagination({ current, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const maxButtons = 10;
  const currentBlock = Math.floor((current - 1) / maxButtons);
  const startPage = currentBlock * maxButtons + 1;
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, padding: "16px 0 8px", flexWrap: "wrap" }}>
      {/* 맨 처음 */}
      <button
        onClick={() => onChange(1)}
        disabled={current <= 1}
        title="첫 페이지"
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
          cursor: current <= 1 ? "not-allowed" : "pointer", opacity: current <= 1 ? 0.4 : 1,
          fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "flex", alignItems: "center", justifyContent: "center"
        }}
      >
        <i className="fa-solid fa-angles-left" />
      </button>

      {/* 이전 */}
      <button
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        title="이전 페이지"
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
          cursor: current <= 1 ? "not-allowed" : "pointer", opacity: current <= 1 ? 0.4 : 1,
          fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "flex", alignItems: "center", justifyContent: "center"
        }}
      >
        <i className="fa-solid fa-angle-left" />
      </button>

      {/* 숫자 버튼 그룹 */}
      {pages.map((p) => {
        const isActive = p === current;
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              minWidth: 32, height: 32, padding: "0 6px", borderRadius: 8,
              border: isActive ? "1px solid #0284c7" : "1px solid #e2e8f0",
              background: isActive ? "linear-gradient(135deg, #0284c7, #0369a1)" : "#fff",
              color: isActive ? "#fff" : "#334155",
              cursor: "pointer", fontSize: "0.82rem", fontWeight: isActive ? 800 : 500,
              boxShadow: isActive ? "0 2px 6px rgba(2,132,199,0.3)" : "none",
              transition: "all 0.15s"
            }}
          >
            {p}
          </button>
        );
      })}

      {/* 다음 */}
      <button
        onClick={() => onChange(Math.min(totalPages, current + 1))}
        disabled={current >= totalPages}
        title="다음 페이지"
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
          cursor: current >= totalPages ? "not-allowed" : "pointer", opacity: current >= totalPages ? 0.4 : 1,
          fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "flex", alignItems: "center", justifyContent: "center"
        }}
      >
        <i className="fa-solid fa-angle-right" />
      </button>

      {/* 맨 끝 */}
      <button
        onClick={() => onChange(totalPages)}
        disabled={current >= totalPages}
        title="마지막 페이지"
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
          cursor: current >= totalPages ? "not-allowed" : "pointer", opacity: current >= totalPages ? 0.4 : 1,
          fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "flex", alignItems: "center", justifyContent: "center"
        }}
      >
        <i className="fa-solid fa-angles-right" />
      </button>
    </div>
  );
}

export default function CommitteePage() {
  // 상단 탭 상태: 'meetings' (회의 게시물 뷰) | 'agendas' (심의 안건별 뷰)
  const [viewTab, setViewTab] = useState("meetings");

  // 레이아웃 & 확대 상태
  const [isFullscreenAgenda, setIsFullscreenAgenda] = useState(false);
  const [isWideLayout, setIsWideLayout] = useState(false);
  const [mobileSection, setMobileSection] = useState("meetings"); // 'meetings' | 'agendas' | 'ai'

  // 1. 회의 게시물 데이터 상태
  const [meetings, setMeetings] = useState([]);
  const [meetingTotal, setMeetingTotal] = useState(0);
  const [meetingPage, setMeetingPage] = useState(1);
  const [meetingPages, setMeetingPages] = useState(1);
  const [meetingSearch, setMeetingSearch] = useState("");
  const [meetingDeptFilter, setMeetingDeptFilter] = useState("");
  const [departments, setDepartments] = useState([]);
  const [expandedMeetingId, setExpandedMeetingId] = useState(null);
  const [meetingSortBy, setMeetingSortBy] = useState("date"); // 'date' | 'postNo' | 'views' | 'title'
  const [meetingSortOrder, setMeetingSortOrder] = useState("desc"); // 'desc' (최신순) | 'asc'

  // 2. 심의 안건 데이터 상태
  const [agendas, setAgendas] = useState([]);
  const [agendaTotal, setAgendaTotal] = useState(0);
  const [agendaPage, setAgendaPage] = useState(1);
  const [agendaPages, setAgendaPages] = useState(1);
  const [agendaSearch, setAgendaSearch] = useState("");
  const [agendaResultFilter, setAgendaResultFilter] = useState("");
  const [agendaSortBy, setAgendaSortBy] = useState("date"); // 'date' | 'ingredient' | 'result'
  const [agendaSortOrder, setAgendaSortOrder] = useState("desc"); // 'desc' (최신순) | 'asc'
  const [stats, setStats] = useState({ total: 0, approved: 0, supplement: 0, rejected: 0, other: 0 });

  const [loading, setLoading] = useState(false);

  // 3. 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncHistoryOpen, setSyncHistoryOpen] = useState(false);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [syncRuns, setSyncRuns] = useState([]);
  const [selectedSyncRun, setSelectedSyncRun] = useState(null);
  const [expandedSyncChange, setExpandedSyncChange] = useState(null);

  // 4. PDF 미리보기 모달 상태
  const [previewPdf, setPreviewPdf] = useState(null); // { id, title, fileName, fileUrl }

  // 5. AI 챗봇 상태 & 권한
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "안녕하세요! 식약처 **건강기능식품심의위원회 AI 도우미**입니다.\n\n역대 회의록의 **인정 / 보완 / 불인정 사유**, **기능성 추가 내역**, **심사 기준** 등에 대해 무엇이든 질문해 주세요.",
      references: [],
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [remaining, setRemaining] = useState(20);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptMsg, setPromptMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 900);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (previewPdf) setPreviewPdf(null);
        else if (isFullscreenAgenda) setIsFullscreenAgenda(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewPdf, isFullscreenAgenda]);

  // 사용자 권한 및 잔여 질문 수 조회
  useEffect(() => {
    fetch('/api/committee/chat')
      .then(res => res.json())
      .then(data => {
        if (data) {
          const admin = !!data.isAdmin;
          setIsAdmin(admin);
          if (admin) {
            setRemaining(9999);
            // 관리자인 경우 커스텀 프롬프트 로드
            fetch('/api/committee/settings')
              .then(r => r.json())
              .then(d => setSystemPrompt(d.value || ""))
              .catch(() => {});
          } else if (typeof data.remaining === 'number') {
            setRemaining(data.remaining);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    setPromptMsg("");
    try {
      const res = await fetch('/api/committee/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: systemPrompt }),
      });
      const data = await res.json();
      setPromptMsg(data.success ? "✅ 저장되었습니다." : `❌ ${data.error}`);
    } catch (e) {
      setPromptMsg("❌ 저장 중 오류 발생");
    } finally {
      setPromptSaving(false);
    }
  };

  const handleResetPrompt = async () => {
    if (!confirm("기본 프롬프트로 초기화하시겠습니까?")) return;
    const res = await fetch('/api/committee/settings', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setSystemPrompt(data.value);
      setPromptMsg("✅ 기본 프롬프트로 초기화되었습니다.");
    }
  };

  // ── 데이터 조회 ──────────────────────────────────────────────────────────
  
  // 회의 게시물 목록 조회
  const fetchMeetings = useCallback(async (p = 1, customSortBy, customSortOrder) => {
    setLoading(true);
    try {
      const sBy = customSortBy || meetingSortBy;
      const sOrder = customSortOrder || meetingSortOrder;
      const params = new URLSearchParams({
        page: p.toString(),
        limit: "10",
        search: meetingSearch,
        department: meetingDeptFilter,
        sortBy: sBy,
        sortOrder: sOrder,
      });
      const res = await fetch(`/api/committee/meetings?${params}`);
      const json = await res.json();
      if (json.success) {
        setMeetings(json.data || []);
        setMeetingTotal(json.total || 0);
        setMeetingPage(p);
        setMeetingPages(json.pages || 1);
        if (json.departments) setDepartments(json.departments);
      }
    } catch (e) {
      console.error('Fetch meetings error:', e);
    } finally {
      setLoading(false);
    }
  }, [meetingSearch, meetingDeptFilter, meetingSortBy, meetingSortOrder]);

  // 안건별 목록 조회
  const fetchAgendas = useCallback(async (p = 1, customSortBy, customSortOrder) => {
    setLoading(true);
    try {
      const sBy = customSortBy || agendaSortBy;
      const sOrder = customSortOrder || agendaSortOrder;
      const params = new URLSearchParams({
        page: p.toString(),
        limit: "15",
        search: agendaSearch,
        result: agendaResultFilter,
        sortBy: sBy,
        sortOrder: sOrder,
      });
      const res = await fetch(`/api/committee/agendas?${params}`);
      const json = await res.json();
      if (json.success) {
        setAgendas(json.data || []);
        setAgendaTotal(json.total || 0);
        setAgendaPage(p);
        setAgendaPages(json.pages || 1);
        if (json.stats) setStats(json.stats);
      }
    } catch (e) {
      console.error('Fetch agendas error:', e);
    } finally {
      setLoading(false);
    }
  }, [agendaSearch, agendaResultFilter, agendaSortBy, agendaSortOrder]);

  useEffect(() => {
    if (viewTab === "meetings") {
      fetchMeetings(1);
    } else {
      fetchAgendas(1);
    }
  }, [viewTab, fetchMeetings, fetchAgendas]);

  // 최초 로드 시 양쪽 통계 로드
  useEffect(() => {
    fetchAgendas(1);
    fetchMeetings(1);
  }, []);

  // 동기화 실행 (전체 목록 비교 + 변경 이력 기록)
  const handleSync = async () => {
    if (!confirm("식약처 심의위원회 게시판 전체 목록을 비교하고 신규/변경분만 업데이트하시겠습니까?")) return;
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/committee/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: 50, mode: "full" })
      });
      const json = await res.json();
      if (json.success) {
        setSyncMsg(json.message);
        await Promise.all([fetchMeetings(1), fetchAgendas(1)]);
        if (syncHistoryOpen) await fetchSyncHistory();
      } else {
        alert(json.error || "동기화 중 오류가 발생했습니다.");
      }
    } catch (e) {
      alert("동기화 오류: " + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const fetchSyncHistory = async (runId) => {
    setSyncHistoryLoading(true);
    try {
      const url = runId ? `/api/committee/sync-history?runId=${runId}` : "/api/committee/sync-history?limit=20";
      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "이력 조회 실패");
      if (runId) {
        setSelectedSyncRun(json.data);
        setExpandedSyncChange(null);
      } else {
        setSyncRuns(json.data || []);
        if (!selectedSyncRun && json.data?.[0]?.id) {
          await fetchSyncHistory(json.data[0].id);
        }
      }
    } catch (e) {
      alert("동기화 이력 조회 오류: " + e.message);
    } finally {
      setSyncHistoryLoading(false);
    }
  };

  const openSyncHistory = async () => {
    setSyncHistoryOpen(true);
    await fetchSyncHistory();
  };

  // 챗봇 스크롤 자동 이동 (컨테이너 내부만 스크롤, 페이지 전체 스크롤 방지)
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 쿨다운 타이머 (2초)
  const startCooldown = () => {
    if (isAdmin) return; // 관리자는 쿨다운 없음
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
      { role: "assistant", content: "", references: [], feedbackId: null, feedback: null },
    ];
    setMessages(newMessages);
    setChatLoading(true);

    try {
      const response = await fetch("/api/committee/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

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

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `서버 오류 (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";
      let refs = [];
      let feedbackId = null;
      let headerChecked = false;
      let headerBuffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        if (!headerChecked) {
          headerBuffer += chunk;
          const separatorIndex = headerBuffer.indexOf("\n\n");
          if (separatorIndex < 0) continue;

          const metadataLine = headerBuffer.slice(0, separatorIndex);
          const firstAnswerChunk = headerBuffer.slice(separatorIndex + 2);
          if (metadataLine.startsWith("__REF__:")) {
            try {
              const parsed = JSON.parse(metadataLine.substring(8));
              refs = parsed.refs ?? parsed;
              feedbackId = parsed.feedbackId || null;
              if (parsed.isAdmin) {
                setIsAdmin(true);
                setRemaining(9999);
              } else if (typeof parsed.remaining === "number") {
                setRemaining(parsed.remaining);
              }
            } catch (e) {}
          }
          streamedText += firstAnswerChunk;
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
            feedbackId,
          };
          return updated;
        });
      }
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

  const handleChatFeedback = async (messageIndex, rating) => {
    const message = messages[messageIndex];
    if (!message?.feedbackId || message.feedbackSaving || typeof message.feedback === 'boolean') return;

    setMessages(prev => prev.map((item, index) =>
      index === messageIndex ? { ...item, feedbackSaving: true, feedbackError: "" } : item
    ));
    try {
      const response = await fetch('/api/committee/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId: message.feedbackId, rating }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '평가 저장에 실패했습니다.');
      setMessages(prev => prev.map((item, index) =>
        index === messageIndex ? { ...item, feedback: rating, feedbackSaving: false, feedbackError: "" } : item
      ));
    } catch (error) {
      setMessages(prev => prev.map((item, index) =>
        index === messageIndex ? { ...item, feedbackSaving: false, feedbackError: error.message } : item
      ));
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
    return <span style={{ background: "#f1f5f9", color: "#64748b", padding: "3px 8px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 800 }}>{res || "기타"}</span>;
  };

  // ── 상단 통계 카드 클릭 핸들러 (바로가기 & 필터링) ──
  const handleCardClick = (cardType) => {
    if (cardType === "meetings") {
      setViewTab("meetings");
      setMobileSection("meetings");
      setMeetingSearch("");
      setMeetingDeptFilter("");
    } else if (cardType === "all_agendas") {
      setViewTab("agendas");
      setMobileSection("agendas");
      setAgendaResultFilter("");
      setAgendaSearch("");
    } else if (cardType === "approved") {
      setViewTab("agendas");
      setMobileSection("agendas");
      setAgendaResultFilter("인정");
    } else if (cardType === "supplement") {
      setViewTab("agendas");
      setMobileSection("agendas");
      setAgendaResultFilter("보완");
    } else if (cardType === "rejected") {
      setViewTab("agendas");
      setMobileSection("agendas");
      setAgendaResultFilter("불인정");
    }
  };

  // ── 회의 게시물 뷰 정렬 토글 ──
  const handleMeetingSort = (column) => {
    if (meetingSortBy === column) {
      const nextOrder = meetingSortOrder === "desc" ? "asc" : "desc";
      setMeetingSortOrder(nextOrder);
    } else {
      setMeetingSortBy(column);
      setMeetingSortOrder("desc");
    }
  };

  // ── 심의 안건 뷰 회차/일시 정렬 토글 ──
  const handleAgendaSort = (column) => {
    if (agendaSortBy === column) {
      const nextOrder = agendaSortOrder === "desc" ? "asc" : "desc";
      setAgendaSortOrder(nextOrder);
    } else {
      setAgendaSortBy(column);
      setAgendaSortOrder("desc");
    }
  };

  const kpiCards = [
    { key: "meetings", label: "총 수집 회의록", value: meetingTotal + "건", color: "#0284c7", icon: "fa-folder-open", active: viewTab === "meetings" },
    { key: "all_agendas", label: "총 심의 안건", value: stats.total + "건", color: "#475569", icon: "fa-list-check", active: viewTab === "agendas" && !agendaResultFilter },
    { key: "approved", label: "인정 (승인)", value: stats.approved + "건", color: "#16a34a", icon: "fa-circle-check", active: viewTab === "agendas" && agendaResultFilter === "인정" },
    { key: "supplement", label: "보완 처분", value: stats.supplement + "건", color: "#d97706", icon: "fa-triangle-exclamation", active: viewTab === "agendas" && agendaResultFilter === "보완" },
    { key: "rejected", label: "불인정 (반려)", value: stats.rejected + "건", color: "#dc2626", icon: "fa-circle-xmark", active: viewTab === "agendas" && agendaResultFilter === "불인정" },
  ];

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: isMobile ? "16px 12px 40px" : "32px 24px 60px" }}>
      {/* ── 헤더 ── */}
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
            식약처 주요위원회 심의 결과(인정 / 보완 / 불인정) 공시 데이터 및 Gemini Flash RAG 질의응답 {isAdmin ? "(관리자 무제한 테스트 모드)" : "(일반 1인 1일 20회 무료)"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {syncMsg && (
            <span style={{ fontSize: "0.82rem", color: "#0d9488", fontWeight: 600 }}>{syncMsg}</span>
          )}
          <button
            onClick={openSyncHistory}
            disabled={syncHistoryLoading}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
              background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10,
              fontWeight: 700, fontSize: "0.84rem", cursor: syncHistoryLoading ? "wait" : "pointer",
              boxShadow: "0 1px 4px rgba(15,23,42,0.06)"
            }}
          >
            <i className={`fa-solid ${syncHistoryLoading ? "fa-spinner fa-spin" : "fa-clock-rotate-left"}`} />
            변경 이력
          </button>
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
            {syncing ? "전체 비교 동기화 중..." : "전체 비교 동기화"}
          </button>
        </div>
      </div>

      {/* ── KPI 통계 카드 (클릭하여 해당 목록 바로보기) ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 10 : 14, marginBottom: 24 }}>
        {kpiCards.map((kpi) => (
          <div
            key={kpi.key}
            onClick={() => handleCardClick(kpi.key)}
            title={`${kpi.label} 목록 바로보기`}
            style={{
              background: "#fff",
              padding: "16px 20px",
              borderRadius: 12,
              border: kpi.active ? `2px solid ${kpi.color}` : "1px solid #e2e8f0",
              boxShadow: kpi.active ? `0 4px 12px ${kpi.color}25` : "0 1px 4px rgba(0,0,0,0.03)",
              borderLeft: `5px solid ${kpi.color}`,
              cursor: "pointer",
              transition: "all 0.2s ease",
              transform: kpi.active ? "translateY(-2px)" : "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.boxShadow = `0 6px 16px ${kpi.color}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = kpi.active ? "translateY(-2px)" : "none";
              e.currentTarget.style.boxShadow = kpi.active ? `0 4px 12px ${kpi.color}25` : "0 1px 4px rgba(0,0,0,0.03)";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                {kpi.label}
                {kpi.active && <i className="fa-solid fa-check" style={{ color: kpi.color, fontSize: "0.7rem" }} />}
              </span>
              <i className={`fa-solid ${kpi.icon}`} style={{ color: kpi.color, fontSize: "0.95rem", opacity: 0.85 }} />
            </div>
            <div style={{ fontSize: "1.45rem", fontWeight: 800, color: kpi.color, marginTop: 4 }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}>
              <span>클릭하여 목록 보기</span>
              <i className="fa-solid fa-arrow-right" style={{ fontSize: "0.6rem" }} />
            </div>
          </div>
        ))}
      </div>

      {isMobile && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, background: "#e2e8f0", padding: 4, borderRadius: 10, marginBottom: 14 }}>
          {[
            { key: "meetings", label: "회의록", icon: "fa-newspaper", action: () => { setMobileSection("meetings"); setViewTab("meetings"); } },
            { key: "agendas", label: "안건", icon: "fa-list-check", action: () => { setMobileSection("agendas"); setViewTab("agendas"); } },
            { key: "ai", label: "AI Q&A", icon: "fa-robot", action: () => setMobileSection("ai") },
          ].map(item => (
            <button
              key={item.key}
              onClick={item.action}
              style={{
                minHeight: 42,
                border: "none",
                borderRadius: 8,
                background: mobileSection === item.key ? "#fff" : "transparent",
                color: mobileSection === item.key ? "#0284c7" : "#64748b",
                fontSize: "0.78rem",
                fontWeight: mobileSection === item.key ? 900 : 700,
                cursor: "pointer",
                boxShadow: mobileSection === item.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <i className={`fa-solid ${item.icon}`} style={{ marginRight: 5 }} />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ── 메인 레이아웃 (좌측: AI 챗봇 / 우측: 회의 게시물 & 안건 탭) ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile || isWideLayout ? "1fr" : "1.02fr 1.38fr",
        gap: isMobile ? 14 : 24,
        alignItems: "start",
        transition: "all 0.3s ease"
      }}>
        
        {/* 🤖 1. AI 심의 도우미 Q&A 챗봇 (와이드 모드 시 접힘) */}
        {!isWideLayout && (!isMobile || mobileSection === "ai") && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", height: isMobile ? "calc(100vh - 120px)" : "860px", minHeight: isMobile ? 540 : 0, overflow: "hidden" }}>
            {/* 챗봇 헤더 */}
            <div style={{ padding: isMobile ? "14px 14px" : "16px 20px", borderBottom: "1px solid #e2e8f0", background: "linear-gradient(135deg, #0f172a, #1e293b)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="fa-solid fa-robot" style={{ color: "#38bdf8", fontSize: "1.1rem" }} />
                <div>
                  <strong style={{ fontSize: "0.95rem" }}>심의위원회 RAG AI 도우미</strong>
                  <span style={{ marginLeft: 8, fontSize: "0.68rem", background: "rgba(56,189,248,0.2)", color: "#38bdf8", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>Gemini Flash</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                {isAdmin ? (
                  <span style={{ fontSize: "0.74rem", color: "#4ade80", fontWeight: 800, background: "rgba(74,222,128,0.15)", padding: "2px 8px", borderRadius: 4 }}>
                    <i className="fa-solid fa-shield-halved" style={{ marginRight: 4 }} />무제한 (ADMIN)
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: "0.7rem", color: remaining > 5 ? "#4ade80" : remaining > 0 ? "#fbbf24" : "#f87171", fontWeight: 700 }}>
                      오늘 남은 질문: {remaining}회
                    </span>
                    <span style={{ fontSize: "0.66rem", color: "#94a3b8" }}>일 최대 20회 (무료)</span>
                  </>
                )}
              </div>
            </div>

            {/* 챗봇 메시지 영역 */}
            <div ref={chatContainerRef} style={{ flex: 1, padding: "18px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, background: "#f8fafc" }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: msg.role === "user" ? (isMobile ? "88%" : "92%") : "100%",
                    padding: "12px 16px",
                    borderRadius: 12,
                    fontSize: "0.85rem",
                    lineHeight: 1.6,
                    background: msg.role === "user" ? "#0284c7" : "#fff",
                    color: msg.role === "user" ? "#fff" : "#1e293b",
                    border: msg.role === "user" ? "none" : "1px solid #e2e8f0",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)"
                  }}>
                    {msg.content
                      ? (msg.role === "user"
                        ? <span style={{ whiteSpace: "pre-line" }}>{msg.content}</span>
                        : <div className="md-body"><ReactMarkdown>{msg.content}</ReactMarkdown></div>)
                      : (chatLoading && i === messages.length - 1 ? "회의록 검색 및 답변 생성 중..." : "")}
                  </div>

                  {/* 인용된 회의록 참고자료 카드 */}
                  {msg.references && msg.references.length > 0 && (
                    <div style={{ width: "100%", marginTop: 8, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", fontSize: "0.78rem" }}>
                      <div style={{ fontWeight: 800, color: "#0284c7", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <i className="fa-solid fa-book-bookmark" /> 답변 근거 회의록 자료:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {msg.references.map((ref, rIdx) => (
                          <div key={rIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#f8fafc", padding: "6px 10px", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                            <div style={{ minWidth: 0 }}>
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

                  {msg.role === "assistant" && msg.feedbackId && msg.content && !(chatLoading && i === messages.length - 1) && (
                    <div style={{ marginTop: 7, fontSize: "0.72rem", color: "#64748b", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {msg.feedback === null || typeof msg.feedback === "undefined" ? (
                        <>
                          <span>이 답변이 도움이 되었나요?</span>
                          <button
                            onClick={() => handleChatFeedback(i, true)}
                            disabled={msg.feedbackSaving}
                            style={{ padding: "3px 9px", borderRadius: 12, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                          >👍 Y</button>
                          <button
                            onClick={() => handleChatFeedback(i, false)}
                            disabled={msg.feedbackSaving}
                            style={{ padding: "3px 9px", borderRadius: 12, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                          >👎 N</button>
                          {msg.feedbackSaving && <span>저장 중...</span>}
                          {msg.feedbackError && <span style={{ color: "#dc2626" }}>{msg.feedbackError}</span>}
                        </>
                      ) : (
                        <span style={{ color: msg.feedback ? "#15803d" : "#b45309", fontWeight: 700 }}>
                          평가가 저장되었습니다. ({msg.feedback ? "Y" : "N"})
                        </span>
                      )}
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
                  disabled={chatLoading || (cooldown > 0 && !isAdmin)}
                  style={{
                    padding: "4px 10px", background: "#f0fdfa", color: "#0d9488", border: "1px solid #ccfbf1",
                    borderRadius: 14, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", flexShrink: 0
                  }}
                >
                  💡 {q}
                </button>
              ))}
            </div>

            {/* 관리자 프롬프트 편집 패널 */}
            {isAdmin && (
              <div style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <button
                  onClick={() => setShowPromptEditor(v => !v)}
                  style={{
                    width: "100%", padding: "8px 16px", background: "none", border: "none",
                    display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                    fontSize: "0.76rem", fontWeight: 700, color: "#475569"
                  }}
                >
                  <i className={`fa-solid fa-${showPromptEditor ? "chevron-up" : "chevron-down"}`} style={{ fontSize: "0.7rem" }} />
                  <i className="fa-solid fa-sliders" style={{ color: "#0284c7" }} />
                  AI 시스템 프롬프트 설정 (관리자)
                </button>
                {showPromptEditor && (
                  <div style={{ padding: "0 14px 14px" }}>
                    <div style={{ fontSize: "0.74rem", color: "#64748b", lineHeight: 1.5, marginBottom: 8 }}>
                      기본 시스템 프롬프트는 항상 먼저 적용되고, 여기에 저장한 내용은 관리자 추가 지시로 함께 적용됩니다. 기본값 초기화를 누르면 코드에 내장된 최신 기본 프롬프트와 다시 일치합니다.
                    </div>
                    <textarea
                      value={systemPrompt}
                      onChange={e => { setSystemPrompt(e.target.value); setPromptMsg(""); }}
                      rows={8}
                      placeholder="AI에게 내릴 시스템 지시문을 입력하세요. (답변 형식, 어투, 금지 내용 등)"
                      style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1",
                        borderRadius: 8, fontSize: "0.78rem", lineHeight: 1.6,
                        resize: "vertical", outline: "none", fontFamily: "inherit",
                        boxSizing: "border-box"
                      }}
                    />
                    {promptMsg && (
                      <div style={{ fontSize: "0.76rem", marginTop: 4, color: promptMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
                        {promptMsg}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button
                        onClick={handleSavePrompt}
                        disabled={promptSaving}
                        style={{
                          padding: "6px 14px", background: "#0284c7", color: "#fff",
                          border: "none", borderRadius: 7, fontSize: "0.78rem", fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        {promptSaving ? "저장 중..." : "💾 저장"}
                      </button>
                      <button
                        onClick={handleResetPrompt}
                        style={{
                          padding: "6px 12px", background: "#f1f5f9", color: "#64748b",
                          border: "1px solid #e2e8f0", borderRadius: 7, fontSize: "0.78rem",
                          fontWeight: 600, cursor: "pointer"
                        }}
                      >
                        기본값 초기화
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 챗봇 입력창 */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", background: "#fff" }}>
              {!isAdmin && (cooldown > 0 || remaining <= 5) && (
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
              <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row" }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                  placeholder="심의위원회 회의록 관련 질문을 입력하세요... (예: 피치세라마이드 보완 사유)"
                  disabled={chatLoading || (!isAdmin && (cooldown > 0 || remaining === 0))}
                  style={{ flex: 1, padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 10, fontSize: "0.84rem", outline: "none", opacity: (!isAdmin && remaining === 0) ? 0.5 : 1 }}
                />
                <button
                  onClick={() => handleSendChat()}
                  disabled={chatLoading || !chatInput.trim() || (!isAdmin && (cooldown > 0 || remaining === 0))}
                  style={{
                    padding: "10px 18px",
                    background: chatLoading || !chatInput.trim() || (!isAdmin && (cooldown > 0 || remaining === 0)) ? "#94a3b8" : "#0284c7",
                    color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: "0.85rem",
                    cursor: chatLoading || !chatInput.trim() || (!isAdmin && (cooldown > 0 || remaining === 0)) ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", width: isMobile ? "100%" : "auto"
                  }}
                >
                  {chatLoading ? <i className="fa-solid fa-spinner fa-spin" /> : cooldown > 0 && !isAdmin ? <i className="fa-solid fa-clock" /> : <i className="fa-solid fa-paper-plane" />}
                  {cooldown > 0 && !isAdmin ? `${cooldown}초` : "전송"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 📋 2. 우측 탭 전환 영역 (회의 게시물 뷰 vs 안건별 결과 뷰) */}
        {(!isMobile || mobileSection === "meetings" || mobileSection === "agendas") && <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", padding: isMobile ? "14px 12px 10px" : "20px 20px 10px", minHeight: isMobile ? "auto" : "860px", display: "flex", flexDirection: "column" }}>
          
          {/* 상단 탭 헤더 & 도구 버튼 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #f1f5f9", paddingBottom: 14, marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setViewTab("meetings")}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "8px 10px" : "8px 16px",
                  borderRadius: 10, border: "none", fontSize: "0.88rem", fontWeight: 800, cursor: "pointer",
                  background: viewTab === "meetings" ? "#0284c7" : "#f1f5f9",
                  color: viewTab === "meetings" ? "#fff" : "#64748b",
                  transition: "all 0.2s"
                }}
              >
                <i className="fa-solid fa-newspaper" />
                {isMobile ? "회의록" : "회의 게시물 뷰 (공시 목록)"}
                <span style={{ fontSize: "0.72rem", background: viewTab === "meetings" ? "rgba(255,255,255,0.25)" : "#e2e8f0", padding: "2px 6px", borderRadius: 10 }}>
                  {meetingTotal}
                </span>
              </button>

              <button
                onClick={() => setViewTab("agendas")}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "8px 10px" : "8px 16px",
                  borderRadius: 10, border: "none", fontSize: "0.88rem", fontWeight: 800, cursor: "pointer",
                  background: viewTab === "agendas" ? "#0284c7" : "#f1f5f9",
                  color: viewTab === "agendas" ? "#fff" : "#64748b",
                  transition: "all 0.2s"
                }}
              >
                <i className="fa-solid fa-list-check" />
                {isMobile ? "안건별" : "심의 안건별 결과 뷰"}
                <span style={{ fontSize: "0.72rem", background: viewTab === "agendas" ? "rgba(255,255,255,0.25)" : "#e2e8f0", padding: "2px 6px", borderRadius: 10 }}>
                  {agendaTotal}
                </span>
              </button>
            </div>

            {/* 안건 뷰일 때 상단 도구: 결과 필터 및 확대 버튼 */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {viewTab === "agendas" && (
                <div style={{ display: "flex", gap: 4, background: "#f1f5f9", padding: 3, borderRadius: 8 }}>
                  {[
                    { label: "전체", val: "" },
                    { label: "인정", val: "인정" },
                    { label: "보완", val: "보완" },
                    { label: "불인정", val: "불인정" },
                  ].map((tab) => (
                    <button
                      key={tab.label}
                      onClick={() => setAgendaResultFilter(tab.val)}
                      style={{
                        padding: "4px 10px", border: "none", borderRadius: 6, fontSize: "0.74rem",
                        fontWeight: agendaResultFilter === tab.val ? 800 : 500,
                        background: agendaResultFilter === tab.val ? "#fff" : "transparent",
                        color: agendaResultFilter === tab.val ? "#0284c7" : "#64748b",
                        cursor: "pointer",
                        boxShadow: agendaResultFilter === tab.val ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {/* 확대 버튼 & 1단 와이드 전환 버튼 */}
              {viewTab === "agendas" && (
                <button
                  onClick={() => setIsFullscreenAgenda(true)}
                  title="심의 안건별 결과 뷰를 큰 창으로 확대 보기"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
                    background: "#0284c7", color: "#fff", border: "none", borderRadius: 8,
                    fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 6px rgba(2,132,199,0.25)"
                  }}
                >
                  <i className="fa-solid fa-up-right-and-down-left-from-center" />
                  확대 보기
                </button>
              )}

              {/* 레이아웃 1단/2단 토글 */}
              <button
                onClick={() => setIsWideLayout(!isWideLayout)}
                title={isWideLayout ? "AI 챗봇과 나란히 보기" : "테이블 넓게 보기 (1단)"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px",
                  background: isWideLayout ? "#0f172a" : "#f1f5f9",
                  color: isWideLayout ? "#fff" : "#475569",
                  border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.74rem", fontWeight: 700, cursor: "pointer"
                }}
              >
                <i className={`fa-solid ${isWideLayout ? "fa-table-columns" : "fa-expand"}`} />
                {isWideLayout ? "2단 분할" : "넓게보기"}
              </button>
            </div>
          </div>

          {/* ═════════ TAB 1: 회의 게시물 뷰 (식약처 공시 형태) ═════════ */}
          {viewTab === "meetings" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {/* 검색 및 부서 필터 & 정렬 드롭다운 */}
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.8rem" }} />
                  <input
                    value={meetingSearch}
                    onChange={(e) => setMeetingSearch(e.target.value)}
                    placeholder="회의명, 회차, 안건 원료명 검색..."
                    style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.82rem", outline: "none" }}
                  />
                </div>
                {departments.length > 0 && (
                  <select
                    value={meetingDeptFilter}
                    onChange={(e) => setMeetingDeptFilter(e.target.value)}
                    style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.8rem", color: "#334155", background: "#fff" }}
                  >
                    <option value="">모든 부서</option>
                    {departments.map((d) => (
                      <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
                    ))}
                  </select>
                )}

                {/* 빠른 정렬 선택 */}
                <select
                  value={`${meetingSortBy}:${meetingSortOrder}`}
                  onChange={(e) => {
                    const [sBy, sOrder] = e.target.value.split(":");
                    setMeetingSortBy(sBy);
                    setMeetingSortOrder(sOrder);
                  }}
                  style={{ padding: "8px 12px", border: "1px solid #0284c7", borderRadius: 8, fontSize: "0.8rem", color: "#0284c7", background: "#f0f9ff", fontWeight: 700 }}
                >
                  <option value="date:desc">등록일 최신순 (기본)</option>
                  <option value="date:asc">등록일 과거순</option>
                  <option value="postNo:desc">글번호 높은순</option>
                  <option value="postNo:asc">글번호 낮은순</option>
                  <option value="views:desc">조회수 높은순</option>
                </select>
              </div>

              {/* ── 구분 첫행 헤더 바 (정렬 토글 버튼 포함) ── */}
              <div style={{
                display: isMobile ? "none" : "grid",
                gridTemplateColumns: "60px 1fr 110px 110px 85px 100px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px 8px 0 0",
                padding: "10px 14px",
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "#475569",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                whiteSpace: "nowrap"
              }}>
                <div
                  onClick={() => handleMeetingSort("postNo")}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, userSelect: "none", whiteSpace: "nowrap" }}
                  title="글번호 정렬"
                >
                  <span>번호</span>
                  <span style={{ color: "#0284c7", fontSize: "0.72rem" }}>
                    {meetingSortBy === "postNo" ? (meetingSortOrder === "desc" ? "▼" : "▲") : "↕"}
                  </span>
                </div>
                <div
                  onClick={() => handleMeetingSort("title")}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 3, userSelect: "none", whiteSpace: "nowrap" }}
                  title="제목 정렬"
                >
                  <span>회의 제목 및 심의 안건</span>
                  {meetingSortBy === "title" && <span style={{ color: "#0284c7", fontSize: "0.72rem" }}>{meetingSortOrder === "desc" ? "▼" : "▲"}</span>}
                </div>
                <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>담당부서</div>
                <div
                  onClick={() => handleMeetingSort("date")}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, userSelect: "none", whiteSpace: "nowrap" }}
                  title="등록일자 정렬"
                >
                  <span>등록일</span>
                  <span style={{ color: "#0284c7", fontSize: "0.72rem" }}>
                    {meetingSortBy === "date" ? (meetingSortOrder === "desc" ? "▼" : "▲") : "↕"}
                  </span>
                </div>
                <div
                  onClick={() => handleMeetingSort("views")}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, userSelect: "none", whiteSpace: "nowrap" }}
                  title="조회수 정렬"
                >
                  <span>조회수</span>
                  <span style={{ color: "#0284c7", fontSize: "0.72rem" }}>
                    {meetingSortBy === "views" ? (meetingSortOrder === "desc" ? "▼" : "▲") : "↕"}
                  </span>
                </div>
                <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>원문/파일</div>
              </div>

              {/* 게시물 카드 리스트 (초기 최신순 정렬) */}
              <div style={{ flex: 1, overflowY: "auto", maxHeight: "620px", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
                {loading ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> 회의 목록을 불러오는 중...
                  </div>
                ) : meetings.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
                    검색 결과가 없습니다.
                  </div>
                ) : (
                  meetings.map((m) => {
                    const isExpanded = expandedMeetingId === m.id;
                    return (
                      <div
                        key={m.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          background: isExpanded ? "#f8fafc" : "#fff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                          transition: "all 0.15s",
                        }}
                      >
                        {/* 게시물 본문 영역 */}
                        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                          {/* 글 번호 */}
                          <div style={{
                            minWidth: 42, minHeight: 38, borderRadius: 8, background: "#f1f5f9",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.88rem", fontWeight: 800, color: "#334155", flexShrink: 0, marginTop: 2
                          }}>
                            {m.postNo || m.id}
                          </div>

                          {/* 제목 및 메타정보 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* 제목 */}
                            <div style={{ marginBottom: 6 }}>
                              <a
                                href={m.sourceUrl || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: "0.91rem", fontWeight: 700, color: "#0f172a",
                                  textDecoration: "none", lineHeight: 1.45,
                                  wordBreak: "break-word", overflowWrap: "anywhere", display: "block"
                                }}
                                onMouseEnter={(e) => e.target.style.color = "#0284c7"}
                                onMouseLeave={(e) => e.target.style.color = "#0f172a"}
                              >
                                {m.title}
                              </a>
                            </div>

                            {/* 담당부서 | 등록일 | 조회수 */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.75rem", color: "#64748b", flexWrap: "wrap", marginBottom: 8 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <strong style={{ color: "#475569" }}>부서:</strong> {m.department || "식약처"}
                              </span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <strong style={{ color: "#475569" }}>등록일:</strong> {m.postDate || m.meetingDate || "-"}
                              </span>
                              {m.viewCount != null && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <strong style={{ color: "#475569" }}>조회:</strong> {m.viewCount.toLocaleString()}
                                </span>
                              )}
                              {m.agendas && m.agendas.length > 0 && (
                                <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "1px 8px", borderRadius: 4, fontWeight: 700, fontSize: "0.72rem" }}>
                                  심의안건 {m.agendas.length}건
                                </span>
                              )}
                            </div>

                            {/* 첨부파일 다운로드 & PDF 미리보기 버튼 */}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              {/* PDF 미리보기 버튼 */}
                              {m.pdfFileUrl && m.pdfFileUrl !== 'NONE' && (
                                <button
                                  onClick={() => setPreviewPdf({ id: m.id, title: m.title, fileName: m.pdfFileName, fileUrl: m.pdfFileUrl })}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px",
                                    background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "#fff", border: "none", borderRadius: 6,
                                    fontSize: "0.73rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 1px 3px rgba(2,132,199,0.25)"
                                  }}
                                >
                                  <i className="fa-solid fa-eye" /> PDF 미리보기
                                </button>
                              )}

                              {/* PDF 다운로드 버튼 */}
                              {m.pdfFileUrl && m.pdfFileUrl !== 'NONE' && (
                                <a
                                  href={`/api/committee/pdf/${m.id}?download=true`}
                                  download
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px",
                                    background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6,
                                    fontSize: "0.72rem", fontWeight: 600, textDecoration: "none"
                                  }}
                                >
                                  <i className="fa-solid fa-file-pdf" /> PDF 다운
                                </a>
                              )}

                              {/* HWP 다운로드 버튼 */}
                              {m.hwpFileUrl && (
                                <a
                                  href={m.hwpFileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px",
                                    background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 6,
                                    fontSize: "0.72rem", fontWeight: 600, textDecoration: "none"
                                  }}
                                >
                                  <i className="fa-solid fa-file-lines" /> HWP 다운
                                </a>
                              )}

                              {/* 식약처 원문 링크 */}
                              {m.sourceUrl && (
                                <a
                                  href={m.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px",
                                    background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 6,
                                    fontSize: "0.72rem", fontWeight: 600, textDecoration: "none"
                                  }}
                                >
                                  <i className="fa-solid fa-arrow-up-right-from-square" /> 식약처 공시
                                </a>
                              )}

                              {/* 안건 아코디언 토글 버튼 */}
                              {m.agendas && m.agendas.length > 0 && (
                                <button
                                  onClick={() => setExpandedMeetingId(isExpanded ? null : m.id)}
                                  style={{
                                    marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
                                    padding: "4px 10px", background: isExpanded ? "#e2e8f0" : "#f1f5f9",
                                    color: "#334155", border: "none", borderRadius: 6, fontSize: "0.72rem",
                                    fontWeight: 700, cursor: "pointer"
                                  }}
                                >
                                  {isExpanded ? "안건 접기 ▲" : `안건 ${m.agendas.length}개 보기 ▼`}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 아코디언 확장 영역 (해당 회의의 안건 리스트) */}
                        {isExpanded && m.agendas && m.agendas.length > 0 && (
                          <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "14px 18px" }}>
                            <div style={{ fontWeight: 800, fontSize: "0.8rem", color: "#0f172a", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                              <i className="fa-solid fa-list-check" style={{ color: "#0284c7" }} />
                              심의 안건 및 의결 결과:
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {m.agendas.map((ag) => (
                                <div
                                  key={ag.id}
                                  style={{
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    background: "#f8fafc", padding: "8px 12px", borderRadius: 6,
                                    border: "1px solid #f1f5f9", fontSize: "0.78rem", gap: 8
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <strong style={{ color: "#0f172a" }}>{ag.ingredientName}</strong>
                                    {ag.agendaType && (
                                      <span style={{ background: "#f1f5f9", color: "#475569", padding: "1px 6px", borderRadius: 4, fontSize: "0.68rem" }}>
                                        {ag.agendaType}
                                      </span>
                                    )}
                                    <span style={{ color: "#64748b", fontSize: "0.72rem" }}>({ag.rawName})</span>
                                  </div>
                                  <div style={{ flexShrink: 0 }}>{getResultBadge(ag.result)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* ── 게시물 뷰 중앙 번호형 페이지네이션 ── */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 4 }}>
                  총 <strong>{meetingTotal}</strong>건 회의 공시 (현재 {meetingPage} / {meetingPages} 페이지)
                </div>
                <CenteredPagination
                  current={meetingPage}
                  totalPages={meetingPages}
                  onChange={(p) => fetchMeetings(p)}
                />
              </div>
            </div>
          )}

          {/* ═════════ TAB 2: 심의 안건별 결과 뷰 (테이블 형태) ═════════ */}
          {viewTab === "agendas" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {/* 검색창 */}
              <div style={{ marginBottom: 12, position: "relative" }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.8rem" }} />
                <input
                  value={agendaSearch}
                  onChange={(e) => setAgendaSearch(e.target.value)}
                  placeholder="원료명(예: 하고초, 피치세라마이드), 회의명 검색..."
                  style={{ width: "100%", padding: "9px 12px 9px 38px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.82rem", outline: "none" }}
                />
              </div>

              {/* 안건 목록 */}
              {isMobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {loading ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />안건 목록을 불러오는 중...</div>
                  ) : agendas.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>등록된 안건 데이터가 없습니다.</div>
                  ) : (
                    agendas.map((ag) => {
                      const ingredientName = cleanCommitteeText(ag.ingredientName);
                      const rawName = cleanCommitteeText(ag.rawName);
                      const agendaType = cleanCommitteeText(ag.agendaType);

                      return (
                        <article key={ag.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 13px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "0.73rem", color: "#64748b", fontWeight: 800, marginBottom: 3 }}>
                                {ag.meeting?.meetingNo || "심의회의"} · {ag.meeting?.meetingDate || ag.meeting?.postDate || "-"}
                              </div>
                              <strong title={ingredientName} style={{ color: "#0f172a", fontSize: "0.92rem", lineHeight: 1.35, ...twoLineClampStyle }}>{ingredientName || "-"}</strong>
                            </div>
                            <div style={{ flexShrink: 0 }}>{getResultBadge(ag.result)}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: rawName ? 8 : 0 }}>
                            {agendaType && <span style={{ background: "#f1f5f9", color: "#475569", padding: "2px 7px", borderRadius: 5, fontSize: "0.7rem", fontWeight: 700 }}>{agendaType}</span>}
                          </div>
                          {rawName && (
                            <div title={rawName} style={{ fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5, marginBottom: 10, ...twoLineClampStyle }}>
                              {rawName}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6 }}>
                            {ag.meeting?.pdfFileUrl && ag.meeting?.pdfFileUrl !== 'NONE' && (
                              <button
                                onClick={() => setPreviewPdf({ id: ag.meeting.id, title: ag.meeting.title, fileName: ag.meeting.pdfFileName, fileUrl: ag.meeting.pdfFileUrl })}
                                style={{ flex: 1, padding: "8px 10px", background: "#0284c7", color: "#fff", border: "none", borderRadius: 7, fontSize: "0.76rem", fontWeight: 800, cursor: "pointer" }}
                              >
                                <i className="fa-solid fa-eye" style={{ marginRight: 5 }} /> PDF
                              </button>
                            )}
                            {ag.meeting?.sourceUrl && (
                              <a
                                href={ag.meeting.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ flex: 1, padding: "8px 10px", background: "#f8fafc", color: "#0284c7", border: "1px solid #cbd5e1", borderRadius: 7, fontSize: "0.76rem", fontWeight: 800, textDecoration: "none", textAlign: "center" }}
                              >
                                <i className="fa-solid fa-arrow-up-right-from-square" style={{ marginRight: 5 }} /> 공시
                              </a>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              ) : (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflowX: "auto", flex: 1, maxHeight: "620px", overflowY: "auto" }}>
                <table style={{ width: "100%", minWidth: isMobile ? 620 : 0, borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 5 }}>
                      {/* 회차/일시 정렬 가능 헤더 */}
                      <th
                        onClick={() => handleAgendaSort("date")}
                        style={{
                          padding: "11px 12px", textAlign: "left", color: "#0f172a", fontWeight: 800, width: "140px",
                          cursor: "pointer", userSelect: "none", background: "#f1f5f9", whiteSpace: "nowrap"
                        }}
                        title="클릭하여 최신순/과거순 정렬 변경"
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                          <span>회차/일시</span>
                          <span style={{ color: "#0284c7", fontSize: "0.72rem" }}>
                            {agendaSortBy === "date" ? (agendaSortOrder === "desc" ? "▼ 최신순" : "▲ 과거순") : "↕"}
                          </span>
                        </div>
                      </th>

                      {/* 원료 성분명 헤더 */}
                      <th
                        onClick={() => handleAgendaSort("ingredient")}
                        style={{ padding: "11px 12px", textAlign: "left", color: "#475569", fontWeight: 700, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="원료명 정렬"
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                          <span>원료·성분명 / 안건 내용</span>
                          {agendaSortBy === "ingredient" && <span style={{ color: "#0284c7", fontSize: "0.72rem" }}>{agendaSortOrder === "desc" ? "▼" : "▲"}</span>}
                        </div>
                      </th>

                      {/* 결과 헤더 */}
                      <th
                        onClick={() => handleAgendaSort("result")}
                        style={{ padding: "11px 10px", textAlign: "center", color: "#475569", fontWeight: 700, width: "80px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                        title="결과 정렬"
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, whiteSpace: "nowrap" }}>
                          <span>결과</span>
                          {agendaSortBy === "result" && <span style={{ color: "#0284c7", fontSize: "0.72rem" }}>{agendaSortOrder === "desc" ? "▼" : "▲"}</span>}
                        </div>
                      </th>

                      <th style={{ padding: "11px 10px", textAlign: "center", color: "#64748b", fontWeight: 700, width: "110px", whiteSpace: "nowrap" }}>원문/PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />안건 목록을 불러오는 중...</td></tr>
                    ) : agendas.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>등록된 안건 데이터가 없습니다.</td></tr>
                    ) : (
                      agendas.map((ag) => {
                        const ingredientName = cleanCommitteeText(ag.ingredientName);
                        const rawName = cleanCommitteeText(ag.rawName);
                        const agendaType = cleanCommitteeText(ag.agendaType);

                        return (
                        <tr key={ag.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                          <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{ag.meeting?.meetingNo || "심의회의"}</div>
                            <div style={{ color: "#94a3b8", fontSize: "0.7rem" }}>{ag.meeting?.meetingDate || ag.meeting?.postDate || "-"}</div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, minWidth: 0 }}>
                              <strong title={ingredientName} style={{ color: "#0f172a", fontSize: "0.85rem", minWidth: 0, ...oneLineClampStyle }}>{ingredientName || "-"}</strong>
                              {agendaType && (
                                <span style={{ background: "#f1f5f9", color: "#475569", padding: "1px 6px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 600 }}>
                                  {agendaType}
                                </span>
                              )}
                            </div>
                            <div title={rawName} style={{ fontSize: "0.75rem", color: "#64748b", lineHeight: 1.4, ...twoLineClampStyle }}>
                              {rawName}
                            </div>
                          </td>
                          <td style={{ padding: "10px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                            {getResultBadge(ag.result)}
                          </td>
                          <td style={{ padding: "10px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              {ag.meeting?.pdfFileUrl && ag.meeting?.pdfFileUrl !== 'NONE' && (
                                <button
                                  onClick={() => setPreviewPdf({ id: ag.meeting.id, title: ag.meeting.title, fileName: ag.meeting.pdfFileName, fileUrl: ag.meeting.pdfFileUrl })}
                                  style={{
                                    padding: "4px 7px", background: "#0284c7", color: "#fff", border: "none",
                                    borderRadius: 4, fontSize: "0.68rem", fontWeight: 700, cursor: "pointer"
                                  }}
                                  title="PDF 미리보기"
                                >
                                  <i className="fa-solid fa-eye" />
                                </button>
                              )}
                              {ag.meeting?.sourceUrl && (
                                <a
                                  href={ag.meeting.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    padding: "4px 7px", background: "#f1f5f9", color: "#0284c7", border: "1px solid #cbd5e1",
                                    borderRadius: 4, fontSize: "0.68rem", fontWeight: 700, textDecoration: "none"
                                  }}
                                  title="식약처 공시 원문"
                                >
                                  공시
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              )}

              {/* ── 안건 뷰 중앙 번호형 페이지네이션 ── */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 4 }}>
                  총 <strong>{agendaTotal}</strong>건 안건 (현재 {agendaPage} / {agendaPages} 페이지)
                </div>
                <CenteredPagination
                  current={agendaPage}
                  totalPages={agendaPages}
                  onChange={(p) => fetchAgendas(p)}
                />
              </div>
            </div>
          )}

        </div>}

      </div>

      {/* ── ⛶ 심의 안건 결과 뷰 대화면 확대 모달 ── */}
      {isFullscreenAgenda && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9990,
          background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "96vw", maxWidth: "1400px", height: "92vh",
            display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.35)"
          }}>
            {/* 확대 모달 헤더 */}
            <div style={{
              padding: "16px 24px", background: "linear-gradient(135deg, #0f172a, #1e293b)", color: "#fff",
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <i className="fa-solid fa-list-check" style={{ color: "#38bdf8", fontSize: "1.2rem" }} />
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>건강기능식품심의위원회 안건별 심의결과 전체보기 (대화면 모드)</strong>
                  <span style={{ marginLeft: 10, fontSize: "0.75rem", background: "rgba(56,189,248,0.2)", color: "#38bdf8", padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                    총 {agendaTotal}건
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setIsFullscreenAgenda(false)}
                  style={{
                    padding: "6px 14px", background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 8, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6
                  }}
                >
                  <i className="fa-solid fa-xmark" /> 닫기 (ESC)
                </button>
              </div>
            </div>

            {/* 확대 모달 검색 & 필터 바 */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "260px", position: "relative" }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.85rem" }} />
                <input
                  value={agendaSearch}
                  onChange={(e) => setAgendaSearch(e.target.value)}
                  placeholder="원료명(예: 하고초, 피치세라마이드), 회의명 검색..."
                  style={{ width: "100%", padding: "9px 14px 9px 40px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.85rem", outline: "none", background: "#fff" }}
                />
              </div>

              {/* 필터 탭 */}
              <div style={{ display: "flex", gap: 6, background: "#e2e8f0", padding: 4, borderRadius: 8 }}>
                {[
                  { label: "전체 안건", val: "" },
                  { label: "인정 (승인)", val: "인정" },
                  { label: "보완 처분", val: "보완" },
                  { label: "불인정 (반려)", val: "불인정" },
                ].map((tab) => (
                  <button
                    key={tab.label}
                    onClick={() => setAgendaResultFilter(tab.val)}
                    style={{
                      padding: "6px 14px", border: "none", borderRadius: 6, fontSize: "0.78rem",
                      fontWeight: agendaResultFilter === tab.val ? 800 : 500,
                      background: agendaResultFilter === tab.val ? "#0284c7" : "transparent",
                      color: agendaResultFilter === tab.val ? "#fff" : "#475569",
                      cursor: "pointer",
                      boxShadow: agendaResultFilter === tab.val ? "0 2px 6px rgba(2,132,199,0.3)" : "none",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 확대 모달 테이블 영역 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", position: "sticky", top: 0, zIndex: 10 }}>
                    <th
                      onClick={() => handleAgendaSort("date")}
                      style={{ padding: "12px 16px", textAlign: "left", color: "#0f172a", fontWeight: 800, width: "160px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="회차/일시 정렬"
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <span>회차 / 개최일시</span>
                        <span style={{ color: "#0284c7", fontSize: "0.78rem" }}>
                          {agendaSortBy === "date" ? (agendaSortOrder === "desc" ? "▼ 최신순" : "▲ 과거순") : "↕"}
                        </span>
                      </div>
                    </th>
                    <th
                      onClick={() => handleAgendaSort("ingredient")}
                      style={{ padding: "12px 16px", textAlign: "left", color: "#0f172a", fontWeight: 800, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="원료명 정렬"
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <span>원료·성분명 및 안건 상세</span>
                        {agendaSortBy === "ingredient" && <span style={{ color: "#0284c7" }}>{agendaSortOrder === "desc" ? "▼" : "▲"}</span>}
                      </div>
                    </th>
                    <th
                      onClick={() => handleAgendaSort("result")}
                      style={{ padding: "12px 16px", textAlign: "center", color: "#0f172a", fontWeight: 800, width: "100px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      title="결과 정렬"
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <span>의결 결과</span>
                        {agendaSortBy === "result" && <span style={{ color: "#0284c7" }}>{agendaSortOrder === "desc" ? "▼" : "▲"}</span>}
                      </div>
                    </th>
                    <th style={{ padding: "12px 16px", textAlign: "center", color: "#475569", fontWeight: 800, width: "140px", whiteSpace: "nowrap" }}>
                      원문 공시 / PDF
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />안건 목록을 불러오는 중...</td></tr>
                  ) : agendas.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>등록된 안건 데이터가 없습니다.</td></tr>
                  ) : (
                    agendas.map((ag) => {
                      const ingredientName = cleanCommitteeText(ag.ingredientName);
                      const rawName = cleanCommitteeText(ag.rawName);
                      const agendaType = cleanCommitteeText(ag.agendaType);

                      return (
                      <tr key={ag.id} style={{ borderBottom: "1px solid #e2e8f0" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.85rem" }}>{ag.meeting?.meetingNo || "심의위원회"}</div>
                          <div style={{ color: "#64748b", marginTop: 2 }}>{ag.meeting?.meetingDate || ag.meeting?.postDate || "-"}</div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, minWidth: 0 }}>
                            <strong title={ingredientName} style={{ color: "#0f172a", fontSize: "0.95rem", minWidth: 0, ...oneLineClampStyle }}>{ingredientName || "-"}</strong>
                            {agendaType && (
                              <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: 4, fontSize: "0.72rem", fontWeight: 700 }}>
                                {agendaType}
                              </span>
                            )}
                          </div>
                          <div title={rawName} style={{ fontSize: "0.8rem", color: "#475569", lineHeight: 1.5, ...twoLineClampStyle }}>
                            {rawName}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                          {getResultBadge(ag.result)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                            {ag.meeting?.pdfFileUrl && ag.meeting?.pdfFileUrl !== 'NONE' && (
                              <button
                                onClick={() => setPreviewPdf({ id: ag.meeting.id, title: ag.meeting.title, fileName: ag.meeting.pdfFileName, fileUrl: ag.meeting.pdfFileUrl })}
                                style={{
                                  padding: "5px 10px", background: "#0284c7", color: "#fff", border: "none",
                                  borderRadius: 6, fontSize: "0.74rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4
                                }}
                              >
                                <i className="fa-solid fa-eye" /> PDF 미리보기
                              </button>
                            )}
                            {ag.meeting?.sourceUrl && (
                              <a
                                href={ag.meeting.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: "5px 10px", background: "#f1f5f9", color: "#0284c7", border: "1px solid #cbd5e1",
                                  borderRadius: 6, fontSize: "0.74rem", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4
                                }}
                              >
                                <i className="fa-solid fa-arrow-up-right-from-square" /> 공시
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 확대 모달 푸터 페이지네이션 */}
            <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "center" }}>
              <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 4 }}>
                총 <strong>{agendaTotal}</strong>건 안건 (현재 {agendaPage} / {agendaPages} 페이지)
              </div>
              <CenteredPagination
                current={agendaPage}
                totalPages={agendaPages}
                onChange={(p) => fetchAgendas(p)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 동기화 변경 이력 모달 */}
      {syncHistoryOpen && (
        <div
          onClick={() => setSyncHistoryOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.72)", zIndex: 9998,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, width: "100%", maxWidth: 1100, height: "88vh",
              display: "grid", gridTemplateColumns: isMobile ? "1fr" : "320px 1fr",
              overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.35)"
            }}
          >
            <div style={{ borderRight: isMobile ? "none" : "1px solid #e2e8f0", borderBottom: isMobile ? "1px solid #e2e8f0" : "none", overflowY: "auto", background: "#f8fafc" }}>
              <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                  <i className="fa-solid fa-clock-rotate-left" style={{ color: "#0284c7", marginRight: 8 }} />
                  동기화 이력
                </strong>
                <button
                  onClick={() => fetchSyncHistory()}
                  disabled={syncHistoryLoading}
                  title="새로고침"
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", cursor: "pointer" }}
                >
                  <i className={`fa-solid ${syncHistoryLoading ? "fa-spinner fa-spin" : "fa-rotate-right"}`} />
                </button>
              </div>
              <div style={{ padding: 10 }}>
                {syncRuns.length === 0 ? (
                  <div style={{ padding: 20, color: "#94a3b8", fontSize: "0.82rem", textAlign: "center" }}>아직 동기화 이력이 없습니다.</div>
                ) : syncRuns.map(run => {
                  const active = selectedSyncRun?.id === run.id;
                  return (
                    <button
                      key={run.id}
                      onClick={() => fetchSyncHistory(run.id)}
                      style={{
                        width: "100%", textAlign: "left", padding: 12, marginBottom: 8, borderRadius: 8,
                        border: active ? "1px solid #0284c7" : "1px solid #e2e8f0",
                        background: active ? "#e0f2fe" : "#fff", cursor: "pointer"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <strong style={{ color: "#0f172a", fontSize: "0.82rem" }}>#{run.id} 전체 비교</strong>
                        <span style={{
                          fontSize: "0.68rem", fontWeight: 800, padding: "2px 6px", borderRadius: 5,
                          background: run.status === "SUCCESS" ? "#dcfce7" : run.status === "FAILED" ? "#fee2e2" : "#fef3c7",
                          color: run.status === "SUCCESS" ? "#15803d" : run.status === "FAILED" ? "#dc2626" : "#b45309"
                        }}>{run.status}</span>
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.72rem", lineHeight: 1.5 }}>
                        {new Date(run.startedAt).toLocaleString("ko-KR")}<br />
                        확인 {run.scannedCount} · 신규 {run.createdCount} · 변경 {run.updatedCount}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <strong style={{ color: "#0f172a", fontSize: "1rem" }}>변경 전/후 상세</strong>
                  {selectedSyncRun && (
                    <span style={{ marginLeft: 8, color: "#64748b", fontSize: "0.78rem" }}>
                      신규 {selectedSyncRun.createdCount} · 변경 {selectedSyncRun.updatedCount} · 동일 {selectedSyncRun.unchangedCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSyncHistoryOpen(false)}
                  style={{ padding: "7px 10px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
                >
                  <i className="fa-solid fa-xmark" /> 닫기
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                {!selectedSyncRun ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>왼쪽에서 동기화 실행 이력을 선택하세요.</div>
                ) : selectedSyncRun.changes?.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>이 실행에서 변경된 항목이 없습니다.</div>
                ) : selectedSyncRun.changes.map(change => {
                  const open = expandedSyncChange === change.id;
                  return (
                    <div key={change.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 10, overflow: "hidden", background: "#fff" }}>
                      <button
                        onClick={() => setExpandedSyncChange(open ? null : change.id)}
                        style={{ width: "100%", border: "none", background: "#fff", padding: 12, cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{
                                fontSize: "0.68rem", fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                                background: change.changeType === "CREATE" ? "#dcfce7" : change.changeType === "ERROR" ? "#fee2e2" : "#e0f2fe",
                                color: change.changeType === "CREATE" ? "#15803d" : change.changeType === "ERROR" ? "#dc2626" : "#0369a1"
                              }}>{change.changeType}</span>
                              <strong style={{ color: "#0f172a", fontSize: "0.86rem", ...oneLineClampStyle }}>{change.title || change.seq}</strong>
                            </div>
                            <div style={{ color: "#64748b", fontSize: "0.74rem" }}>
                              seq {change.seq} · 변경 필드: {change.changedFields || "-"}
                            </div>
                          </div>
                          <i className={`fa-solid ${open ? "fa-chevron-up" : "fa-chevron-down"}`} style={{ color: "#64748b" }} />
                        </div>
                      </button>
                      {open && (
                        <div style={{ borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 0 }}>
                          <div style={{ padding: 12, background: "#f8fafc", borderRight: isMobile ? "none" : "1px solid #e2e8f0" }}>
                            <strong style={{ display: "block", color: "#475569", fontSize: "0.78rem", marginBottom: 8 }}>변경 전</strong>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.72rem", lineHeight: 1.5, color: "#334155" }}>
                              {JSON.stringify(change.beforeData, null, 2) || "null"}
                            </pre>
                          </div>
                          <div style={{ padding: 12, background: "#fff" }}>
                            <strong style={{ display: "block", color: "#475569", fontSize: "0.78rem", marginBottom: 8 }}>변경 후</strong>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.72rem", lineHeight: 1.5, color: "#334155" }}>
                              {JSON.stringify(change.afterData, null, 2) || "null"}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF 미리보기 모달 */}
      {previewPdf && (
        <div
          onClick={() => setPreviewPdf(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, width: "100%", maxWidth: 900, height: "90vh",
              display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
            }}
          >
            {/* 모달 헤더 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <i className="fa-solid fa-file-pdf" style={{ color: "#dc2626", marginRight: 6 }} />
                {previewPdf.title}
              </div>
              <div style={{ display: "flex", gap: 8, marginLeft: 12, flexShrink: 0 }}>
                <a
                  href={`/api/committee/pdf/${previewPdf.id}?download=true`}
                  download
                  style={{ padding: "5px 10px", background: "#0284c7", color: "#fff", borderRadius: 6, fontSize: "0.78rem", fontWeight: 700, textDecoration: "none" }}
                >
                  <i className="fa-solid fa-download" /> 다운로드
                </a>
                <button
                  onClick={() => setPreviewPdf(null)}
                  style={{ padding: "5px 10px", background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                >
                  <i className="fa-solid fa-xmark" /> 닫기
                </button>
              </div>
            </div>
            {/* iframe으로 PDF 렌더링 */}
            <iframe
              src={`/api/committee/pdf/${previewPdf.id}`}
              style={{ flex: 1, border: "none", width: "100%" }}
              title={previewPdf.title}
            />
          </div>
        </div>
      )}

    </div>
  );
}
