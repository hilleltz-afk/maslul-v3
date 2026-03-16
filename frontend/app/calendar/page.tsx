"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

const STATUS_COLORS: Record<string, string> = {
  todo:        "#7f8c8d",
  in_progress: "#2980b9",
  done:        "#27ae60",
  blocked:     "#c0392b",
  review:      "#8e44ad",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "לביצוע", in_progress: "בעבודה", done: "הושלם", blocked: "חסום", review: "לבדיקה",
};

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  project_id?: string;
  stage_id?: string;
  end_date?: string;
  start_date?: string;
}
interface Project { id: string; name: string; }

const DAY_NAMES = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export default function CalendarPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [projectFilter, setProjectFilter] = useState("all");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/tasks/`),
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
    ]).then(([t, p]) => {
      setTasks(t);
      setProjects(p);
    }).catch(console.error).finally(() => setLoading(false));
  }, [router]);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  const filtered = tasks.filter(t => {
    if (projectFilter !== "all" && t.project_id !== projectFilter) return false;
    return true;
  });

  // Tasks that fall within a given day (by end_date)
  function tasksOnDay(y: number, m: number, d: number): Task[] {
    const dayStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return filtered.filter(t => t.end_date?.slice(0, 10) === dayStr);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const monthName = new Date(year, month, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Agenda: tasks with end_date in this month, sorted by date
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const agendaTasks = filtered
    .filter(t => t.end_date && t.end_date.slice(0, 10) >= monthStart && t.end_date.slice(0, 10) <= monthEnd)
    .sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));

  // Build calendar grid (6 rows × 7 cols)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>לוח שנה</h1>
          <p className="text-sm text-gray-400 mt-0.5">משימות לפי תאריך יעד</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">כל הפרויקטים</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {(["month", "agenda"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1 rounded-md text-sm transition-colors"
                style={{ background: view === v ? "#011e41" : "transparent", color: view === v ? "#fff" : "#555" }}
              >
                {v === "month" ? "חודש" : "אג׳נדה"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">→</button>
        <span className="text-base font-semibold min-w-40 text-center" style={{ color: "#011e41" }}>{monthName}</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">←</button>
        <button
          onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-500 hover:bg-gray-50"
        >
          היום
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : view === "month" ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Day names header */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center py-2 text-xs font-semibold text-gray-400">{d}</div>
            ))}
          </div>
          {/* Weeks */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="min-h-24 border-r border-b border-gray-100 bg-gray-50/40" />;
              const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dayStr === todayStr;
              const dayTasks = tasksOnDay(year, month, day);
              return (
                <div
                  key={day}
                  className="min-h-24 border-r border-b border-gray-100 p-1.5"
                  style={{ background: isToday ? "#eff6ff" : "white" }}
                >
                  <div
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? "text-white" : "text-gray-500"}`}
                    style={{ background: isToday ? "#011e41" : "transparent" }}
                  >
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <a
                        key={t.id}
                        href={t.project_id ? `/projects/${t.project_id}` : "#"}
                        className="block text-xs px-1.5 py-0.5 rounded truncate"
                        style={{ background: (STATUS_COLORS[t.status] || "#aaa") + "25", color: STATUS_COLORS[t.status] || "#555" }}
                        title={t.title}
                      >
                        {t.title}
                      </a>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-xs text-gray-400 px-1">+{dayTasks.length - 3} עוד</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda view */
        <div className="space-y-2">
          {agendaTasks.length === 0 ? (
            <div className="text-center py-16 text-gray-400">אין משימות עם תאריך יעד החודש</div>
          ) : (
            agendaTasks.map(t => {
              const color = STATUS_COLORS[t.status] || "#aaa";
              const isOverdue = t.end_date && t.end_date.slice(0, 10) < todayStr && t.status !== "done";
              return (
                <a
                  key={t.id}
                  href={t.project_id ? `/projects/${t.project_id}` : "#"}
                  className="flex items-center gap-4 bg-white rounded-xl px-5 py-3 shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-gray-100"
                  style={{ textDecoration: "none" }}
                >
                  <div
                    className="w-10 text-center flex-shrink-0"
                  >
                    <div className="text-lg font-bold" style={{ color: isOverdue ? "#c0392b" : "#011e41" }}>
                      {t.end_date ? new Date(t.end_date).getDate() : "—"}
                    </div>
                    <div className="text-xs text-gray-400">
                      {t.end_date ? new Date(t.end_date).toLocaleDateString("he-IL", { month: "short" }) : ""}
                    </div>
                  </div>
                  <div className="w-px self-stretch bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: "#011e41" }}>{t.title}</div>
                    {t.project_id && projectMap[t.project_id] && (
                      <div className="text-xs text-gray-400 mt-0.5">📁 {projectMap[t.project_id]}</div>
                    )}
                  </div>
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                    style={{ background: color + "20", color }}
                  >
                    {STATUS_LABELS[t.status] || t.status}
                  </span>
                </a>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
