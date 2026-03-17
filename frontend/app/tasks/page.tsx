"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [search, setSearch] = useState("");

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
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className="px-3 py-1 rounded-md text-sm transition-colors"
              style={{ background: statusFilter === val ? "#011e41" : "transparent", color: statusFilter === val ? "#fff" : "#555" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {[["all", "כל עדיפות"], ["high", "גבוהה"], ["medium", "בינונית"], ["low", "נמוכה"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPriorityFilter(val)}
              className="px-3 py-1 rounded-md text-sm transition-colors"
              style={{ background: priorityFilter === val ? "#011e41" : "transparent", color: priorityFilter === val ? "#fff" : "#555" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      {!loading && (
        <p className="text-xs text-gray-400 mb-3">מציג {filtered.length} מתוך {tasks.length}</p>
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
              <a
                key={t.id}
                href={t.project_id ? `/projects/${t.project_id}` : "#"}
                className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow border border-transparent hover:border-gray-100 cursor-pointer"
                style={{ textDecoration: "none" }}
              >
                {/* Priority stripe */}
                <div
                  className="w-1 self-stretch rounded-full flex-shrink-0"
                  style={{ background: prio.color, minHeight: 36 }}
                  title={`עדיפות ${prio.label}`}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
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
                    {assigneeName && (
                      <span className="text-xs text-gray-400">👤 {assigneeName}</span>
                    )}
                    {t.end_date && !isOverdue && (
                      <span className="text-xs text-gray-400">
                        📅 {new Date(t.end_date).toLocaleDateString("he-IL")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className="text-xs px-3 py-1 rounded-full font-medium flex-shrink-0"
                  style={{ background: s.color + "20", color: s.color }}
                >
                  {s.label}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
