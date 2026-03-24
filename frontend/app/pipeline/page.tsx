"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getTenantId } from "@/lib/tenant";
import { apiFetch } from "@/lib/api";

const TENANT_ID = getTenantId();
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PipelineItem {
  id: string;
  sender: string;
  subject: string;
  body_preview?: string;
  status: string;
  suggested_task_name?: string;
  suggested_priority?: string;
  suggested_project_id?: string;
  project_match_confidence?: number;
  suggested_due_date?: string;
  budget_mentioned?: number;
  triage_confidence?: number;
  triage_reason?: string;
  analysis_notes?: string;
  created_at: string;
}
interface Project { id: string; name: string; }
interface Stage { id: string; name: string; project_id: string; }
interface User { id: string; name: string; }

function PipelineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [fetchingGmail, setFetchingGmail] = useState(false);
  const [gmailMsg, setGmailMsg] = useState("");

  // Data for approve modal
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Approve modal state
  const [approveItem, setApproveItem] = useState<PipelineItem | null>(null);
  const [approveForm, setApproveForm] = useState({ project_id: "", stage_id: "", task_title: "", priority: "medium", assignee_id: "", due_date: "" });

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
    checkGmail();
    if (searchParams.get("gmail_connected")) {
      setGmailMsg("Gmail חובר בהצלחה!");
    }
    // Load projects, stages, users for approve modal
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/`),
      apiFetch(`/tenants/${TENANT_ID}/stages/`),
      apiFetch(`/tenants/${TENANT_ID}/users/`),
    ]).then(([p, s, u]) => { setProjects(p); setStages(s); setUsers(u); }).catch(() => {});
  }, [router]);

  function load() {
    setLoading(true);
    apiFetch(`/tenants/${TENANT_ID}/pipeline/pending`)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function checkGmail() {
    try {
      const s = await apiFetch("/auth/gmail/status");
      setGmailConnected(s.connected);
    } catch {}
  }

  async function connectGmail() {
    try {
      const { url } = await apiFetch("/auth/gmail/connect");
      window.location.href = url;
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function fetchGmail() {
    setFetchingGmail(true);
    setGmailMsg("");
    try {
      const res = await apiFetch(`/auth/gmail/fetch?tenant_id=${TENANT_ID}`, { method: "POST" });
      setGmailMsg(`נוספו ${res.added} מיילים חדשים`);
      if (res.added > 0) load();
    } catch (e: any) {
      setGmailMsg(e.message || "שגיאה");
    } finally {
      setFetchingGmail(false);
    }
  }

  function openApprove(item: PipelineItem) {
    const dueDateStr = item.suggested_due_date ? item.suggested_due_date.slice(0, 10) : "";
    setApproveForm({
      project_id: item.suggested_project_id || "",
      stage_id: "",
      task_title: item.suggested_task_name || item.subject,
      priority: item.suggested_priority || "medium",
      assignee_id: "",
      due_date: dueDateStr,
    });
    setApproveItem(item);
  }

  async function submitApprove() {
    if (!approveItem || !approveForm.project_id || !approveForm.stage_id || !approveForm.task_title) {
      alert("יש לבחור פרויקט, קבוצה וכותרת משימה");
      return;
    }
    setActing(approveItem.id);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/pipeline/${approveItem.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          project_id: approveForm.project_id,
          stage_id: approveForm.stage_id,
          task_title: approveForm.task_title,
          priority: approveForm.priority,
          assignee_id: approveForm.assignee_id || null,
          due_date: approveForm.due_date || null,
        }),
      });
      setApproveItem(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(null);
    }
  }

  async function dismiss(id: string) {
    setActing(id);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/pipeline/${id}/dismiss`, { method: "POST" });
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>Email AI Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">מיילים שעברו triage ומחכים לאישורך</p>
        </div>

        {/* Gmail connect / fetch */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {gmailMsg && (
            <span className="text-sm text-green-600">{gmailMsg}</span>
          )}
          {gmailConnected === false && (
            <button
              onClick={connectGmail}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
              style={{ background: "#011e41" }}
            >
              <span>חבר Gmail</span>
            </button>
          )}
          {gmailConnected === true && (
            <button
              onClick={fetchGmail}
              disabled={fetchingGmail}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-60"
              style={{ background: "#27ae60" }}
            >
              {fetchingGmail ? "שולף מיילים..." : "רענן מ-Gmail"}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
          אין מיילים ממתינים
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: "#011e41" }}>{item.subject}</div>
                  <div className="text-xs text-gray-500 mt-0.5">מאת: {item.sender}</div>
                  {item.body_preview && (
                    <div className="text-sm text-gray-400 mt-2 line-clamp-2">{item.body_preview}</div>
                  )}
                </div>
                {item.triage_confidence && (
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {Math.round(item.triage_confidence * 100)}% רלוונטי
                  </div>
                )}
              </div>

              {item.suggested_task_name && (
                <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: "#f0f4ff" }}>
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <div>
                      <span className="font-medium" style={{ color: "#011e41" }}>משימה מוצעת: </span>
                      <span className="text-gray-600">{item.suggested_task_name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.suggested_priority && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.suggested_priority === "urgent" ? "bg-red-100 text-red-700" :
                          item.suggested_priority === "high" ? "bg-orange-100 text-orange-700" :
                          item.suggested_priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {item.suggested_priority === "urgent" ? "דחוף" :
                           item.suggested_priority === "high" ? "גבוהה" :
                           item.suggested_priority === "medium" ? "בינונית" : "נמוכה"}
                        </span>
                      )}
                      {item.suggested_project_id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                          {projects.find(p => p.id === item.suggested_project_id)?.name || "פרויקט"}
                          {item.project_match_confidence ? ` ${Math.round(item.project_match_confidence * 100)}%` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {(item.suggested_due_date || item.budget_mentioned) && (
                    <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                      {item.suggested_due_date && (
                        <span>יעד: {new Date(item.suggested_due_date).toLocaleDateString("he-IL")}</span>
                      )}
                      {item.budget_mentioned && (
                        <span>סכום: ₪{item.budget_mentioned.toLocaleString("he-IL")}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {item.analysis_notes && (
                <div className="mt-2 text-xs text-gray-400 italic">{item.analysis_notes}</div>
              )}
              {item.triage_reason && (
                <div className="mt-1 text-xs text-gray-400">סיבת רלוונטיות: {item.triage_reason}</div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => openApprove(item)}
                  disabled={acting === item.id}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#27ae60" }}
                >
                  אשר ✓
                </button>
                <button
                  onClick={() => dismiss(item.id)}
                  disabled={acting === item.id}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 disabled:opacity-50"
                  style={{ color: "#c0392b" }}
                >
                  דחה ✗
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve modal */}
      {approveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" dir="rtl" onClick={() => setApproveItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1" style={{ color: "#011e41" }}>אישור ויצירת משימה</h2>
            <p className="text-xs text-gray-400 mb-4 truncate">{approveItem.subject}</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">כותרת המשימה *</label>
                <input
                  value={approveForm.task_title}
                  onChange={e => setApproveForm(p => ({ ...p, task_title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">פרויקט *</label>
                <select
                  value={approveForm.project_id}
                  onChange={e => setApproveForm(p => ({ ...p, project_id: e.target.value, stage_id: "" }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="">בחר פרויקט...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">קבוצת משימות *</label>
                <select
                  value={approveForm.stage_id}
                  onChange={e => setApproveForm(p => ({ ...p, stage_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  disabled={!approveForm.project_id}
                >
                  <option value="">בחר קבוצה...</option>
                  {stages.filter(s => s.project_id === approveForm.project_id).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">עדיפות</label>
                  <select
                    value={approveForm.priority}
                    onChange={e => setApproveForm(p => ({ ...p, priority: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  >
                    <option value="urgent">דחוף</option>
                    <option value="high">גבוהה</option>
                    <option value="medium">בינונית</option>
                    <option value="low">נמוכה</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">תאריך יעד</label>
                  <input
                    type="date"
                    value={approveForm.due_date}
                    onChange={e => setApproveForm(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">שייך לאיש צוות</label>
                <select
                  value={approveForm.assignee_id}
                  onChange={e => setApproveForm(p => ({ ...p, assignee_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="">—</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setApproveItem(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ביטול</button>
              <button
                onClick={submitApprove}
                disabled={!!acting}
                className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-60"
                style={{ background: "#27ae60" }}
              >
                {acting ? "יוצר משימה..." : "צור משימה ✓"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense>
      <PipelineContent />
    </Suspense>
  );
}
