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

// Israeli holidays 5785-5786 (2025-2026)
const HOLIDAYS: Record<string, string> = {
  "2025-04-12": "שבת הגדול",
  "2025-04-13": "ערב פסח",
  "2025-04-14": "פסח א׳",
  "2025-04-15": "פסח ב׳",
  "2025-04-20": "פסח ז׳",
  "2025-04-21": "פסח ח׳ / אחרון של פסח",
  "2025-05-01": "ל״ג בעומר",
  "2025-05-02": "יום העצמאות",
  "2025-05-26": "ערב שבועות",
  "2025-05-27": "שבועות",
  "2025-07-13": "י״ז בתמוז (צום)",
  "2025-08-04": "תשעה באב (צום)",
  "2025-09-22": "ערב ראש השנה",
  "2025-09-23": "ראש השנה א׳",
  "2025-09-24": "ראש השנה ב׳",
  "2025-09-25": "צום גדליה",
  "2025-10-01": "ערב יום כיפור",
  "2025-10-02": "יום כיפור",
  "2025-10-06": "ערב סוכות",
  "2025-10-07": "סוכות א׳",
  "2025-10-08": "סוכות ב׳",
  "2025-10-13": "הושענא רבה",
  "2025-10-14": "שמיני עצרת / שמחת תורה",
  "2025-12-14": "חנוכה א׳",
  "2025-12-15": "חנוכה ב׳",
  "2025-12-16": "חנוכה ג׳",
  "2025-12-17": "חנוכה ד׳",
  "2025-12-18": "חנוכה ה׳",
  "2025-12-19": "חנוכה ו׳",
  "2025-12-20": "חנוכה ז׳",
  "2025-12-21": "חנוכה ח׳",
  "2026-01-13": "ט״ו בשבט",
  "2026-03-04": "פורים",
  "2026-03-05": "שושן פורים",
  "2026-03-29": "ערב פסח",
  "2026-03-30": "פסח א׳",
  "2026-03-31": "פסח ב׳",
  "2026-04-05": "פסח ז׳",
  "2026-04-06": "פסח ח׳ / אחרון של פסח",
  "2026-04-27": "יום הזיכרון",
  "2026-04-28": "יום העצמאות",
  "2026-05-12": "ל״ג בעומר",
  "2026-05-18": "ערב שבועות",
  "2026-05-19": "שבועות א׳",
  "2026-05-20": "שבועות ב׳",
};

interface Task {
  id: string; title: string; status: string; priority: string;
  project_id?: string; stage_id?: string; end_date?: string; start_date?: string;
}
interface Project { id: string; name: string; }

const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function getHebrewDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat("he-u-ca-hebrew", { day: "numeric", month: "long" }).format(date);
  } catch {
    return "";
  }
}

