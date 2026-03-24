"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUpload } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Document {
  id: string;
  name: string;
  path: string;
  expiry_date?: string;
  project_id?: string;
  task_id?: string;
  stage_id?: string;
}
interface Project { id: string; name: string; }
interface Task { id: string; title: string; project_id: string; }

function expiryStatus(expiry?: string): { label: string; color: string } | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0)   return { label: "פג תוקף",     color: "#c0392b" };
  if (days <= 30) return { label: `${days} ימים`, color: "#e67e22" };
  return           { label: `${days} ימים`,        color: "#27ae60" };
}

export default function DocumentsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<Document[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [uploadTaskId, setUploadTaskId] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Inline editing
  const [editingDoc, setEditingDoc] = useState<{ id: string; name: string; expiry: string } | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
  }, [router]);

  async function load() {
    const [d, p, t] = await Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/documents/`),
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/tasks/`).catch(() => []),
    ]);
    setDocs(d);
    setProjects(p);
    setTasks(t);
    setLoading(false);
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t.title]));

  // Tasks filtered by selected upload project
  const uploadProjectTasks = tasks.filter(t => t.project_id === uploadProjectId);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadProjectId) { setUploadError("יש לבחור פרויקט"); return; }
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", uploadProjectId);
      if (uploadTaskId) fd.append("task_id", uploadTaskId);
      if (uploadExpiry) fd.append("expiry_date", uploadExpiry);
      if (uploadName.trim()) fd.append("name", uploadName.trim());
      const doc = await apiUpload(`/tenants/${TENANT_ID}/documents/upload`, fd);
      setDocs(prev => [doc, ...prev]);
      setShowUpload(false);
      setUploadProjectId(""); setUploadTaskId(""); setUploadName(""); setUploadExpiry("");
    } catch (err: any) {
      setUploadError(err.message || "שגיאה בהעלאה");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteDoc(id: string, name: string) {
    if (!confirm(`למחוק את "${name}"?`)) return;
    setDeleting(id);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/documents/${id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (e: any) {
      alert(e.message || "שגיאה במחיקה");
    } finally {
      setDeleting(null);
    }
  }

  async function saveDocEdit(id: string) {
    if (!editingDoc) return;
    const body: Record<string, unknown> = { name: editingDoc.name };
    if (editingDoc.expiry) body.expiry_date = editingDoc.expiry;
    else body.expiry_date = null;
    await apiFetch(`/tenants/${TENANT_ID}/documents/${id}`, { method: "PUT", body: JSON.stringify(body) });
    setDocs(prev => prev.map(d => d.id === id ? { ...d, name: editingDoc.name, expiry_date: editingDoc.expiry || undefined } : d));
    setEditingDoc(null);
  }

  const filtered = docs.filter(d => {
    if (projectFilter !== "all" && d.project_id !== projectFilter) return false;
    if (expiryFilter === "expiring") {
      const status = expiryStatus(d.expiry_date);
      if (!status || status.color === "#27ae60") return false;
    }
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>מסמכים</h1>
          <p className="text-sm text-gray-400 mt-0.5">{docs.length} מסמכים סה"כ</p>
        </div>
        <button
          onClick={() => { setShowUpload(v => !v); setUploadError(""); }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "#011e41" }}
        >
          + העלה מסמך
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="text-sm font-semibold mb-4" style={{ color: "#011e41" }}>העלאת מסמך חדש</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">פרויקט <span className="text-red-400">*</span></label>
              <select
                value={uploadProjectId}
                onChange={e => { setUploadProjectId(e.target.value); setUploadTaskId(""); setUploadError(""); }}
                className={`border rounded-lg px-3 py-2 text-sm outline-none ${!uploadProjectId ? "border-red-200" : "border-gray-200"}`}
              >
                <option value="">בחר פרויקט...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">שיוך למשימה (אופציונלי)</label>
              <select
                value={uploadTaskId}
                onChange={e => setUploadTaskId(e.target.value)}
                disabled={!uploadProjectId}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50"
              >
                <option value="">— ללא שיוך למשימה —</option>
                {uploadProjectTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">שם המסמך (ריק = שם הקובץ)</label>
              <input
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
                placeholder="למשל: חוזה עם קבלן ראשי"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">תאריך תוקף (אופציונלי)</label>
              <input
                type="date"
                value={uploadExpiry}
                onChange={e => setUploadExpiry(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => {
                if (!uploadProjectId) { setUploadError("יש לבחור פרויקט"); return; }
                fileRef.current?.click();
              }}
              disabled={uploading}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#27ae60", opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? "מעלה..." : "📎 בחר קובץ"}
            </button>
            <button onClick={() => setShowUpload(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3">ביטול</button>
            {uploadError && <span className="text-sm text-red-600">{uploadError}</span>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם..."
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
          {[["all", "הכל"], ["expiring", "פגי תוקף"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setExpiryFilter(val)}
              className="px-3 py-1 rounded-md text-sm transition-colors"
              style={{ background: expiryFilter === val ? "#011e41" : "transparent", color: expiryFilter === val ? "#fff" : "#555" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 mb-3">מציג {filtered.length} מתוך {docs.length}</p>
      )}

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 py-10 text-center">אין מסמכים</div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((d) => {
            const status = expiryStatus(d.expiry_date);
            const url = d.path.startsWith("http") ? d.path : `${API_BASE}${d.path}`;
            const isEditing = editingDoc?.id === d.id;

            return (
              <div key={d.id} className="bg-white rounded-xl p-4 shadow-sm flex items-start gap-4 group hover:shadow-md transition-shadow">
                <div className="text-xl flex-shrink-0 mt-0.5">📄</div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        autoFocus
                        value={editingDoc.name}
                        onChange={e => setEditingDoc(p => p ? { ...p, name: e.target.value } : p)}
                        onKeyDown={e => { if (e.key === "Enter") saveDocEdit(d.id); if (e.key === "Escape") setEditingDoc(null); }}
                        className="text-sm border border-blue-300 rounded-lg px-3 py-1.5 outline-none w-full"
                        placeholder="שם המסמך"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500">תוקף:</span>
                          <input
                            type="date"
                            value={editingDoc.expiry}
                            onChange={e => setEditingDoc(p => p ? { ...p, expiry: e.target.value } : p)}
                            className="text-xs border border-gray-200 rounded px-2 py-1 outline-none"
                          />
                        </div>
                        <button onClick={() => saveDocEdit(d.id)} className="text-xs px-3 py-1 rounded-lg text-white" style={{ background: "#27ae60" }}>שמור</button>
                        <button onClick={() => setEditingDoc(null)} className="text-xs px-2 py-1 text-gray-400">ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <a href={url} target="_blank" rel="noreferrer" className="font-medium text-sm hover:underline" style={{ color: "#011e41" }}>
                        {d.name}
                      </a>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-400">
                        {d.project_id && <span>📁 {projectMap[d.project_id] || d.project_id}</span>}
                        {d.task_id && <span>📌 {taskMap[d.task_id] || d.task_id}</span>}
                        {d.expiry_date && (
                          <span>תוקף: {new Date(d.expiry_date).toLocaleDateString("he-IL")}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {status && !isEditing && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: status.color + "20", color: status.color }}>
                      {status.label}
                    </span>
                  )}
                  {!isEditing && (
                    <button
                      onClick={() => setEditingDoc({ id: d.id, name: d.name, expiry: d.expiry_date?.slice(0, 10) || "" })}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-300 hover:text-blue-500 px-2 py-1 rounded hover:bg-blue-50"
                      title="ערוך"
                    >✏️</button>
                  )}
                  <button
                    onClick={() => deleteDoc(d.id, d.name)}
                    disabled={deleting === d.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-300 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50"
                    title="מחק"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
