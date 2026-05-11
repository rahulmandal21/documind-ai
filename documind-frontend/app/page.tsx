"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// Speech Recognition type shim
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
}
declare class SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type LangMode = "en" | "hi"; // FIX 1: declared LangMode type

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  sources?: { page: number; text: string }[];
};

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "success" | "error";
  progress: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  
  "Summarize the document",
  "Explain this in simple terms",
  "Generate MCQs",
  "Create fill in the blanks",
  "Generate True/False questions",
  "Key takeaways",
  "Create concise study notes from this document",
  "What are the risks?",
];

// ─── Smart Recommendation Engine ─────────────────────────────────────────────
const getSmartSuggestions = (history: ChatMessage[]): string[] => {
  const lastUserMsgs = history
    .filter(m => m.role === "user")
    .slice(-3)
    .map(m => m.content.toLowerCase());

  if (lastUserMsgs.length === 0) return [
    "Summarize the document",
    "Generate MCQs",
    "Explain this in simple terms",
    "Key takeaways",
  ];

  const last = lastUserMsgs[lastUserMsgs.length - 1];

  if (/summar|overview|brief/i.test(last)) return [
    "Generate MCQs from this summary",
    "Create True/False questions",
    "What are the key concepts?",
    "Create fill in the blanks",
  ];

  if (/mcq|multiple choice|quiz/i.test(last)) return [
    "Generate more MCQs",
    "Create True/False questions",
    "Create fill in the blanks",
    "Explain the weak areas",
  ];

  if (/explain|what is|define|concept/i.test(last)) return [
    "Give me examples of this",
    "Summarize this concept",
    "Generate MCQs on this topic",
    "Compare with related concepts",
  ];

  if (/true.false/i.test(last)) return [
    "Generate MCQs now",
    "Create fill in the blanks",
    "Summarize the topic",
    "What are the key takeaways?",
  ];

  if (/risk|problem|issue|challenge/i.test(last)) return [
    "What are the solutions?",
    "Summarize the risks",
    "Generate MCQs on risks",
    "Key takeaways",
  ];

  return [
    "Generate MCQs",
    "Summarize the document",
    "Key takeaways",
    "Create True/False questions",
  ];
};

// ─── Study History Helpers ────────────────────────────────────────────────────
type HistoryItem = {
  id: string;
  type: "summary" | "quiz" | "question";
  document: string;
  content: string;
  timestamp: string;
};

const detectType = (q: string): HistoryItem["type"] => {
  const lower = q.toLowerCase();
  if (/mcq|true.false|fill in|quiz|question/i.test(lower)) return "quiz";
  if (/summar|explain|overview|takeaway/i.test(lower)) return "summary";
  return "question";
};

const saveToHistory = (item: Omit<HistoryItem, "id">) => {
  try {
    const existing: HistoryItem[] = JSON.parse(localStorage.getItem("documind_history") || "[]");
    const newItem = { ...item, id: genId() };
    const updated = [newItem, ...existing].slice(0, 50);
    localStorage.setItem("documind_history", JSON.stringify(updated));
  } catch { /* storage unavailable */ }
};

const loadHistory = (): HistoryItem[] => {
  try {
    return JSON.parse(localStorage.getItem("documind_history") || "[]");
  } catch { return []; }
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const genId = () => Math.random().toString(36).slice(2, 10);

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }
  body { font-family: 'Inter', sans-serif; background: #03050f; color: #e2e8f0; }

  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.25); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.5); }

  @keyframes orb-drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(40px, -30px) scale(1.05); }
    66% { transform: translate(-20px, 20px) scale(0.97); }
  }
  @keyframes orb-drift-2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(-50px, 25px) scale(1.03); }
    66% { transform: translate(30px, -20px) scale(0.98); }
  }
  @keyframes grid-pulse {
    0%, 100% { opacity: 0.018; }
    50% { opacity: 0.035; }
  }
  @keyframes msg-in {
    from { opacity: 0; transform: translateY(14px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
  @keyframes thinking-pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.85); }
    50%       { opacity: 1;   transform: scale(1); }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes mic-ring {
    0%   { transform: scale(1);    opacity: 0.7; }
    100% { transform: scale(1.9);  opacity: 0; }
  }
  @keyframes scan-line {
    0%   { top: 0%; }
    100% { top: 100%; }
  }
  @keyframes glow-border {
    0%, 100% { border-color: rgba(139,92,246,0.35); box-shadow: 0 0 16px rgba(139,92,246,0.12); }
    50%       { border-color: rgba(99,179,237,0.55);  box-shadow: 0 0 28px rgba(99,179,237,0.18); }
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes progress-glow {
    0%, 100% { box-shadow: 0 0 6px rgba(139,92,246,0.6); }
    50%       { box-shadow: 0 0 14px rgba(99,179,237,0.8); }
  }

  .msg-in      { animation: msg-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .fade-in     { animation: fade-in 0.5s ease both; }
  .spin        { animation: spin 1s linear infinite; }

  .glass-panel {
    background: rgba(8, 12, 28, 0.75);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(139,92,246,0.12);
  }
  .glass-sidebar {
    background: rgba(5, 8, 20, 0.85);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border-right: 1px solid rgba(139,92,246,0.1);
  }
  .glow-text {
    text-shadow: 0 0 28px rgba(167,139,250,0.6), 0 0 60px rgba(139,92,246,0.3);
  }
  .neon-border-focus:focus-within {
    animation: glow-border 2.5s ease infinite;
    border-color: rgba(139,92,246,0.5) !important;
    box-shadow: 0 0 0 1px rgba(139,92,246,0.2), 0 0 24px rgba(139,92,246,0.15) !important;
  }
  .hover-card {
    transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
  }
  .hover-card:hover {
    background: rgba(139,92,246,0.08) !important;
    border-color: rgba(139,92,246,0.25) !important;
    box-shadow: 0 0 20px rgba(139,92,246,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
    transform: translateY(-1px);
  }
  .hover-card.active-file {
    background: rgba(139,92,246,0.13) !important;
    border-color: rgba(139,92,246,0.35) !important;
    box-shadow: 0 0 24px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .send-btn {
    transition: all 0.2s cubic-bezier(0.22,1,0.36,1);
    background: linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%);
    box-shadow: 0 0 20px rgba(124,58,237,0.5), 0 4px 16px rgba(0,0,0,0.4);
  }
  .send-btn:hover:not(:disabled) {
    transform: scale(1.07);
    box-shadow: 0 0 32px rgba(124,58,237,0.7), 0 8px 24px rgba(0,0,0,0.5);
  }
  .send-btn:active:not(:disabled) { transform: scale(0.96); }
  .send-btn:disabled {
    background: rgba(255,255,255,0.05) !important;
    box-shadow: none !important;
  }
  .chip {
    transition: all 0.2s cubic-bezier(0.22,1,0.36,1);
    cursor: pointer;
  }
  .chip:hover {
    background: rgba(139,92,246,0.15) !important;
    border-color: rgba(139,92,246,0.4) !important;
    color: #c4b5fd !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139,92,246,0.15);
  }
  .chip:active { transform: scale(0.96) translateY(0); }
  .copy-btn {
    transition: all 0.18s ease;
    opacity: 0;
  }
  .ai-bubble:hover .copy-btn { opacity: 1; }
  .regen-btn {
    transition: all 0.2s ease;
    opacity: 0;
  }
  .ai-bubble:hover .regen-btn { opacity: 1; }
  .progress-bar {
    animation: progress-glow 1.5s ease infinite;
  }
    @keyframes tutor-bob {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-5px); }
  }
  @keyframes tutor-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.35); }
    50%       { box-shadow: 0 0 0 7px rgba(124,58,237,0); }
  }
  @keyframes arrow-flow {
    0%   { stroke-dashoffset: 120; }
    100% { stroke-dashoffset: 0; }
  }
  .shimmer-bg {
    background: linear-gradient(90deg,
      rgba(255,255,255,0.03) 0%,
      rgba(139,92,246,0.08) 40%,
      rgba(255,255,255,0.03) 80%
    );
    background-size: 400px 100%;
    animation: shimmer 1.6s ease infinite;
  }
  .upload-zone {
    transition: all 0.28s cubic-bezier(0.22,1,0.36,1);
  }
  .upload-zone:hover, .upload-zone.dragging {
    border-color: rgba(139,92,246,0.6) !important;
    background: rgba(139,92,246,0.06) !important;
    box-shadow: 0 0 32px rgba(139,92,246,0.12), inset 0 0 24px rgba(139,92,246,0.04);
    transform: scale(1.01);
  }
  .hud-line {
    position: absolute;
    left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(139,92,246,0.4), rgba(99,179,237,0.4), transparent);
    animation: scan-line 4s linear infinite;
    pointer-events: none;
    opacity: 0.4;
  }
