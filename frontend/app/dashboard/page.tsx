"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface Task { id: string; status: string; end_date?: string; title: string; priority: string; }
interface Project { id: string; name: string; }

interface Stats {
  projects: number;
  tasks: number;
  tasksDone: number;
  tasksOverdue: number;
  tasksInProgress: number;
  contacts: number;
  documents: number;
  expiring: number;
  pipeline: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [userName, setUserName] = useState("");
  const [overdueTasks, setOverdueTasks] = useState<(Task & { projectName?: string })[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserName(payload.name || payload.email);
    } catch {}

    const today = new Date().toISOString().slice(0, 10);

    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/tasks/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/contacts/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/documents/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/documents/expiring`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/pipeline/pending`).catch(() => []),
    ]).then(([projects, tasks, contacts, documents, expiring, pipeline]) => {
      const allTasks: Task[] = tasks;
      const allProjects: Project[] = projects;

      const projectMap: Record<string, string> = {};
      allProjects.forEach((p) => { projectMap[p.id] = p.name; });

      const done = allTasks.filter(t => t.status === "done").length;
      const inProgress = allTasks.filter(t => t.status === "in_progress").length;
      const overdueList = allTasks.filter(
        t => t.end_date && t.end_date.slice(0, 10) < today && t.status !== "done"
      );

      setStats({
        projects: allProjects.length,
        tasks: allTasks.length,
        tasksDone: done,
        tasksInProgress: inProgress,
        tasksOverdue: overdueList.length,
        contacts: contacts.length,
        documents: documents.length,
        expiring: expiring.length,
        pipeline: pipeline.length,
      });

      setOverdueTasks(overdueList.slice(0, 5));
    });
  }, [router]);

  const cards = stats ? [
    { label: "פרויקטים", value: stats.projects, href: "/projects", color: "#011e41", sub: null },
    { label: "משימות פעילות", value: stats.tasksInProgress, href: "/projects", color: "#2980b9", sub: `${stats.tasksDone} הושלמו` },
    { label: "משימות באיחור", value: stats.tasksOverdue, href: "/projects", color: stats.tasksOverdue > 0 ? "#c0392b" : "#7f8c8d", sub: stats.tasksOverdue > 0 ? "דורש טיפול" : "הכל בסדר" },
    { label: "מסמכים פגי תוקף", value: stats.expiring, href: "/documents", color: stats.expiring > 0 ? "#e67e22" : "#7f8c8d", sub: stats.expiring > 0 ? "לחידוש" : "הכל תקין" },
    { label: "מיילים ממתינים", value: stats.pipeline, href: "/pipeline", color: stats.pipeline > 0 ? "#a4742d" : "#7f8c8d", sub: stats.pipeline > 0 ? "לאישור" : "אין חדש" },
  ] : [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";

  return (
    <div dir="rtl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>
          {greeting}{userName ? `, ${userName}` : ""}
        </h1>
        <p className="text-gray-400 text-sm mt-1">סקירה כללית — {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      {!stats ? (
        <div className="text-gray-400">טוען...</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-6">
            {cards.map((card) => (
              <a
                key={card.label}
                href={card.href}
                className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100"
              >
                <div className="text-3xl font-bold mb-1" style={{ color: card.color }}>
                  {card.value}
                </div>
                <div className="text-sm font-medium text-gray-700">{card.label}</div>
                {card.sub && <div className="text-xs text-gray-400 mt-0.5">{card.sub}</div>}
              </a>
            ))}
          </div>

          {/* Task progress chart */}
          {stats && stats.tasks > 0 && (() => {
            const total = stats.tasks;
            const bars = [
              { label: "הושלם", count: stats.tasksDone, color: "#27ae60" },
              { label: "בעבודה", count: stats.tasksInProgress, color: "#2980b9" },
              { label: "באיחור", count: stats.tasksOverdue, color: "#c0392b" },
              { label: "שאר", count: Math.max(0, total - stats.tasksDone - stats.tasksInProgress), color: "#e0e0e0" },
            ];
            const donePct = Math.round((stats.tasksDone / total) * 100);
            return (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold" style={{ color: "#011e41" }}>התקדמות משימות</span>
                  <span className="text-sm font-bold" style={{ color: "#27ae60" }}>{donePct}% הושלמו</span>
                </div>
                {/* Stacked bar */}
                <div className="w-full h-4 rounded-full overflow-hidden bg-gray-100 flex mb-3">
                  {bars.filter(b => b.count > 0).map(b => (
                    <div
                      key={b.label}
                      style={{ width: `${(b.count / total) * 100}%`, background: b.color }}
                      title={`${b.label}: ${b.count}`}
                    />
                  ))}
                </div>
                {/* Legend */}
                <div className="flex gap-4 flex-wrap">
                  {bars.filter(b => b.count > 0).map(b => (
                    <div key={b.label} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                      <span className="text-xs text-gray-500">{b.label} ({b.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Overdue tasks */}
          {overdueTasks.length > 0 && (
            <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 flex items-center gap-2">
                <span className="text-sm font-semibold text-red-600">משימות באיחור</span>
                <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5">{stats.tasksOverdue}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {overdueTasks.map(task => {
                  const daysLate = task.end_date
                    ? Math.floor((Date.now() - new Date(task.end_date).getTime()) / 86400000)
                    : 0;
                  return (
                    <div key={task.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-orange-400" : "bg-green-400"}`} />
                        <span className="text-sm text-gray-800">{task.title}</span>
                      </div>
                      <span className="text-xs text-red-500 flex-shrink-0">איחור של {daysLate} ימים</span>
                    </div>
                  );
                })}
                {stats.tasksOverdue > 5 && (
                  <a href="/tasks" className="block px-5 py-2 text-xs text-center text-gray-400 hover:text-gray-600">
                    + עוד {stats.tasksOverdue - 5} משימות באיחור
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
