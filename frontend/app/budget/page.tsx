"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { apiFetch, apiUpload } from "@/lib/api";

const TENANT_ID = getTenantId();

const BUDGET_CATEGORIES = ["מגרש","תכנון","היתרים","בנייה","תשתיות","פיקוח","משפטי","שיווק","אחר"];

interface Project { id: string; name: string; budget_total?: number; }
interface BudgetEntry { id: string; project_id: string; category: string; description: string; vendor?: string; amount: number; entry_date?: string; is_planned: number; }
interface Milestone { id: string; quote_id: string; project_id?: string; description: string; amount: number; due_date?: string; is_paid: number; paid_at?: string; }
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

export default function BudgetPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  // Dashboard filters
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [slice, setSlice] = useState<Slice>("monthly");

  // Quote upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quote detail expand
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const projs: Project[] = await apiFetch(`/tenants/${TENANT_ID}/projects/`);
      setProjects(projs);

      // Fetch budget entries for all projects in parallel
      const allEntries = await Promise.all(
        projs.map(p =>
          apiFetch(`/tenants/${TENANT_ID}/projects/${p.id}/budget/`).catch(() => [])
        )
      );
      setEntries(allEntries.flat());

      const q: Quote[] = await apiFetch(`/tenants/${TENANT_ID}/quotes/`);
      setQuotes(q);
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

  async function toggleMilestonePaid(quote: Quote, ms: Milestone) {
    const newPaid = ms.is_paid === 1 ? 0 : 1;
    try {
      await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_paid: newPaid }),
      });
      setQuotes(prev => prev.map(q =>
        q.id === quote.id
          ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, is_paid: newPaid } : m) }
          : q
      ));
    } catch (err: any) {
      alert(err.message);
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

  // --- Dashboard calculations ---
  const filteredEntries = selectedProject === "all"
    ? entries
    : entries.filter(e => e.project_id === selectedProject);

  const totalPlanned = filteredEntries.filter(e => e.is_planned === 1).reduce((s, e) => s + e.amount, 0);
  const totalActual = filteredEntries.filter(e => e.is_planned === 0).reduce((s, e) => s + e.amount, 0);

  // All milestones from visible quotes
  const allMilestones = quotes.flatMap(q => q.milestones.map(m => ({ ...m, quoteTitle: q.title })));
  const milestonesFiltered = selectedProject === "all"
    ? allMilestones
    : allMilestones.filter(m => m.project_id === selectedProject);

  const totalMilestoneAmount = milestonesFiltered.reduce((s, m) => s + m.amount, 0);
  const paidMilestoneAmount = milestonesFiltered.filter(m => m.is_paid === 1).reduce((s, m) => s + m.amount, 0);
  const unpaidMilestoneAmount = totalMilestoneAmount - paidMilestoneAmount;

  // Upcoming unpaid milestones (next 90 days)
  const today = new Date();
  const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const upcomingMilestones = milestonesFiltered
    .filter(m => m.is_paid === 0 && m.due_date)
    .filter(m => new Date(m.due_date!) <= in90)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

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

  const projectName = (id?: string) => projects.find(p => p.id === id)?.name || "—";

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
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/tenants/${TENANT_ID}/budget/export`}
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
                    const daysLeft = Math.ceil((new Date(m.due_date!).getTime() - today.getTime()) / 86400000);
                    return (
                      <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{m.description}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{(m as any).quoteTitle}</div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-sm" style={{ color: "#e67e22" }}>{fmt(m.amount)}</div>
                          <div className="text-xs" style={{ color: daysLeft <= 14 ? "#c0392b" : "#888" }}>
                            {fmtDate(m.due_date)} ({daysLeft} ימים)
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
                  const paidTotal = q.milestones.filter(m => m.is_paid).reduce((s, m) => s + m.amount, 0);
                  const unpaidTotal = q.milestones.filter(m => !m.is_paid).reduce((s, m) => s + m.amount, 0);

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
                              <div className="space-y-1.5">
                                {q.milestones.map(ms => (
                                  <div
                                    key={ms.id}
                                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                                    style={{ background: ms.is_paid ? "#f0fdf4" : "#fafafa" }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={ms.is_paid === 1}
                                        onChange={() => toggleMilestonePaid(q, ms)}
                                        className="accent-green-600"
                                      />
                                      <span style={{ textDecoration: ms.is_paid ? "line-through" : "none", color: ms.is_paid ? "#aaa" : "#333" }}>
                                        {ms.description}
                                      </span>
                                    </div>
                                    <div className="text-left">
                                      <div className="font-medium text-sm" style={{ color: ms.is_paid ? "#aaa" : "#011e41" }}>
                                        {fmt(ms.amount)}
                                      </div>
                                      {ms.due_date && (
                                        <div className="text-xs text-gray-400">{fmtDate(ms.due_date)}</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
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
