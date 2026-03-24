"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Project { id: string; name: string; gush: string; helka: string; budget_total?: number; address?: string; archived_at?: string; }
interface Task { id: string; project_id: string; status: string; end_date?: string; }

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: "", gush: "", helka: "", address: "" });
  const [myRole, setMyRole] = useState<string>("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/?archived=false`),
      apiFetch(`/tenants/${TENANT_ID}/tasks/`).catch(() => []),
      apiFetch("/auth/me").catch(() => null),
    ]).then(([p, t, me]) => {
      setProjects(p);
      setTasks(t);
      setMyRole(me?.role || "");
    }).catch(console.error).finally(() => setLoading(false));
  }, [router]);

  async function loadArchived() {
    const data = await apiFetch(`/tenants/${TENANT_ID}/projects/?archived=true`).catch(() => []);
    setArchivedProjects(data);
  }

  async function archiveProject(id: string, name: string) {
    if (!confirm(`לשלוח את הפרויקט "${name}" לארכיון? ניתן לשחזר בכל עת.`)) return;
    await apiFetch(`/tenants/${TENANT_ID}/projects/${id}/archive`, { method: "POST" });
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  async function unarchiveProject(id: string) {
    const updated = await apiFetch(`/tenants/${TENANT_ID}/projects/${id}/archive`, { method: "DELETE" });
    setArchivedProjects(prev => prev.filter(p => p.id !== id));
    setProjects(prev => [...prev, updated]);
  }

  async function deleteProject(id: string, name: string) {
    if (!confirm(`למחוק לצמיתות את הפרויקט "${name}"?\n\nכל המשימות, המסמכים והתקציב יימחקו גם כן.\nפעולה זו אינה הפיכה.`)) return;
    await apiFetch(`/tenants/${TENANT_ID}/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
    setArchivedProjects(prev => prev.filter(p => p.id !== id));
    // Remove project tasks from local state
    setTasks(prev => prev.filter(t => t.project_id !== id));
  }

  async function downloadProject(id: string, name: string) {
    setDownloading(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/tenants/${TENANT_ID}/projects/${id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("שגיאה בהורדה");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || "שגיאה בהורדה");
    } finally {
      setDownloading(null);
    }
  }

  async function createProject() {
    if (!form.name || !form.gush || !form.helka) return;
    const p = await apiFetch(`/tenants/${TENANT_ID}/projects/`, {
      method: "POST",
      body: JSON.stringify({ name: form.name, gush: form.gush, helka: form.helka, address: form.address || undefined }),
    });
    setProjects(prev => [...prev, p]);
    setForm({ name: "", gush: "", helka: "", address: "" });
    setCreating(false);
  }

  function projectStats(projectId: string) {
    const pt = tasks.filter(t => t.project_id === projectId);
    const total = pt.length;
    const done = pt.filter(t => t.status === "done").length;
    const inProgress = pt.filter(t => t.status === "in_progress").length;
    const overdue = pt.filter(t => t.end_date && t.end_date.slice(0, 10) < today && t.status !== "done").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, overdue, pct };
  }

  const isAdmin = myRole === "super_admin" || myRole === "admin";

  function ProjectCard({ p, isArchiveView = false }: { p: Project; isArchiveView?: boolean }) {
    const stats = projectStats(p.id);
    return (
      <div
        key={p.id}
        className="bg-white rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-5 group cursor-pointer"
        style={{ opacity: isArchiveView ? 0.8 : 1 }}
        onClick={() => !isArchiveView && router.push(`/projects/${p.id}`)}
      >
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: isArchiveView ? "#95a5a6" : "#011e41" }} />

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base flex items-center gap-2" style={{ color: isArchiveView ? "#7f8c8d" : "#011e41" }}>
            {isArchiveView && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">ארכיון</span>}
            {p.name}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            גוש {p.gush} · חלקה {p.helka}
            {p.address && <span> · {p.address}</span>}
          </div>
          {!isArchiveView && stats.total > 0 && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 max-w-xs h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${stats.pct}%`, background: stats.pct === 100 ? "#27ae60" : "#2980b9" }} />
              </div>
              <span className="text-xs text-gray-400">{stats.pct}%</span>
            </div>
          )}
        </div>

        {!isArchiveView && stats.total > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f0f9ff", color: "#2980b9" }}>{stats.inProgress} בעבודה</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f0fdf4", color: "#27ae60" }}>{stats.done}/{stats.total} הושלמו</span>
            {stats.overdue > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#fef2f2", color: "#c0392b" }}>{stats.overdue} באיחור</span>}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Download ZIP */}
          <button
            onClick={e => { e.stopPropagation(); downloadProject(p.id, p.name); }}
            disabled={downloading === p.id}
            className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
            title="הורד פרויקט (ZIP)"
          >
            {downloading === p.id ? "⏳" : "⬇️"}
          </button>

          {isAdmin && !isArchiveView && (
            <button
              onClick={e => { e.stopPropagation(); archiveProject(p.id, p.name); }}
              className="text-xs text-gray-400 hover:text-orange-500 px-2 py-1 rounded hover:bg-orange-50"
              title="העבר לארכיון"
            >
              📦
            </button>
          )}

          {isAdmin && isArchiveView && (
            <button
              onClick={e => { e.stopPropagation(); unarchiveProject(p.id); }}
              className="text-xs text-gray-400 hover:text-green-600 px-2 py-1 rounded hover:bg-green-50"
              title="שחזר מארכיון"
            >
              ↩️
            </button>
          )}

          {isAdmin && (
            <button
              onClick={e => { e.stopPropagation(); deleteProject(p.id, p.name); }}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
              title="מחק לצמיתות"
            >
              🗑️
            </button>
          )}
        </div>

        {!isArchiveView && <span className="text-gray-300 text-sm flex-shrink-0">←</span>}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>פרויקטים</h1>
          {!loading && <p className="text-sm text-gray-400 mt-0.5">{projects.length} פרויקטים פעילים</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowArchived(v => !v); if (!showArchived) loadArchived(); }}
            className="px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: showArchived ? "#e67e22" : "#e5e7eb", color: showArchived ? "#e67e22" : "#6b7280", background: showArchived ? "#fff7ed" : "white" }}
          >
            📦 ארכיון
          </button>
          <button onClick={() => setCreating(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#011e41" }}>
            + פרויקט חדש
          </button>
        </div>
      </div>

      {creating && (
        <div className="bg-white rounded-xl p-5 shadow-sm mb-4 flex gap-3 flex-wrap items-end border border-gray-100">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">שם הפרויקט *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === "Enter" && createProject()} className="border border-gray-200 rounded px-3 py-2 text-sm outline-none w-56 focus:border-blue-300" placeholder="רמת אביב גימל" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">גוש *</label>
            <input value={form.gush} onChange={e => setForm(p => ({ ...p, gush: e.target.value }))} onKeyDown={e => e.key === "Enter" && createProject()} className="border border-gray-200 rounded px-3 py-2 text-sm outline-none w-24 focus:border-blue-300" placeholder="6100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">חלקה *</label>
            <input value={form.helka} onChange={e => setForm(p => ({ ...p, helka: e.target.value }))} onKeyDown={e => e.key === "Enter" && createProject()} className="border border-gray-200 rounded px-3 py-2 text-sm outline-none w-24 focus:border-blue-300" placeholder="120" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">כתובת</label>
            <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} onKeyDown={e => e.key === "Enter" && createProject()} className="border border-gray-200 rounded px-3 py-2 text-sm outline-none w-48 focus:border-blue-300" placeholder="רח' הרצל 1, תל אביב" />
          </div>
          <button onClick={createProject} className="px-5 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#27ae60" }}>צור</button>
          <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700">ביטול</button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : (
        <>
          {projects.length === 0 && !showArchived ? (
            <div className="text-gray-400 py-16 text-center">אין פרויקטים פעילים</div>
          ) : (
            <div className="grid gap-3">
              {projects.map(p => <ProjectCard key={p.id} p={p} />)}
            </div>
          )}

          {showArchived && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-semibold" style={{ color: "#e67e22" }}>📦 ארכיון</h2>
                <span className="text-xs text-gray-400">({archivedProjects.length} פרויקטים)</span>
              </div>
              {archivedProjects.length === 0 ? (
                <div className="text-gray-400 py-6 text-center text-sm">אין פרויקטים בארכיון</div>
              ) : (
                <div className="grid gap-3">
                  {archivedProjects.map(p => <ProjectCard key={p.id} p={p} isArchiveView />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