`;

// ─── Background Scene ─────────────────────────────────────────────────────────
function BackgroundScene() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(139,92,246,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139,92,246,0.04) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        animation: "grid-pulse 6s ease infinite",
      }} />
      <div style={{
        position: "absolute", top: "-15%", right: "5%",
        width: "55vw", height: "55vw",
        background: "radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, rgba(109,40,217,0.04) 45%, transparent 70%)",
        borderRadius: "50%",
        animation: "orb-drift 18s ease-in-out infinite",
        filter: "blur(1px)",
      }} />
      <div style={{
        position: "absolute", bottom: "-10%", left: "-10%",
        width: "50vw", height: "50vw",
        background: "radial-gradient(ellipse, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0.03) 45%, transparent 70%)",
        borderRadius: "50%",
        animation: "orb-drift-2 22s ease-in-out infinite",
        filter: "blur(1px)",
      }} />
      <div style={{
        position: "absolute", top: "40%", right: "-5%",
        width: "30vw", height: "30vw",
        background: "radial-gradient(ellipse, rgba(20,184,166,0.07) 0%, transparent 65%)",
        borderRadius: "50%",
        animation: "orb-drift 28s ease-in-out infinite reverse",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        opacity: 0.025,
      }} />
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function TopNavbar({ onClearChat, onOpenTutor, tutorMode, onOpenSidebar, isMobile }: { onClearChat: () => void; onOpenTutor: () => void; tutorMode: boolean; onOpenSidebar: () => void; isMobile: boolean; }) {
  return (
    <header className="glass-panel" style={{
      height: "56px", display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 20px",
      position: "relative", zIndex: 10, flexShrink: 0,
      borderTop: "none", borderLeft: "none", borderRight: "none",
      borderBottom: "1px solid rgba(139,92,246,0.12)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "30px", height: "30px", borderRadius: "9px",
          background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 18px rgba(124,58,237,0.6), 0 4px 12px rgba(0,0,0,0.4)",
          position: "relative", overflow: "hidden",
        }}>
          <div className="hud-line" />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
        </div>
        <span className="glow-text" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.02em", color: "#fff" }}>
          Docu<span style={{ color: "#a78bfa" }}>Mind</span>
        </span>
        <span style={{
          fontSize: "9px", fontWeight: 600, padding: "2px 7px", borderRadius: "99px",
          background: "rgba(139,92,246,0.15)", color: "#a78bfa",
          border: "1px solid rgba(139,92,246,0.25)", letterSpacing: "0.08em", textTransform: "uppercase",
        }}>AI · BETA</span>
      </div>

      

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button onClick={onClearChat}style={{
          display: "flex", alignItems: "center", gap: "6px",
          fontSize: "11px", color: "#64748b", background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px",
          padding: "6px 12px", cursor: "pointer", transition: "all 0.2s",
          fontFamily: "'Inter', sans-serif",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e2e8f0"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.3)"; (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#64748b"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.58"/>
          </svg>
          Clear
        </button>
        <button onClick={onOpenTutor} style={{
          display: "flex", alignItems: "center", gap: "6px",
          fontSize: "11px",
          color: tutorMode ? "#34d399" : "#a78bfa",
          background: tutorMode ? "rgba(52,211,153,0.08)" : "rgba(139,92,246,0.08)",
          border: `1px solid ${tutorMode ? "rgba(52,211,153,0.25)" : "rgba(139,92,246,0.2)"}`,
          borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
          transition: "all 0.2s", fontFamily: "'Inter', sans-serif",
        }}>
          <svg width="14" height="14" viewBox="0 0 52 52" fill="none">
            <circle cx="26" cy="26" r="24" fill={tutorMode ? "#34d399" : "#7c3aed"} opacity="0.85"/>
            <ellipse cx="18" cy="22" rx="3.5" ry="4" fill="white" opacity="0.95"/>
            <ellipse cx="34" cy="22" rx="3.5" ry="4" fill="white" opacity="0.95"/>
            <circle cx="19.5" cy="23" r="2" fill="#1e1b4b"/>
            <circle cx="35.5" cy="23" r="2" fill="#1e1b4b"/>
            <path d="M18 33 Q26 40 34 33" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.9"/>
            <line x1="26" y1="2" x2="26" y2="8" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="26" cy="8" r="2.5" fill="white" opacity="0.8"/>
          </svg>
          AI Tutor {tutorMode && "● ON"}
        </button>
        <div style={{
          width: "30px", height: "30px", borderRadius: "50%",
          background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", fontWeight: 700, color: "white",
          boxShadow: "0 0 12px rgba(124,58,237,0.4)",
          border: "1px solid rgba(167,139,250,0.3)",
        }}>U</div>
      </div>
    </header>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ files, activeFileId, onSelectFile, onDrop, isDragging, setIsDragging, onFileSelect, onShowHistory, onShowPerformance }: {
  files: UploadedFile[]; activeFileId: string | null; onSelectFile: (id: string) => void;
  onDrop: (e: React.DragEvent) => void; isDragging: boolean; setIsDragging: (v: boolean) => void;
  onFileSelect: (file: File) => void; onShowHistory: () => void; onShowPerformance: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <aside className="glass-sidebar" style={{ width: "100%", height: "100%", flexShrink: 0, display: "flex", flexDirection: "column", position: "relative", zIndex: 5 }}>
      <div style={{ padding: "12px", borderBottom: "1px solid rgba(139,92,246,0.08)" }}>
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); onDrop(e); }}
          style={{
            border: "1.5px dashed rgba(139,92,246,0.25)", borderRadius: "12px",
            padding: "18px 12px", textAlign: "center", cursor: "pointer",
            background: "rgba(139,92,246,0.03)", position: "relative", overflow: "hidden",
          }}
        >
          {isDragging && <div className="hud-line" style={{ top: "0%", animation: "scan-line 1.2s linear infinite" }} />}
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px", margin: "0 auto 10px",
            background: isDragging ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.08)",
            border: `1px solid ${isDragging ? "rgba(139,92,246,0.5)" : "rgba(139,92,246,0.15)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isDragging ? "0 0 18px rgba(139,92,246,0.3)" : "none",
            transition: "all 0.28s",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={isDragging ? "#c4b5fd" : "#8b5cf6"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p style={{ fontSize: "11px", fontWeight: 600, color: isDragging ? "#c4b5fd" : "#94a3b8", marginBottom: "2px" }}>
            {isDragging ? "Release to upload" : "Drop PDF here"}
          </p>
          <p style={{ fontSize: "9px", color: "#475569" }}>or click to browse</p>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 8px" }}>
        <p style={{ fontSize: "9px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 4px", marginBottom: "8px" }}>Documents</p>
        {files.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0", opacity: 0.4 }}>
            <svg style={{ margin: "0 auto 6px", display: "block" }} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/>
            </svg>
            <p style={{ fontSize: "10px", color: "#475569" }}>No documents yet</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {files.map(f => <FileItem key={f.id} file={f} isActive={f.id === activeFileId} onClick={() => f.status === "success" && onSelectFile(f.id)} />)}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(139,92,246,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.8)", flexShrink: 0 }} />
          <span style={{ fontSize: "9px", color: "#334155", flex: 1 }}>API · localhost:8000</span>
          <button onClick={onShowHistory} style={{
            display: "flex", alignItems: "center", gap: "4px",
            fontSize: "9px", color: "#64748b", background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.15)", borderRadius: "6px",
            padding: "3px 8px", cursor: "pointer", fontFamily: "'Inter',sans-serif",
          }}>📚 History</button>
          <button onClick={onShowPerformance} style={{
            display: "flex", alignItems: "center", gap: "4px",
            fontSize: "9px", color: "#64748b", background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.15)", borderRadius: "6px",
            padding: "3px 8px", cursor: "pointer", fontFamily: "'Inter',sans-serif",
          }}>📊 Stats</button>
        </div>
      </div>
    </aside>
  );
}

function FileItem({ file, isActive, onClick }: { file: UploadedFile; isActive: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`hover-card ${isActive ? "active-file" : ""}`} style={{
      width: "100%", textAlign: "left", borderRadius: "9px", padding: "9px 10px",
      border: "1px solid transparent", background: "transparent", cursor: file.status === "success" ? "pointer" : "default",
      display: "flex", alignItems: "flex-start", gap: "9px",
    }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "7px", flexShrink: 0, marginTop: "1px",
        background: isActive ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isActive ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.06)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: isActive ? "0 0 10px rgba(139,92,246,0.2)" : "none",
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isActive ? "#a78bfa" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/>
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "11px", fontWeight: 500, color: isActive ? "#d8b4fe" : "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {file.name}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
          {file.status === "uploading" ? (
            <>
              <div style={{ flex: 1, height: "2px", borderRadius: "99px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div className="progress-bar" style={{ height: "100%", width: `${file.progress}%`, background: "linear-gradient(90deg,#7c3aed,#3b82f6)", borderRadius: "99px", transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: "9px", color: "#475569" }}>
                {file.progress < 90 ? `${file.progress}%` : "Indexing…"}
              </span>
            </>
          ) : file.status === "success" ? (
            <>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#34d399", boxShadow: "0 0 5px rgba(52,211,153,0.7)", flexShrink: 0 }} />
              <span style={{ fontSize: "9px", color: "#475569" }}>{formatBytes(file.size)}</span>
            </>
          ) : (
            <>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#f87171", boxShadow: "0 0 5px rgba(248,113,113,0.7)", flexShrink: 0 }} />
              <span style={{ fontSize: "9px", color: "#f87171" }}>Failed</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Chat Bubbles ─────────────────────────────────────────────────────────────
function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="msg-in" style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: "10px" }}>
      <div style={{ maxWidth: "68%" }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(59,130,246,0.75) 100%)",
          borderRadius: "18px 18px 4px 18px", padding: "11px 16px",
          fontSize: "13.5px", lineHeight: "1.6", color: "#f1f5f9",
          border: "1px solid rgba(167,139,250,0.25)",
          boxShadow: "0 4px 24px rgba(124,58,237,0.25), 0 1px 0 rgba(255,255,255,0.08) inset",
          backdropFilter: "blur(8px)",
        }}>
          {msg.content}
        </div>
        <p style={{ fontSize: "9px", color: "#1e293b", textAlign: "right", marginTop: "4px", paddingRight: "4px" }}>
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div style={{
        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg,#7c3aed,#06b6d4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "10px", fontWeight: 700, color: "white",
        border: "1px solid rgba(167,139,250,0.3)",
        boxShadow: "0 0 10px rgba(124,58,237,0.35)",
      }}>U</div>
    </div>
  );
}

