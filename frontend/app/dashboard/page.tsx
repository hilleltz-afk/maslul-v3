"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface Task { id: string; status: string; end_date?: string; title: string; priority: string; project_id?: string; }
interface Project { id: string; name: string; }
interface BudgetEntry { id: string; project_id: string; category: string; amount: number; is_planned: number; }

const PIE_COLORS = ["#011e41","#2980b9","#27ae60","#e67e22","#c0392b","#9b59b6","#1abc9c","#f39c12","#e74c3c","#3498db","#95a5a6"];

function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const cx = 80, cy = 80, r = 68;
  let angle = -Math.PI / 2;
  const paths = slices.map(d => {
    const a = (d.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += a;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    return { ...d, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${a > Math.PI ? 1 : 0},1 ${x2},${y2} Z` };
  });
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      {paths.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={1.5}>
          <title>{s.label}: {Math.round((s.value / total) * 100)}%</title>
        </path>
      ))}
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allEntries, setAllEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [expiringCount, setExpiringCount] = useState(0);
  const [pipelineCount, setPipelineCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserName(payload.name || payload.email);
    } catch {}

    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/tasks/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/documents/expiring`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/pipeline/pending`).catch(() => []),
    ]).then(async ([projs, tasks, expiring, pipeline]) => {
      setProjects(projs);
      setAllTasks(tasks);
      setExpiringCount(expiring.length);
      setPipelineCount(pipeline.length);
      const entries = await Promise.all(
        projs.map((p: Project) =>
          apiFetch(`/tenants/${TENANT_ID}/projects/${p.id}/budget/`).catch(() => [])
        )
      );
      setAllEntries(entries.flat());
      setLoading(false);
    });
  }, [router]);

  const today = new Date().toISOString().slice(0, 10);

  const filteredTasks = selectedProject === "all" ? allTasks : allTasks.filter(t => t.project_id === selectedProject);
  const filteredEntries = selectedProject === "all" ? allEntries : allEntries.filter(e => e.project_id === selectedProject);

  const done = filteredTasks.filter(t => t.status === "done").length;
  const inProgress = filteredTasks.filter(t => t.status === "in_progress").length;
  const overdueList = filteredTasks.filter(t => t.end_date && t.end_date.slice(0, 10) < today && t.status !== "done");
  const total = filteredTasks.length;

  const totalPlanned = filteredEntries.filter(e => e.is_planned === 1).reduce((s, e) => s + e.amount, 0);
  const totalActual = filteredEntries.filter(e => e.is_planned === 0).reduce((s, e) => s + e.amount, 0);
  const budgetDelta = totalPlanned - totalActual;

  // Category map for pie + bars
  const catMap: Record<string, { planned: number; actual: number }> = {};
  for (const e of filteredEntries) {
    if (!catMap[e.category]) catMap[e.category] = { planned: 0, actual: 0 };
    if (e.is_planned) catMap[e.category].planned += e.amount;
    else catMap[e.category].actual += e.amount;
  }
  const catEntries = Object.entries(catMap).sort((a, b) => (b[1].planned + b[1].actual) - (a[1].planned + a[1].actual));
  const maxCatVal = Math.max(...catEntries.map(([, v]) => Math.max(v.planned, v.actual)), 1);

  // Pie slices — actual expenses by category (non-zero)
  const pieSlices = catEntries
    .filter(([, v]) => v.actual > 0)
    .map(([cat, v], i) => ({ label: cat, value: v.actual, color: PIE_COLORS[i % PIE_COLORS.length] }));

  function fmt(n: number) {
    if (n >= 1_000_000) return "₪" + (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return "₪" + Math.round(n / 1_000) + "K";
    return "₪" + Math.round(n);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";

  const cards = !loading ? [
    { label: "פרויקטים", value: projects.length, href: "/projects", color: "#011e41", sub: null },
    { label: "משימות פעילות", value: inProgress, href: "/projects", color: "#2980b9", sub: `${done} הושלמו` },
    { label: "משימות באיחור", value: overdueList.length, href: "/tasks", color: overdueList.length > 0 ? "#c0392b" : "#7f8c8d", sub: overdueList.length > 0 ? "דורש טיפול" : "הכל בסדר" },
    { label: "מסמכים פגי תוקף", value: expiringCount, href: "/documents", color: expiringCount > 0 ? "#e67e22" : "#7f8c8d", sub: expiringCount > 0 ? "לחידוש" : "הכל תקין" },
    { label: "מיילים ממתינים", value: pipelineCount, href: "/pipeline", color: pipelineCount > 0 ? "#a4742d" : "#7f8c8d", sub: pipelineCount > 0 ? "לאישור" : "אין חדש" },
  ] : [];

  return (
    <div dir="rtl">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>
            {greeting}{userName ? `, ${userName}` : ""}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            סקירה כללית — {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
        >
          <option value="all">כל הפרויקטים</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-4">
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

            {/* Budget summary card */}
            {(totalPlanned > 0 || totalActual > 0) && (
              <a
                href="/budget"
                className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100 col-span-2 lg:col-span-1"
                style={{ borderRight: "4px solid #011e41" }}
              >
                <div className="text-xs text-gray-400 mb-2 font-medium">תקציב</div>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-xs text-gray-400">מתוכנן</div>
                    <div className="text-lg font-bold" style={{ color: "#2980b9" }}>{fmt(totalPlanned)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">בפועל</div>
                    <div className="text-lg font-bold" style={{ color: "#27ae60" }}>{fmt(totalActual)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">יתרה</div>
                    <div className="text-lg font-bold" style={{ color: budgetDelta >= 0 ? "#011e41" : "#c0392b" }}>
                      {fmt(Math.abs(budgetDelta))}
                      <span className="text-xs font-normal mr-0.5">{budgetDelta >= 0 ? "✓" : "⚠"}</span>
                    </div>
                  </div>
                </div>
                {totalPlanned > 0 && (
                  <div className="mt-3 w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (totalActual / totalPlanned) * 100)}%`,
                        background: totalActual > totalPlanned ? "#c0392b" : "#27ae60",
                      }}
                    />
                  </div>
                )}
              </a>
            )}
          </div>

          {/* Task progress chart */}
          {total > 0 && (() => {
            const bars = [
              { label: "הושלם", count: done, color: "#27ae60" },
              { label: "בעבודה", count: inProgress, color: "#2980b9" },
              { label: "באיחור", count: overdueList.length, color: "#c0392b" },
              { label: "שאר", count: Math.max(0, total - done - inProgress), color: "#e0e0e0" },
            ];
            const donePct = Math.round((done / total) * 100);
            return (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold" style={{ color: "#011e41" }}>התקדמות משימות</span>
                  <span className="text-sm font-bold" style={{ color: "#27ae60" }}>{donePct}% הושלמו</span>
                </div>
                <div className="w-full h-4 rounded-full overflow-hidden bg-gray-100 flex mb-3">
                  {bars.filter(b => b.count > 0).map(b => (
                    <div
                      key={b.label}
                      style={{ width: `${(b.count / total) * 100}%`, background: b.color }}
                      title={`${b.label}: ${b.count}`}
                    />
                  ))}
                </div>
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

          {/* Budget pie + bars */}
          {(totalPlanned > 0 || totalActual > 0) && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <span className="text-sm font-semibold" style={{ color: "#011e41" }}>תקציב לפי קטגוריה</span>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#dbeafe" }} />
                    מתוכנן: {fmt(totalPlanned)}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#27ae60" }} />
                    בפועל: {fmt(totalActual)}
                  </span>
                </div>
              </div>

              {/* Pie + legend side by side */}
              {pieSlices.length > 0 && (
                <div className="flex gap-6 items-center mb-5 flex-wrap">
                  <PieChart slices={pieSlices} />
                  <div className="flex flex-col gap-1.5">
                    {pieSlices.map(s => {
                      const pct = Math.round((s.value / pieSlices.reduce((a, b) => a + b.value, 0)) * 100);
                      return (
                        <div key={s.label} className="flex items-center gap-2 text-xs text-gray-600">
                          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                          <span className="min-w-16">{s.label}</span>
                          <span className="text-gray-400">{fmt(s.value)}</span>
                          <span className="font-medium" style={{ color: s.color }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Usage bar */}
              {totalPlanned > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>ניצול תקציב כולל</span>
                    <span style={{ color: totalActual > totalPlanned ? "#c0392b" : "#27ae60" }}>
                      {Math.round((totalActual / totalPlanned) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (totalActual / totalPlanned) * 100)}%`,
                        background: totalActual > totalPlanned ? "#c0392b" : "#27ae60",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Per-category bars */}
              {catEntries.length > 0 && (
                <div className="space-y-2.5 mt-3">
                  {catEntries.slice(0, 6).map(([cat, vals]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{cat}</span>
                        <span>{fmt(vals.actual)} / {fmt(vals.planned)}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className="absolute h-full rounded-full"
                          style={{ width: `${(vals.planned / maxCatVal) * 100}%`, background: "#dbeafe" }}
                        />
                        <div
                          className="absolute h-full rounded-full"
                          style={{ width: `${(vals.actual / maxCatVal) * 100}%`, background: "#27ae60" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Overdue tasks */}
          {overdueList.length > 0 && (
            <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 flex items-center gap-2">
                <span className="text-sm font-semibold text-red-600">משימות באיחור</span>
                <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5">{overdueList.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {overdueList.slice(0, 5).map(task => {
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
                {overdueList.length > 5 && (
                  <a href="/tasks" className="block px-5 py-2 text-xs text-center text-gray-400 hover:text-gray-600">
                    + עוד {overdueList.length - 5} משימות באיחור
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
