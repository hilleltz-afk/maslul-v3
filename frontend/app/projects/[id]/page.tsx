"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, apiUpload } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

const STATUS_OPTIONS = [
  { value: "todo",        label: "לביצוע",  bg: "#e0e0e0", text: "#555" },
  { value: "in_progress", label: "בעבודה",  bg: "#2980b9", text: "#fff" },
  { value: "done",        label: "הושלם",   bg: "#27ae60", text: "#fff" },
  { value: "blocked",     label: "חסום",    bg: "#c0392b", text: "#fff" },
  { value: "review",      label: "לבדיקה",  bg: "#8e44ad", text: "#fff" },
];

const PRIORITY_OPTIONS = [
  { value: "high",   label: "גבוהה",   color: "#c0392b" },
  { value: "medium", label: "בינונית", color: "#e67e22" },
  { value: "low",    label: "נמוכה",   color: "#27ae60" },
];

const BUDGET_CATEGORIES = ["מגרש","תכנון","היתרים","בנייה","תשתיות","פיקוח","משפטי","שיווק","אחר"];

const GROUP_COLORS = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#011e41"];

interface Task { id: string; title: string; status: string; priority: string; description?: string; assignee_id?: string; contact_id?: string; start_date?: string; end_date?: string; stage_id: string; }
interface Stage { id: string; name: string; color: string; handling_authority: string; }
interface User { id: string; name: string; email: string; }
interface Contact { id: string; name: string; profession?: string; }
interface Project { id: string; name: string; gush: string; helka: string; budget_total?: number; address?: string; }
interface BudgetEntry { id: string; category: string; description: string; vendor?: string; amount: number; entry_date?: string; is_planned: number; notes?: string; }
interface BudgetSummary { category: string; planned: number; actual: number; diff: number; }
interface Comment { id: string; content: string; created_at: string; created_by?: string; }
interface Milestone { id: string; quote_id: string; description: string; amount: number; due_date?: string; is_paid: number; }
interface Quote { id: string; project_id?: string; vendor?: string; title: string; total_amount?: number; pdf_filename?: string; status: string; notes?: string; created_at: string; milestones: Milestone[]; }

const DEFAULT_WIDTHS: Record<string, number> = { title: 300, assignee: 130, contact: 160, status: 140, priority: 110, start_date: 120, end_date: 120, notes: 200 };

type Tab = "tasks" | "gantt" | "budget" | "comments" | "docs";