function getHebrewMonthYear(date: Date): string {
  try {
    return new Intl.DateTimeFormat("he-u-ca-hebrew", { month: "long", year: "numeric" }).format(date);
  } catch {
    return "";
  }
}

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

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const firstDate = new Date(year, month, 1);
  const monthName = firstDate.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const hebrewMonthYear = getHebrewMonthYear(firstDate);
  const firstDay = firstDate.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const agendaTasks = filtered
    .filter(t => t.end_date && t.end_date.slice(0, 10) >= monthStart && t.end_date.slice(0, 10) <= monthEnd)
    .sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));

  // Also add holidays to agenda
  const agendaHolidays = Object.entries(HOLIDAYS)
    .filter(([d]) => d >= monthStart && d <= monthEnd)
    .sort(([a], [b]) => a.localeCompare(b));

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
          <p className="text-sm text-gray-400 mt-0.5">משימות + חגים לפי תאריך</p>
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
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">→</button>
        <div className="min-w-52 text-center">
          <div className="text-base font-semibold" style={{ color: "#011e41" }}>{monthName}</div>
          {hebrewMonthYear && (
            <div className="text-xs text-gray-400">{hebrewMonthYear}</div>
          )}
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">←</button>
        <button
          onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-500 hover:bg-gray-50"
        >
          היום
        </button>
        {/* Legend */}
        <div className="flex gap-3 mr-auto text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-amber-400" />חג</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-blue-400" />משימה</span>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : view === "month" ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Day names header */}
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center py-2 text-xs font-semibold text-gray-400">{d}</div>
            ))}
          </div>
          {/* Weeks */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="min-h-28 border-r border-b border-gray-100 bg-gray-50/30" />;
              const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dayStr === todayStr;
              const isSaturday = new Date(year, month, day).getDay() === 6;
              const dayTasks = tasksOnDay(year, month, day);
              const holiday = HOLIDAYS[dayStr];
              const hebrewDay = getHebrewDate(new Date(year, month, day));

              return (
                <div
                  key={day}
                  className="min-h-28 border-r border-b border-gray-100 p-1"
                  style={{
                    background: isToday ? "#eff6ff" : holiday ? "#fffbeb" : isSaturday ? "#fafafa" : "white",
                  }}
                >
                  {/* Date numbers */}
                  <div className="flex items-start justify-between mb-0.5">
                    <div
                      className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full`}
                      style={{
                        background: isToday ? "#011e41" : "transparent",
                        color: isToday ? "#fff" : isSaturday ? "#2980b9" : "#555",
                      }}
                    >
                      {day}
                    </div>
                    {hebrewDay && (
                      <div className="text-xs text-gray-300 leading-none mt-1">{hebrewDay.split(" ")[0]}</div>
                    )}
                  </div>

                  {/* Holiday */}
                  {holiday && (
                    <div className="text-xs px-1 py-0.5 rounded mb-0.5 truncate font-medium"
                      style={{ background: "#fef3c7", color: "#92400e" }}>
                      ✡ {holiday}
                    </div>
                  )}

                  {/* Tasks */}
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 2).map(t => (
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
                    {dayTasks.length > 2 && (
                      <div className="text-xs text-gray-400 px-1">+{dayTasks.length - 2} עוד</div>
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
          {agendaTasks.length === 0 && agendaHolidays.length === 0 ? (
            <div className="text-center py-16 text-gray-400">אין פריטים החודש</div>
          ) : (() => {
            // Merge tasks + holidays by date
            type AgendaItem = { date: string; type: "task" | "holiday"; task?: Task; holiday?: string };
            const items: AgendaItem[] = [
              ...agendaTasks.map(t => ({ date: t.end_date!.slice(0, 10), type: "task" as const, task: t })),
              ...agendaHolidays.map(([d, h]) => ({ date: d, type: "holiday" as const, holiday: h })),
            ].sort((a, b) => a.date.localeCompare(b.date));

            let lastDate = "";
            return items.map((item, idx) => {
              const d = new Date(item.date + "T12:00:00");
              const showHeader = item.date !== lastDate;
              if (showHeader) lastDate = item.date;
              const isOverdue = item.type === "task" && item.task!.end_date && item.task!.end_date.slice(0, 10) < todayStr && item.task!.status !== "done";

              return (
                <div key={`${item.type}-${item.date}-${idx}`}>
                  {showHeader && (
                    <div className="flex items-center gap-3 mt-4 mb-1 first:mt-0">
                      <div className="text-center flex-shrink-0 w-12">
                        <div className="text-lg font-bold" style={{ color: "#011e41" }}>{d.getDate()}</div>
                        <div className="text-xs text-gray-400">{d.toLocaleDateString("he-IL", { weekday: "short", month: "short" })}</div>
                      </div>
                      <div className="text-xs text-gray-300">{getHebrewDate(d)}</div>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  )}
                  {item.type === "holiday" ? (
                    <div className="flex items-center gap-4 rounded-xl px-5 py-2.5 mr-14"
                      style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                      <span className="text-sm">✡</span>
                      <span className="font-medium text-sm" style={{ color: "#92400e" }}>{item.holiday}</span>
                    </div>
                  ) : (
                    <a
                      href={item.task!.project_id ? `/projects/${item.task!.project_id}` : "#"}
                      className="flex items-center gap-4 bg-white rounded-xl px-5 py-2.5 shadow-sm hover:shadow-md transition-shadow border border-transparent hover:border-gray-100 mr-14"
                      style={{ textDecoration: "none" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm" style={{ color: isOverdue ? "#c0392b" : "#011e41" }}>{item.task!.title}</div>
                        {item.task!.project_id && projectMap[item.task!.project_id] && (
                          <div className="text-xs text-gray-400 mt-0.5">{projectMap[item.task!.project_id]}</div>
                        )}
                      </div>
                      <span
                        className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                        style={{ background: (STATUS_COLORS[item.task!.status] || "#aaa") + "20", color: STATUS_COLORS[item.task!.status] || "#aaa" }}
                      >
                        {STATUS_LABELS[item.task!.status] || item.task!.status}
                      </span>
                      {isOverdue && <span className="text-xs text-red-500 flex-shrink-0">באיחור</span>}
                    </a>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
