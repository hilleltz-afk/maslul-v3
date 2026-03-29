"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { apiFetch, apiUpload, API_BASE } from "@/lib/api";

const TENANT_ID = getTenantId();

const BUDGET_CATEGORIES = ["מגרש","תכנון","היתרים","בנייה","תשתיות","פיקוח","משפטי","שיווק","אחר"];

interface Project { id: string; name: string; budget_total?: number; }
interface Stage { id: string; name: string; project_id: string; }
interface Task { id: string; project_id: string; stage_id: string; title: string; end_date?: string; }
interface BudgetEntry { id: string; project_id: string; category: string; description: string; vendor?: string; amount: number; entry_date?: string; is_planned: number; }
interface Milestone {
  id: string;
  quote_id: string;
  project_id?: string;
  task_id?: string;
  description: string;
  amount: number;
  percentage?: number;
  order: number;
  due_date?: string;
  is_paid: number;
  paid_at?: string;
  paid_amount?: number;
}
interface Quote { id: string; project_id?: string; vendor?: string; title: string; total_amount?: number; pdf_filename?: string; status: string; notes?: string; created_at: string; milestones: Milestone[]; }

type Tab = "dashboard" | "quotes";
type Slice = "monthly" | "quarterly" | "annual";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending_review: { label: "ממתין לאישור", color: "#e67e22" },
  approved: { label: "מאושר", color: "#27ae60" },
  rejected: { label: "נדחה", color: "#c0392b" },
};

function fmt(n: number) {
  return "₪" + Math.round(n).toLocaleString("he-IL");
}

function fmtDate(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("he-IL");
}

function sliceLabel(s: Slice) {
  return s === "monthly" ? "חודשי" : s === "quarterly" ? "רבעוני" : "שנתי";
}