interface Doc { id: string; name: string; path: string; expiry_date?: string; task_id?: string; project_id?: string; }

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [tab, setTab] = useState<Tab>("tasks");
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTHS;
    try { return JSON.parse(localStorage.getItem(`col_widths_${projectId}`) || "{}") || DEFAULT_WIDTHS; }
    catch { return DEFAULT_WIDTHS; }
  });
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const dragCol = useRef<{ col: string; startX: number; startW: number } | null>(null);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Project settings
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", gush: "", helka: "", address: "", budget_total: "" });
  const [savingProject, setSavingProject] = useState(false);

  // Task detail panel
  const [taskPanel, setTaskPanel] = useState<string | null>(null);

  // Stage editing
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");
  const [dragStageId, setDragStageId] = useState<string | null>(null);
  const [stageMenu, setStageMenu] = useState<string | null>(null);

  // Budget state
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary[]>([]);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({ category: "בנייה", description: "", vendor: "", amount: "", is_planned: "0", notes: "" });
  const [projectQuotes, setProjectQuotes] = useState<Quote[]>([]);
  const [quotesUploading, setQuotesUploading] = useState(false);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const quoteFileRef = useRef<HTMLInputElement>(null);

  // Comments state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Docs state
  const [projectDocs, setProjectDocs] = useState<Doc[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);
  const [taskDocs, setTaskDocs] = useState<Doc[]>([]);
  const [taskDocsUploading, setTaskDocsUploading] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  const taskDocFileRef = useRef<HTMLInputElement>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTaskId, setUploadTaskId] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}`),
      apiFetch(`/tenants/${TENANT_ID}/stages/?project_id=${projectId}`),
      apiFetch(`/tenants/${TENANT_ID}/tasks/?project_id=${projectId}`),
      apiFetch(`/tenants/${TENANT_ID}/users/`),
      apiFetch(`/tenants/${TENANT_ID}/contacts/`).catch(() => []),
    ]).then(([proj, stgs, tsks, usrs, ctcts]) => {
      setProject(proj);
      setTasks(tsks);
      setUsers(usrs);
      setContacts(ctcts);
      // Apply saved stage order
      const savedOrder = localStorage.getItem(`stage_order_${projectId}`);
      if (savedOrder) {
        try {
          const order = JSON.parse(savedOrder) as string[];
          setStages([...stgs].sort((a: Stage, b: Stage) => {
            const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          }));
        } catch { setStages(stgs); }
      } else {
        setStages(stgs);
      }
    }).catch(console.error);
  }, [projectId, router]);

  useEffect(() => {
    if (tab === "budget") loadBudget();
    if (tab === "docs") loadProjectDocs();
  }, [tab]);

  async function loadProjectDocs() {
    const data = await apiFetch(`/tenants/${TENANT_ID}/documents/?project_id=${projectId}`).catch(() => []);
    setProjectDocs(data);
  }

  async function uploadProjectDoc(file: File, taskId?: string) {
    setDocsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      if (taskId) fd.append("task_id", taskId);
      const doc = await apiUpload(`/tenants/${TENANT_ID}/documents/upload`, fd);
      setProjectDocs(prev => [doc, ...prev]);
      setShowUploadForm(false);
      setUploadTaskId("");
    } catch (e: any) {
      alert("שגיאה בהעלאה: " + e.message);
    } finally { setDocsUploading(false); }
  }

  async function deleteDoc(docId: string) {
    await apiFetch(`/tenants/${TENANT_ID}/documents/${docId}`, { method: "DELETE" });
    setProjectDocs(prev => prev.filter(d => d.id !== docId));
    setTaskDocs(prev => prev.filter(d => d.id !== docId));
  }

  async function loadTaskDocs(taskId: string) {
    const data = await apiFetch(`/tenants/${TENANT_ID}/documents/?task_id=${taskId}`).catch(() => []);
    setTaskDocs(data);
  }

  async function uploadTaskDoc(file: File, taskId: string) {
    setTaskDocsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      fd.append("task_id", taskId);
      const doc = await apiUpload(`/tenants/${TENANT_ID}/documents/upload`, fd);
      setTaskDocs(prev => [doc, ...prev]);
    } finally { setTaskDocsUploading(false); }
  }

  useEffect(() => {
    if (!stageMenu) return;
    const close = () => setStageMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [stageMenu]);

  useEffect(() => {
    if (selectedTaskId) loadComments(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (taskPanel) loadTaskDocs(taskPanel);
    else setTaskDocs([]);
  }, [taskPanel]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  async function loadBudget() {
    const [entries, summary, quotes] = await Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/budget/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/budget/summary`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/quotes/?project_id=${projectId}`).catch(() => []),
    ]);
    setBudgetEntries(entries);
    setBudgetSummary(summary);
    setProjectQuotes(quotes);
  }

  async function handleQuoteUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQuotesUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload(`/tenants/${TENANT_ID}/quotes/upload?project_id=${projectId}`, fd);
      await loadBudget();
    } catch (err: any) {
      alert(err.message || "שגיאה בהעלאה");
    } finally {
      setQuotesUploading(false);
      if (quoteFileRef.current) quoteFileRef.current.value = "";
    }
  }

  async function toggleMilestonePaid(quote: Quote, ms: Milestone) {
    const newPaid = ms.is_paid === 1 ? 0 : 1;
    await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_paid: newPaid }),
    });
    setProjectQuotes(prev => prev.map(q =>
      q.id === quote.id
        ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, is_paid: newPaid } : m) }
        : q
    ));
  }

  async function loadComments(taskId: string) {
    const data = await apiFetch(`/tenants/${TENANT_ID}/tasks/${taskId}/comments/`).catch(() => []);
    setComments(data);
  }

  function saveWidths(w: Record<string, number>) {
    setColWidths(w);
    localStorage.setItem(`col_widths_${projectId}`, JSON.stringify(w));
  }

  function startResize(col: string, e: React.MouseEvent) {
    e.preventDefault();
    dragCol.current = { col, startX: e.clientX, startW: colWidths[col] ?? DEFAULT_WIDTHS[col] ?? 120 };
    const onMove = (ev: MouseEvent) => {
      if (!dragCol.current) return;
      const newW = Math.max(60, dragCol.current.startW + (dragCol.current.startX - ev.clientX));
      saveWidths({ ...colWidths, [dragCol.current.col]: newW });
    };
    const onUp = () => { dragCol.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function updateTask(taskId: string, data: Partial<Task>) {
    try {
      await apiFetch(`/tenants/${TENANT_ID}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...data } : t));
    } catch (e: any) {
      alert("שגיאה בשמירה: " + e.message);
    }
  }

  async function updateStage(stageId: string, data: { name?: string; color?: string }) {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;
    await apiFetch(`/tenants/${TENANT_ID}/stages/${stageId}`, {
      method: "PUT",
      body: JSON.stringify({ handling_authority: stage.handling_authority || "—", ...data }),
    });
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, ...data } : s));
  }

  function handleStageDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragStageId || dragStageId === targetId) return;
    setStages(prev => {
      const from = prev.findIndex(s => s.id === dragStageId);
      const to = prev.findIndex(s => s.id === targetId);
      if (from === -1 || to === -1) return prev;
      const arr = [...prev];
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      return arr;
    });
  }

  function handleStageDragEnd() {
    setDragStageId(null);
    setStages(prev => {
      localStorage.setItem(`stage_order_${projectId}`, JSON.stringify(prev.map(s => s.id)));
      return prev;
    });
  }

  async function deleteStage(stageId: string) {
    if (!confirm("למחוק קבוצת משימות זו? המשימות בה לא יימחקו.")) return;
    await apiFetch(`/tenants/${TENANT_ID}/stages/${stageId}`, { method: "DELETE" });
    setStages(prev => prev.filter(s => s.id !== stageId));
  }

  async function saveProjectSettings() {
    setSavingProject(true);
    try {
      const updated = await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: projectForm.name,
          gush: projectForm.gush,
          helka: projectForm.helka,
          address: projectForm.address || undefined,
          budget_total: projectForm.budget_total ? parseFloat(projectForm.budget_total) : undefined,
        }),
      });
      setProject(updated);
      setShowProjectSettings(false);
    } catch (e: any) { alert(e.message); }
    finally { setSavingProject(false); }
  }

  async function addTask(stageId: string) {
    if (!newTaskTitle.trim()) return;
    const task = await apiFetch(`/tenants/${TENANT_ID}/tasks/`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, stage_id: stageId, title: newTaskTitle, priority: "medium", status: "todo" }),
    });
    setTasks(prev => [...prev, task]);
    setNewTaskTitle("");
    setAddingToStage(null);
  }

  async function addBudgetEntry() {
    if (!newEntry.description.trim() || !newEntry.amount) return;
    try {
      const entry = await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/budget/`, {
        method: "POST",
        body: JSON.stringify({
          category: newEntry.category,
          description: newEntry.description,
          vendor: newEntry.vendor || undefined,
          amount: parseFloat(newEntry.amount),
          is_planned: parseInt(newEntry.is_planned),
          notes: newEntry.notes || undefined,
        }),
      });
      setBudgetEntries(prev => [...prev, entry]);
      setNewEntry({ category: "בנייה", description: "", vendor: "", amount: "", is_planned: "0", notes: "" });
      setShowAddEntry(false);
      loadBudget();
    } catch (e: any) {
      alert("שגיאה בשמירת רשומת תקציב: " + e.message);
    }
  }

  async function deleteTask(taskId: string, title: string) {
    if (!confirm(`למחוק את המשימה "${title}"?`)) return;
    try {
      await apiFetch(`/tenants/${TENANT_ID}/tasks/${taskId}`, { method: "DELETE" });
      setTasks(prev => prev.filter(t => t.id !== taskId));
      if (taskPanel === taskId) setTaskPanel(null);
    } catch (e: any) {
      alert("שגיאה במחיקה: " + e.message);
    }
  }

  async function deleteBudgetEntry(id: string) {
    await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/budget/${id}`, { method: "DELETE" });
    setBudgetEntries(prev => prev.filter(e => e.id !== id));
    loadBudget();
  }

  async function sendComment() {
    if (!newComment.trim() || !selectedTaskId) return;
    const comment = await apiFetch(`/tenants/${TENANT_ID}/tasks/${selectedTaskId}/comments/`, {
      method: "POST",
      body: JSON.stringify({ content: newComment }),
    });
    setComments(prev => [...prev, comment]);
    setNewComment("");
  }

  function getW(col: string) { return colWidths[col] ?? DEFAULT_WIDTHS[col] ?? 120; }
  function getUser(id?: string) { return users.find(u => u.id === id); }
  function getStatus(val: string) { return STATUS_OPTIONS.find(s => s.value === val) || STATUS_OPTIONS[0]; }
  function getPriority(val: string) { return PRIORITY_OPTIONS.find(p => p.value === val) || PRIORITY_OPTIONS[1]; }
  function fmt(n: number) { return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }); }

  const totalPlanned = budgetSummary.reduce((s, r) => s + r.planned, 0);
  const totalActual = budgetSummary.reduce((s, r) => s + r.actual, 0);
  const budgetTotal = project?.budget_total ?? (totalPlanned > 0 ? totalPlanned : 0);
  const pct = budgetTotal > 0 ? Math.min(100, Math.round((totalActual / budgetTotal) * 100)) : 0;

  const columns = [
    { key: "title", label: "משימה" },
    { key: "assignee", label: "איש צוות" },
    { key: "contact", label: "גורם מטפל" },
    { key: "status", label: "סטטוס" },
    { key: "priority", label: "עדיפות" },
    { key: "start_date", label: "התחלה" },
    { key: "end_date", label: "סיום" },
    { key: "notes", label: "הערות" },
  ];

  if (!project) return <div className="p-8 text-gray-400">טוען...</div>;

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  return (
    <div className="flex flex-col h-screen overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="px-8 py-4 bg-white border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.push("/projects")} className="text-gray-400 hover:text-gray-600 text-sm">→ פרויקטים</button>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold" style={{ color: "#011e41" }}>{project.name}</h1>
        <span className="text-xs text-gray-400">גוש {project.gush} חלקה {project.helka}</span>
        <button
          onClick={() => { setProjectForm({ name: project.name, gush: project.gush, helka: project.helka, address: project.address || "", budget_total: project.budget_total?.toString() || "" }); setShowProjectSettings(true); }}
          className="mr-auto text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-100"
          title="הגדרות פרויקט"
        >⚙</button>
      </div>

      {/* Project settings modal */}
      {showProjectSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowProjectSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4" style={{ color: "#011e41" }}>הגדרות פרויקט</h2>
            <div className="flex flex-col gap-3">
              {[
                { key: "name", label: "שם הפרויקט" },
                { key: "gush", label: "גוש" },
                { key: "helka", label: "חלקה" },
                { key: "address", label: "כתובת" },
                { key: "budget_total", label: "תקציב כולל (₪)", type: "number" },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input
                    type={type || "text"}
                    value={(projectForm as any)[key]}
                    onChange={e => setProjectForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowProjectSettings(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ביטול</button>
              <button onClick={saveProjectSettings} disabled={savingProject} className="px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ background: "#011e41", opacity: savingProject ? 0.6 : 1 }}>
                {savingProject ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 bg-white px-8 flex-shrink-0 items-center">
        {[
          { id: "tasks" as Tab, label: "משימות" },
          { id: "gantt" as Tab, label: "ציר זמן" },
          { id: "budget" as Tab, label: "תקציב" },
          { id: "docs" as Tab, label: "מסמכים" },
          { id: "comments" as Tab, label: "הערות" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-[#011e41] text-[#011e41]" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            {t.label}
          </button>
        ))}
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/tenants/f7d67cb1-3414-47a4-8ddb-2845d11d32ff/projects/${projectId}/export`}
          className="mr-auto text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1"
          download
        >
          יצא Excel
        </a>
      </div>

      {/* Tab: Tasks */}
      {tab === "tasks" && (
        <div className="flex-1 overflow-auto px-8 py-6">
          {stages.map((stage) => {
            const stageTasks = tasks.filter(t => t.stage_id === stage.id);
            const isCollapsed = collapsed[stage.id];
            return (
              <div
                key={stage.id}
                className="mb-6"
                onDragOver={e => handleStageDragOver(e, stage.id)}
              >
                <div className="flex items-center gap-2 mb-1 select-none group/stage">
                  {/* Drag handle */}
                  <span
                    className="text-gray-300 cursor-grab text-xs px-0.5"
                    draggable
                    onDragStart={() => setDragStageId(stage.id)}
                    onDragEnd={handleStageDragEnd}
                  >⠿</span>
                  {/* Color dot */}
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: stage.color || "#011e41" }} />
                  {/* Name - inline edit or label */}
                  {editingStageId === stage.id ? (
                    <input
                      autoFocus
                      value={editingStageName}
                      onChange={e => setEditingStageName(e.target.value)}
                      onBlur={() => {
                        if (editingStageName.trim()) updateStage(stage.id, { name: editingStageName });
                        setEditingStageId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingStageId(null);
                      }}
                      className="font-semibold text-sm outline-none border-b border-blue-400 bg-transparent"
                      style={{ color: stage.color || "#011e41", minWidth: 80 }}
                    />
                  ) : (
                    <span
                      className="font-semibold text-sm cursor-pointer hover:opacity-70"
                      style={{ color: stage.color || "#011e41" }}
                      onClick={e => { e.stopPropagation(); setStageMenu(stageMenu === stage.id ? null : stage.id); }}
                    >{stage.name}</span>
                  )}
                  <span className="text-xs text-gray-400">({stageTasks.length})</span>

                  {/* ⋮ menu */}
                  <div className="relative mr-1">
                    <button
                      onClick={e => { e.stopPropagation(); setStageMenu(stageMenu === stage.id ? null : stage.id); }}
                      className="opacity-0 group-hover/stage:opacity-100 text-gray-400 hover:text-gray-600 px-1 text-base leading-none"
                    >⋮</button>
                    {stageMenu === stage.id && (
                      <div
                        className="absolute right-0 top-6 bg-white shadow-xl rounded-lg border border-gray-200 z-50 py-1 min-w-40"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          onClick={() => { setEditingStageId(stage.id); setEditingStageName(stage.name); setStageMenu(null); }}
                          className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50"
                        >✏️ שינוי שם</button>
                        <label className="w-full text-right px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center justify-between">
                          <span>🎨 שינוי צבע</span>
                          <input
                            type="color"
                            value={stage.color || "#011e41"}
                            onChange={e => { updateStage(stage.id, { color: e.target.value }); }}
                            className="w-6 h-6 cursor-pointer rounded"
                          />
                        </label>
                        <hr className="my-1 border-gray-100" />
                        <button
                          onClick={() => { setStageMenu(null); deleteStage(stage.id); }}
                          className="w-full text-right px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                        >🗑️ מחיקת קבוצה</button>
                      </div>
                    )}
                  </div>

                  <span
                    className="text-xs text-gray-400 mr-auto cursor-pointer"
                    onClick={() => setCollapsed(p => ({ ...p, [stage.id]: !p[stage.id] }))}
                  >
                    {isCollapsed ? "◀" : "▼"}
                  </span>
                </div>

                {!isCollapsed && (
                  <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                    <div className="flex bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium select-none">
                      <div style={{ width: 32, minWidth: 32 }} />
                      {columns.map((col) => (
                        <div key={col.key} className="relative flex items-center px-3 py-2 border-r border-gray-200" style={col.key === "notes" ? { minWidth: getW(col.key), flex: 1 } : { width: getW(col.key), minWidth: getW(col.key) }}>
                          {col.label}
                          <div
                            className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100"
                            onMouseDown={(e) => startResize(col.key, e)}
                          />
                        </div>
                      ))}
                      <div className="px-2 py-2 text-xs text-gray-400 w-10">💬</div>
                    </div>

                    {stageTasks.map((task) => {
                      const status = getStatus(task.status);
                      const priority = getPriority(task.priority);
                      return (
                        <div key={task.id} className="flex items-center border-b border-gray-100 hover:bg-gray-50 group text-sm">
                          <div style={{ width: 32, minWidth: 32 }} className="flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full" style={{ background: stage.color || "#011e41" }} />
                          </div>

                          {/* Title */}
                          <div className="flex items-center px-2 py-1.5 border-r border-gray-100" style={{ width: getW("title"), minWidth: getW("title") }}>
                            <span
                              className="truncate cursor-pointer hover:text-blue-600"
                              onClick={() => { setTaskPanel(task.id); setSelectedTaskId(task.id); }}
                            >{task.title}</span>
                          </div>

                          {/* Assignee */}
                          <div className="px-2 py-1.5 border-r border-gray-100" style={{ width: getW("assignee"), minWidth: getW("assignee") }}>
                            <select
                              value={task.assignee_id || ""}
                              onChange={e => updateTask(task.id, { assignee_id: e.target.value || undefined })}
                              className="w-full text-xs bg-transparent outline-none cursor-pointer"
                            >
                              <option value="">—</option>
                              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>

                          {/* Contact (professional handler) */}
                          <div className="px-2 py-1.5 border-r border-gray-100" style={{ width: getW("contact"), minWidth: getW("contact") }}>
                            <select
                              value={task.contact_id || ""}
                              onChange={e => updateTask(task.id, { contact_id: e.target.value || undefined })}
                              className="w-full text-xs bg-transparent outline-none cursor-pointer"
                            >
                              <option value="">—</option>
                              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.profession ? ` (${c.profession})` : ""}</option>)}
                            </select>
                          </div>

                          {/* Status */}
                          <div className="px-2 py-1.5 border-r border-gray-100" style={{ width: getW("status"), minWidth: getW("status") }}>
                            <select
                              value={task.status}
                              onChange={e => updateTask(task.id, { status: e.target.value })}
                              className="w-full text-xs font-medium rounded px-1 py-0.5 outline-none cursor-pointer"
                              style={{ background: status.bg, color: status.text }}
                            >
                              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>

                          {/* Priority */}
                          <div className="px-2 py-1.5 border-r border-gray-100" style={{ width: getW("priority"), minWidth: getW("priority") }}>
                            <select
                              value={task.priority}
                              onChange={e => updateTask(task.id, { priority: e.target.value })}
                              className="w-full text-xs outline-none cursor-pointer bg-transparent font-medium"
                              style={{ color: priority.color }}
                            >
                              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                          </div>

                          {/* Start date */}
                          <div className="px-2 py-1.5 border-r border-gray-100" style={{ width: getW("start_date"), minWidth: getW("start_date") }}>
                            <input
                              type="date"
                              value={task.start_date ? task.start_date.slice(0, 10) : ""}
                              onChange={e => updateTask(task.id, { start_date: e.target.value || undefined })}
                              className="w-full text-xs bg-transparent outline-none cursor-pointer"
                            />
                          </div>

                          {/* End date */}
                          <div className="px-2 py-1.5 border-r border-gray-100" style={{ width: getW("end_date"), minWidth: getW("end_date") }}>
                            <input
                              type="date"
                              value={task.end_date ? task.end_date.slice(0, 10) : ""}
                              onChange={e => updateTask(task.id, { end_date: e.target.value || undefined })}
                              className="w-full text-xs bg-transparent outline-none cursor-pointer"
                            />
                          </div>

                          {/* Notes */}
                          <div className="px-2 py-1.5 border-r border-gray-100" style={{ minWidth: getW("notes"), flex: 1 }}>
                            {editingTask === task.id + "_notes" ? (
                              <input
                                autoFocus
                                defaultValue={task.description || ""}
                                className="w-full text-xs outline-none border-b border-blue-400"
                                onBlur={e => { updateTask(task.id, { description: e.target.value }); setEditingTask(null); }}
                              />
                            ) : (
                              <span className="text-xs text-gray-400 truncate cursor-pointer hover:text-gray-600 block" onClick={() => setEditingTask(task.id + "_notes")}>
                                {task.description || "הוסף הערה..."}
                              </span>
                            )}
                          </div>

                          {/* Comments + Delete icons */}
                          <div className="px-2 py-1.5 flex items-center gap-1">
                            <button
                              onClick={() => { setSelectedTaskId(task.id); setTab("comments"); }}
                              className="text-gray-300 hover:text-blue-500 text-base"
                              title="הערות"
                            >
                              💬
                            </button>
                            <button
                              onClick={() => deleteTask(task.id, task.title)}
                              className="text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs px-1"
                              title="מחק משימה"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {addingToStage === stage.id ? (
                      <div className="flex items-center px-8 py-2 gap-2">
                        <input
                          autoFocus
                          value={newTaskTitle}
                          onChange={e => setNewTaskTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addTask(stage.id); if (e.key === "Escape") { setAddingToStage(null); setNewTaskTitle(""); } }}
                          placeholder="שם המשימה..."
                          className="flex-1 text-sm outline-none border-b border-blue-400 py-0.5"
                        />
                        <button onClick={() => addTask(stage.id)} className="text-xs px-3 py-1 rounded text-white" style={{ background: "#011e41" }}>הוסף</button>
                        <button onClick={() => { setAddingToStage(null); setNewTaskTitle(""); }} className="text-xs text-gray-400 hover:text-gray-600">ביטול</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingToStage(stage.id)}
                        className="flex items-center gap-2 px-8 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 w-full"
                      >
                        <span>+</span> הוסף משימה
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={async () => {
              const name = prompt("שם הקבוצה:");
              if (!name) return;
              const color = GROUP_COLORS[stages.length % GROUP_COLORS.length];
              const stage = await apiFetch(`/tenants/${TENANT_ID}/stages/`, {
                method: "POST",
                body: JSON.stringify({ project_id: projectId, name, handling_authority: "—", color }),
              });
              setStages(prev => [...prev, stage]);
            }}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 px-2 py-2"
          >
            <span>+</span> הוסף קבוצה
          </button>
        </div>
      )}

      {/* Tab: Gantt */}
      {tab === "gantt" && (() => {
        const tasksWithDates = tasks.filter(t => t.start_date && t.end_date);
        if (tasksWithDates.length === 0) {
          return (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              אין משימות עם תאריכי התחלה וסיום להצגה
            </div>
          );
        }

        const allDates = tasksWithDates.flatMap(t => [new Date(t.start_date!), new Date(t.end_date!)]);
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        minDate.setDate(1);
        maxDate.setMonth(maxDate.getMonth() + 1, 1);
        const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000);

        // Generate month labels
        const months: { label: string; pct: number }[] = [];
        let cur = new Date(minDate);
        while (cur < maxDate) {
          const start = Math.max(0, (cur.getTime() - minDate.getTime()) / 86400000);
          months.push({
            label: cur.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
            pct: (start / totalDays) * 100,
          });
          cur.setMonth(cur.getMonth() + 1);
        }

        const STATUS_COLORS: Record<string, string> = { todo: "#aaa", in_progress: "#2980b9", done: "#27ae60", blocked: "#c0392b", review: "#8e44ad" };

        return (
          <div className="flex-1 overflow-auto px-6 py-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Month header */}
              <div className="relative h-8 border-b border-gray-200 bg-gray-50" style={{ marginRight: 220 }}>
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center text-xs text-gray-400 px-2 border-r border-gray-200"
                    style={{ left: `${m.pct}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {/* Task rows */}
              {stages.map(stage => {
                const stageTasks = tasksWithDates.filter(t => t.stage_id === stage.id);
                if (stageTasks.length === 0) return null;
                return (
                  <div key={stage.id}>
                    <div className="px-3 py-1.5 text-xs font-semibold bg-gray-50 border-b border-gray-100 flex items-center gap-2" style={{ color: stage.color || "#011e41" }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: stage.color || "#011e41" }} />
                      {stage.name}
                    </div>
                    {stageTasks.map(task => {
                      const start = (new Date(task.start_date!).getTime() - minDate.getTime()) / 86400000;
                      const end = (new Date(task.end_date!).getTime() - minDate.getTime()) / 86400000;
                      const leftPct = (start / totalDays) * 100;
                      const widthPct = Math.max(0.5, ((end - start) / totalDays) * 100);
                      const color = STATUS_COLORS[task.status] || "#aaa";
                      return (
                        <div key={task.id} className="flex items-center border-b border-gray-50 hover:bg-gray-50 py-1.5">
                          <div className="text-sm text-gray-700 truncate flex-shrink-0 px-3" style={{ width: 220 }}>{task.title}</div>
                          <div className="flex-1 relative h-6">
                            <div
                              className="absolute h-5 rounded-md top-0.5 flex items-center px-2 text-white text-xs overflow-hidden"
                              style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color, minWidth: 4 }}
                              title={`${task.start_date?.slice(0, 10)} → ${task.end_date?.slice(0, 10)}`}
                            >
                              {widthPct > 5 ? task.title : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Tab: Budget */}
      {tab === "budget" && (
        <div className="flex-1 overflow-auto px-6 py-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="text-xs text-gray-400 mb-1">תקציב כולל</div>
              <div className="text-2xl font-bold" style={{ color: "#011e41" }}>{budgetTotal ? fmt(budgetTotal) : "—"}</div>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="text-xs text-gray-400 mb-1">בפועל</div>
              <div className="text-2xl font-bold" style={{ color: totalActual > budgetTotal ? "#c0392b" : "#27ae60" }}>{fmt(totalActual)}</div>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="text-xs text-gray-400 mb-1">יתרה</div>
              <div className="text-2xl font-bold" style={{ color: budgetTotal && (budgetTotal - totalActual) < 0 ? "#c0392b" : "#011e41" }}>{budgetTotal ? fmt(budgetTotal - totalActual) : "—"}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 mb-6">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>ניצול תקציב</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: pct > 90 ? "#c0392b" : pct > 70 ? "#e67e22" : "#27ae60" }}
              />
            </div>
          </div>

          {/* Category breakdown */}
          {budgetSummary.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">פירוט לפי קטגוריה</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-5 py-2 text-right font-medium">קטגוריה</th>
                    <th className="px-5 py-2 text-right font-medium">מתוכנן</th>
                    <th className="px-5 py-2 text-right font-medium">בפועל</th>
                    <th className="px-5 py-2 text-right font-medium">הפרש</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetSummary.map(row => (
                    <tr key={row.category} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-2 font-medium text-gray-700">{row.category}</td>
                      <td className="px-5 py-2 text-gray-500">{fmt(row.planned)}</td>
                      <td className="px-5 py-2">{fmt(row.actual)}</td>
                      <td className="px-5 py-2 font-medium" style={{ color: row.diff < 0 ? "#c0392b" : "#27ae60" }}>
                        {row.diff > 0 ? "+" : ""}{fmt(row.diff)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Entries list */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">רשומות תקציב</span>
              <button
                onClick={() => setShowAddEntry(true)}
                className="text-xs px-3 py-1.5 rounded text-white"
                style={{ background: "#011e41" }}
              >
                + הוסף רשומה
              </button>
            </div>

            {showAddEntry && (
              <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 grid grid-cols-6 gap-3 items-end">
                <div>
                  <div className="text-xs text-gray-500 mb-1">קטגוריה</div>
                  <select value={newEntry.category} onChange={e => setNewEntry(p => ({ ...p, category: e.target.value }))} className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none">
                    {BUDGET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-gray-500 mb-1">תיאור *</div>
                  <input value={newEntry.description} onChange={e => setNewEntry(p => ({ ...p, description: e.target.value }))} placeholder="תיאור..." className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">ספק</div>
                  <input value={newEntry.vendor} onChange={e => setNewEntry(p => ({ ...p, vendor: e.target.value }))} placeholder="ספק..." className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">סכום *</div>
                  <input type="number" value={newEntry.amount} onChange={e => setNewEntry(p => ({ ...p, amount: e.target.value }))} placeholder="0" className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">סוג</div>
                  <select value={newEntry.is_planned} onChange={e => setNewEntry(p => ({ ...p, is_planned: e.target.value }))} className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none">
                    <option value="0">בפועל</option>
                    <option value="1">מתוכנן</option>
                  </select>
                </div>
                <div className="col-span-6 flex gap-2 justify-end">
                  <button onClick={addBudgetEntry} className="text-xs px-4 py-1.5 rounded text-white" style={{ background: "#011e41" }}>שמור</button>
                  <button onClick={() => setShowAddEntry(false)} className="text-xs px-4 py-1.5 rounded border border-gray-200 text-gray-600">ביטול</button>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-5 py-2 text-right font-medium">קטגוריה</th>
                  <th className="px-5 py-2 text-right font-medium">תיאור</th>
                  <th className="px-5 py-2 text-right font-medium">ספק</th>
                  <th className="px-5 py-2 text-right font-medium">סכום</th>
                  <th className="px-5 py-2 text-right font-medium">סוג</th>
                  <th className="px-5 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {budgetEntries.map(entry => (
                  <tr key={entry.id} className="border-t border-gray-50 hover:bg-gray-50 group">
                    <td className="px-5 py-2 text-gray-600">{entry.category}</td>
                    <td className="px-5 py-2 font-medium text-gray-800">{entry.description}</td>
                    <td className="px-5 py-2 text-gray-500">{entry.vendor || "—"}</td>
                    <td className="px-5 py-2 font-medium">{fmt(entry.amount)}</td>
                    <td className="px-5 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${entry.is_planned ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {entry.is_planned ? "מתוכנן" : "בפועל"}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => deleteBudgetEntry(entry.id)} className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
                {budgetEntries.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">אין רשומות תקציב עדיין</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Quotes section */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">הצעות מחיר</span>
              <div className="flex items-center gap-2">
                {quotesUploading && <span className="text-xs text-gray-400">Claude מנתח...</span>}
                <input ref={quoteFileRef} type="file" accept=".pdf" className="hidden" onChange={handleQuoteUpload} />
                <button
                  onClick={() => quoteFileRef.current?.click()}
                  disabled={quotesUploading}
                  className="text-xs px-3 py-1.5 rounded text-white"
                  style={{ background: "#011e41", opacity: quotesUploading ? 0.6 : 1 }}
                >
                  {quotesUploading ? "מנתח PDF..." : "העלאת הצעה (PDF)"}
                </button>
              </div>
            </div>

            {projectQuotes.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">אין הצעות מחיר עדיין — העלה PDF</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {projectQuotes.map(q => {
                  const isExpanded = expandedQuoteId === q.id;
                  const paid = q.milestones.filter(m => m.is_paid).reduce((s, m) => s + m.amount, 0);
                  const unpaid = q.milestones.filter(m => !m.is_paid).reduce((s, m) => s + m.amount, 0);
                  const statusColors: Record<string, string> = { pending_review: "#e67e22", approved: "#27ae60", rejected: "#c0392b" };
                  const statusLabels: Record<string, string> = { pending_review: "ממתין לאישור", approved: "מאושר", rejected: "נדחה" };
                  return (
                    <div key={q.id}>
                      <div
                        className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedQuoteId(isExpanded ? null : q.id)}
                      >
                        <div>
                          <span className="font-medium text-sm">{q.title}</span>
                          {q.vendor && <span className="text-xs text-gray-400 mr-2">· {q.vendor}</span>}
                          <span
                            className="text-xs px-2 py-0.5 rounded-full mr-2"
                            style={{ background: (statusColors[q.status] || "#888") + "20", color: statusColors[q.status] || "#888" }}
                          >
                            {statusLabels[q.status] || q.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {q.total_amount != null && <span className="font-bold text-sm" style={{ color: "#011e41" }}>{fmt(q.total_amount)}</span>}
                          <span className="text-gray-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      {isExpanded && q.milestones.length > 0 && (
                        <div className="px-5 pb-3 space-y-1.5">
                          {q.milestones.map(ms => (
                            <div key={ms.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: ms.is_paid ? "#f0fdf4" : "#fafafa" }}>
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
                                <div className="font-medium text-xs" style={{ color: ms.is_paid ? "#aaa" : "#011e41" }}>{fmt(ms.amount)}</div>
                                {ms.due_date && <div className="text-xs text-gray-400">{new Date(ms.due_date).toLocaleDateString("he-IL")}</div>}
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-4 text-xs pt-1">
                            <span className="text-green-600">שולם: {fmt(paid)}</span>
                            <span className="text-orange-500">נותר: {fmt(unpaid)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Docs */}
      {tab === "docs" && (
        <div
          className="flex-1 overflow-auto px-8 py-6 relative"
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragEnter={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) uploadProjectDoc(f, uploadTaskId || undefined);
          }}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/80 pointer-events-none">
              <div className="text-center">
                <div className="text-4xl mb-2">📂</div>
                <div className="text-blue-600 font-semibold">שחרר להעלאה</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold" style={{ color: "#011e41" }}>מסמכי פרויקט</span>
            <button
              onClick={() => setShowUploadForm(v => !v)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ background: "#011e41" }}
            >+ העלה מסמך</button>
          </div>

          {showUploadForm && (
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex gap-3 flex-wrap items-end border border-gray-100">
              <div className="flex flex-col gap-1 flex-1 min-w-48">
                <label className="text-xs text-gray-500">קובץ</label>
                <input
                  type="file"
                  className="text-sm border border-gray-200 rounded px-2 py-1 outline-none"
                  ref={docFileRef}
                />
              </div>
              <div className="flex flex-col gap-1 min-w-48">
                <label className="text-xs text-gray-500">שייך למשימה (אופציונלי)</label>
                <select
                  value={uploadTaskId}
                  onChange={e => setUploadTaskId(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                >
                  <option value="">— ללא משימה ספציפית —</option>
                  {tasks.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={docsUploading}
                onClick={() => {
                  const f = docFileRef.current?.files?.[0];
                  if (f) uploadProjectDoc(f, uploadTaskId || undefined);
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: "#27ae60", opacity: docsUploading ? 0.6 : 1 }}
              >{docsUploading ? "מעלה..." : "העלה"}</button>
              <button onClick={() => setShowUploadForm(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2">ביטול</button>
            </div>
          )}

          {docsUploading && (
            <div className="text-sm text-blue-500 mb-3 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              מעלה קובץ...
            </div>
          )}

          {projectDocs.length === 0 ? (
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl py-16 text-center cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => setShowUploadForm(true)}
            >
              <div className="text-3xl mb-2">📂</div>
              <div className="text-gray-400 text-sm">גרור קובץ לכאן או לחץ להעלאה</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {projectDocs.map(doc => {
                const isTaskDoc = !!doc.task_id;
                const taskName = isTaskDoc ? tasks.find(t => t.id === doc.task_id)?.title : null;
                return (
                  <div key={doc.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 group">
                    <span className="text-xl flex-shrink-0">📄</span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={doc.path.startsWith("http") ? doc.path : `${API_BASE}${doc.path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium hover:underline"
                        style={{ color: "#011e41" }}
                      >{doc.name}</a>
                      {taskName && <div className="text-xs text-gray-400 mt-0.5">📌 {taskName}</div>}
                      {doc.expiry_date && (
                        <div className="text-xs text-orange-500 mt-0.5">
                          תוקף: {new Date(doc.expiry_date).toLocaleDateString("he-IL")}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteDoc(doc.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded transition-opacity"
                    >מחק</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Comments */}
      {tab === "comments" && (
        <div className="flex-1 flex overflow-hidden">
          {/* Task list */}
          <div className="w-72 border-l border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
            <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">משימות</div>
            {tasks.map(task => {
              const stage = stages.find(s => s.id === task.stage_id);
              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`w-full text-right px-4 py-3 border-b border-gray-100 transition-colors ${selectedTaskId === task.id ? "bg-white border-r-2 border-r-[#011e41]" : "hover:bg-white"}`}
                >
                  <div className="text-sm font-medium text-gray-800 truncate">{task.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    {stage && <span style={{ color: stage.color }}>{stage.name}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Comment thread */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedTaskId ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">בחר משימה להצגת הערות</div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
                  <div className="font-semibold text-gray-800">{selectedTask?.title}</div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                  {comments.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-8">אין הערות עדיין. היה הראשון!</div>
                  )}
                  {comments.map(c => (
                    <div key={c.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">{c.content}</div>
                      <div className="text-xs text-gray-400 mt-1">{new Date(c.created_at).toLocaleString("he-IL")}</div>
                    </div>
                  ))}
                  <div ref={commentsEndRef} />
                </div>
                <div className="px-6 py-4 border-t border-gray-200 bg-white flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                      placeholder="כתוב הערה... (Enter לשליחה)"
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-4 py-2.5 outline-none focus:border-blue-300"
                    />
                    <button
                      onClick={sendComment}
                      className="px-4 py-2.5 rounded-lg text-white text-sm font-medium"
                      style={{ background: "#011e41" }}
                    >
                      שלח
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Task detail panel */}
      {taskPanel && (() => {
        const t = tasks.find(x => x.id === taskPanel);
        if (!t) return null;
        const stg = stages.find(s => s.id === t.stage_id);
        return (
          <div className="fixed inset-0 z-50 flex" dir="rtl">
            <div className="flex-1 bg-black/20" onClick={() => setTaskPanel(null)} />
            <div className="w-[420px] bg-white h-full flex flex-col shadow-2xl border-r border-gray-200 overflow-hidden">
              {/* Panel header */}
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <span className="text-sm font-semibold text-gray-700">פרטי משימה</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => deleteTask(t.id, t.title)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                    title="מחק משימה"
                  >
                    מחק
                  </button>
                  <button onClick={() => setTaskPanel(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Title */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">כותרת</label>
                  <input
                    defaultValue={t.title}
                    onBlur={e => { if (e.target.value !== t.title) updateTask(t.id, { title: e.target.value }); }}
                    className="w-full text-base font-semibold border-b border-gray-200 pb-1 outline-none focus:border-blue-400"
                    style={{ color: "#011e41" }}
                  />
                </div>

                {/* Stage */}
                {stg && (
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stg.color || "#011e41" }} />
                    <span className="text-xs text-gray-500">{stg.name}</span>
                  </div>
                )}

                {/* Status + Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">סטטוס</label>
                    <select
                      value={t.status}
                      onChange={e => updateTask(t.id, { status: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">עדיפות</label>
                    <select
                      value={t.priority}
                      onChange={e => updateTask(t.id, { priority: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    >
                      {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Assignee + Contact */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">איש צוות</label>
                    <select
                      value={t.assignee_id || ""}
                      onChange={e => updateTask(t.id, { assignee_id: e.target.value || undefined })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    >
                      <option value="">—</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">גורם מטפל</label>
                    <select
                      value={t.contact_id || ""}
                      onChange={e => updateTask(t.id, { contact_id: e.target.value || undefined })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    >
                      <option value="">—</option>
                      {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.profession ? ` (${c.profession})` : ""}</option>)}
                    </select>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">תאריך התחלה</label>
                    <input
                      type="date"
                      value={t.start_date ? t.start_date.slice(0, 10) : ""}
                      onChange={e => updateTask(t.id, { start_date: e.target.value || undefined })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">תאריך סיום</label>
                    <input
                      type="date"
                      value={t.end_date ? t.end_date.slice(0, 10) : ""}
                      onChange={e => updateTask(t.id, { end_date: e.target.value || undefined })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">הערות</label>
                  <textarea
                    defaultValue={t.description || ""}
                    onBlur={e => { if (e.target.value !== (t.description || "")) updateTask(t.id, { description: e.target.value }); }}
                    rows={3}
                    placeholder="הוסף הערה..."
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 resize-none"
                  />
                </div>

                {/* Documents */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400">קבצים מצורפים</label>
                    <label className={`text-xs px-2 py-1 rounded cursor-pointer text-white ${taskDocsUploading ? "opacity-60" : ""}`} style={{ background: "#011e41" }}>
                      {taskDocsUploading ? "..." : "+ צרף"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={taskDocsUploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadTaskDoc(f, t.id); e.target.value = ""; }}
                      />
                    </label>
                  </div>
                  {taskDocs.length === 0 ? (
                    <div className="text-xs text-gray-300 py-1">אין קבצים מצורפים</div>
                  ) : (
                    <div className="space-y-1">
                      {taskDocs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 group">
                          <span className="text-base">📄</span>
                          <a
                            href={doc.path.startsWith("http") ? doc.path : `${API_BASE}${doc.path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 text-xs text-blue-600 hover:underline truncate"
                          >{doc.name}</a>
                          <button
                            onClick={() => deleteDoc(doc.id)}
                            className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-opacity"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comments */}
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">תגובות</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-2">
                    {comments.length === 0 && <div className="text-xs text-gray-300 py-2">אין תגובות עדיין</div>}
                    {comments.map(c => (
                      <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2">
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{new Date(c.created_at).toLocaleString("he-IL")}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                      placeholder="כתוב תגובה..."
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300"
                    />
                    <button onClick={sendComment} className="px-3 py-2 rounded-lg text-white text-sm" style={{ background: "#011e41" }}>שלח</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
