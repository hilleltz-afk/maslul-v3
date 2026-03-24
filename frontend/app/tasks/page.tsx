"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { apiFetch, apiUpload } from "@/lib/api";

const TENANT_ID = getTenantId();

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  in_progress: { label: "בעבודה",        color: "#2980b9" },
  done:        { label: "בוצע",          color: "#27ae60" },
  delayed:     { label: "בעיכוב",        color: "#e67e22" },
  rejected:    { label: "נדחה",          color: "#c0392b" },
  partial:     { label: "בוצע חלקית",   color: "#8e44ad" },
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: "גבוהה",  color: "#c0392b" },
  medium: { label: "בינונית", color: "#e67e22" },
  low:    { label: "נמוכה",  color: "#27ae60" },
};

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string;
  project_id?: string;
  stage_id?: string;
  assignee_id?: string;
  end_date?: string;
}
interface Project { id: string; name: string; }
interface User { id: string; name: string; }
interface Stage { id: string; name: string; color?: string; project_id: string; }

export default function TasksPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulking, setBulking] = useState(false);

  // Attach doc modal
  const [attachTask, setAttachTask] = useState<Task | null>(null);
  const [attachExpiry, setAttachExpiry] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attaching, setAttaching] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/tasks/`),
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/users/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/stages/`).catch(() => []),
    ]).then(([t, p, u, s]) => {
      setTasks(t);
      setProjects(p);
      setUsers(u);
      setStages(s);
    }).catch(console.error).finally(() => setLoading(false));
  }, [router]);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]));

  const filtered = tasks.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (projectFilter !== "all" && t.project_id !== projectFilter) return false;
    if (search && !t.title.includes(search) && !t.description?.includes(search)) return false;
    return true;
  });

  const overdue = (t: Task) => t.end_date && t.end_date.slice(0, 10) < today && t.status !== "done";

  async function updateTaskStatus(id: string, status: string) {
    await apiFetch(`/tenants/${TENANT_ID}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  }

  async function deleteTask(id: string, title: string) {
    if (!confirm(`למחוק את המשימה "${title}"?`)) return;
    await apiFetch(`/tenants/${TENANT_ID}/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  }

  async function bulkUpdateStatus() {
    if (!bulkStatus || selected.size === 0) return;
    setBulking(true);
    try {
      await Promise.all([...selected].map(id =>
        apiFetch(`/tenants/${TENANT_ID}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status: bulkStatus }) })
      ));
      setTasks(prev => prev.map(t => selected.has(t.id) ? { ...t, status: bulkStatus } : t));
      setSelected(new Set());
      setBulkStatus("");
    } finally {
      setBulking(false);
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`למחוק ${selected.size} משימות?`)) return;
    setBulking(true);
    try {
      await Promise.all([...selected].map(id =>
        apiFetch(`/tenants/${TENANT_ID}/tasks/${id}`, { method: "DELETE" })
      ));
      setTasks(prev => prev.filter(t => !selected.has(t.id)));
      setSelected(new Set());
    } finally {
      setBulking(false);
    }
  }

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !attachTask) return;
    setAttaching(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (attachTask.project_id) fd.append("project_id", attachTask.project_id);
      fd.append("task_id", attachTask.id);
      if (attachExpiry) fd.append("expiry_date", attachExpiry);
      if (attachName.trim()) fd.append("name", attachName.trim());
      await apiUpload(`/tenants/${TENANT_ID}/documents/upload`, fd);
      setAttachTask(null);
      setAttachExpiry("");
      setAttachName("");
    } catch (err: any) {
      alert(err.message || "שגיאה בהעלאה");
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = "";
      e.target.value = "";
    }
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>משימות</h1>
          <p className="text-sm text-gray-400 mt-0.5">{tasks.length} משימות סה"כ</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש..."
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-300 w-48"
        />
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="all">כל הפרויקטים</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {[["all", "הכל"], ["in_progress", "בעבודה"], ["done", "בוצע"], ["delayed", "בעיכוב"], ["rejected", "נדחה"], ["partial", "בוצע חלקית"]].map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val)} className="px-3 py-1 rounded-md text-sm transition-colors"
              style={{ background: statusFilter === val ? "#011e41" : "transparent", color: statusFilter === val ? "#fff" : "#555" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {[["all", "כל עדיפות"], ["high", "גבוהה"], ["medium", "בינונית"], ["low", "נמוכה"]].map(([val, label]) => (
            <button key={val} onClick={() => setPriorityFilter(val)} className="px-3 py-1 rounded-md text-sm transition-colors"
              style={{ background: priorityFilter === val ? "#011e41" : "transparent", color: priorityFilter === val ? "#fff" : "#555" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filtered.length > 0 && selected.size === filtered.length}
              ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
              onChange={toggleSelectAll}
              className="w-4 h-4 cursor-pointer accent-blue-600"
              title="בחר הכל"
            />
            <p className="text-xs text-gray-400">מציג {filtered.length} מתוך {tasks.length}</p>
          </div>

          {/* Bulk toolbar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-blue-700">{selected.size} נבחרו</span>
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value)}
                className="text-xs border border-blue-200 rounded px-2 py-1 bg-white"
              >
                <option value="">שנה סטטוס...</option>
                {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button
                onClick={bulkUpdateStatus}
                disabled={!bulkStatus || bulking}
                className="text-xs px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
              >
                {bulking ? "..." : "עדכן"}
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulking}
                className="text-xs px-3 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50"
              >
                🗑️ מחק
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 py-10 text-center">אין משימות</div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((t) => {
            const s = STATUS_LABELS[t.status] || { label: t.status, color: "#7f8c8d" };
            const prio = PRIORITY_LABELS[t.priority] || { label: t.priority, color: "#ccc" };
            const projectName = t.project_id ? projectMap[t.project_id] : null;
            const assigneeName = t.assignee_id ? userMap[t.assignee_id] : null;
            const stage = t.stage_id ? stageMap[t.stage_id] : null;
            const isOverdue = overdue(t);
            const daysLate = t.end_date && isOverdue
              ? Math.floor((Date.now() - new Date(t.end_date).getTime()) / 86400000)
              : null;

            return (
              <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow border border-transparent hover:border-gray-100 group"
                style={{ outline: selected.has(t.id) ? "2px solid #3b82f6" : "none", outlineOffset: "-1px" }}>
                {/* Row checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggleSelect(t.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 flex-shrink-0 cursor-pointer accent-blue-600"
                />
                {/* Priority stripe */}
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: prio.color, minHeight: 36 }} title={`עדיפות ${prio.label}`} />

                {/* Content — click to navigate */}
                <a
                  href={t.project_id ? `/projects/${t.project_id}` : "#"}
                  className="flex-1 min-w-0"
                  style={{ textDecoration: "none" }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm" style={{ color: "#011e41" }}>{t.title}</span>
                    {isOverdue && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#fef2f2", color: "#c0392b" }}>
                        איחור {daysLate}י׳
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {projectName && (
                      <span className="text-xs text-gray-500">
                        📁 {projectName}
                        {stage && <span> › {stage.name}</span>}
                      </span>
                    )}
                    {assigneeName && <span className="text-xs text-gray-400">👤 {assigneeName}</span>}
                    {t.end_date && !isOverdue && (
                      <span className="text-xs text-gray-400">📅 {new Date(t.end_date).toLocaleDateString("he-IL")}</span>
                    )}
                  </div>
                </a>

                {/* Status — clickable dropdown */}
                <select
                  value={t.status}
                  onChange={e => updateTaskStatus(t.id, e.target.value)}
                  className="text-xs px-3 py-1 rounded-full font-medium flex-shrink-0 cursor-pointer border-0 outline-none appearance-none"
                  style={{ background: s.color + "22", color: s.color }}
                >
                  {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>

                {/* Attach doc button */}
                <button
                  onClick={e => { e.preventDefault(); setAttachTask(t); setAttachExpiry(""); setAttachName(""); }}
                  className="text-gray-400 hover:text-green-600 text-xl flex-shrink-0"
                  title="צרף מסמך"
                >
                  📎
                </button>

                {/* Delete button */}
                <button
                  onClick={e => { e.preventDefault(); deleteTask(t.id, t.title); }}
                  className="text-gray-300 hover:text-red-500 text-base flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="מחק משימה"
                >
                  🗑️
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Attach document modal */}
      {attachTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAttachTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base" style={{ color: "#011e41" }}>צרף מסמך למשימה</h3>
              <button onClick={() => setAttachTask(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="text-sm text-gray-500 mb-4 bg-gray-50 rounded-lg px-3 py-2 truncate">{attachTask.title}</div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">שם המסמך (ריק = שם הקובץ)</label>
                <input
                  value={attachName}
                  onChange={e => setAttachName(e.target.value)}
                  placeholder="למשל: חוזה ספק"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">תאריך תוקף (אופציונלי)</label>
                <input
                  type="date"
                  value={attachExpiry}
                  onChange={e => setAttachExpiry(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <input ref={fileRef} type="file" className="hidden" onChange={handleAttach} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={attaching}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: "#011e41", opacity: attaching ? 0.6 : 1 }}
              >
                {attaching ? "מעלה..." : "📎 בחר קובץ"}
              </button>
              <button onClick={() => setAttachTask(null)} className="px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 border border-gray-200">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
