"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { apiFetch, apiUpload, API_BASE } from "@/lib/api";


interface Project { id: string; name: string; }
interface Stage { id: string; name: string; project_id: string; }
interface ActionItem { title: string; assignee?: string; due_date?: string; notes?: string; }
interface Meeting {
  id: string;
  project_id: string;
  title: string;
  raw_text?: string;
  meeting_date?: string;
  participants?: string[];
  overview?: string;
  decisions?: string[];
  action_items?: ActionItem[];
  status: string;
  created_at: string;
}

function fmtDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("he-IL"); } catch { return s; }
}

export default function MeetingsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter
  const [filterProject, setFilterProject] = useState<string>("all");

  // New meeting flow
  const [showNew, setShowNew] = useState(false);
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Expanded / editing meeting
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [saving, setSaving] = useState(false);

  // Task creation
  const [creatingTasks, setCreatingTasks] = useState<string | null>(null);   // meeting id
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set()); // index in action_items
  const [taskCreating, setTaskCreating] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const tid = getTenantId();
    try {
      const [projs, mtgs, stgs] = await Promise.all([
        apiFetch(`/tenants/${tid}/projects/`).catch(() => []),
        apiFetch(`/tenants/${tid}/meetings/`).catch(() => []),
        apiFetch(`/tenants/${tid}/stages/`).catch(() => []),
      ]);
      setProjects(projs);
      setMeetings(mtgs);
      setStages(stgs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function processNew() {
    if (!newProjectId) { setProcessError("יש לבחור פרויקט"); return; }
    if (!rawText.trim()) { setProcessError("יש להדביק טקסט"); return; }
    setProcessing(true);
    setProcessError("");
    try {
      const tid = getTenantId();
      const m: Meeting = await apiFetch(`/tenants/${tid}/meetings/process`, {
        method: "POST",
        body: JSON.stringify({ project_id: newProjectId, raw_text: rawText }),
      });
      setMeetings(prev => [m, ...prev]);
      setShowNew(false);
      setRawText("");
      setExpandedId(m.id);
      setEditing({ ...m });
    } catch (err: any) {
      setProcessError(err.message || "שגיאה בעיבוד");
    } finally {
      setProcessing(false);
    }
  }

  async function uploadPdf(file: File) {
    if (!newProjectId) { setProcessError("יש לבחור פרויקט לפני העלאה"); return; }
    setProcessing(true);
    setProcessError("");
    try {
      const tid = getTenantId();
      const fd = new FormData();
      fd.append("file", file);
      const m: Meeting = await apiUpload(
        `/tenants/${tid}/meetings/upload-pdf?project_id=${newProjectId}`, fd
      );
      setMeetings(prev => [m, ...prev]);
      setShowNew(false);
      setExpandedId(m.id);
      setEditing({ ...m });
    } catch (err: any) {
      setProcessError(err.message || "שגיאה בניתוח PDF");
    } finally {
      setProcessing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  async function saveMeeting() {
    if (!editing) return;
    setSaving(true);
    try {
      const updated: Meeting = await apiFetch(`/tenants/${getTenantId()}/meetings/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editing.title,
          meeting_date: editing.meeting_date,
          participants: editing.participants,
          overview: editing.overview,
          decisions: editing.decisions,
          action_items: editing.action_items,
        }),
      });
      setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m));
      setEditing(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteMeeting(id: string) {
    if (!confirm("למחוק סיכום פגישה זה?")) return;
    await apiFetch(`/tenants/${getTenantId()}/meetings/${id}`, { method: "DELETE" });
    setMeetings(prev => prev.filter(m => m.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function submitCreateTasks(meeting: Meeting) {
    if (!selectedStageId) { alert("יש לבחור קבוצה"); return; }
    const items = (meeting.action_items || []).filter((_, i) => selectedItems.has(i));
    if (items.length === 0) { alert("יש לבחור לפחות משימה אחת"); return; }
    setTaskCreating(true);
    try {
      const res = await apiFetch(`/tenants/${getTenantId()}/meetings/${meeting.id}/create-tasks`, {
        method: "POST",
        body: JSON.stringify({ stage_id: selectedStageId, items }),
      });
      alert(`נוצרו ${res.count} משימות בהצלחה`);
      setMeetings(prev => prev.map(m => m.id === meeting.id ? { ...m, status: "finalized" } : m));
      setCreatingTasks(null);
      setSelectedItems(new Set());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTaskCreating(false);
    }
  }

  const visibleMeetings = filterProject === "all"
    ? meetings
    : meetings.filter(m => m.project_id === filterProject);

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || "—";

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>סיכומי פגישות</h1>
            <p className="text-sm text-gray-500 mt-0.5">עיבוד AI, הפקת PDF, יצירת משימות</p>
          </div>
          <button
            onClick={() => { setShowNew(true); setProcessError(""); }}
            className="px-4 py-2 rounded-xl text-white text-sm font-medium"
            style={{ background: "#011e41" }}
          >
            + פגישה חדשה
          </button>
        </div>

        {/* New meeting panel */}
        {showNew && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6 space-y-4">
            <div className="text-sm font-semibold" style={{ color: "#011e41" }}>פגישה חדשה — הדבק טקסט</div>
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">פרויקט <span className="text-red-400">*</span></label>
                <select
                  value={newProjectId}
                  onChange={e => setNewProjectId(e.target.value)}
                  className={`border rounded-lg px-3 py-2 text-sm outline-none bg-white ${!newProjectId ? "border-red-200" : "border-gray-200"}`}
                >
                  <option value="">בחר פרויקט...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            {/* Two input options: text or PDF */}
            <div className="flex gap-2 text-xs text-gray-400 items-center">
              <span className="font-medium text-gray-500">אפשרות א׳ — הדבק טקסט:</span>
            </div>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={6}
              placeholder="הדבק כאן את הציון / נקודות הפגישה..."
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-y w-full"
              style={{ fontFamily: "inherit" }}
            />

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-gray-100" />
              <span className="text-xs text-gray-400">או</span>
              <div className="flex-1 border-t border-gray-100" />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 font-medium">אפשרות ב׳ — העלה PDF:</span>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadPdf(f); }}
              />
              <button
                onClick={() => { if (!newProjectId) { setProcessError("יש לבחור פרויקט תחילה"); return; } pdfInputRef.current?.click(); }}
                disabled={processing}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ opacity: processing ? 0.6 : 1 }}
              >
                📎 בחר PDF
              </button>
              <span className="text-xs text-gray-400">Claude יקרא וינתח את המסמך</span>
            </div>

            {processError && <div className="text-sm text-red-600">{processError}</div>}
            <div className="flex gap-2">
              <button
                onClick={processNew}
                disabled={processing || !rawText.trim()}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity"
                style={{ background: "#011e41", opacity: (processing || !rawText.trim()) ? 0.4 : 1 }}
              >
                {processing ? "⏳ Claude מעבד..." : "✨ עבד טקסט עם AI"}
              </button>
              <button
                onClick={() => { setShowNew(false); setRawText(""); setProcessError(""); }}
                className="px-4 py-2 rounded-lg text-sm text-gray-500"
                style={{ background: "#f5f5f5" }}
              >
                ביטול
              </button>
            </div>
            {processing && <p className="text-xs text-gray-400">Claude Sonnet מנתח את הפגישה ומחלץ מבנה — עשוי לקחת כ-15 שניות...</p>}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-3 mb-4">
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">כל הפרויקטים</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="text-sm text-gray-400 self-center">{visibleMeetings.length} פגישות</span>
        </div>

        {loading && <div className="text-center py-20 text-gray-400">טוען...</div>}

        {!loading && visibleMeetings.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            אין סיכומי פגישות עדיין — לחץ "+ פגישה חדשה"
          </div>
        )}

        {/* Meetings list */}
        <div className="space-y-3">
          {visibleMeetings.map(m => {
            const isExpanded = expandedId === m.id;
            const isEditing = editing?.id === m.id;
            const projectStages = stages.filter(s => s.project_id === m.project_id);
            const ed = isEditing ? editing! : m;

            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header row */}
                <div
                  className="px-5 py-4 cursor-pointer hover:bg-gray-50 flex items-start gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                >
                  <span className="text-gray-300 text-xs mt-1">{isExpanded ? "▲" : "▼"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{m.title}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: m.status === "finalized" ? "#d1fae5" : "#fef9c3",
                          color: m.status === "finalized" ? "#16a34a" : "#b45309",
                        }}
                      >
                        {m.status === "finalized" ? "מאושר" : "טיוטה"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 flex gap-3 flex-wrap">
                      <span>{projectName(m.project_id)}</span>
                      {m.meeting_date && <span>{m.meeting_date}</span>}
                      {m.participants && m.participants.length > 0 && (
                        <span>{m.participants.slice(0, 3).join(", ")}{m.participants.length > 3 ? ` +${m.participants.length - 3}` : ""}</span>
                      )}
                      <span className="text-gray-300">{fmtDate(m.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <a
                      href={`${API_BASE}/tenants/${getTenantId()}/meetings/${m.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                      title="הפק PDF"
                    >
                      🖨️ PDF
                    </a>
                    <button
                      onClick={() => deleteMeeting(m.id)}
                      className="text-xs px-2 py-1 rounded-lg text-gray-300 hover:text-red-500"
                      title="מחק"
                    >✕</button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-5">

                    {/* Edit / Save buttons */}
                    <div className="flex gap-2">
                      {!isEditing ? (
                        <button
                          onClick={() => setEditing({ ...m })}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          ✏️ ערוך
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={saveMeeting}
                            disabled={saving}
                            className="text-xs px-3 py-1.5 rounded-lg text-white font-medium"
                            style={{ background: "#011e41", opacity: saving ? 0.6 : 1 }}
                          >
                            {saving ? "שומר..." : "שמור שינויים"}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="text-xs px-3 py-1.5 rounded-lg text-gray-500"
                            style={{ background: "#f5f5f5" }}
                          >
                            ביטול
                          </button>
                        </>
                      )}
                      {m.status !== "finalized" && creatingTasks !== m.id && (
                        <button
                          onClick={() => {
                            setCreatingTasks(m.id);
                            setSelectedItems(new Set((m.action_items || []).map((_, i) => i)));
                            setSelectedStageId(projectStages[0]?.id || "");
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium"
                          style={{ background: "#011e4110", color: "#011e41" }}
                        >
                          ✓ צור משימות בפרויקט
                        </button>
                      )}
                    </div>

                    {/* Meeting date + participants */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">תאריך</div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={ed.meeting_date || ""}
                            onChange={e => setEditing(p => p ? { ...p, meeting_date: e.target.value } : p)}
                            className="border border-gray-200 rounded px-2 py-1 text-sm outline-none w-full"
                            placeholder="DD.MM.YYYY"
                          />
                        ) : (
                          <div className="text-sm">{m.meeting_date || "—"}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">משתתפים</div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={(ed.participants || []).join(", ")}
                            onChange={e => setEditing(p => p ? { ...p, participants: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : p)}
                            className="border border-gray-200 rounded px-2 py-1 text-sm outline-none w-full"
                            placeholder="שם1, שם2, ..."
                          />
                        ) : (
                          <div className="text-sm">{(m.participants || []).join(", ") || "—"}</div>
                        )}
                      </div>
                    </div>

                    {/* Overview */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">סקירה כללית</div>
                      {isEditing ? (
                        <textarea
                          value={ed.overview || ""}
                          onChange={e => setEditing(p => p ? { ...p, overview: e.target.value } : p)}
                          rows={3}
                          className="border border-gray-200 rounded px-2 py-1 text-sm outline-none w-full resize-y"
                        />
                      ) : (
                        <p className="text-sm text-gray-700 leading-relaxed">{m.overview || "—"}</p>
                      )}
                    </div>

                    {/* Decisions */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2">החלטות</div>
                      {isEditing ? (
                        <div className="space-y-1">
                          {(ed.decisions || []).map((d, i) => (
                            <div key={i} className="flex gap-2">
                              <input
                                value={d}
                                onChange={e => setEditing(p => {
                                  if (!p) return p;
                                  const dec = [...(p.decisions || [])];
                                  dec[i] = e.target.value;
                                  return { ...p, decisions: dec };
                                })}
                                className="border border-gray-200 rounded px-2 py-1 text-sm outline-none flex-1"
                              />
                              <button
                                onClick={() => setEditing(p => {
                                  if (!p) return p;
                                  const dec = (p.decisions || []).filter((_, j) => j !== i);
                                  return { ...p, decisions: dec };
                                })}
                                className="text-gray-300 hover:text-red-400 text-xs px-1"
                              >✕</button>
                            </div>
                          ))}
                          <button
                            onClick={() => setEditing(p => p ? { ...p, decisions: [...(p.decisions || []), ""] } : p)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >+ הוסף החלטה</button>
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {(m.decisions || []).map((d, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <span className="text-yellow-400 shrink-0 mt-1">◆</span>
                              <span>{d}</span>
                            </li>
                          ))}
                          {(!m.decisions || m.decisions.length === 0) && <li className="text-sm text-gray-400">—</li>}
                        </ul>
                      )}
                    </div>

                    {/* Action items */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2">חלוקת משימות</div>
                      {isEditing ? (
                        <div className="space-y-2">
                          {(ed.action_items || []).map((a, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2 items-start">
                              <input
                                value={a.title}
                                onChange={e => setEditing(p => {
                                  if (!p) return p;
                                  const items = [...(p.action_items || [])];
                                  items[i] = { ...items[i], title: e.target.value };
                                  return { ...p, action_items: items };
                                })}
                                placeholder="משימה"
                                className="col-span-4 border border-gray-200 rounded px-2 py-1 text-sm outline-none"
                              />
                              <input
                                value={a.assignee || ""}
                                onChange={e => setEditing(p => {
                                  if (!p) return p;
                                  const items = [...(p.action_items || [])];
                                  items[i] = { ...items[i], assignee: e.target.value };
                                  return { ...p, action_items: items };
                                })}
                                placeholder="אחראי"
                                className="col-span-3 border border-gray-200 rounded px-2 py-1 text-sm outline-none"
                              />
                              <input
                                value={a.due_date || ""}
                                onChange={e => setEditing(p => {
                                  if (!p) return p;
                                  const items = [...(p.action_items || [])];
                                  items[i] = { ...items[i], due_date: e.target.value };
                                  return { ...p, action_items: items };
                                })}
                                placeholder="YYYY-MM-DD"
                                className="col-span-3 border border-gray-200 rounded px-2 py-1 text-sm outline-none"
                              />
                              <button
                                onClick={() => setEditing(p => {
                                  if (!p) return p;
                                  const items = (p.action_items || []).filter((_, j) => j !== i);
                                  return { ...p, action_items: items };
                                })}
                                className="col-span-1 text-gray-300 hover:text-red-400 text-xs"
                              >✕</button>
                              <input
                                value={a.notes || ""}
                                onChange={e => setEditing(p => {
                                  if (!p) return p;
                                  const items = [...(p.action_items || [])];
                                  items[i] = { ...items[i], notes: e.target.value };
                                  return { ...p, action_items: items };
                                })}
                                placeholder="הערות"
                                className="col-span-11 border border-gray-200 rounded px-2 py-1 text-xs outline-none text-gray-500"
                              />
                            </div>
                          ))}
                          <button
                            onClick={() => setEditing(p => p ? { ...p, action_items: [...(p.action_items || []), { title: "" }] } : p)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >+ הוסף משימה</button>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-xs text-gray-500">
                                <th className="text-right px-3 py-2 font-medium">משימה</th>
                                <th className="text-right px-3 py-2 font-medium">אחראי</th>
                                <th className="text-right px-3 py-2 font-medium">תאריך יעד</th>
                                <th className="text-right px-3 py-2 font-medium">הערות</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(m.action_items || []).map((a, i) => (
                                <tr key={i} className="border-t border-gray-50">
                                  <td className="px-3 py-2 font-medium">{a.title}</td>
                                  <td className="px-3 py-2 text-gray-500">{a.assignee || "—"}</td>
                                  <td className="px-3 py-2 text-gray-500">{a.due_date || "—"}</td>
                                  <td className="px-3 py-2 text-gray-400 text-xs">{a.notes || ""}</td>
                                </tr>
                              ))}
                              {(!m.action_items || m.action_items.length === 0) && (
                                <tr><td colSpan={4} className="px-3 py-3 text-gray-400 text-center">אין משימות</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Create tasks panel */}
                    {creatingTasks === m.id && (
                      <div className="border border-blue-100 rounded-xl bg-blue-50 p-4 space-y-3">
                        <div className="text-sm font-semibold" style={{ color: "#011e41" }}>יצירת משימות בפרויקט</div>
                        <div className="flex gap-3 items-center flex-wrap">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">קבוצה (Stage)</label>
                            <select
                              value={selectedStageId}
                              onChange={e => setSelectedStageId(e.target.value)}
                              className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white outline-none"
                            >
                              <option value="">בחר קבוצה...</option>
                              {projectStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mb-1">בחר משימות ליצירה:</div>
                        <div className="space-y-1.5">
                          {(m.action_items || []).map((a, i) => (
                            <label key={i} className="flex items-start gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={selectedItems.has(i)}
                                onChange={() => setSelectedItems(prev => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i); else next.add(i);
                                  return next;
                                })}
                                className="mt-0.5 accent-blue-600"
                              />
                              <span className="text-sm">
                                <span className="font-medium">{a.title}</span>
                                {a.assignee && <span className="text-gray-400 mr-2">· {a.assignee}</span>}
                                {a.due_date && <span className="text-gray-400 mr-2">· {a.due_date}</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => submitCreateTasks(m)}
                            disabled={taskCreating}
                            className="text-xs px-4 py-2 rounded-lg text-white font-medium"
                            style={{ background: "#011e41", opacity: taskCreating ? 0.6 : 1 }}
                          >
                            {taskCreating ? "יוצר..." : `צור ${selectedItems.size} משימות`}
                          </button>
                          <button
                            onClick={() => setCreatingTasks(null)}
                            className="text-xs px-3 py-1.5 rounded-lg text-gray-500"
                            style={{ background: "#f5f5f5" }}
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