function getQuarterKey(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function getMonthKey(d: Date): string {
  return d.toLocaleDateString("he-IL", { year: "numeric", month: "long" });
}

function getYearKey(d: Date): string {
  return String(d.getFullYear());
}

export default function BudgetPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  // Dashboard filters
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [slice, setSlice] = useState<Slice>("quarterly");

  // Quote upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quote detail expand
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);

  // "Mark as paid" inline state: key = milestone id
  const [payingMs, setPayingMs] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");

  // Task-link saving state: key = milestone id
  const [savingTaskLink, setSavingTaskLink] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const projs: Project[] = await apiFetch(`/tenants/${TENANT_ID}/projects/`);
      setProjects(projs);

      // Parallel: budget entries, quotes, stages, tasks
      const [allEntriesArr, quotesData, stagesData, tasksData] = await Promise.all([
        Promise.all(projs.map(p =>
          apiFetch(`/tenants/${TENANT_ID}/projects/${p.id}/budget/`).catch(() => [])
        )),
        apiFetch(`/tenants/${TENANT_ID}/quotes/`).catch(() => []),
        apiFetch(`/tenants/${TENANT_ID}/stages/`).catch(() => []),
        Promise.all(projs.map(p =>
          apiFetch(`/tenants/${TENANT_ID}/tasks/?project_id=${p.id}`).catch(() => [])
        )),
      ]);

      setEntries((allEntriesArr as BudgetEntry[][]).flat());
      setQuotes(quotesData as Quote[]);
      setStages(stagesData as Stage[]);
      setTasks((tasksData as Task[][]).flat());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadProjectId) {
      setUploadError("יש לבחור פרויקט לפני העלאה");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload(`/tenants/${TENANT_ID}/quotes/upload?project_id=${uploadProjectId}`, fd);
      await loadAll();
    } catch (err: any) {
      setUploadError(err.message || "שגיאה בהעלאה");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function markMilestonePaid(quote: Quote, ms: Milestone, amount: number) {
    try {
      const updated = await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_paid: 1, paid_amount: amount }),
      });
      setQuotes(prev => prev.map(q =>
        q.id === quote.id
          ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, is_paid: 1, paid_amount: amount } : m) }
          : q
      ));
    } catch (err: any) {
      alert(err.message);
    }
    setPayingMs(null);
    setPayAmount("");
  }

  async function unmarkMilestonePaid(quote: Quote, ms: Milestone) {
    try {
      await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_paid: 0, paid_amount: null }),
      });
      setQuotes(prev => prev.map(q =>
        q.id === quote.id
          ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, is_paid: 0, paid_amount: undefined } : m) }
          : q
      ));
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function linkMilestoneTask(quote: Quote, ms: Milestone, taskId: string) {
    setSavingTaskLink(ms.id);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
        method: "PUT",
        body: JSON.stringify({ task_id: taskId || null }),
      });
      setQuotes(prev => prev.map(q =>
        q.id === quote.id
          ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, task_id: taskId || undefined } : m) }
          : q
      ));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingTaskLink(null);
    }
  }

  async function updateQuoteStatus(quoteId: string, newStatus: string) {
    try {
      await apiFetch(`/tenants/${TENANT_ID}/quotes/${quoteId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: newStatus } : q));
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function deleteQuote(quoteId: string) {
    if (!confirm("למחוק הצעת מחיר זו?")) return;
    try {
      await apiFetch(`/tenants/${TENANT_ID}/quotes/${quoteId}`, { method: "DELETE" });
      setQuotes(prev => prev.filter(q => q.id !== quoteId));
    } catch (err: any) {
      alert(err.message);
    }
  }

  // --- Helpers ---
  const projectName = (id?: string) => projects.find(p => p.id === id)?.name || "—";

  const taskMap: Record<string, Task> = {};
  for (const t of tasks) taskMap[t.id] = t;

  const stageMap: Record<string, Stage> = {};
  for (const s of stages) stageMap[s.id] = s;

  // Effective date for a milestone: task.end_date if linked, else milestone.due_date
  function effectiveDate(ms: Milestone): string | undefined {
    if (ms.task_id && taskMap[ms.task_id]?.end_date) return taskMap[ms.task_id].end_date;
    return ms.due_date;
  }

  // --- Dashboard calculations ---
  const filteredEntries = selectedProject === "all"
    ? entries
    : entries.filter(e => e.project_id === selectedProject);

  const totalPlanned = filteredEntries.filter(e => e.is_planned === 1).reduce((s, e) => s + e.amount, 0);
  const totalActual = filteredEntries.filter(e => e.is_planned === 0).reduce((s, e) => s + e.amount, 0);

  const allMilestones = quotes.flatMap(q => q.milestones.map(m => ({ ...m, quoteTitle: q.title })));
  const milestonesFiltered = selectedProject === "all"
    ? allMilestones
    : allMilestones.filter(m => m.project_id === selectedProject);

  const paidMilestoneAmount = milestonesFiltered
    .filter(m => m.is_paid === 1)
    .reduce((s, m) => s + (m.paid_amount ?? m.amount), 0);
  const unpaidMilestoneAmount = milestonesFiltered
    .filter(m => m.is_paid === 0)
    .reduce((s, m) => s + m.amount, 0);

  // Upcoming unpaid milestones (next 90 days)
  const today = new Date();
  const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const upcomingMilestones = milestonesFiltered
    .filter(m => m.is_paid === 0 && effectiveDate(m as Milestone))
    .filter(m => new Date(effectiveDate(m as Milestone)!) <= in90)
    .sort((a, b) => new Date(effectiveDate(a as Milestone)!).getTime() - new Date(effectiveDate(b as Milestone)!).getTime());

  // Category breakdown
  const catMap: Record<string, { planned: number; actual: number }> = {};
  for (const e of filteredEntries) {
    if (!catMap[e.category]) catMap[e.category] = { planned: 0, actual: 0 };
    if (e.is_planned) catMap[e.category].planned += e.amount;
    else catMap[e.category].actual += e.amount;
  }

  // Per-project summary
  const projectSummary = projects.map(p => {
    const pe = entries.filter(e => e.project_id === p.id);
    const planned = pe.filter(e => e.is_planned === 1).reduce((s, e) => s + e.amount, 0);
    const actual = pe.filter(e => e.is_planned === 0).reduce((s, e) => s + e.amount, 0);
    const milestonesTotal = quotes.flatMap(q => q.milestones).filter(m => m.project_id === p.id).reduce((s, m) => s + m.amount, 0);
    return { ...p, planned, actual, milestonesTotal };
  }).filter(p => p.planned > 0 || p.actual > 0 || p.milestonesTotal > 0);

  // Projection: group unpaid milestones by period
  const projectionMap: Record<string, number> = {};
  for (const m of milestonesFiltered) {
    if (m.is_paid === 1) continue;
    const d = effectiveDate(m as Milestone);
    if (!d) continue;
    const date = new Date(d);
    const key = slice === "monthly" ? getMonthKey(date) : slice === "quarterly" ? getQuarterKey(date) : getYearKey(date);
    projectionMap[key] = (projectionMap[key] || 0) + m.amount;
  }
  const projectionRows = Object.entries(projectionMap).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>תקציב</h1>
            <p className="text-sm text-gray-500 mt-0.5">ניהול תקציב, הצעות מחיר ואבני דרך לתשלום</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 items-center">
          {(["dashboard", "quotes"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-2.5 text-sm font-medium transition-colors relative"
              style={{
                color: tab === t ? "#011e41" : "#888",
                borderBottom: tab === t ? "2px solid #011e41" : "2px solid transparent",
              }}
            >
              {t === "dashboard" ? "דשבורד תקציב" : "הצעות מחיר"}
            </button>
          ))}
          <a
            href={`${API_BASE}/tenants/${TENANT_ID}/budget/export`}
            className="mr-auto text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            download
          >
            יצא Excel
          </a>
        </div>

        {loading && <div className="text-center py-20 text-gray-400">טוען...</div>}

        {/* ===== DASHBOARD TAB ===== */}
        {!loading && tab === "dashboard" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="all">כל הפרויקטים</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
                {(["monthly", "quarterly", "annual"] as Slice[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSlice(s)}
                    className="px-3 py-1 rounded-md text-sm transition-colors"
                    style={{
                      background: slice === s ? "#011e41" : "transparent",
                      color: slice === s ? "#fff" : "#555",
                    }}
                  >
                    {sliceLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "תקציב מתוכנן", value: totalPlanned, color: "#2980b9" },
                { label: "הוצאות בפועל", value: totalActual, color: "#27ae60" },
                { label: "יתרה", value: totalPlanned - totalActual, color: totalPlanned - totalActual >= 0 ? "#011e41" : "#c0392b" },
                { label: "תשלומים עתידיים", value: unpaidMilestoneAmount, color: "#e67e22" },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                  <div className="text-xl font-bold" style={{ color: c.color }}>{fmt(c.value)}</div>
                </div>
              ))}
            </div>

            {/* Projection by period */}
            {projectionRows.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 font-medium text-sm flex items-center justify-between" style={{ color: "#011e41" }}>
                  <span>תחזית תשלומים — {sliceLabel(slice)}</span>
                  <span className="text-xs text-gray-400 font-normal">לפי תאריך משימה / תאריך יעד</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-right px-5 py-2 font-medium">תקופה</th>
                      <th className="text-right px-5 py-2 font-medium">סה"כ לתשלום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectionRows.map(([period, amount]) => (
                      <tr key={period} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-2.5 font-medium">{period}</td>
                        <td className="px-5 py-2.5 text-orange-600 font-semibold">{fmt(amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Category breakdown */}
            {Object.keys(catMap).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 font-medium text-sm" style={{ color: "#011e41" }}>
                  פירוט לפי קטגוריה
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-right px-5 py-2 font-medium">קטגוריה</th>
                      <th className="text-right px-5 py-2 font-medium">מתוכנן</th>
                      <th className="text-right px-5 py-2 font-medium">בפועל</th>
                      <th className="text-right px-5 py-2 font-medium">הפרש</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(catMap).map(([cat, vals]) => (
                      <tr key={cat} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-2.5 font-medium">{cat}</td>
                        <td className="px-5 py-2.5 text-blue-600">{fmt(vals.planned)}</td>
                        <td className="px-5 py-2.5 text-green-600">{fmt(vals.actual)}</td>
                        <td className="px-5 py-2.5" style={{ color: vals.planned - vals.actual >= 0 ? "#011e41" : "#c0392b" }}>
                          {fmt(vals.planned - vals.actual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-project summary */}
            {projectSummary.length > 1 && selectedProject === "all" && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 font-medium text-sm" style={{ color: "#011e41" }}>
                  סיכום לפי פרויקט
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-right px-5 py-2 font-medium">פרויקט</th>
                      <th className="text-right px-5 py-2 font-medium">מתוכנן</th>
                      <th className="text-right px-5 py-2 font-medium">בפועל</th>
                      <th className="text-right px-5 py-2 font-medium">הצעות מחיר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectSummary.map(p => (
                      <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-2.5 font-medium">{p.name}</td>
                        <td className="px-5 py-2.5 text-blue-600">{fmt(p.planned)}</td>
                        <td className="px-5 py-2.5 text-green-600">{fmt(p.actual)}</td>
                        <td className="px-5 py-2.5 text-orange-500">{fmt(p.milestonesTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Upcoming milestones */}
            {upcomingMilestones.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 font-medium text-sm" style={{ color: "#011e41" }}>
                  תשלומים קרובים (90 יום)
                </div>
                <div className="divide-y divide-gray-50">
                  {upcomingMilestones.map(m => {
                    const d = effectiveDate(m as Milestone)!;
                    const daysLeft = Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000);
                    const linkedTask = m.task_id ? taskMap[m.task_id] : null;
                    return (
                      <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{m.description}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {(m as any).quoteTitle}
                            {linkedTask && <span className="mr-2 text-blue-400">• {linkedTask.title}</span>}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-sm" style={{ color: "#e67e22" }}>{fmt(m.amount)}</div>
                          <div className="text-xs" style={{ color: daysLeft <= 14 ? "#c0392b" : "#888" }}>
                            {fmtDate(d)} ({daysLeft} ימים)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredEntries.length === 0 && milestonesFiltered.length === 0 && (
              <div className="text-center py-20 text-gray-400">אין נתוני תקציב להצגה</div>
            )}
          </div>
        )}

        {/* ===== QUOTES TAB ===== */}
        {!loading && tab === "quotes" && (
          <div className="space-y-4">
            {/* Upload */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
              <div className="text-sm font-medium" style={{ color: "#011e41" }}>העלאת הצעת מחיר (PDF)</div>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">פרויקט <span className="text-red-400">*</span></label>
                  <select
                    value={uploadProjectId}
                    onChange={e => { setUploadProjectId(e.target.value); setUploadError(""); }}
                    className={`border rounded-lg px-3 py-2 text-sm outline-none bg-white ${!uploadProjectId ? "border-red-200" : "border-gray-200"}`}
                  >
                    <option value="">בחר פרויקט...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleUpload}
                />
                <button
                  onClick={() => {
                    if (!uploadProjectId) { setUploadError("יש לבחור פרויקט לפני העלאה"); return; }
                    fileInputRef.current?.click();
                  }}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity"
                  style={{ background: "#011e41", opacity: uploading ? 0.6 : 1 }}
                >
                  {uploading ? "⏳ מנתח PDF..." : "📎 בחר קובץ PDF"}
                </button>
                {uploading && <span className="text-sm text-gray-500">Claude מנתח את ההצעה, אנא המתן...</span>}
              </div>
              {uploadError && <span className="text-sm text-red-600">{uploadError}</span>}
            </div>

            {/* Quotes list */}
            {quotes.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                אין הצעות מחיר עדיין — העלה PDF ו-AI ינתח אותו
              </div>
            ) : (
              <div className="space-y-3">
                {quotes.map(q => {
                  const statusInfo = STATUS_LABEL[q.status] || { label: q.status, color: "#888" };
                  const isExpanded = expandedQuote === q.id;
                  const paidTotal = q.milestones.filter(m => m.is_paid).reduce((s, m) => s + (m.paid_amount ?? m.amount), 0);
                  const unpaidTotal = q.milestones.filter(m => !m.is_paid).reduce((s, m) => s + m.amount, 0);
                  const projectTasks = tasks.filter(t => t.project_id === q.project_id);

                  // Group tasks by stage for dropdown
                  const tasksByStage: Record<string, { stageName: string; tasks: Task[] }> = {};
                  for (const t of projectTasks) {
                    const stage = stageMap[t.stage_id];
                    const stageKey = t.stage_id;
                    if (!tasksByStage[stageKey]) {
                      tasksByStage[stageKey] = { stageName: stage?.name || "קבוצה", tasks: [] };
                    }
                    tasksByStage[stageKey].tasks.push(t);
                  }

                  return (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      {/* Quote header */}
                      <div
                        className="px-5 py-4 cursor-pointer hover:bg-gray-50 flex items-start justify-between gap-4"
                        onClick={() => setExpandedQuote(isExpanded ? null : q.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{q.title}</span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: statusInfo.color + "20", color: statusInfo.color }}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                            {q.vendor && <span>ספק: {q.vendor}</span>}
                            {q.project_id && <span>פרויקט: {projectName(q.project_id)}</span>}
                            <span>{fmtDate(q.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          {q.total_amount != null && (
                            <div className="font-bold text-base" style={{ color: "#011e41" }}>
                              {fmt(q.total_amount)}
                            </div>
                          )}
                          {q.milestones.length > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {q.milestones.length} אבני דרך
                            </div>
                          )}
                        </div>
                        <span className="text-gray-400 text-xs mt-1">{isExpanded ? "▲" : "▼"}</span>
                      </div>

                      {/* Expanded */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                          {/* Actions */}
                          <div className="flex gap-2 flex-wrap">
                            {q.status === "pending_review" && (
                              <>
                                <button
                                  onClick={() => updateQuoteStatus(q.id, "approved")}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                  style={{ background: "#27ae6020", color: "#27ae60" }}
                                >
                                  אשר הצעה
                                </button>
                                <button
                                  onClick={() => updateQuoteStatus(q.id, "rejected")}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                  style={{ background: "#c0392b20", color: "#c0392b" }}
                                >
                                  דחה הצעה
                                </button>
                              </>
                            )}
                            {q.status !== "pending_review" && (
                              <button
                                onClick={() => updateQuoteStatus(q.id, "pending_review")}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                style={{ background: "#e67e2220", color: "#e67e22" }}
                              >
                                החזר לסקירה
                              </button>
                            )}
                            <button
                              onClick={() => deleteQuote(q.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: "#f5f5f5", color: "#999" }}
                            >
                              מחק
                            </button>
                          </div>

                          {/* Milestones */}
                          {q.milestones.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-gray-600 mb-2">אבני דרך לתשלום</div>
                              <div className="space-y-2">
                                {[...q.milestones].sort((a, b) => a.order - b.order).map(ms => {
                                  const isPaying = payingMs === ms.id;
                                  const linkedTask = ms.task_id ? taskMap[ms.task_id] : null;

                                  return (
                                    <div
                                      key={ms.id}
                                      className="rounded-lg border text-sm"
                                      style={{
                                        borderColor: ms.is_paid ? "#d1fae5" : "#f0f0f0",
                                        background: ms.is_paid ? "#f0fdf4" : "#fafafa",
                                      }}
                                    >
                                      {/* Main row */}
                                      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {ms.is_paid === 1 && (
                                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#d1fae5", color: "#16a34a" }}>
                                                שולם
                                              </span>
                                            )}
                                            <span style={{ color: ms.is_paid ? "#aaa" : "#333", textDecoration: ms.is_paid ? "line-through" : "none" }}>
                                              {ms.description}
                                            </span>
                                            {ms.percentage != null && (
                                              <span className="text-xs text-gray-400">({ms.percentage}%)</span>
                                            )}
                                          </div>
                                          {/* Task link */}
                                          <div className="flex items-center gap-2 mt-1.5">
                                            <span className="text-xs text-gray-400 shrink-0">משימה:</span>
                                            <select
                                              value={ms.task_id || ""}
                                              disabled={savingTaskLink === ms.id}
                                              onChange={e => linkMilestoneTask(q, ms, e.target.value)}
                                              className="text-xs border border-gray-200 rounded px-2 py-0.5 bg-white max-w-xs"
                                              style={{ opacity: savingTaskLink === ms.id ? 0.5 : 1 }}
                                            >
                                              <option value="">ללא קישור</option>
                                              {Object.values(tasksByStage).map(({ stageName, tasks: stageTasks }) => (
                                                <optgroup key={stageName} label={stageName}>
                                                  {stageTasks.map(t => (
                                                    <option key={t.id} value={t.id}>{t.title}</option>
                                                  ))}
                                                </optgroup>
                                              ))}
                                            </select>
                                            {linkedTask?.end_date && (
                                              <span className="text-xs text-blue-400 shrink-0">
                                                יעד: {fmtDate(linkedTask.end_date)}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Amount + payment */}
                                        <div className="text-left shrink-0">
                                          <div className="font-semibold text-sm" style={{ color: ms.is_paid ? "#16a34a" : "#011e41" }}>
                                            {ms.is_paid && ms.paid_amount != null && ms.paid_amount !== ms.amount
                                              ? <><span className="line-through text-gray-400 text-xs ml-1">{fmt(ms.amount)}</span>{fmt(ms.paid_amount)}</>
                                              : fmt(ms.amount)
                                            }
                                          </div>
                                          {ms.due_date && !ms.task_id && (
                                            <div className="text-xs text-gray-400">{fmtDate(ms.due_date)}</div>
                                          )}
                                          {/* Payment buttons */}
                                          <div className="mt-1.5 flex gap-1.5 justify-end">
                                            {ms.is_paid === 0 && !isPaying && (
                                              <button
                                                onClick={() => { setPayingMs(ms.id); setPayAmount(String(ms.amount)); }}
                                                className="text-xs px-2 py-1 rounded-lg font-medium"
                                                style={{ background: "#27ae6020", color: "#27ae60" }}
                                              >
                                                סמן כשולם
                                              </button>
                                            )}
                                            {ms.is_paid === 1 && (
                                              <button
                                                onClick={() => unmarkMilestonePaid(q, ms)}
                                                className="text-xs px-2 py-1 rounded-lg font-medium"
                                                style={{ background: "#f5f5f5", color: "#999" }}
                                              >
                                                בטל תשלום
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Inline pay form */}
                                      {isPaying && (
                                        <div className="border-t border-gray-100 px-3 py-2.5 flex items-center gap-2 bg-white">
                                          <span className="text-xs text-gray-500 shrink-0">סכום ששולם:</span>
                                          <input
                                            type="number"
                                            value={payAmount}
                                            onChange={e => setPayAmount(e.target.value)}
                                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-28 outline-none"
                                            placeholder={String(ms.amount)}
                                          />
                                          <span className="text-xs text-gray-400">מתוך {fmt(ms.amount)}</span>
                                          <button
                                            onClick={() => markMilestonePaid(q, ms, parseFloat(payAmount) || ms.amount)}
                                            className="text-xs px-3 py-1 rounded-lg text-white font-medium"
                                            style={{ background: "#27ae60" }}
                                          >
                                            אשר
                                          </button>
                                          <button
                                            onClick={() => { setPayingMs(null); setPayAmount(""); }}
                                            className="text-xs px-2 py-1 rounded-lg"
                                            style={{ background: "#f5f5f5", color: "#999" }}
                                          >
                                            ביטול
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex gap-4 mt-2 text-xs">
                                <span className="text-green-600">שולם: {fmt(paidTotal)}</span>
                                <span className="text-orange-500">נותר: {fmt(unpaidTotal)}</span>
                              </div>
                            </div>
                          )}

                          {q.notes && (
                            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                              {q.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