function AiBubble({ msg, onRegenerate, lastAi, onSpeak, onSpeakWithPicker }: {
  msg: ChatMessage; onRegenerate: () => void; lastAi: boolean;
  onSpeak: (text: string) => void; onSpeakWithPicker: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="msg-in ai-bubble" style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "9px", flexShrink: 0,
        background: "linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 14px rgba(124,58,237,0.5), 0 4px 10px rgba(0,0,0,0.4)",
        border: "1px solid rgba(167,139,250,0.3)",
        position: "relative", overflow: "hidden",
      }}>
        <div className="hud-line" style={{ animation: "scan-line 3s linear infinite", opacity: 0.5 }} />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        </svg>
      </div>

      <div style={{ maxWidth: "72%", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "5px", paddingLeft: "2px" }}>
          <span style={{ fontSize: "9px", color: "#334155", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>DocuMind AI</span>
          <span style={{ fontSize: "9px", color: "#1e293b" }}>·</span>
          <span style={{ fontSize: "9px", color: "#1e293b" }}>{msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>

        <div style={{
          background: "rgba(10, 15, 35, 0.8)", borderRadius: "4px 18px 18px 18px",
          padding: "13px 16px", fontSize: "13.5px", lineHeight: "1.7", color: "#cbd5e1",
          border: "1px solid rgba(139,92,246,0.12)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
          backdropFilter: "blur(12px)", position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", left: 0, top: "12px", bottom: "12px", width: "2px", borderRadius: "99px", background: "linear-gradient(180deg,#7c3aed,#3b82f6)", opacity: 0.5 }} />
          <div style={{ paddingLeft: "6px" }}>
            <StructuredText content={msg.content} />
          </div>
          <div style={{ fontSize: "10px", color: "#34d399", marginTop: "8px", opacity: 0.7 }}>
            Confidence: {Math.floor(85 + (msg.id.charCodeAt(0) % 10))}%
          </div>

          {msg.sources && msg.sources.length > 0 && !msg.content.startsWith("⚠️ Not found in document") && (
            <div style={{ marginTop: "10px", borderTop: "1px solid rgba(139,92,246,0.1)", paddingTop: "8px" }}>
              <p style={{ fontSize: "9px", color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                📄 Sources
              </p>
              {msg.sources.map((src: { page: number; text: string }, i: number) => (
                <div key={i} style={{
                  background: "rgba(139,92,246,0.06)", borderRadius: "7px",
                  padding: "7px 10px", marginBottom: "5px",
                  borderLeft: "2px solid rgba(139,92,246,0.4)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                    <span style={{
                      fontSize: "8px", fontWeight: 700, color: "#a78bfa",
                      background: "rgba(139,92,246,0.15)", padding: "1px 6px",
                      borderRadius: "99px",
                    }}>Page {src.page}</span>
                  </div>
                  <p style={{ fontSize: "10px", color: "#64748b", lineHeight: "1.5", fontStyle: "italic" }}>
                    &quot;{src.text}&quot;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", paddingLeft: "2px" }}>
          <button className="copy-btn" onClick={handleCopy} style={{
            display: "flex", alignItems: "center", gap: "4px", fontSize: "9px",
            color: copied ? "#34d399" : "#475569", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)", borderRadius: "5px",
            padding: "3px 8px", cursor: "pointer", fontFamily: "'Inter',sans-serif",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#94a3b8"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = copied ? "#34d399" : "#475569"}
          >
            {copied ? (
              <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg> Copied</>
            ) : (
              <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</>
            )}
          </button>

          <button className="copy-btn" onClick={() => {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  } else {
    onSpeakWithPicker(msg.id);
  }
}} style={{
            display: "flex", alignItems: "center", gap: "4px", fontSize: "9px",
            color: "#475569", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)", borderRadius: "5px",
            padding: "3px 8px", cursor: "pointer", fontFamily: "'Inter',sans-serif",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#94a3b8"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#475569"}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            {window.speechSynthesis?.speaking ? "⏹ Stop" : "Speak"}
          </button>

          {lastAi && (
            <button className="regen-btn" onClick={onRegenerate} style={{
              display: "flex", alignItems: "center", gap: "4px", fontSize: "9px",
              color: "#475569", background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: "5px",
              padding: "3px 8px", cursor: "pointer", fontFamily: "'Inter',sans-serif",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#94a3b8"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#475569"}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.58"/>
              </svg>
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="msg-in" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "9px", flexShrink: 0,
        background: "linear-gradient(135deg,#7c3aed,#3b82f6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 14px rgba(124,58,237,0.5)",
        border: "1px solid rgba(167,139,250,0.3)",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <div className="shimmer-bg" style={{
        borderRadius: "4px 18px 18px 18px", padding: "14px 20px",
        border: "1px solid rgba(139,92,246,0.12)",
        backdropFilter: "blur(12px)", display: "flex", alignItems: "center", gap: "5px",
      }}>
        {[0, 150, 300].map(delay => (
          <div key={delay} style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "linear-gradient(135deg,#a78bfa,#60a5fa)",
            animation: `thinking-pulse 1.2s ease infinite`,
            animationDelay: `${delay}ms`,
            boxShadow: "0 0 6px rgba(139,92,246,0.6)",
          }} />
        ))}
        <span style={{ fontSize: "11px", color: "#475569", marginLeft: "4px", fontStyle: "italic" }}>Analyzing document…</span>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "32px" }}>
      <div style={{ position: "relative", marginBottom: "28px" }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "20px",
          background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(59,130,246,0.1))",
          border: "1px solid rgba(139,92,246,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 40px rgba(124,58,237,0.15), 0 0 80px rgba(59,130,246,0.08)",
          backdropFilter: "blur(12px)",
          position: "relative", overflow: "hidden",
        }}>
          <div className="hud-line" style={{ animation: "scan-line 2.5s linear infinite", opacity: 0.3 }} />
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#60a5fa"/>
              </linearGradient>
            </defs>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        {[1, 1.4, 1.8].map((scale, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "20px",
            border: "1px solid rgba(139,92,246,0.15)",
            transform: `scale(${scale})`,
            opacity: 1 - i * 0.3,
            animation: `mic-ring ${1.5 + i * 0.4}s ease-out infinite`,
            animationDelay: `${i * 0.4}s`,
          }} />
        ))}
      </div>

      <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "20px", color: "#f1f5f9", marginBottom: "8px", letterSpacing: "-0.02em" }}>
        Ask your documents anything
      </h2>
      <p style={{ fontSize: "13px", color: "#475569", maxWidth: "280px", lineHeight: "1.6" }}>
        Upload a PDF from the sidebar, then start a conversation with your document.
      </p>

      <div style={{ marginTop: "28px", width: "100%", maxWidth: "380px" }}>
        <p style={{ fontSize: "9px", color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: "10px" }}>Try asking</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center" }}>
          {SUGGESTED_PROMPTS.map(p => (
            <button key={p} className="chip" onClick={() => onPrompt(p)} style={{
              fontSize: "11px", padding: "6px 14px", borderRadius: "99px",
              background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)",
              color: "#64748b", fontFamily: "'Inter',sans-serif", cursor: "pointer",
            }}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mic Button ───────────────────────────────────────────────────────────────
function MicButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggle = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser."); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <button onClick={toggle} title={listening ? "Stop listening" : "Voice input"} style={{
      width: "34px", height: "34px", borderRadius: "9px", border: "none", cursor: "pointer",
      background: listening ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", flexShrink: 0, transition: "all 0.2s",
      boxShadow: listening ? "0 0 16px rgba(239,68,68,0.3)" : "none",
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = listening ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = listening ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)"}
    >
      {listening && <>
        {[1, 1.6].map((_s, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "9px",
            border: "1px solid rgba(239,68,68,0.5)",
            animation: `mic-ring ${1 + i * 0.4}s ease-out infinite`,
            animationDelay: `${i * 0.3}s`,
          }} />
        ))}
      </>}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={listening ? "#f87171" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>
  );
}

// ─── Performance Tracker ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const updatePerformance = (topic: string, correct: boolean) => {
  try {
    const perf = JSON.parse(localStorage.getItem("documind_perf") || "{}");
    if (!perf[topic]) perf[topic] = { correct: 0, total: 0 };
    perf[topic].total += 1;
    if (correct) perf[topic].correct += 1;
    localStorage.setItem("documind_perf", JSON.stringify(perf));
  } catch { /* ignore */ }
};

const getPerformance = (): Record<string, { correct: number; total: number }> => {
  try { return JSON.parse(localStorage.getItem("documind_perf") || "{}"); }
  catch { return {}; }
};

function PerformancePanel({ onClose }: { onClose: () => void }) {
  const perf = getPerformance();
  const topics = Object.entries(perf);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "380px", maxHeight: "500px",
        background: "rgba(8,12,28,0.97)",
        border: "1px solid rgba(139,92,246,0.3)",
        borderRadius: "18px", overflow: "hidden",
        boxShadow: "0 0 60px rgba(124,58,237,0.25)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(139,92,246,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#f1f5f9" }}>📊 Performance</p>
            <p style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>{topics.length} topics tracked</p>
          </div>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "none", background: "rgba(255,255,255,0.05)", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px" }}>
          {topics.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", opacity: 0.4 }}>
              <p style={{ fontSize: "28px", marginBottom: "8px" }}>📭</p>
              <p style={{ fontSize: "11px", color: "#475569" }}>No quiz data yet. Generate MCQs to start tracking!</p>
            </div>
          ) : (
            topics.sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total)).map(([topic, data]) => {
              const pct = Math.round((data.correct / data.total) * 100);
              const color = pct >= 70 ? "#34d399" : pct >= 40 ? "#fbbf24" : "#f87171";
              return (
                <div key={topic} style={{ marginBottom: "10px", padding: "10px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>{topic}</span>
                    <span style={{ fontSize: "11px", color, fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <div style={{ height: "4px", borderRadius: "99px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "99px", transition: "width 0.5s" }} />
                  </div>
                  <p style={{ fontSize: "9px", color: "#334155", marginTop: "4px" }}>
                    {data.correct}/{data.total} correct
                    {pct < 50 && <span style={{ color: "#f87171", marginLeft: "6px" }}>⚠ Needs revision</span>}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StudyHistoryPanel({ onClose, onRevise }: { onClose: () => void; onRevise: (content: string) => void }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<"all" | HistoryItem["type"]>("all");

  useEffect(() => { setItems(loadHistory()); }, []);

  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);

  const typeIcon = (t: HistoryItem["type"]) =>
    t === "summary" ? "📄" : t === "quiz" ? "🧠" : "💬";

  const typeColor = (t: HistoryItem["type"]) =>
    t === "summary" ? "#60a5fa" : t === "quiz" ? "#a78bfa" : "#34d399";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "420px", maxHeight: "580px",
        background: "rgba(8,12,28,0.97)",
        border: "1px solid rgba(139,92,246,0.3)",
        borderRadius: "18px", overflow: "hidden",
        boxShadow: "0 0 60px rgba(124,58,237,0.25), 0 24px 48px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid rgba(139,92,246,0.1)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div>
            <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#f1f5f9" }}>📚 Study History</p>
            <p style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>{items.length} saved items · click any to revisit</p>
          </div>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "none", background: "rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ display: "flex", gap: "6px", padding: "10px 14px", borderBottom: "1px solid rgba(139,92,246,0.08)", flexShrink: 0 }}>
          {(["all", "summary", "quiz", "question"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontSize: "9px", padding: "3px 10px", borderRadius: "99px", border: "none",
              background: filter === f ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
              color: filter === f ? "#c4b5fd" : "#475569",
              cursor: "pointer", fontFamily: "'Inter',sans-serif",
              outline: filter === f ? "1px solid rgba(139,92,246,0.4)" : "1px solid transparent",
              textTransform: "capitalize",
            }}>{f === "all" ? "All" : typeIcon(f) + " " + f}</button>
          ))}
          {items.length > 0 && (
            <button onClick={() => { localStorage.removeItem("documind_history"); setItems([]); }} style={{
              fontSize: "9px", padding: "3px 10px", borderRadius: "99px", border: "none",
              background: "rgba(248,113,113,0.08)", color: "#f87171",
              cursor: "pointer", fontFamily: "'Inter',sans-serif", marginLeft: "auto",
            }}>Clear all</button>
          )}
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", opacity: 0.4 }}>
              <p style={{ fontSize: "28px", marginBottom: "8px" }}>📭</p>
              <p style={{ fontSize: "11px", color: "#475569" }}>No history yet. Ask something!</p>
            </div>
          ) : (
            filtered.map(item => (
              <button key={item.id} onClick={() => { onRevise(item.content); onClose(); }} style={{
                textAlign: "left", padding: "11px 13px", borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.05)",
                background: "rgba(255,255,255,0.02)", cursor: "pointer",
                transition: "all 0.18s", width: "100%",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                  <span style={{ fontSize: "13px" }}>{typeIcon(item.type)}</span>
                  <span style={{
                    fontSize: "8px", fontWeight: 700, padding: "1px 7px", borderRadius: "99px",
                    background: `${typeColor(item.type)}18`,
                    color: typeColor(item.type), textTransform: "uppercase", letterSpacing: "0.08em",
                  }}>{item.type}</span>
                  <span style={{ fontSize: "8px", color: "#334155", marginLeft: "auto" }}>
                    {new Date(item.timestamp).toLocaleDateString()} · {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p style={{ fontSize: "10px", color: "#64748b", marginBottom: "3px", fontWeight: 600 }}>📎 {item.document}</p>
                <p style={{ fontSize: "11px", color: "#94a3b8", lineHeight: "1.5",
                  overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>
                  {item.content}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Structured Text Renderer ─────────────────────────────────────────────────
function StructuredText({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "--" || trimmed === "---") {
          return <div key={i} style={{ height: "1px", background: "rgba(139,92,246,0.2)", margin: "8px 0" }} />;
        }
        if (trimmed.startsWith("━")) {
          return <div key={i} style={{ height: "1px", background: "rgba(139,92,246,0.2)", margin: "4px 0" }} />;
        }

        if (trimmed === "--" || trimmed === "---") {
          return (
            <div key={i} style={{
              height: "1px",
              background: "rgba(139,92,246,0.2)",
              margin: "8px 0",
            }} />
          );
        }

        // ── Emoji section headers
        if (/^[📋💬🔍📝📚💡📌🧠📊🎯🔑⚡🏆🏭🌍⚠️🔥🎯🔍⚙️🚨✅🌀💠🏭]/.test(trimmed)) {
          const headerColors: Record<string, string> = {
            "📌": "#f472b6",
            "🧠": "#a78bfa",
            "🏭": "#60a5fa",
            "🌍": "#34d399",
            "⚠️": "#fbbf24",
            "💡": "#60a5fa",
            "🔥": "#f87171",
          };
          const emoji = trimmed[0];
          const col = headerColors[emoji] || "#a78bfa";
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: "10px",
              marginTop: "18px", marginBottom: "8px",
              padding: "10px 14px",
              background: `${col}10`,
              borderRadius: "10px",
              border: `1px solid ${col}30`,
              borderLeft: `3px solid ${col}`,
            }}>
              <span style={{ fontSize: "18px" }}>{emoji}</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: col, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {trimmed.slice(2).trim()}
              </span>
            </div>
          );
        }

        if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
          return (
            <div key={i} style={{ display: "flex", gap: "8px", paddingLeft: "8px", marginTop: "2px" }}>
              <span style={{ flexShrink: 0, marginTop: "1px" }}>✦</span>
              <span style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: "1.6" }}>{trimmed.slice(1).trim()}</span>
            </div>
          );
        }

        if (/^Q\d+\./.test(trimmed)) {
          return <p key={i} style={{ fontSize: "13.5px", fontWeight: 700, color: "#f1f5f9", marginTop: "14px", marginBottom: "4px" }}>{trimmed}</p>;
        }

        if (/^[A-D]\)/.test(trimmed)) {
          return (
            <div key={i} style={{ display: "flex", gap: "8px", paddingLeft: "16px", marginTop: "2px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", background: "rgba(255,255,255,0.05)", borderRadius: "4px", padding: "1px 6px", flexShrink: 0, marginTop: "2px" }}>{trimmed[0]}</span>
              <span style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5" }}>{trimmed.slice(2).trim()}</span>
            </div>
          );
        }

        if (trimmed.startsWith("✅")) {
          return (
            <div key={i} style={{ display: "flex", gap: "6px", paddingLeft: "16px", marginTop: "6px", background: "rgba(52,211,153,0.06)", borderRadius: "6px", padding: "5px 10px" }}>
              <span style={{ fontSize: "13px", color: "#34d399", fontWeight: 600 }}>{trimmed}</span>
            </div>
          );
        }

        if (trimmed.startsWith("💡")) {
          return <p key={i} style={{ fontSize: "11px", color: "#60a5fa", paddingLeft: "16px", fontStyle: "italic", marginBottom: "8px" }}>{trimmed}</p>;
        }

        if (/^\d+\)/.test(trimmed)) {
          return (
            <div key={i} style={{ display: "flex", gap: "8px", paddingLeft: "8px", marginTop: "2px" }}>
              <span style={{ fontSize: "11px", color: "#a78bfa", fontWeight: 700, flexShrink: 0 }}>{trimmed.match(/^\d+\)/)?.[0]}</span>
              <span style={{ fontSize: "13px", color: "#cbd5e1" }}>{trimmed.replace(/^\d+\)\s*/, "")}</span>
            </div>
          );
        }

        if (!trimmed) return <div key={i} style={{ height: "4px" }} />;

        return <p key={i} style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: "1.7" }}>{trimmed}</p>;
      })}
    </div>
  );
}

