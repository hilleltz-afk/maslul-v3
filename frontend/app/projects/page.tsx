"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface Project { id: string; name: string; gush: string; helka: string; }

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", gush: "", helka: "" });
  const [myRole, setMyRole] = useState<string>("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    apiFetch(`/tenants/${TENANT_ID}/projects/`).then(setProjects).catch(console.error).finally(() => setLoading(false));
    apiFetch("/auth/me").then((me: any) => setMyRole(me?.role || "")).catch(() => {});
  }, [router]);

  async function deleteProject(id: string, name: string) {
    if (!confirm(`למחוק את הפרויקט "${name}"? פעולה זו אינה הפיכה.`)) return;
    await apiFetch(`/tenants/${TENANT_ID}/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  async function createProject() {
    if (!form.name || !form.gush || !form.helka) return;
    const p = await apiFetch(`/tenants/${TENANT_ID}/projects/`, { method: "POST", body: JSON.stringify(form) });
    setProjects(prev => [...prev, p]);
    setForm({ name: "", gush: "", helka: "" });
    setCreating(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>פרויקטים</h1>
        <button onClick={() => setCreating(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#011e41" }}>
          + פרויקט חדש
        </button>
      </div>

      {creating && (
        <div className="bg-white rounded-xl p-5 shadow-sm mb-4 flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">שם הפרויקט</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none w-56" placeholder="רמת אביב גימל" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">גוש</label>
            <input value={form.gush} onChange={e => setForm(p => ({ ...p, gush: e.target.value }))} className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none w-24" placeholder="6100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">חלקה</label>
            <input value={form.helka} onChange={e => setForm(p => ({ ...p, helka: e.target.value }))} className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none w-24" placeholder="120" />
          </div>
          <button onClick={createProject} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: "#27ae60" }}>צור</button>
          <button onClick={() => setCreating(false)} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700">ביטול</button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : projects.length === 0 ? (
        <div className="text-gray-400">אין פרויקטים עדיין</div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <div key={p.id} className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 group">
              <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ background: "#011e41" }} />
              <div className="flex-1 cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                <div className="font-semibold text-lg" style={{ color: "#011e41" }}>{p.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">גוש {p.gush} · חלקה {p.helka}</div>
              </div>
              {(myRole === "super_admin") && (
                <button
                  onClick={e => { e.stopPropagation(); deleteProject(p.id, p.name); }}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded transition-opacity"
                  title="מחק פרויקט"
                >
                  מחק
                </button>
              )}
              <span className="text-gray-300 text-lg cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>←</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
