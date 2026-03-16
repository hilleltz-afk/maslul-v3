"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

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
interface Task { id: string; title: string; }
interface Stage { id: string; name: string; }

function expiryStatus(expiry?: string): { label: string; color: string } | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0)   return { label: "פג תוקף",     color: "#c0392b" };
  if (days <= 30) return { label: `${days} ימים`, color: "#e67e22" };
  return           { label: `${days} ימים`,        color: "#27ae60" };
}

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Document[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/documents/`),
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/tasks/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/stages/`).catch(() => []),
    ]).then(([d, p, t, s]) => {
      setDocs(d);
      setProjects(p);
      setTasks(t);
      setStages(s);
    }).catch(console.error).finally(() => setLoading(false));
  }, [router]);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t.title]));
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s.name]));

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
      </div>

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
            const projectName = d.project_id ? projectMap[d.project_id] : null;
            const taskTitle = d.task_id ? taskMap[d.task_id] : null;
            const stageName = d.stage_id ? stageMap[d.stage_id] : null;
            const url = d.path.startsWith("http") ? d.path : `${API_BASE}${d.path}`;

            return (
              <div key={d.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4 group hover:shadow-md transition-shadow">
                <div className="text-xl flex-shrink-0">📄</div>
                <div className="flex-1 min-w-0">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sm hover:underline"
                    style={{ color: "#011e41" }}
                  >
                    {d.name}
                  </a>
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-400">
                    {projectName && <span>📁 {projectName}</span>}
                    {stageName && !taskTitle && <span>› {stageName}</span>}
                    {taskTitle && <span>📌 {taskTitle}</span>}
                    {!projectName && !taskTitle && !stageName && (
                      <span className="truncate max-w-xs">{d.path}</span>
                    )}
                    {d.expiry_date && (
                      <span>תוקף: {new Date(d.expiry_date).toLocaleDateString("he-IL")}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {status && (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: status.color + "20", color: status.color }}
                    >
                      {status.label}
                    </span>
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