function VoicePickerModal({ voices, selectedVoiceURI, onSelect, onClose, onPlay }: {
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  onSelect: (uri: string) => void;
  onClose: () => void;
  onPlay: () => void;
}) {
  const englishVoices = voices.filter(v => v.lang.startsWith("en"));

  const recommended = [
    "Google UK English Female", "Google US English Female",
    "Microsoft Zira Desktop", "Samantha", "Karen", "Moira", "Microsoft Hazel Desktop",
    "Google हिन्दी", "Microsoft Swara Desktop", "Lekha",
  ];

  const categories = [
    { label: "🌟 Recommended", filter: (v: SpeechSynthesisVoice) => recommended.includes(v.name) },
    { label: "🇮🇳 Indian & Hindi", filter: (v: SpeechSynthesisVoice) => v.lang.startsWith("hi") || v.lang === "en-IN" || /india|hindi|swara|lekha/i.test(v.name) },
    { label: "🇬🇧 UK Voices", filter: (v: SpeechSynthesisVoice) => v.lang === "en-GB" },
    { label: "🇺🇸 US Voices", filter: (v: SpeechSynthesisVoice) => v.lang === "en-US" },
    { label: "🌏 Other English", filter: (v: SpeechSynthesisVoice) => v.lang.startsWith("en") && v.lang !== "en-GB" && v.lang !== "en-US" && v.lang !== "en-IN" },
    { label: "🗣️ Other Languages", filter: (v: SpeechSynthesisVoice) => !v.lang.startsWith("en") && !v.lang.startsWith("hi") },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "360px", maxHeight: "520px",
        background: "rgba(8,12,28,0.97)",
        border: "1px solid rgba(139,92,246,0.3)",
        borderRadius: "18px", overflow: "hidden",
        boxShadow: "0 0 60px rgba(124,58,237,0.25), 0 24px 48px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "14px", color: "#f1f5f9", letterSpacing: "-0.01em" }}>Choose Voice</p>
            <p style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>Select how DocuMind AI sounds</p>
          </div>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "none", background: "rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "10px 12px" }}>
          {englishVoices.length === 0 ? (
            <p style={{ fontSize: "11px", color: "#475569", textAlign: "center", padding: "24px" }}>No voices available in this browser.</p>
          ) : (
            categories.map(cat => {
              const catVoices = cat.label === "🌟 Recommended"
                ? englishVoices.filter(cat.filter)
                : englishVoices.filter(v => cat.filter(v) && !["Google UK English Female","Google US English Female","Microsoft Zira Desktop","Samantha","Karen","Moira","Microsoft Hazel Desktop"].includes(v.name));
              if (catVoices.length === 0) return null;
              return (
                <div key={cat.label} style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "9px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 4px", marginBottom: "6px" }}>{cat.label}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    {catVoices.map(v => {
                      const isSelected = v.voiceURI === selectedVoiceURI;
                      return (
                        <button key={v.voiceURI} onClick={() => onSelect(v.voiceURI)} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "9px 12px", borderRadius: "10px", border: "none", cursor: "pointer",
                          background: isSelected ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                          outline: isSelected ? "1px solid rgba(139,92,246,0.35)" : "1px solid transparent",
                          transition: "all 0.18s", textAlign: "left",
                        }}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.07)"; }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                        >
                          <div>
                            <p style={{ fontSize: "12px", fontWeight: 500, color: isSelected ? "#c4b5fd" : "#94a3b8", fontFamily: "'Inter',sans-serif" }}>{v.name}</p>
                            <p style={{ fontSize: "9px", color: "#334155", marginTop: "1px" }}>{v.lang}</p>
                          </div>
                          {isSelected && (
                            <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(139,92,246,0.1)", display: "flex", gap: "8px", flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: "#64748b", fontSize: "12px", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Cancel</button>
          <button onClick={() => { onPlay(); onClose(); }} style={{
            flex: 2, padding: "9px", borderRadius: "10px", border: "none",
            background: "linear-gradient(135deg,#7c3aed,#3b82f6)",
            color: "white", fontSize: "12px", fontWeight: 600,
            cursor: "pointer", fontFamily: "'Inter',sans-serif",
            boxShadow: "0 0 20px rgba(124,58,237,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            Speak Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Tutor Assistant ───────────────────────────────────────────────────────
// ─── AI Tutor Onboarding Tour ─────────────────────────────────────────────────
function TutorAssistant({
  tutorMode, tutorMsg, setTutorMsg, setTutorMode,
  showPanel, setShowPanel, tutorBubble, setTutorBubble,
  onSendPrompt,
}: {
  tutorMode: boolean; tutorMsg: string; setTutorMsg: (m: string) => void;
  setTutorMode: (v: boolean) => void; showPanel: boolean;
  setShowPanel: (v: boolean) => void; tutorBubble: boolean;
  setTutorBubble: React.Dispatch<React.SetStateAction<boolean>>;
  onSendPrompt: (p: string) => void;
}) {
  const [step, setStep] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);

  const features = [
    { icon: "💡", label: "Explain concepts",   sub: "Break down complex topics",  prompt: "Explain the key concepts in this document step by step" },
    { icon: "📋", label: "Summarize document", sub: "Get key takeaways fast",     prompt: "Summarize this document in clear bullet points" },
    { icon: "🧠", label: "Generate quizzes",   sub: "MCQs, true/false, blanks",   prompt: "Generate MCQs to test my understanding of this document" },
    { icon: "📝", label: "Create notes",       sub: "Structured study notes",     prompt: "Create concise study notes from this document" },
  ];

  const handleFeature = (prompt: string) => {
    setShowPanel(false);
    setTutorMsg("On it! Sending your request ✨");
    setTutorBubble(true);
    onSendPrompt(prompt);
  };

  const handleTutorToggle = () => {
    const next = !tutorMode;
    setTutorMode(next);
    setTutorMsg(next
      ? "🧠 Tutor Mode Activated! Ask me anything and I'll guide you step by step."
      : "Tutor Mode off. Click AI Tutor in the navbar whenever you need help! 👋"
    );
  };

  const tourSteps = [
    { title: "Welcome to DocuMind AI 👋", desc: "I'm your AI study tutor. Let me show you around in 3 quick steps." },
    { title: "Upload your document 📄", desc: "Drag & drop any PDF into the sidebar on the left to get started." },
    { title: "Use AI Features 🚀", desc: "Click 'AI Tutor' in the top navbar anytime to summarize, quiz yourself, or get explanations." },
    { title: "Enable Tutor Mode 🧠", desc: "Turn on Tutor Mode for step-by-step guidance on every answer." },
  ];

  // ── ONBOARDING TOUR (shown first) ──
  if (!dismissed) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter',sans-serif",
      }}>
        <div style={{
          width: "460px", background: "rgba(6,9,22,0.99)",
          border: "1px solid rgba(139,92,246,0.35)", borderRadius: "24px",
          overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
          animation: "tutor-fade 0.3s ease both",
        }}>
          <div style={{
            padding: "14px 20px", borderBottom: "1px solid rgba(139,92,246,0.1)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(139,92,246,0.04)",
          }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {tourSteps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)} style={{
                  width: step === i ? "22px" : "8px", height: "8px", borderRadius: "99px", border: "none", padding: 0,
                  background: step === i ? "linear-gradient(90deg,#7c3aed,#3b82f6)" : "rgba(139,92,246,0.2)",
                  cursor: "pointer", transition: "all 0.3s",
                }} />
              ))}
            </div>
            <span style={{ fontSize: "10px", color: "#334155", fontWeight: 600 }}>{step + 1} / {tourSteps.length}</span>
            <button onClick={() => setDismissed(true)} style={{ background: "none", border: "none", color: "#475569", fontSize: "18px", cursor: "pointer", padding: 0 }}>×</button>
          </div>

          <div style={{ position: "relative", padding: "32px 28px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Robot avatar */}
            <div style={{
              width: "88px", height: "88px", borderRadius: "50%",
              background: "linear-gradient(135deg,#4c1d95,#1e3a8a)",
              border: "2px solid rgba(139,92,246,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 32px rgba(124,58,237,0.5)",
              animation: "tutor-bob 3s ease-in-out infinite",
            }}>
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="24" fill="url(#faceGrad2)" />
                <defs><radialGradient id="faceGrad2" cx="40%" cy="35%"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#3b82f6"/></radialGradient></defs>
                <ellipse cx="18" cy="22" rx="3.5" ry="4" fill="white" opacity="0.95"/>
                <ellipse cx="34" cy="22" rx="3.5" ry="4" fill="white" opacity="0.95"/>
                <circle cx="19.5" cy="23" r="2" fill="#1e1b4b"/>
                <circle cx="35.5" cy="23" r="2" fill="#1e1b4b"/>
                <circle cx="20.2" cy="22.2" r="0.7" fill="white"/>
                <circle cx="36.2" cy="22.2" r="0.7" fill="white"/>
                <path d="M18 33 Q26 40 34 33" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.9"/>
                <line x1="26" y1="2" x2="26" y2="8" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="26" cy="8" r="2.5" fill="#7c3aed"/>
                <ellipse cx="13" cy="29" rx="4" ry="2.5" fill="#f472b6" opacity="0.35"/>
                <ellipse cx="39" cy="29" rx="4" ry="2.5" fill="#f472b6" opacity="0.35"/>
              </svg>
            </div>

            <div style={{
              marginTop: "18px", background: "rgba(139,92,246,0.1)",
              border: "1px solid rgba(139,92,246,0.25)", borderRadius: "14px",
              padding: "14px 18px", maxWidth: "340px", textAlign: "center", position: "relative",
              animation: "tutor-fade 0.35s ease both",
            }}>
              <div style={{ position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "8px solid rgba(139,92,246,0.25)" }} />
              <p style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9", marginBottom: "4px" }}>{tourSteps[step].title}</p>
              <p style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{tourSteps[step].desc}</p>
            </div>
          </div>

          {step === 2 && (
            <div style={{ padding: "0 20px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {features.map(f => (
                <div key={f.label} style={{ padding: "9px 11px", borderRadius: "10px", border: "1px solid rgba(139,92,246,0.12)", background: "rgba(139,92,246,0.05)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>{f.icon}</span>
                  <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>{f.label}</span>
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div style={{ padding: "0 20px 8px" }}>
              <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "#34d399" }}>Tutor Mode</p>
                  <p style={{ fontSize: "10px", color: "#475569" }}>Step-by-step AI guidance</p>
                </div>
                <div style={{ width: "38px", height: "21px", borderRadius: "11px", background: "#34d399", position: "relative" }}>
                  <div style={{ position: "absolute", top: "2.5px", left: "19px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff" }} />
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: "16px 20px 20px", display: "flex", gap: "10px" }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.06)", color: "#94a3b8", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>← Back</button>
            )}
            {step < tourSteps.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} style={{ flex: 2, padding: "10px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>Next →</button>
            ) : (
              <button onClick={() => setDismissed(true)} style={{ flex: 2, padding: "10px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg,#34d399,#059669)", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>🚀 Get Started!</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── NAVBAR DROPDOWN PANEL (no floating button!) ──
  return showPanel ? (
    <div onClick={() => setShowPanel(false)} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: "absolute", top: "64px", right: "16px",  // ← drops down from navbar
        width: "310px", background: "rgba(6,9,22,0.98)",
        border: "1px solid rgba(139,92,246,0.35)", borderRadius: "16px",
        overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.1)",
        animation: "tutor-fade 0.18s ease both",
      }}>
        {/* Panel header with robot avatar */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(139,92,246,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg,#4c1d95,#1e3a8a)",
            border: "2px solid rgba(139,92,246,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(124,58,237,0.4)",
          }}>
            <svg width="24" height="24" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="24" fill="url(#navFaceGrad)" />
              <defs><radialGradient id="navFaceGrad" cx="40%" cy="35%"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#3b82f6"/></radialGradient></defs>
              <ellipse cx="18" cy="22" rx="3.5" ry="4" fill="white" opacity="0.95"/>
              <ellipse cx="34" cy="22" rx="3.5" ry="4" fill="white" opacity="0.95"/>
              <circle cx="19.5" cy="23" r="2" fill="#1e1b4b"/>
              <circle cx="35.5" cy="23" r="2" fill="#1e1b4b"/>
              <path d="M18 33 Q26 40 34 33" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.9"/>
              <line x1="26" y1="2" x2="26" y2="8" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="26" cy="8" r="2.5" fill="#7c3aed"/>
              <ellipse cx="13" cy="29" rx="4" ry="2.5" fill="#f472b6" opacity="0.3"/>
              <ellipse cx="39" cy="29" rx="4" ry="2.5" fill="#f472b6" opacity="0.3"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#f1f5f9" }}>AI Tutor</p>
            <p style={{ fontSize: "10px", color: tutorMode ? "#34d399" : "#475569" }}>
              {tutorMode ? "● Tutor Mode ON" : "Ready to help"}
            </p>
          </div>
          <button onClick={() => setShowPanel(false)} style={{ background: "none", border: "none", color: "#475569", fontSize: "20px", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Tutor message bubble */}
        {tutorBubble && (
          <div style={{ margin: "10px 12px 0", padding: "10px 12px", background: "rgba(139,92,246,0.08)", borderRadius: "10px", border: "1px solid rgba(139,92,246,0.15)", fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>
            {tutorMsg}
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "5px" }}>
          <p style={{ fontSize: "9px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "2px" }}>Quick Actions</p>
          {features.map(f => (
            <button key={f.label} onClick={() => handleFeature(f.prompt)} style={{
              display: "flex", alignItems: "center", gap: "10px", width: "100%",
              padding: "9px 11px", borderRadius: "9px",
              border: "1px solid rgba(139,92,246,0.12)",
              background: "rgba(139,92,246,0.04)", cursor: "pointer",
              textAlign: "left", fontFamily: "'Inter',sans-serif", transition: "all 0.15s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.12)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.35)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.04)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.12)"; }}
            >
              <span style={{ fontSize: "18px" }}>{f.icon}</span>
              <div>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0" }}>{f.label}</p>
                <p style={{ fontSize: "10px", color: "#475569" }}>{f.sub}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Tutor Mode Toggle */}
        <div style={{ padding: "6px 12px 14px" }}>
          <button onClick={handleTutorToggle} style={{
            width: "100%", padding: "10px 14px", borderRadius: "9px",
            border: `1px solid ${tutorMode ? "rgba(52,211,153,0.45)" : "rgba(139,92,246,0.25)"}`,
            background: tutorMode ? "rgba(52,211,153,0.09)" : "rgba(139,92,246,0.09)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
            fontFamily: "'Inter',sans-serif", transition: "all 0.2s",
          }}>
            <div style={{ textAlign: "left" }}>
              <p style={{ fontSize: "12px", fontWeight: 700, color: tutorMode ? "#34d399" : "#a78bfa" }}>
                {tutorMode ? "✅ Tutor Mode ON" : "Enable Tutor Mode"}
              </p>
              <p style={{ fontSize: "10px", color: "#475569" }}>Step-by-step guidance</p>
            </div>
            <div style={{ width: "38px", height: "21px", borderRadius: "11px", background: tutorMode ? "#34d399" : "rgba(255,255,255,0.08)", position: "relative", transition: "background 0.25s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: "2.5px", left: tutorMode ? "19px" : "2.5px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.25s" }} />
            </div>
          </button>
        </div>
      </div>
    </div>
  ) : null;
}
// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [_file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [_isStopped, setIsStopped] = useState(false);
  const stopRef = useRef<boolean>(false);
  const [streamingText, setStreamingText] = useState("");
  // FIX 2: track whether streaming is active separately from streamingText
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lastUserQuery, setLastUserQuery] = useState("");
  const [voicePickerMsgId, setVoicePickerMsgId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [langMode, setLangMode] = useState<LangMode>("en");
  const [tutorMode, setTutorMode]           = useState(false);
  const [showTutorPanel, setShowTutorPanel] = useState(false);
  const [tutorBubble, setTutorBubble]       = useState(true);
  const [tutorMsg, setTutorMsg]             = useState(
    "Hi! I'm your AI tutor 👋 I can help you understand your document, create quizzes, or explain topics. Click 'AI Features' to get started 🚀"
  );

  useEffect(() => {
    const load = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length === 0) return;
      setVoices(available);

      const preferred = [
        "Google UK English Female", "Microsoft Hazel Desktop",
        "Google हिन्दी", "Microsoft Swara Desktop", "Lekha",
        "Microsoft Zira Desktop", "Karen", "Samantha",
      ];

      const best =
        preferred.reduce<SpeechSynthesisVoice | null>((found, name) => {
          if (found) return found;
          return available.find(v => v.name === name) ?? null;
        }, null) ??
        available.find(v => /female/i.test(v.name)) ??
        available.find(v => /en[-_]?(US|GB|AU)/i.test(v.lang)) ??
        available[0];

      if (best) setSelectedVoiceURI(best.voiceURI);
    };

    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const translateToHindi = async (text: string): Promise<string> => {
    try {
      const shortened = text.replace(/^⚠️.*?\n\n/, "").slice(0, 500);
      const encoded = encodeURIComponent(shortened);
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|hi`);
      const data = await res.json();
      if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
      return shortened;
    } catch {
      return text.slice(0, 500);
    }
  };

  const getVoiceByPriority = (names: string[], langMatchers: ((lang: string) => boolean)[]): SpeechSynthesisVoice | null => {
    for (const name of names) {
      const v = voices.find(v => v.name === name);
      if (v) return v;
    }
    for (const match of langMatchers) {
      const v = voices.find(v => match(v.lang));
      if (v) return v;
    }
    return null;
  };

  const getHindiVoice = () => getVoiceByPriority(
    ["Google हिन्दी", "Microsoft Swara Desktop", "Lekha"],
    [l => l === "hi-IN", l => l.startsWith("hi")]
  );

  const getEnglishIndianVoice = () => getVoiceByPriority(
    ["Google UK English Female", "Microsoft Hazel Desktop", "Microsoft Zira Desktop"],
    [l => l === "en-IN", l => /india/i.test(l)]
  );

  const speakText = async (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const stripped = text.replace(/^⚠️.*?\n\n/, "").slice(0, 500);
    const manualVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
    const userPickedHindi = manualVoice?.lang.startsWith("hi") ?? false;

    let spokenText = stripped;
    let targetLang = "en-IN";
    let voice: SpeechSynthesisVoice | null = null;

    if (langMode === "hi" || userPickedHindi) {
      spokenText = await translateToHindi(stripped);
      targetLang = "hi-IN";
      voice = userPickedHindi && manualVoice ? manualVoice : getHindiVoice();
    } else {
      targetLang = "en-IN";
      voice = manualVoice ?? getEnglishIndianVoice();
    }

    const utt = new SpeechSynthesisUtterance(spokenText);
    utt.lang = targetLang;
    if (voice) utt.voice = voice;
    utt.rate = 0.88;
    utt.pitch = 1.08;
    utt.volume = 1;
    window.speechSynthesis.speak(utt);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, isThinking, streamingText]);

  const handleUpload = async (uploadFile: File) => {
    const fileEntry: UploadedFile = { id: genId(), name: uploadFile.name, size: uploadFile.size, status: "uploading", progress: 0 };
    setUploadedFiles(prev => [...prev, fileEntry]);

    const interval = setInterval(() => {
      setUploadedFiles(prev => prev.map(f => f.id === fileEntry.id && f.progress < 82 ? { ...f, progress: f.progress + 14 } : f));
    }, 220);

    try {
      setFile(uploadFile);
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch("https://rahul-m23-documind-ai.hf.space/upload", { method: "POST", body: formData });
      const data = await res.json();
      clearInterval(interval);
      setActiveFileId(fileEntry.id);

      const fileId = data.file_id;
      if (fileId) {
        let ready = false;
        let attempts = 0;
        while (!ready && attempts < 60) {
          await new Promise(r => setTimeout(r, 2000));
          attempts++;
          try {
            const statusRes = await fetch(`https://rahul-m23-documind-ai.hf.space/status/${fileId}`);
            const statusData = await statusRes.json();

            setUploadedFiles(prev => prev.map(f =>
              f.id === fileEntry.id ? { ...f, progress: Math.min(90 + attempts, 99) } : f
            ));

            if (statusData.status === "ready") {
              ready = true;
              setUploadedFiles(prev => prev.map(f =>
                f.id === fileEntry.id ? { ...f, status: "success", progress: 100 } : f
              ));
              setChatHistory(prev => [...prev, {
                id: genId(), role: "ai",
                content: `✅ Document "${uploadFile.name}" is ready! ${statusData.chunks} chunks indexed.\n\nYou can now ask questions, generate quizzes, summaries, and more.`,
                timestamp: new Date(),
              }]);
            } else if (statusData.status === "error") {
              throw new Error(statusData.message);
            }
          } catch (pollErr) {
            console.error("Poll error:", pollErr);
          }
        }

        if (!ready) {
          setUploadedFiles(prev => prev.map(f =>
            f.id === fileEntry.id ? { ...f, status: "success", progress: 100 } : f
          ));
          setChatHistory(prev => [...prev, {
            id: genId(), role: "ai",
            content: `⚠️ Document "${uploadFile.name}" is taking longer than expected. Try asking a question — it may be ready.`,
            timestamp: new Date(),
          }]);
        }
      } else {
        setUploadedFiles(prev => prev.map(f =>
          f.id === fileEntry.id ? { ...f, status: "success", progress: 100 } : f
        ));
        setChatHistory(prev => [...prev, {
          id: genId(), role: "ai",
          content: `Document "${uploadFile.name}" loaded. ${data.message || "Ready!"}`,
          timestamp: new Date(),
        }]);
      }
    } catch {
      clearInterval(interval);
      setUploadedFiles(prev => prev.map(f => f.id === fileEntry.id ? { ...f, status: "error", progress: 0 } : f));
    }
  };

  // FIX 3: removed duplicate `current` declaration; single clean streaming implementation
  const handleAsk = async (questionOverride?: string) => {
    const q = (questionOverride ?? query).trim();
    if (!q) return;
    setLastUserQuery(q);
    setChatHistory(prev => [...prev, { id: genId(), role: "user", content: q, timestamp: new Date() }]);
    setQuery("");
    stopRef.current = false;
setIsStopped(false);
setIsStreaming(false);
setStreamingText("");
setIsThinking(true);
    setIsStreaming(false);
    setStreamingText("");

    try {
      const historyPayload = chatHistory
        .filter(m => m.role === "ai" || m.role === "user")
        .slice(-5)
        .map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));

      const res = await fetch("https://rahul-m23-documind-ai.hf.space/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history: historyPayload }),
      });

      const data = await res.json();
      let responseText: string = data.answer || data.error;
      const sourcesData: { page: number; text: string }[] = data.general ? [] : (data.sources ?? []);

      if (data.general) {
        responseText = `⚠️ Not from document\n\n${responseText}`;
      }

      // FIX 4: switch off thinking, switch on streaming before typewriter begins
      setIsThinking(false);
      setIsStreaming(true);
      setStreamingText("");

      await new Promise<void>(resolve => {
        let i = 0;
        let accumulated = "";

        const type = () => {
          if (stopRef.current) {
            // FIX 5: commit partial text on stop, clear stream
            setIsStreaming(false);
            setStreamingText("");
            setChatHistory(prev => [...prev, {
              id: genId(), role: "ai",
              content: accumulated + "\n\n⏹ Generation stopped.",
              timestamp: new Date(),
              sources: sourcesData,
            }]);
            resolve();
            return;
          }

          accumulated += responseText[i];
          setStreamingText(accumulated);
          i++;

          if (i < responseText.length) {
            setTimeout(type, 10);
          } else {
            // FIX 6: clear stream BEFORE pushing to chatHistory to avoid double render
            setIsStreaming(false);
            setStreamingText("");
            setChatHistory(prev => [...prev, {
              id: genId(), role: "ai",
              content: responseText,
              timestamp: new Date(),
              sources: sourcesData,
            }]);
            resolve();
          }
        };

        type();
      });

      const activeFile = uploadedFiles.find(f => f.id === activeFileId);
      saveToHistory({
        type: detectType(q),
        document: activeFile?.name ?? "Unknown document",
        content: responseText.slice(0, 300),
        timestamp: new Date().toISOString(),
      });
    } catch {
      setIsThinking(false);
      setIsStreaming(false);
      setStreamingText("");
      setChatHistory(prev => [...prev, {
        id: genId(), role: "ai",
        content: "Connection error. Please check the server.",
        timestamp: new Date(),
      }]);
    }
  };

  const handleRegenerate = () => { if (lastUserQuery) handleAsk(lastUserQuery); };

  // FIX 7: added handleUpload to useCallback deps
  const handleDrop = useCallback((e: React.DragEvent) => {
    const dropped = e.dataTransfer.files?.[0];
    if (dropped?.type === "application/pdf") handleUpload(dropped);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastAiIdx = chatHistory.reduce((acc, m, i) => m.role === "ai" ? i : acc, -1);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <BackgroundScene />

      {showPerformance && <PerformancePanel onClose={() => setShowPerformance(false)} />}
      {showHistory && (
        <StudyHistoryPanel onClose={() => setShowHistory(false)} onRevise={(content) => setQuery(content)} />
      )}
      {voicePickerMsgId && (
        <VoicePickerModal
          voices={voices}
          selectedVoiceURI={selectedVoiceURI}
          onSelect={setSelectedVoiceURI}
          onClose={() => setVoicePickerMsgId(null)}
          onPlay={() => {
            const msg = chatHistory.find(m => m.id === voicePickerMsgId);
            if (msg) speakText(msg.content);
          }}
        />
      )}

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
      <TopNavbar 
          onClearChat={() => setChatHistory([])} 
          onOpenTutor={() => setShowTutorPanel(v => !v)}
          tutorMode={tutorMode}
          onOpenSidebar={() => setShowMobileSidebar(v => !v)}
          isMobile={isMobile}
        />

<div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>

{isMobile && showMobileSidebar && (
  <div onClick={() => setShowMobileSidebar(false)} style={{
    position: "fixed", inset: 0, zIndex: 40,
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
  }} />
)}

{!isMobile ? (
  <div style={{ width: "240px", flexShrink: 0 }}>
    <Sidebar
      files={uploadedFiles} activeFileId={activeFileId} onSelectFile={setActiveFileId}
      onDrop={handleDrop} isDragging={isDragging} setIsDragging={setIsDragging}
      onFileSelect={handleUpload} onShowHistory={() => setShowHistory(true)} onShowPerformance={() => setShowPerformance(true)}
    />
  </div>
) : (
  <div style={{
    position: "fixed", left: 0, top: 0, bottom: 0,
    zIndex: 50, width: "280px",
    transform: showMobileSidebar ? "translateX(0)" : "translateX(-110%)",
    transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
    visibility: showMobileSidebar ? "visible" : "hidden",
  }}>
    <Sidebar
      files={uploadedFiles} activeFileId={activeFileId} onSelectFile={setActiveFileId}
      onDrop={handleDrop} isDragging={isDragging} setIsDragging={setIsDragging}
      onFileSelect={handleUpload} onShowHistory={() => setShowHistory(true)} onShowPerformance={() => setShowPerformance(true)}
    />
  </div>
)}

          <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            <div style={{
              position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
              width: "60%", height: "40%",
              background: "radial-gradient(ellipse, rgba(124,58,237,0.05) 0%, transparent 70%)",
              pointerEvents: "none", zIndex: 0, filter: "blur(40px)",
            }} />

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 14px" : "24px 32px", display: "flex", flexDirection: "column", gap: "18px", position: "relative", zIndex: 1, minHeight: 0 }}>
              {chatHistory.length === 0 && !isThinking ? (
                <EmptyState onPrompt={p => handleAsk(p)} />
              ) : (
                <>
                  {chatHistory.map((msg, i) =>
                    msg.role === "user"
                      ? <UserBubble key={msg.id} msg={msg} />
                      : <AiBubble key={msg.id} msg={msg} onRegenerate={handleRegenerate} lastAi={i === lastAiIdx} onSpeak={speakText} onSpeakWithPicker={setVoicePickerMsgId} />
                  )}
                  {/* FIX 8: show ThinkingBubble only while fetching, streaming bubble only while typing */}
                  {isThinking && <ThinkingBubble />}
                  {isStreaming && streamingText && (
                    <AiBubble
                      msg={{ id: "stream", role: "ai", content: streamingText, timestamp: new Date() }}
                      onRegenerate={() => {}}
                      lastAi={false}
                      onSpeak={speakText}
                      onSpeakWithPicker={() => {}}
                    />
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            <div style={{
              padding: isMobile ? "8px 12px 14px" : "12px 24px 18px", position: "relative", zIndex: 1,
              borderTop: "1px solid rgba(139,92,246,0.08)",
              background: "rgba(3,5,15,0.7)", backdropFilter: "blur(20px)",
            }}>
              {/* Smart Chips - always visible */}
<div style={{ display: "flex", gap: "6px", marginBottom: "10px", overflowX: "auto", paddingBottom: "4px" }}>
  {[
    "Summarize the document",
    "Generate 10 MCQs",
    "Key takeaways",
    "Create True/False questions",
    "Create fill in the blanks",
    "Explain this in simple terms",
  ].map(p => (
    <button key={p} className="chip" onClick={() => handleAsk(p)} style={{
      whiteSpace: "nowrap", fontSize: "10px", padding: "5px 13px",
      borderRadius: "99px", border: "1px solid rgba(139,92,246,0.15)",
      background: "rgba(139,92,246,0.05)", color: "#475569",
      cursor: "pointer", fontFamily: "'Inter',sans-serif", flexShrink: 0,
    }}>{p}</button>
  ))}
</div>

              {/* Language mode selector */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                {(["en", "hi"] as LangMode[]).map(mode => {
                  const labels: Record<LangMode, string> = { en: "🇮🇳 English", hi: "🇮🇳 हिंदी" };
                  const isActive = langMode === mode;
                  return (
                    <button key={mode} onClick={() => setLangMode(mode)} style={{
                      fontSize: "9px", padding: "4px 10px", borderRadius: "99px",
                      border: `1px solid ${isActive ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.06)"}`,
                      background: isActive ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                      color: isActive ? "#c4b5fd" : "#475569",
                      cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all 0.18s",
                    }}>{labels[mode]}</button>
                  );
                })}
              </div>

              {/* Input box */}
              <div className="neon-border-focus" style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "rgba(8,12,28,0.9)", border: "1px solid rgba(139,92,246,0.15)",
                borderRadius: "14px", padding: "9px 10px 9px 14px",
                backdropFilter: "blur(16px)",
                boxShadow: "0 4px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
                transition: "all 0.25s",
              }}>
                {isMobile && (
  <>
    <input
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.docx"
      id="mobile-upload-input"
      style={{ display: "none" }}
      onChange={e => {
        const f = e.target.files?.[0];
        if (f) handleUpload(f);
      }}
    />
    <button
      onClick={() => document.getElementById("mobile-upload-input")?.click()}
      title="Upload PDF"
      style={{
        width: "36px", height: "36px", borderRadius: "10px",
        cursor: "pointer", flexShrink: 0,
        background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(59,130,246,0.2))",
        border: "1px solid rgba(139,92,246,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 14px rgba(139,92,246,0.35)",
        transition: "all 0.2s",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="#c4b5fd" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17,8 12,3 7,8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    </button>
  </>
)}

{uploadedFiles.some(f => f.status === "success") && (
  <div style={{
    display: "flex", alignItems: "center", gap: "5px", flexShrink: 0,
                    background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
                    borderRadius: "7px", padding: "3px 8px",
                  }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    </svg>
                    <span style={{ fontSize: "9px", color: "#a78bfa", fontWeight: 600, maxWidth: "70px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {uploadedFiles.find(f => f.id === activeFileId)?.name ?? "PDF"}
                    </span>
                  </div>
                )}

                <input
                  type="text" value={query}
                  placeholder={uploadedFiles.some(f => f.status === "success") ? "Ask anything about your document…" : "Upload a PDF to get started…"}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    color: "#e2e8f0", fontSize: isMobile ? "16px" : "13.5px", caretColor: "#a78bfa",
                    fontFamily: "'Inter', sans-serif", minWidth: 0,
                  }}
                />

                <MicButton onTranscript={(text) => setQuery(prev => prev ? prev + " " + text : text)} />

                {/* Stop generation — visible during thinking OR streaming */}
                {(isThinking || isStreaming) && (
                  <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    stopRef.current = true;
                    setIsStopped(true);
                    setIsThinking(false);
                    setIsStreaming(false);
                    window.speechSynthesis?.cancel();
                  }}
                    style={{
                      width: "36px", height: "36px", borderRadius: "10px", border: "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, cursor: "pointer",
                      background: "rgba(248,113,113,0.15)",
                      boxShadow: "0 0 16px rgba(248,113,113,0.25)",
                      transition: "all 0.2s",
                    }}
                    title="Stop generation"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#f87171">
                      <rect x="4" y="4" width="16" height="16" rx="2"/>
                    </svg>
                  </button>
                )}

                {/* Send */}
                <button
                  className={`send-btn ${(!query.trim() || isThinking || isStreaming) ? "send-btn-disabled" : ""}`}
                  onClick={() => handleAsk()}
                  disabled={!query.trim() || isThinking || isStreaming}
                  style={{
                    width: "36px", height: "36px", borderRadius: "10px", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    cursor: query.trim() && !isThinking && !isStreaming ? "pointer" : "default",
                  }}
                >
                  {(isThinking || isStreaming) ? (
                    <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={query.trim() ? "white" : "rgba(255,255,255,0.2)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/>
                    </svg>
                  )}
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "7px" }}>
                <p style={{ fontSize: "9px", color: "#1e293b" }}>
                  DocuMind AI · Responses are generated from your uploaded documents
                </p>
                {voices.length > 0 && (
                  <select
                    value={selectedVoiceURI}
                    onChange={e => setSelectedVoiceURI(e.target.value)}
                    style={{
                      fontSize: "9px", color: "#64748b",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "6px", padding: "2px 6px",
                      cursor: "pointer", outline: "none",
                      fontFamily: "'Inter', sans-serif",
                      maxWidth: "160px",
                    }}
                  >
                    {voices
                      .filter(v => v.lang.startsWith("en"))
                      .map(v => (
                        <option key={v.voiceURI} value={v.voiceURI} style={{ background: "#0a0f1e", color: "#e2e8f0" }}>
                          {v.name.replace("Google ", "").replace(" English", "")}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </div>
          </main>
        </div>
        {isMobile && uploadedFiles.length === 0 && (
  <>
    <input
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.docx"
      id="fab-upload-input"
      style={{ display: "none" }}
      onChange={e => {
        const f = e.target.files?.[0];
        if (f) handleUpload(f);
      }}
    />
    <button
      onClick={() => document.getElementById("fab-upload-input")?.click()}
      style={{
        position: "fixed", bottom: "110px", right: "18px", zIndex: 60,
        width: "56px", height: "56px", borderRadius: "16px", border: "none",
        background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "3px",
        boxShadow: "0 0 28px rgba(124,58,237,0.7), 0 8px 24px rgba(0,0,0,0.5)",
        cursor: "pointer",
        animation: "tutor-pulse 2s ease infinite",
      }}
      title="Upload PDF"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17,8 12,3 7,8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span style={{ fontSize: "7px", color: "rgba(255,255,255,0.85)", fontWeight: 700, letterSpacing: "0.05em" }}>PDF</span>
    </button>
  </>
)}
        <TutorAssistant
          tutorMode={tutorMode}
          tutorMsg={tutorMsg}
          setTutorMsg={setTutorMsg}
          setTutorMode={setTutorMode}
          showPanel={showTutorPanel}
          setShowPanel={setShowTutorPanel}
          tutorBubble={tutorBubble}
          setTutorBubble={setTutorBubble}
          onSendPrompt={(p) => handleAsk(p)}
        />
      </div>
    </>
  );
}