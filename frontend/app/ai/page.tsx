"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "כמה משימות באיחור יש כרגע?",
  "תן סיכום של כל הפרויקטים הפעילים",
  "אילו משימות הן בסטטוס 'חסום'?",
  "מה המצב הכולל של הפרויקטים?",
];

export default function AiPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await apiFetch(`/tenants/${TENANT_ID}/ai/ask`, {
        method: "POST",
        body: JSON.stringify({ question: q }),
      });
      setMessages(prev => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `שגיאה: ${err.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-4rem)]" dir="rtl">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>AI — עוזר חכם</h1>
        <p className="text-sm text-gray-400 mt-0.5">שאל שאלות על הפרויקטים, המשימות והתקציב שלך</p>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="pt-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ background: "#011e41" }}>
                <span className="text-white text-2xl">✨</span>
              </div>
              <p className="text-gray-500 text-sm">התחל שיחה — שאל כל שאלה על הנתונים שלך</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-right px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:border-[#011e41] hover:text-[#011e41] transition-colors shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ml-2 mt-0.5"
                style={{ background: "#011e41" }}>
                <span className="text-white text-xs font-bold">AI</span>
              </div>
            )}
            <div
              className="max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed"
              style={{
                background: msg.role === "user" ? "#011e41" : "#fff",
                color: msg.role === "user" ? "#fff" : "#1a1a1a",
                border: msg.role === "assistant" ? "1px solid #e5e7eb" : "none",
                borderRadius: msg.role === "user" ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ml-2"
              style={{ background: "#011e41" }}>
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-400 flex items-center gap-1">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse delay-75">●</span>
              <span className="animate-pulse delay-150">●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 pt-3 border-t border-gray-200">
        <div className="flex gap-2 items-end bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="שאל שאלה... (Enter לשליחה, Shift+Enter לשורה חדשה)"
            className="flex-1 resize-none outline-none text-sm bg-transparent text-gray-800 placeholder-gray-400 max-h-32"
            rows={1}
            dir="rtl"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-opacity"
            style={{
              background: "#011e41",
              opacity: !input.trim() || loading ? 0.4 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">מופעל על ידי Claude Sonnet — Anthropic</p>
      </div>
    </div>
  );
}
