"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { apiFetch, apiUpload, API_BASE } from "@/lib/api";
import ApplyTemplateModal from "@/components/ApplyTemplateModal";
import ProfessionCombobox from "@/components/ProfessionCombobox";

const TENANT_ID = getTenantId();

const STATUS_OPTIONS = [
  { value: "in_progress", label: "בעבודה",       bg: "#2980b9", text: "#fff" },
  { value: "done",        label: "בוצע",          bg: "#27ae60", text: "#fff" },
  { value: "delayed",     label: "בעיכוב",        bg: "#e67e22", text: "#fff" },
  { value: "rejected",    label: "נדחה",          bg: "#c0392b", text: "#fff" },
  { value: "partial",     label: "בוצע חלקית",   bg: "#8e44ad", text: "#fff" },
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
interface Project { id: string; name: string; gush: string; helka: string; budget_total?: number; address?: string; description?: string; company_name?: string; company_id?: string; }
interface BudgetEntry { id: string; category: string; description: string; vendor?: string; amount: number; entry_date?: string; is_planned: number; notes?: string; }
interface BudgetSummary { category: string; planned: number; actual: number; diff: number; }
interface Comment { id: string; content: string; created_at: string; created_by?: string; }
interface Milestone { id: string; quote_id: string; description: string; amount: number; percentage?: number; order: number; task_id?: string; due_date?: string; is_paid: number; paid_amount?: number; }
interface Quote { id: string; project_id?: string; vendor?: string; title: string; total_amount?: number; pdf_filename?: string; status: string; notes?: string; created_at: string; milestones: Milestone[]; }

const DEFAULT_WIDTHS: Record<string, number> = { title: 300, assignee: 130, contact: 160, status: 140, priority: 110, start_date: 120, end_date: 120, notes: 200 };

type Tab = "tasks" | "kanban" | "gantt" | "budget" | "comments" | "docs" | "professionals" | "meetings";

interface Doc { id: string; name: string; path: string; expiry_date?: string; task_id?: string; stage_id?: string; project_id?: string; }

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
  const [newTaskForm, setNewTaskForm] = useState({
    title: "", status: "todo", priority: "medium",
    assignee_id: "", start_date: new Date().toISOString().slice(0, 10), end_date: "", description: "",
  });
  const [newTaskErrors, setNewTaskErrors] = useState<Record<string, string>>({});
  const [newTaskFile, setNewTaskFile] = useState<File | null>(null);
  const [newTaskDocExpiry, setNewTaskDocExpiry] = useState("");
  const newTaskFileRef = useRef<HTMLInputElement>(null);
  const dragCol = useRef<{ col: string; startX: number; startW: number } | null>(null);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Professionals
  interface Professional { id: string; contact_id: string; profession: string; contact_name?: string; contact_phone?: string; contact_email?: string; }
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [newProfProfession, setNewProfProfession] = useState("");
  const [newProfContactId, setNewProfContactId] = useState("");
  const [addingProf, setAddingProf] = useState(false);

  // Template
  const [showApplyTemplate, setShowApplyTemplate] = useState(false);

  // Project settings
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", gush: "", helka: "", address: "", budget_total: "", description: "", company_name: "", company_id: "" });
  const [savingProject, setSavingProject] = useState(false);

  // Task detail panel
  const [taskPanel, setTaskPanel] = useState<string | null>(null);

  // Stage editing
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");
  const [dragStageId, setDragStageId] = useState<string | null>(null);
  const [stageMenu, setStageMenu] = useState<string | null>(null);
  const [dragTaskListId, setDragTaskListId] = useState<string | null>(null);
  const [dragOverTaskListId, setDragOverTaskListId] = useState<string | null>(null);

  // Budget state
  const [dragBudgetId, setDragBudgetId] = useState<string | null>(null);
  const [dragOverBudgetId, setDragOverBudgetId] = useState<string | null>(null);
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary[]>([]);
  const [editEntry, setEditEntry] = useState<BudgetEntry | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({ category: "בנייה", description: "", vendor: "", amount: "", is_planned: "0", notes: "" });
  const [projectQuotes, setProjectQuotes] = useState<Quote[]>([]);
  const [quotesUploading, setQuotesUploading] = useState(false);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const quoteFileRef = useRef<HTMLInputElement>(null);
  const [addingMilestoneToQuote, setAddingMilestoneToQuote] = useState<string | null>(null);
  const [newMilestone, setNewMilestone] = useState({ description: "", amount: "", due_date: "" });
  const [editingMilestone, setEditingMilestone] = useState<{ id: string; field: "description" | "amount"; value: string } | null>(null);
  const [payingMsId, setPayingMsId] = useState<string | null>(null);
  const [payingMsAmount, setPayingMsAmount] = useState<string>("");
  const [savingMsTaskLink, setSavingMsTaskLink] = useState<string | null>(null);
  // Project members
  const [projectMembers, setProjectMembers] = useState<{id:string;user_id:string;role:string;user_name?:string;user_email?:string}[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");

  // Comments state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Gantt zoom
  const [ganttZoom, setGanttZoom] = useState<"day" | "week" | "month" | "year">("month");

  // Kanban filter
  const [kanbanStageFilter, setKanbanStageFilter] = useState<string>("all");
  const [kanbanAssigneeFilter, setKanbanAssigneeFilter] = useState<string>("all");

  // Bulk task selection
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Docs state
  const [projectDocs, setProjectDocs] = useState<Doc[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);
  const [taskDocs, setTaskDocs] = useState<Doc[]>([]);
  const [taskDocsUploading, setTaskDocsUploading] = useState(false);
  const [taskDocExpiry, setTaskDocExpiry] = useState("");
  const docFileRef = useRef<HTMLInputElement>(null);
  const taskDocFileRef = useRef<HTMLInputElement>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTaskId, setUploadTaskId] = useState("");
  const [uploadExpiryDate, setUploadExpiryDate] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => { setShowApplyTemplate(false); }, [projectId]);

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
    if (tab === "professionals") loadProfessionals();
  }, [tab]);

  async function loadProjectDocs() {
    const data = await apiFetch(`/tenants/${TENANT_ID}/documents/?project_id=${projectId}`).catch(() => []);
    setProjectDocs(data);
  }

  async function uploadProjectDoc(file: File, association?: string, expiryDate?: string) {
    setDocsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      if (association?.startsWith("stage:")) {
        fd.append("stage_id", association.replace("stage:", ""));
      } else if (association) {
        fd.append("task_id", association);
      }
      if (expiryDate) fd.append("expiry_date", expiryDate);
      const doc = await apiUpload(`/tenants/${TENANT_ID}/documents/upload`, fd);
      setProjectDocs(prev => [doc, ...prev]);
      setShowUploadForm(false);
      setUploadTaskId("");
      setUploadExpiryDate("");
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

  async function uploadTaskDoc(file: File, taskId: string, expiry?: string) {
    setTaskDocsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      fd.append("task_id", taskId);
      if (expiry) fd.append("expiry_date", expiry);
      const doc = await apiUpload(`/tenants/${TENANT_ID}/documents/upload`, fd);
      setTaskDocs(prev => [doc, ...prev]);
      setProjectDocs(prev => [doc, ...prev]);
      setTaskDocExpiry("");
    } finally { setTaskDocsUploading(false); }
  }

  // stageMenu closes via backdrop (see JSX) — no document listener needed

  useEffect(() => {
    if (selectedTaskId) loadComments(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (taskPanel) { loadTaskDocs(taskPanel); loadComments(taskPanel); }
    else setTaskDocs([]);
  }, [taskPanel]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  async function loadProfessionals() {
    const data = await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/professionals/`).catch(() => []);
    setProfessionals(data);
  }

  async function addProfessional() {
    if (!newProfProfession || !newProfContactId) return;
    try {
      const p = await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/professionals/`, {
        method: "POST",
        body: JSON.stringify({ profession: newProfProfession, contact_id: newProfContactId }),
      });
      setProfessionals(prev => [...prev, p]);
      setNewProfProfession("");
      setNewProfContactId("");
      setAddingProf(false);
    } catch (e: unknown) {
      alert((e as Error).message || "שגיאה");
    }
  }

  async function removeProfessional(id: string) {
    await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/professionals/${id}`, { method: "DELETE" });
    setProfessionals(prev => prev.filter(p => p.id !== id));
  }

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

  async function markMilestonePaid(quote: Quote, ms: Milestone, amount: number) {
    await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_paid: 1, paid_amount: amount }),
    });
    setProjectQuotes(prev => prev.map(q =>
      q.id === quote.id
        ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, is_paid: 1, paid_amount: amount } : m) }
        : q
    ));
    setPayingMsId(null);
    setPayingMsAmount("");
    await loadBudget();
  }

  async function unmarkMilestonePaid(quote: Quote, ms: Milestone) {
    await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_paid: 0, paid_amount: null }),
    });
    setProjectQuotes(prev => prev.map(q =>
      q.id === quote.id
        ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, is_paid: 0, paid_amount: undefined } : m) }
        : q
    ));
  }

  async function linkMilestoneTaskProj(quote: Quote, ms: Milestone, taskId: string) {
    setSavingMsTaskLink(ms.id);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
        method: "PUT",
        body: JSON.stringify({ task_id: taskId || null }),
      });
      setProjectQuotes(prev => prev.map(q =>
        q.id === quote.id
          ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, task_id: taskId || undefined } : m) }
          : q
      ));
    } finally {
      setSavingMsTaskLink(null);
    }
  }

  async function saveMilestoneDueDate(quote: Quote, ms: Milestone, date: string) {
    await apiFetch(`/tenants/${TENANT_ID}/quotes/${quote.id}/milestones/${ms.id}`, {
      method: "PUT",
      body: JSON.stringify({ due_date: date || null }),
    });
    setProjectQuotes(prev => prev.map(q =>
      q.id === quote.id
        ? { ...q, milestones: q.milestones.map(m => m.id === ms.id ? { ...m, due_date: date } : m) }
        : q
    ));
  }

  async function approveQuote(quoteId: string) {
    const updated = await apiFetch(`/tenants/${TENANT_ID}/quotes/${quoteId}/approve`, { method: "POST" });
    setProjectQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: "approved", milestones: updated.milestones ?? q.milestones } : q));
    await loadBudget();
  }

  async function deleteQuote(quoteId: string) {
    if (!confirm("למחוק את ההצעה?")) return;
    await apiFetch(`/tenants/${TENANT_ID}/quotes/${quoteId}`, { method: "DELETE" });
    setProjectQuotes(prev => prev.filter(q => q.id !== quoteId));
    await loadBudget();
  }

  async function submitAddMilestone(quoteId: string) {
    if (!newMilestone.description || !newMilestone.amount) return;
    const body: Record<string, unknown> = { description: newMilestone.description, amount: parseFloat(newMilestone.amount) };
    if (newMilestone.due_date) body.due_date = newMilestone.due_date;
    const ms = await apiFetch(`/tenants/${TENANT_ID}/quotes/${quoteId}/milestones`, { method: "POST", body: JSON.stringify(body) });
    setProjectQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, milestones: [...q.milestones, ms] } : q));
    setAddingMilestoneToQuote(null);
    setNewMilestone({ description: "", amount: "", due_date: "" });
  }

  async function saveMilestoneField(quoteId: string, msId: string, field: "description" | "amount", value: string) {
    if (!value.trim()) return;
    const body = field === "amount" ? { amount: parseFloat(value) } : { description: value };
    const updated = await apiFetch(`/tenants/${TENANT_ID}/quotes/${quoteId}/milestones/${msId}`, { method: "PUT", body: JSON.stringify(body) });
    setProjectQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, milestones: q.milestones.map(m => m.id === msId ? { ...m, ...updated } : m) } : q));
    setEditingMilestone(null);
  }

  async function deleteMilestone(quoteId: string, msId: string) {
    await apiFetch(`/tenants/${TENANT_ID}/quotes/${quoteId}/milestones/${msId}`, { method: "DELETE" });
    setProjectQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, milestones: q.milestones.filter(m => m.id !== msId) } : q));
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

  function handleTaskListDrop(fromId: string, toId: string) {
    if (fromId === toId) return;
    setTasks(prev => {
      const arr = [...prev];
      const from = arr.findIndex(t => t.id === fromId);
      const to   = arr.findIndex(t => t.id === toId);
      if (from === -1 || to === -1) return prev;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      const order = arr.filter(t => t.stage_id === arr[to].stage_id).map(t => t.id);
      localStorage.setItem(`task_order_${projectId}`, JSON.stringify(
        { ...(JSON.parse(localStorage.getItem(`task_order_${projectId}`) || "{}")), [arr[to].stage_id]: order }
      ));
      return arr;
    });
    setDragTaskListId(null);
    setDragOverTaskListId(null);
  }

  async function deleteStage(stageId: string) {
    const stage = stages.find(s => s.id === stageId);
    const stageTaskCount = tasks.filter(t => t.stage_id === stageId).length;
    if (stageTaskCount > 0) {
      const input = prompt(`קבוצה זו מכילה ${stageTaskCount} משימות שימחקו גם הן.\nכתוב את שם הקבוצה לאישור: "${stage?.name}"`);
      if (input?.trim() !== stage?.name?.trim()) {
        if (input !== null) alert("שם לא תואם — המחיקה בוטלה");
        return;
      }
    } else {
      if (!confirm(`למחוק את הקבוצה "${stage?.name}"?`)) return;
    }
    await apiFetch(`/tenants/${TENANT_ID}/stages/${stageId}`, { method: "DELETE" });
    setStages(prev => prev.filter(s => s.id !== stageId));
    setTasks(prev => prev.filter(t => t.stage_id !== stageId));
  }

  async function loadProjectMembers() {
    const data = await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/members/`).catch(() => []);
    setProjectMembers(data);
  }

  async function addProjectMember() {
    if (!newMemberUserId) return;
    const m = await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/members/`, {
      method: "POST",
      body: JSON.stringify({ user_id: newMemberUserId, role: newMemberRole }),
    });
    setProjectMembers(prev => [...prev, m]);
    setAddingMember(false);
    setNewMemberUserId("");
    setNewMemberRole("member");
  }

  async function updateMemberRole(userId: string, role: string) {
    const m = await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
    setProjectMembers(prev => prev.map(p => p.user_id === userId ? { ...p, role: m.role } : p));
  }

  async function removeMember(userId: string) {
    await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    setProjectMembers(prev => prev.filter(p => p.user_id !== userId));
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
          description: projectForm.description || undefined,
          company_name: projectForm.company_name || undefined,
          company_id: projectForm.company_id || undefined,
        }),
      });
      setProject(updated);
      setShowProjectSettings(false);
    } catch (e: any) { alert(e.message); }
    finally { setSavingProject(false); }
  }

  async function addTask(stageId: string) {
    // Validate required fields
    const errors: Record<string, string> = {};
    if (!newTaskForm.title.trim()) errors.title = "שדה חובה";
    if (!newTaskForm.assignee_id) errors.assignee_id = "שדה חובה";
    if (!newTaskForm.start_date) errors.start_date = "שדה חובה";
    if (!newTaskForm.end_date) errors.end_date = "שדה חובה";
    else if (newTaskForm.start_date && newTaskForm.end_date <= newTaskForm.start_date) errors.end_date = "תאריך סיום חייב להיות אחרי תאריך ההתחלה";
    if (Object.keys(errors).length > 0) { setNewTaskErrors(errors); return; }
    setNewTaskErrors({});
    // Duplicate check
    const titleLower = newTaskForm.title.trim().toLowerCase();
    const duplicate = tasks.find(t => t.title.trim().toLowerCase() === titleLower);
    if (duplicate) {
      const ok = confirm(`משימה בשם "${newTaskForm.title.trim()}" כבר קיימת בפרויקט. להוסיף בכל זאת?`);
      if (!ok) return;
    }
    try {
      const task = await apiFetch(`/tenants/${TENANT_ID}/tasks/`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          stage_id: stageId,
          title: newTaskForm.title,
          priority: newTaskForm.priority,
          status: newTaskForm.status,
          assignee_id: newTaskForm.assignee_id || undefined,
          start_date: newTaskForm.start_date,
          end_date: newTaskForm.end_date,
          description: newTaskForm.description || undefined,
        }),
      });
      setTasks(prev => [...prev, task]);
      // Upload attachment if selected
      if (newTaskFile) {
        try {
          const fd = new FormData();
          fd.append("file", newTaskFile);
          fd.append("project_id", projectId);
          fd.append("task_id", task.id);
          if (newTaskDocExpiry) fd.append("expiry_date", newTaskDocExpiry);
          const doc = await apiUpload(`/tenants/${TENANT_ID}/documents/upload`, fd);
          setProjectDocs(prev => [doc, ...prev]);
        } catch { /* non-fatal */ }
      }
      setNewTaskForm({ title: "", status: "todo", priority: "medium", assignee_id: "", start_date: new Date().toISOString().slice(0, 10), end_date: "", description: "" });
      setNewTaskTitle("");
      setNewTaskFile(null);
      setNewTaskDocExpiry("");
      if (newTaskFileRef.current) newTaskFileRef.current.value = "";
      setAddingToStage(null);
    } catch (e: any) {
      alert("שגיאה ביצירת משימה: " + e.message);
    }
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
    if (!confirm("למחוק רשומה זו?")) return;
    await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/budget/${id}`, { method: "DELETE" });
    setBudgetEntries(prev => prev.filter(e => e.id !== id));
    loadBudget();
  }

  async function downloadExport() {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    try {
      const res = await fetch(`${API_BASE}/tenants/${TENANT_ID}/projects/${projectId}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "שגיאה לא ידועה" }));
        alert("שגיאה בייצוא: " + (err.detail || res.status));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maslul_project.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("שגיאה בייצוא: " + e.message);
    }
  }

  async function saveBudgetEntry() {
    if (!editEntry || !editEntry.description.trim() || !editEntry.amount) return;
    try {
      await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/budget/${editEntry.id}`, {
        method: "PUT",
        body: JSON.stringify({
          category: editEntry.category,
          description: editEntry.description,
          vendor: editEntry.vendor || undefined,
          amount: Number(editEntry.amount),
          is_planned: editEntry.is_planned,
        }),
      });
      setEditEntry(null);
      loadBudget();
    } catch (e: any) {
      alert("שגיאה בשמירה: " + e.message);
    }
  }

  async function toggleBudgetEntryDone(id: string, currentIsPlanned: number) {
    if (currentIsPlanned === 0) return; // already actual, no toggle back
    await apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}/budget/${id}`, {
      method: "PUT",
      body: JSON.stringify({ is_planned: 0 }),
    });
    setBudgetEntries(prev => prev.map(e => e.id === id ? { ...e, is_planned: 0 } : e));
    loadBudget();
  }

  async function sendComment() {
    const taskId = taskPanel || selectedTaskId;
    if (!newComment.trim() || !taskId) return;
    const comment = await apiFetch(`/tenants/${TENANT_ID}/tasks/${taskId}/comments/`, {
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
        {project.company_name && <span className="text-xs text-gray-400">· {project.company_name}{project.company_id ? ` (${project.company_id})` : ""}</span>}
        <button
          onClick={() => { setProjectForm({ name: project.name, gush: project.gush, helka: project.helka, address: project.address || "", budget_total: project.budget_total?.toString() || "", description: project.description || "", company_name: project.company_name || "", company_id: project.company_id || "" }); setShowProjectSettings(true); loadProjectMembers(); }}
          className="mr-auto text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-100"
          title="הגדרות פרויקט"
        >⚙</button>
        <button
          onClick={() => setShowApplyTemplate(true)}
          className="text-sm px-3 py-1 rounded font-medium"
          style={{ background: "#f0f4ff", color: "#3b5bdb", border: "1px solid #c5d0fc" }}
          title="החל טמפלייט על פרויקט"
        >
          📋 טמפלייט
        </button>
      </div>

      {showApplyTemplate && (
        <ApplyTemplateModal
          projectId={projectId}
          existingTaskTitles={tasks.map(t => t.title)}
          onClose={() => setShowApplyTemplate(false)}
          onApplied={() => { router.refresh(); window.location.reload(); }}
        />
      )}

      {/* Project settings modal */}
      {showProjectSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowProjectSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4" style={{ color: "#011e41" }}>הגדרות פרויקט</h2>
            <div className="flex flex-col gap-3 mb-5">
              {[
                { key: "name", label: "שם הפרויקט" },
                { key: "gush", label: "גוש" },
                { key: "helka", label: "חלקה" },
                { key: "address", label: "כתובת" },
                { key: "budget_total", label: "תקציב כולל (₪)", type: "number" },
                { key: "company_name", label: "שם חברה" },
                { key: "company_id", label: "ח.פ." },
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
              <div>
                <label className="text-xs text-gray-500 mb-1 block">מהות הפרויקט</label>
                <textarea
                  value={projectForm.description}
                  onChange={e => setProjectForm(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="תיאור קצר של הפרויקט..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300 resize-none"
                />
              </div>
            </div>

            {/* Team section */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold" style={{ color: "#011e41" }}>צוות הפרויקט</span>
                <button onClick={() => setAddingMember(true)} className="text-xs px-2 py-1 rounded text-white" style={{ background: "#011e41" }}>+ הוסף</button>
              </div>
              {projectMembers.length === 0 && !addingMember && (
                <p className="text-xs text-gray-400">לא הוקצו חברי צוות לפרויקט זה</p>
              )}
              <div className="space-y-1.5 mb-2">
                {projectMembers.map(m => (
                  <div key={m.user_id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.user_name || m.user_email || m.user_id}</div>
                      {m.user_email && m.user_name && <div className="text-xs text-gray-400 truncate">{m.user_email}</div>}
                    </div>
                    <select
                      value={m.role}
                      onChange={e => updateMemberRole(m.user_id, e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 outline-none"
                    >
                      <option value="manager">מנהל פרויקט</option>
                      <option value="member">חבר צוות</option>
                      <option value="viewer">צופה</option>
                    </select>
                    <button onClick={() => removeMember(m.user_id)} className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
                  </div>
                ))}
              </div>
              {addingMember && (
                <div className="flex gap-2 items-end flex-wrap bg-blue-50 rounded-lg p-3">
                  <div className="flex-1 min-w-40">
                    <label className="text-xs text-gray-500 mb-1 block">משתמש</label>
                    <select
                      value={newMemberUserId}
                      onChange={e => setNewMemberUserId(e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none"
                    >
                      <option value="">— בחר משתמש —</option>
                      {users.filter(u => !projectMembers.some(m => m.user_id === u.id)).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email || ""})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">תפקיד</label>
                    <select
                      value={newMemberRole}
                      onChange={e => setNewMemberRole(e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm outline-none"
                    >
                      <option value="manager">מנהל פרויקט</option>
                      <option value="member">חבר צוות</option>
                      <option value="viewer">צופה</option>
                    </select>
                  </div>
                  <button onClick={addProjectMember} className="text-xs px-3 py-1.5 rounded text-white" style={{ background: "#27ae60" }}>הוסף</button>
                  <button onClick={() => setAddingMember(false)} className="text-xs text-gray-400 px-2">ביטול</button>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5 justify-end border-t border-gray-100 pt-4">
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
          { id: "kanban" as Tab, label: "חתך סטטוס" },
          { id: "gantt" as Tab, label: "ציר זמן" },
          { id: "budget" as Tab, label: "תקציב" },
          { id: "docs" as Tab, label: "מסמכים" },
          { id: "comments" as Tab, label: "תגובות" },
          { id: "professionals" as Tab, label: "אנשי מקצוע" },
          { id: "meetings" as Tab, label: "סיכומי פגישות" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-[#011e41] text-[#011e41]" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={downloadExport}
          className="mr-auto text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1"
        >
          יצא Excel
        </button>
      </div>

      {/* Tab: Tasks */}
      {tab === "tasks" && (
        <div className="flex-1 overflow-auto px-8 py-6">
          {/* Bulk action bar */}
          {selectedTasks.size > 0 && (
            <div className="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3 flex-wrap shadow-sm">
              <span className="text-sm font-medium text-blue-700">{selectedTasks.size} משימות נבחרו</span>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    disabled={bulkLoading}
                    onClick={async () => {
                      setBulkLoading(true);
                      await Promise.all([...selectedTasks].map(id =>
                        apiFetch(`/tenants/${TENANT_ID}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status: s.value }) })
                      ));
                      setTasks(prev => prev.map(t => selectedTasks.has(t.id) ? { ...t, status: s.value } : t));
                      setSelectedTasks(new Set());
                      setBulkLoading(false);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium transition-opacity"
                    style={{ background: s.bg, color: s.text, opacity: bulkLoading ? 0.5 : 1 }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSelectedTasks(new Set())}
                className="mr-auto text-xs text-gray-400 hover:text-gray-600"
              >
                בטל בחירה
              </button>
            </div>
          )}
          {stages.map((stage) => {
            const stageTasks = tasks.filter(t => t.stage_id === stage.id);
            const isCollapsed = collapsed[stage.id];
            return (
              <div
                key={stage.id}
                className="mb-6"
                onDragOver={e => handleStageDragOver(e, stage.id)}
              >
                <div
                  className="flex items-center gap-2 mb-1 select-none group/stage cursor-pointer rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors"
                  onClick={() => setCollapsed(p => ({ ...p, [stage.id]: !p[stage.id] }))}
                >
                  {/* Collapse arrow */}
                  <span className="text-gray-400 text-sm font-bold w-5 text-center transition-transform duration-150" style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", display: "inline-block" }}>
                    ▾
                  </span>
                  {/* Drag handle */}
                  <span
                    className="text-gray-300 cursor-grab text-xs px-0.5"
                    draggable
                    onClick={e => e.stopPropagation()}
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
                      onClick={e => { e.stopPropagation(); setCollapsed(p => ({ ...p, [stage.id]: !p[stage.id] })); }}
                    >{stage.name}</span>
                  )}
                  <span className="text-xs text-gray-400">({stageTasks.length})</span>

                  {/* ⋮ menu */}
                  <div className="relative mr-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => { e.stopPropagation(); setStageMenu(stageMenu === stage.id ? null : stage.id); }}
                      className="opacity-0 group-hover/stage:opacity-100 text-gray-400 hover:text-gray-600 px-1 text-base leading-none"
                    >⋮</button>
                    {stageMenu === stage.id && (
                      <>
                        {/* Backdrop — closes menu on outside click */}
                        <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onMouseDown={() => setStageMenu(null)} />
                      <div
                        className="absolute right-0 top-6 bg-white shadow-xl rounded-lg border border-gray-200 py-1 min-w-40"
                        style={{ zIndex: 9999 }}
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
                      </>
                    )}
                  </div>

                </div>

                {!isCollapsed && (
                  <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
                    <div className="flex bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium select-none" style={{ minWidth: "max-content" }}>
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
                        <div key={task.id}
                          draggable
                          onDragStart={() => setDragTaskListId(task.id)}
                          onDragOver={e => { e.preventDefault(); setDragOverTaskListId(task.id); }}
                          onDrop={() => { if (dragTaskListId) handleTaskListDrop(dragTaskListId, task.id); }}
                          onDragEnd={() => { setDragTaskListId(null); setDragOverTaskListId(null); }}
                          className="flex items-center border-b border-gray-100 hover:bg-gray-50 group text-sm"
                          style={{ background: selectedTasks.has(task.id) ? "#eff6ff" : dragOverTaskListId === task.id && dragTaskListId !== task.id ? "#f0f4ff" : undefined, minWidth: "max-content", cursor: "grab" }}>
                          <div style={{ width: 32, minWidth: 32 }} className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedTasks.has(task.id)}
                              onChange={e => {
                                const next = new Set(selectedTasks);
                                if (e.target.checked) next.add(task.id);
                                else next.delete(task.id);
                                setSelectedTasks(next);
                              }}
                              className="w-3.5 h-3.5 accent-blue-600 cursor-pointer opacity-0 group-hover:opacity-100"
                              style={{ opacity: selectedTasks.has(task.id) ? 1 : undefined }}
                            />
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
                              onChange={e => {
                                const v = e.target.value;
                                if (v && task.start_date && v <= task.start_date.slice(0, 10)) {
                                  alert("תאריך סיום חייב להיות אחרי תאריך ההתחלה");
                                  e.target.value = task.end_date ? task.end_date.slice(0, 10) : "";
                                  return;
                                }
                                updateTask(task.id, { end_date: v || undefined });
                              }}
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

                          {/* Comments + Attach + Delete icons */}
                          <div className="px-2 py-1.5 flex items-center gap-1">
                            <button
                              onClick={() => { setSelectedTaskId(task.id); setTab("comments"); }}
                              className="text-gray-300 hover:text-blue-500 text-base"
                              title="תגובות"
                            >
                              💬
                            </button>
                            <button
                              onClick={() => { setTaskPanel(task.id); setSelectedTaskId(task.id); }}
                              className="text-gray-400 hover:text-green-600 text-xl"
                              title="צרף מסמך"
                            >
                              📎
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
                      <div className="mx-4 my-3 bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm" dir="rtl">
                        <div className="text-xs font-semibold text-blue-700 mb-3">משימה חדשה — {stage.name}</div>
                        <div className="grid grid-cols-1 gap-3">
                          {/* Title — required */}
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">שם המשימה <span className="text-red-500">*</span></label>
                            <input
                              autoFocus
                              value={newTaskForm.title}
                              onChange={e => setNewTaskForm(f => ({ ...f, title: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Escape") { setAddingToStage(null); setNewTaskErrors({}); } if (e.key === "Enter") addTask(stage.id); }}
                              placeholder="שם המשימה..."
                              className={`w-full text-sm border rounded-lg px-3 py-2 outline-none bg-white ${newTaskErrors.title ? "border-red-400" : "border-gray-200 focus:border-blue-400"}`}
                            />
                            {newTaskErrors.title && <span className="text-xs text-red-500">{newTaskErrors.title}</span>}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            {/* Assignee — required */}
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">אחראי <span className="text-red-500">*</span></label>
                              <select
                                value={newTaskForm.assignee_id}
                                onChange={e => setNewTaskForm(f => ({ ...f, assignee_id: e.target.value }))}
                                className={`w-full text-sm border rounded-lg px-3 py-2 outline-none bg-white ${newTaskErrors.assignee_id ? "border-red-400" : "border-gray-200 focus:border-blue-400"}`}
                              >
                                <option value="">בחר אחראי...</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                              {newTaskErrors.assignee_id && <span className="text-xs text-red-500">{newTaskErrors.assignee_id}</span>}
                            </div>

                            {/* Status */}
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">סטטוס <span className="text-red-500">*</span></label>
                              <select
                                value={newTaskForm.status}
                                onChange={e => setNewTaskForm(f => ({ ...f, status: e.target.value }))}
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none bg-white focus:border-blue-400"
                              >
                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            {/* Priority */}
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">עדיפות <span className="text-red-500">*</span></label>
                              <select
                                value={newTaskForm.priority}
                                onChange={e => setNewTaskForm(f => ({ ...f, priority: e.target.value }))}
                                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none bg-white focus:border-blue-400"
                              >
                                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                              </select>
                            </div>

                            {/* Start date — required */}
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">תאריך התחלה <span className="text-red-500">*</span></label>
                              <input
                                type="date"
                                value={newTaskForm.start_date}
                                onChange={e => setNewTaskForm(f => ({ ...f, start_date: e.target.value }))}
                                className={`w-full text-sm border rounded-lg px-3 py-2 outline-none bg-white ${newTaskErrors.start_date ? "border-red-400" : "border-gray-200 focus:border-blue-400"}`}
                              />
                              {newTaskErrors.start_date && <span className="text-xs text-red-500">{newTaskErrors.start_date}</span>}
                            </div>

                            {/* End date — required */}
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">תאריך סיום <span className="text-red-500">*</span></label>
                              <input
                                type="date"
                                value={newTaskForm.end_date}
                                onChange={e => setNewTaskForm(f => ({ ...f, end_date: e.target.value }))}
                                className={`w-full text-sm border rounded-lg px-3 py-2 outline-none bg-white ${newTaskErrors.end_date ? "border-red-400" : "border-gray-200 focus:border-blue-400"}`}
                              />
                              {newTaskErrors.end_date && <span className="text-xs text-red-500">{newTaskErrors.end_date}</span>}
                            </div>
                          </div>

                          {/* Description */}
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">תיאור</label>
                            <textarea
                              value={newTaskForm.description}
                              onChange={e => setNewTaskForm(f => ({ ...f, description: e.target.value }))}
                              placeholder="תיאור אופציונלי..."
                              rows={2}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none bg-white focus:border-blue-400 resize-none"
                            />
                          </div>

                          {/* Attachment */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <input ref={newTaskFileRef} type="file" className="hidden" onChange={e => setNewTaskFile(e.target.files?.[0] ?? null)} />
                            <button
                              type="button"
                              onClick={() => newTaskFileRef.current?.click()}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"
                            >
                              📎 {newTaskFile ? newTaskFile.name : "צרף מסמך (אופציונלי)"}
                            </button>
                            {newTaskFile && (
                              <>
                                <input
                                  type="date"
                                  value={newTaskDocExpiry}
                                  onChange={e => setNewTaskDocExpiry(e.target.value)}
                                  placeholder="תאריך תוקף"
                                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-300"
                                />
                                <button type="button" onClick={() => { setNewTaskFile(null); setNewTaskDocExpiry(""); if (newTaskFileRef.current) newTaskFileRef.current.value = ""; }} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                              </>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => addTask(stage.id)}
                              className="px-4 py-2 text-sm font-medium text-white rounded-lg"
                              style={{ background: "#011e41" }}
                            >
                              הוסף משימה
                            </button>
                            <button
                              onClick={() => { setAddingToStage(null); setNewTaskErrors({}); setNewTaskForm({ title: "", status: "todo", priority: "medium", assignee_id: "", start_date: new Date().toISOString().slice(0, 10), end_date: "", description: "" }); setNewTaskFile(null); setNewTaskDocExpiry(""); if (newTaskFileRef.current) newTaskFileRef.current.value = ""; }}
                              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
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

      {/* Tab: Kanban */}
      {tab === "kanban" && (() => {
        const KANBAN_COLS = [
          { status: "in_progress", label: "בעבודה",       color: "#2980b9", bg: "#ebf5fb" },
          { status: "done",        label: "בוצע",          color: "#27ae60", bg: "#eafaf1" },
          { status: "delayed",     label: "בעיכוב",        color: "#e67e22", bg: "#fef9ec" },
          { status: "rejected",    label: "נדחה",          color: "#c0392b", bg: "#fdedec" },
          { status: "partial",     label: "בוצע חלקית",   color: "#8e44ad", bg: "#f5eef8" },
        ];
        const PRIO_COLOR: Record<string, string> = { high: "#c0392b", medium: "#e67e22", low: "#27ae60" };
        const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
        const stageMap = Object.fromEntries(stages.map(s => [s.id, s.name]));

        async function handleDrop(taskId: string, newStatus: string) {
          const task = tasks.find(t => t.id === taskId);
          if (!task || task.status === newStatus) return;
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
          try {
            await apiFetch(`/tenants/${TENANT_ID}/tasks/${taskId}`, {
              method: "PUT",
              body: JSON.stringify({ status: newStatus }),
            });
          } catch {
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t));
          }
        }

        const kanbanFiltered = tasks.filter(t => {
          if (kanbanStageFilter !== "all" && t.stage_id !== kanbanStageFilter) return false;
          if (kanbanAssigneeFilter !== "all" && t.assignee_id !== kanbanAssigneeFilter) return false;
          return true;
        });

        return (
          <div className="flex-1 overflow-auto px-6 py-4 flex flex-col gap-3">
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              <select
                value={kanbanStageFilter}
                onChange={e => setKanbanStageFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm"
              >
                <option value="all">כל השלבים</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                value={kanbanAssigneeFilter}
                onChange={e => setKanbanAssigneeFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm"
              >
                <option value="all">כל האחראים</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {(kanbanStageFilter !== "all" || kanbanAssigneeFilter !== "all") && (
                <button
                  onClick={() => { setKanbanStageFilter("all"); setKanbanAssigneeFilter("all"); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  נקה פילטרים
                </button>
              )}
            </div>
            <div className="flex gap-3 overflow-auto" style={{ minWidth: KANBAN_COLS.length * 220, flex: 1 }}>
              {KANBAN_COLS.map(col => {
                const colTasks = kanbanFiltered.filter(t => t.status === col.status);
                return (
                  <div
                    key={col.status}
                    className="flex flex-col rounded-xl border border-gray-200 overflow-hidden flex-shrink-0"
                    style={{ width: 220, background: col.bg }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      const taskId = e.dataTransfer.getData("taskId");
                      if (taskId) handleDrop(taskId, col.status);
                    }}
                  >
                    {/* Column header */}
                    <div className="px-3 py-2.5 flex items-center gap-2 border-b border-gray-200 bg-white/60">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                      <span className="text-sm font-semibold" style={{ color: col.color }}>{col.label}</span>
                      <span
                        className="mr-auto text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: col.color + "20", color: col.color }}
                      >
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {colTasks.map(task => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData("taskId", task.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => setTaskPanel(task.id)}
                          className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                        >
                          {/* Priority stripe */}
                          <div className="w-full h-0.5 rounded-full mb-2" style={{ background: PRIO_COLOR[task.priority] || "#ccc" }} />
                          <div className="text-sm font-medium text-gray-800 leading-tight">{task.title}</div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {task.stage_id && stageMap[task.stage_id] && (
                              <span className="text-xs text-gray-400 truncate max-w-full">{stageMap[task.stage_id]}</span>
                            )}
                          </div>
                          {(task.assignee_id || task.end_date) && (
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              {task.assignee_id && userMap[task.assignee_id] && (
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ background: "#011e41" }}
                                  title={userMap[task.assignee_id]}
                                >
                                  {userMap[task.assignee_id][0]}
                                </div>
                              )}
                              {task.end_date && (
                                <span className="text-xs text-gray-400 mr-auto">
                                  {new Date(task.end_date).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {colTasks.length === 0 && (
                        <div
                          className="h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300"
                        >
                          גרור לכאן
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
        const rawMin = new Date(Math.min(...allDates.map(d => d.getTime())));
        const rawMax = new Date(Math.max(...allDates.map(d => d.getTime())));

        // Align min/max to zoom boundaries
        const minDate = new Date(rawMin);
        const maxDate = new Date(rawMax);
        if (ganttZoom === "day") {
          minDate.setHours(0, 0, 0, 0);
          maxDate.setDate(maxDate.getDate() + 1);
          maxDate.setHours(0, 0, 0, 0);
        } else if (ganttZoom === "week") {
          const day = minDate.getDay();
          minDate.setDate(minDate.getDate() - day);
          minDate.setHours(0, 0, 0, 0);
          maxDate.setDate(maxDate.getDate() + (7 - maxDate.getDay()));
          maxDate.setHours(0, 0, 0, 0);
        } else if (ganttZoom === "month") {
          minDate.setDate(1);
          maxDate.setMonth(maxDate.getMonth() + 1, 1);
        } else {
          minDate.setMonth(0, 1);
          maxDate.setFullYear(maxDate.getFullYear() + 1, 0, 1);
        }

        const totalMs = maxDate.getTime() - minDate.getTime();
        const totalDays = totalMs / 86400000;

        // Generate header ticks based on zoom
        const ticks: { label: string; pct: number }[] = [];
        const cur = new Date(minDate);
        while (cur < maxDate) {
          const pct = ((cur.getTime() - minDate.getTime()) / totalMs) * 100;
          let label = "";
          if (ganttZoom === "day") {
            label = cur.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
            cur.setDate(cur.getDate() + 1);
          } else if (ganttZoom === "week") {
            label = cur.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
            cur.setDate(cur.getDate() + 7);
          } else if (ganttZoom === "month") {
            label = cur.toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
            cur.setMonth(cur.getMonth() + 1);
          } else {
            label = String(cur.getFullYear());
            cur.setFullYear(cur.getFullYear() + 1);
          }
          ticks.push({ label, pct });
        }

        // Today marker
        const todayPct = ((new Date().getTime() - minDate.getTime()) / totalMs) * 100;
        const showToday = todayPct >= 0 && todayPct <= 100;

        const STATUS_COLORS: Record<string, string> = { todo: "#aaa", in_progress: "#2980b9", done: "#27ae60", blocked: "#c0392b", review: "#8e44ad" };
        // Minimum bar width in pixels (for very short tasks)
        const minBarPct = (1 / totalDays) * 100;

        return (
          <div className="flex-1 overflow-auto px-6 py-4">
            {/* Zoom controls */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-400">תצוגה:</span>
              {(["day", "week", "month", "year"] as const).map(z => (
                <button
                  key={z}
                  onClick={() => setGanttZoom(z)}
                  className="px-3 py-1 text-xs rounded-md transition-colors"
                  style={{
                    background: ganttZoom === z ? "#011e41" : "#f3f4f6",
                    color: ganttZoom === z ? "#fff" : "#555",
                  }}
                >
                  {z === "day" ? "יום" : z === "week" ? "שבוע" : z === "month" ? "חודש" : "שנה"}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header ticks */}
              <div className="relative h-8 border-b border-gray-200 bg-gray-50" style={{ marginRight: 220 }}>
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center text-xs text-gray-400 px-1.5 border-r border-gray-200"
                    style={{ left: `${t.pct}%` }}
                  >
                    {t.label}
                  </div>
                ))}
                {/* Today line */}
                {showToday && (
                  <div
                    className="absolute top-0 h-full border-r-2 border-red-400 opacity-60"
                    style={{ left: `${todayPct}%` }}
                    title="היום"
                  />
                )}
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
                      const startMs = new Date(task.start_date!).getTime() - minDate.getTime();
                      const endMs = new Date(task.end_date!).getTime() - minDate.getTime();
                      const leftPct = Math.max(0, (startMs / totalMs) * 100);
                      const widthPct = Math.max(minBarPct, ((endMs - startMs) / totalMs) * 100);
                      const color = STATUS_COLORS[task.status] || "#aaa";
                      return (
                        <div key={task.id} className="flex items-center border-b border-gray-50 hover:bg-gray-50 py-1.5">
                          <div className="text-sm text-gray-700 truncate flex-shrink-0 px-3" style={{ width: 220 }}>{task.title}</div>
                          <div className="flex-1 relative h-6">
                            {/* Today line in row */}
                            {showToday && (
                              <div className="absolute top-0 h-full border-r border-red-300 opacity-40" style={{ left: `${todayPct}%` }} />
                            )}
                            <div
                              className="absolute h-5 rounded-md top-0.5 flex items-center px-2 text-white text-xs overflow-hidden cursor-pointer"
                              style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color, minWidth: 4 }}
                              title={`${task.start_date?.slice(0, 10)} → ${task.end_date?.slice(0, 10)}`}
                              onClick={() => setTaskPanel(task.id)}
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

          {/* Category breakdown — chart + table */}
          {budgetSummary.length > 0 && (() => {
            const maxVal = Math.max(...budgetSummary.map(r => Math.max(r.planned, r.actual)), 1);
            return (
              <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">פירוט לפי קטגוריה</span>
                  <div className="flex gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#dbeafe" }} />מתוכנן</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#27ae60" }} />בפועל</span>
                  </div>
                </div>

                {/* Bar chart */}
                <div className="px-5 py-4 space-y-3 border-b border-gray-100">
                  {budgetSummary.map(row => (
                    <div key={row.category}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{row.category}</span>
                        <span style={{ color: row.diff < 0 ? "#c0392b" : "#555" }}>
                          {fmt(row.actual)} / {fmt(row.planned)}
                        </span>
                      </div>
                      <div className="w-full h-4 bg-gray-100 rounded overflow-hidden relative">
                        <div
                          className="absolute h-full rounded"
                          style={{ width: `${(row.planned / maxVal) * 100}%`, background: "#dbeafe" }}
                        />
                        <div
                          className="absolute h-full rounded"
                          style={{ width: `${(row.actual / maxVal) * 100}%`, background: row.actual > row.planned ? "#c0392b" : "#27ae60" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table */}
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
                        <td className="px-5 py-2 text-blue-600">{fmt(row.planned)}</td>
                        <td className="px-5 py-2 font-medium" style={{ color: row.actual > row.planned ? "#c0392b" : "#27ae60" }}>{fmt(row.actual)}</td>
                        <td className="px-5 py-2 text-sm" style={{ color: row.diff < 0 ? "#c0392b" : "#27ae60" }}>
                          {row.diff > 0 ? "+" : ""}{fmt(row.diff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

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
                  <th className="px-3 py-2 w-8" title="סמן כבוצע" />
                  <th className="px-5 py-2 text-right font-medium">קטגוריה</th>
                  <th className="px-5 py-2 text-right font-medium">תיאור</th>
                  <th className="px-5 py-2 text-right font-medium">ספק</th>
                  <th className="px-5 py-2 text-right font-medium">סכום</th>
                  <th className="px-5 py-2 text-right font-medium">סוג</th>
                  <th className="px-5 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {budgetEntries.map(entry => {
                  const isEditing = editEntry?.id === entry.id;
                  return (
                  <tr key={entry.id}
                    draggable={!isEditing}
                    onDragStart={() => !isEditing && setDragBudgetId(entry.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverBudgetId(entry.id); }}
                    onDrop={() => {
                      if (!dragBudgetId || dragBudgetId === entry.id) return;
                      setBudgetEntries(prev => {
                        const arr = [...prev];
                        const from = arr.findIndex(x => x.id === dragBudgetId);
                        const to   = arr.findIndex(x => x.id === entry.id);
                        arr.splice(to, 0, arr.splice(from, 1)[0]);
                        return arr;
                      });
                      setDragBudgetId(null); setDragOverBudgetId(null);
                    }}
                    onDragEnd={() => { setDragBudgetId(null); setDragOverBudgetId(null); }}
                    style={{ background: isEditing ? "#f0f9ff" : dragOverBudgetId === entry.id && dragBudgetId !== entry.id ? "#f0f4ff" : undefined, cursor: isEditing ? "default" : "grab" }}
                    className={`border-t border-gray-50 hover:bg-gray-50 group ${!entry.is_planned && !isEditing ? "opacity-60" : ""}`}>
                    {isEditing ? (
                      <>
                        <td className="px-2 py-1.5">
                          <select value={editEntry.category} onChange={e => setEditEntry({ ...editEntry, category: e.target.value })}
                            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 outline-none">
                            {BUDGET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={editEntry.description} onChange={e => setEditEntry({ ...editEntry, description: e.target.value })}
                            autoFocus onKeyDown={e => { if (e.key === "Enter") saveBudgetEntry(); if (e.key === "Escape") setEditEntry(null); }}
                            className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 outline-none" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={editEntry.vendor || ""} onChange={e => setEditEntry({ ...editEntry, vendor: e.target.value })}
                            placeholder="ספק" className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 outline-none" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={editEntry.amount} onChange={e => setEditEntry({ ...editEntry, amount: Number(e.target.value) })}
                            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 outline-none" />
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={editEntry.is_planned} onChange={e => setEditEntry({ ...editEntry, is_planned: parseInt(e.target.value) })}
                            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 outline-none">
                            <option value="0">בפועל</option>
                            <option value="1">מתוכנן</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 flex gap-1 items-center">
                          <button onClick={saveBudgetEntry} className="text-xs px-2 py-1 rounded text-white" style={{ background: "#011e41" }}>✓</button>
                          <button onClick={() => setEditEntry(null)} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500">✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={entry.is_planned === 0}
                            onChange={() => toggleBudgetEntryDone(entry.id, entry.is_planned)}
                            title={entry.is_planned ? "סמן כבוצע (יעבור לבפועל)" : "בוצע"}
                            className="accent-green-600 cursor-pointer"
                            disabled={entry.is_planned === 0}
                          />
                        </td>
                        <td className="px-5 py-2 text-gray-600">{entry.category}</td>
                        <td className="px-5 py-2 font-medium text-gray-800" style={{ textDecoration: entry.is_planned === 0 ? "line-through" : "none" }}>{entry.description}</td>
                        <td className="px-5 py-2 text-gray-500">{entry.vendor || "—"}</td>
                        <td className="px-5 py-2 font-medium">{fmt(entry.amount)}</td>
                        <td className="px-5 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${entry.is_planned ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {entry.is_planned ? "מתוכנן" : "בפועל"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                            <button onClick={() => setEditEntry({ ...entry })} className="text-gray-400 hover:text-blue-500 text-xs">✏</button>
                            <button onClick={() => deleteBudgetEntry(entry.id)} className="text-gray-400 hover:text-red-400 text-xs">✕</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )})}
                {budgetEntries.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">אין רשומות תקציב עדיין</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Budget Gantt — monthly planned vs actual */}
          {budgetEntries.length > 0 && (() => {
            // Build last 3 + next 9 months relative to today
            const now = new Date();
            const months: { key: string; label: string }[] = [];
            for (let i = -3; i <= 8; i++) {
              const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              const label = d.toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
              months.push({ key, label });
            }
            // Aggregate entries by month using entry_date (or created_at fallback)
            const planned: Record<string, number> = {};
            const actual: Record<string, number> = {};
            budgetEntries.forEach(e => {
              const raw = (e as any).entry_date || (e as any).created_at;
              if (!raw) return;
              const d = new Date(raw);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              if (e.is_planned) planned[key] = (planned[key] || 0) + e.amount;
              else actual[key] = (actual[key] || 0) + e.amount;
            });
            const maxVal = Math.max(1, ...months.flatMap(m => [planned[m.key] || 0, actual[m.key] || 0]));
            const hasAny = months.some(m => (planned[m.key] || 0) + (actual[m.key] || 0) > 0);
            if (!hasAny) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
                <div className="px-5 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">גאנט תקציב — מתוכנן מול בפועל</span>
                </div>
                <div className="px-5 py-4 overflow-x-auto">
                  <div className="flex gap-1 items-end min-w-max">
                    {months.map(({ key, label }) => {
                      const p = planned[key] || 0;
                      const a = actual[key] || 0;
                      const pPct = Math.round((p / maxVal) * 100);
                      const aPct = Math.round((a / maxVal) * 100);
                      const isCurrentMonth = key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                      return (
                        <div key={key} className="flex flex-col items-center gap-1" style={{ width: 52 }}>
                          <div className="flex gap-0.5 items-end" style={{ height: 80 }}>
                            {p > 0 && (
                              <div
                                title={`מתוכנן: ${fmt(p)}`}
                                style={{ width: 18, height: `${pPct}%`, background: "#3b82f6", borderRadius: "3px 3px 0 0", minHeight: 3 }}
                              />
                            )}
                            {a > 0 && (
                              <div
                                title={`בפועל: ${fmt(a)}`}
                                style={{ width: 18, height: `${aPct}%`, background: "#22c55e", borderRadius: "3px 3px 0 0", minHeight: 3 }}
                              />
                            )}
                          </div>
                          <span className="text-xs text-gray-500" style={{ fontWeight: isCurrentMonth ? 700 : 400, color: isCurrentMonth ? "#011e41" : undefined }}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span style={{ width: 12, height: 12, background: "#3b82f6", borderRadius: 2, display: "inline-block" }} />מתוכנן</span>
                    <span className="flex items-center gap-1"><span style={{ width: 12, height: 12, background: "#22c55e", borderRadius: 2, display: "inline-block" }} />בפועל</span>
                  </div>
                </div>
              </div>
            );
          })()}

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
                  const paid = q.milestones.filter(m => m.is_paid).reduce((s, m) => s + (m.paid_amount ?? m.amount), 0);
                  const unpaid = q.milestones.filter(m => !m.is_paid).reduce((s, m) => s + m.amount, 0);
                  // Build stage→task groups for this project
                  const tasksByStage: Record<string, { stageName: string; tasks: Task[] }> = {};
                  for (const t of tasks) {
                    const stage = stages.find(s => s.id === t.stage_id);
                    if (!tasksByStage[t.stage_id]) tasksByStage[t.stage_id] = { stageName: stage?.name || "קבוצה", tasks: [] };
                    tasksByStage[t.stage_id].tasks.push(t);
                  }
                  const taskMap: Record<string, Task> = {};
                  for (const t of tasks) taskMap[t.id] = t;
                  const statusColors: Record<string, string> = { pending_review: "#e67e22", approved: "#27ae60", rejected: "#c0392b" };
                  const statusLabels: Record<string, string> = { pending_review: "ממתין לאישור", approved: "מאושר", rejected: "נדחה" };
                  return (
                    <div key={q.id}>
                      <div className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                        <div
                          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                          onClick={() => setExpandedQuoteId(isExpanded ? null : q.id)}
                        >
                          <span className="text-gray-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                          <span className="font-medium text-sm truncate">{q.title}</span>
                          {q.vendor && <span className="text-xs text-gray-400">· {q.vendor}</span>}
                          <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: (statusColors[q.status] || "#888") + "20", color: statusColors[q.status] || "#888" }}>
                            {statusLabels[q.status] || q.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {q.total_amount != null && <span className="font-bold text-sm" style={{ color: "#011e41" }}>{fmt(q.total_amount)}</span>}
                          {q.status === "pending_review" && (
                            <button
                              onClick={() => approveQuote(q.id)}
                              className="text-xs px-3 py-1 rounded-lg text-white font-medium"
                              style={{ background: "#27ae60" }}
                            >אשר הצעה</button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); deleteQuote(q.id); }}
                            className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-50 border border-red-100"
                            title="מחק הצעה"
                          >מחק</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-5 pb-4 space-y-2">
                          {[...q.milestones].sort((a, b) => a.order - b.order).map(ms => {
                            const isOverdue = !ms.is_paid && ms.due_date && new Date(ms.due_date) < new Date();
                            const editingDesc = editingMilestone?.id === ms.id && editingMilestone.field === "description";
                            const editingAmt = editingMilestone?.id === ms.id && editingMilestone.field === "amount";
                            const isPaying = payingMsId === ms.id;
                            const linkedTask = ms.task_id ? taskMap[ms.task_id] : null;
                            return (
                              <div key={ms.id} className="rounded-lg border text-sm group/ms"
                                style={{
                                  borderColor: ms.is_paid ? "#d1fae5" : isOverdue ? "#fecaca" : "#f0f0f0",
                                  background: ms.is_paid ? "#f0fdf4" : isOverdue ? "#fef3f2" : "#fafafa",
                                }}>
                                {/* Main row */}
                                <div className="flex items-start gap-2 px-3 py-2.5">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {ms.is_paid === 1 && (
                                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#d1fae5", color: "#16a34a" }}>שולם</span>
                                      )}
                                      {editingDesc ? (
                                        <input
                                          autoFocus
                                          className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5 outline-none"
                                          value={editingMilestone.value}
                                          onChange={e => setEditingMilestone(p => p ? { ...p, value: e.target.value } : p)}
                                          onBlur={() => saveMilestoneField(q.id, ms.id, "description", editingMilestone.value)}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") saveMilestoneField(q.id, ms.id, "description", editingMilestone.value);
                                            if (e.key === "Escape") setEditingMilestone(null);
                                          }}
                                        />
                                      ) : (
                                        <span
                                          className="cursor-pointer hover:underline"
                                          onClick={() => setEditingMilestone({ id: ms.id, field: "description", value: ms.description })}
                                          style={{ textDecoration: ms.is_paid ? "line-through" : "none", color: ms.is_paid ? "#aaa" : isOverdue ? "#c0392b" : "#333" }}>
                                          {ms.description}
                                        </span>
                                      )}
                                      {ms.percentage != null && <span className="text-xs text-gray-400">({ms.percentage}%)</span>}
                                    </div>
                                    {/* Task link row */}
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      <span className="text-xs text-gray-400">משימה:</span>
                                      <select
                                        value={ms.task_id || ""}
                                        disabled={savingMsTaskLink === ms.id}
                                        onChange={e => linkMilestoneTaskProj(q, ms, e.target.value)}
                                        className="text-xs border border-gray-200 rounded px-2 py-0.5 bg-white max-w-xs"
                                        style={{ opacity: savingMsTaskLink === ms.id ? 0.5 : 1 }}
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
                                      {/* Date: task end_date if linked, else editable due_date */}
                                      {linkedTask?.end_date ? (
                                        <span className="text-xs text-blue-400">יעד: {new Date(linkedTask.end_date).toLocaleDateString("he-IL")}</span>
                                      ) : (
                                        <input
                                          type="date"
                                          value={ms.due_date ? ms.due_date.slice(0, 10) : ""}
                                          onChange={e => saveMilestoneDueDate(q, ms, e.target.value)}
                                          className="text-xs border border-gray-200 rounded px-1 py-0.5 outline-none w-32"
                                          style={{ color: isOverdue ? "#c0392b" : "#888" }}
                                          title="תאריך צפוי לתשלום"
                                        />
                                      )}
                                    </div>
                                  </div>
                                  {/* Amount + actions */}
                                  <div className="text-left shrink-0">
                                    {editingAmt ? (
                                      <input
                                        autoFocus
                                        type="number"
                                        className="w-24 text-sm border border-blue-300 rounded px-2 py-0.5 outline-none"
                                        value={editingMilestone.value}
                                        onChange={e => setEditingMilestone(p => p ? { ...p, value: e.target.value } : p)}
                                        onBlur={() => saveMilestoneField(q.id, ms.id, "amount", editingMilestone.value)}
                                        onKeyDown={e => {
                                          if (e.key === "Enter") saveMilestoneField(q.id, ms.id, "amount", editingMilestone.value);
                                          if (e.key === "Escape") setEditingMilestone(null);
                                        }}
                                      />
                                    ) : (
                                      <span
                                        className="font-semibold text-sm cursor-pointer hover:underline"
                                        onClick={() => setEditingMilestone({ id: ms.id, field: "amount", value: String(ms.amount) })}
                                        style={{ color: ms.is_paid ? "#16a34a" : "#011e41" }}>
                                        {ms.is_paid && ms.paid_amount != null && ms.paid_amount !== ms.amount
                                          ? <><span className="line-through text-gray-400 text-xs ml-1">{fmt(ms.amount)}</span>{fmt(ms.paid_amount)}</>
                                          : fmt(ms.amount)
                                        }
                                      </span>
                                    )}
                                    <div className="mt-1.5 flex gap-1 justify-end">
                                      {ms.is_paid === 0 && !isPaying && (
                                        <button
                                          onClick={() => { setPayingMsId(ms.id); setPayingMsAmount(String(ms.amount)); }}
                                          className="text-xs px-2 py-1 rounded-lg font-medium"
                                          style={{ background: "#27ae6020", color: "#27ae60" }}
                                        >סמן כשולם</button>
                                      )}
                                      {ms.is_paid === 1 && (
                                        <button
                                          onClick={() => unmarkMilestonePaid(q, ms)}
                                          className="text-xs px-2 py-1 rounded-lg"
                                          style={{ background: "#f5f5f5", color: "#999" }}
                                        >בטל</button>
                                      )}
                                      <button
                                        onClick={() => deleteMilestone(q.id, ms.id)}
                                        className="opacity-0 group-hover/ms:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs px-1"
                                        title="מחק"
                                      >✕</button>
                                    </div>
                                  </div>
                                </div>
                                {/* Inline pay form */}
                                {isPaying && (
                                  <div className="border-t border-gray-100 px-3 py-2 flex items-center gap-2 bg-white flex-wrap">
                                    <span className="text-xs text-gray-500">סכום ששולם:</span>
                                    <input
                                      type="number"
                                      value={payingMsAmount}
                                      onChange={e => setPayingMsAmount(e.target.value)}
                                      className="border border-gray-200 rounded px-2 py-1 text-sm w-24 outline-none"
                                    />
                                    <span className="text-xs text-gray-400">מתוך {fmt(ms.amount)}</span>
                                    <button
                                      onClick={() => markMilestonePaid(q, ms, parseFloat(payingMsAmount) || ms.amount)}
                                      className="text-xs px-3 py-1 rounded-lg text-white"
                                      style={{ background: "#27ae60" }}
                                    >אשר</button>
                                    <button
                                      onClick={() => { setPayingMsId(null); setPayingMsAmount(""); }}
                                      className="text-xs px-2 py-1 rounded-lg"
                                      style={{ background: "#f5f5f5", color: "#999" }}
                                    >ביטול</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {q.milestones.length > 0 && (
                            <div className="flex gap-4 text-xs pt-1 px-1">
                              <span className="text-green-600">שולם: {fmt(paid)}</span>
                              <span className="text-orange-500">נותר: {fmt(unpaid)}</span>
                            </div>
                          )}
                          {addingMilestoneToQuote === q.id ? (
                            <div className="flex gap-2 items-end pt-1 flex-wrap">
                              <input
                                autoFocus
                                placeholder="תיאור תשלום"
                                value={newMilestone.description}
                                onChange={e => setNewMilestone(p => ({ ...p, description: e.target.value }))}
                                onKeyDown={e => e.key === "Enter" && submitAddMilestone(q.id)}
                                className="border border-gray-200 rounded px-2 py-1 text-xs outline-none flex-1 min-w-32"
                              />
                              <input
                                type="number"
                                placeholder="סכום ₪"
                                value={newMilestone.amount}
                                onChange={e => setNewMilestone(p => ({ ...p, amount: e.target.value }))}
                                onKeyDown={e => e.key === "Enter" && submitAddMilestone(q.id)}
                                className="border border-gray-200 rounded px-2 py-1 text-xs outline-none w-28"
                              />
                              <input
                                type="date"
                                value={newMilestone.due_date}
                                onChange={e => setNewMilestone(p => ({ ...p, due_date: e.target.value }))}
                                className="border border-gray-200 rounded px-2 py-1 text-xs outline-none w-32"
                              />
                              <button onClick={() => submitAddMilestone(q.id)}
                                className="text-xs px-3 py-1 rounded text-white" style={{ background: "#011e41" }}>שמור</button>
                              <button onClick={() => setAddingMilestoneToQuote(null)}
                                className="text-xs px-2 py-1 text-gray-400">ביטול</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingMilestoneToQuote(q.id); setNewMilestone({ description: "", amount: "", due_date: "" }); }}
                              className="text-xs text-gray-400 hover:text-gray-600 pt-1 px-1"
                            >+ הוסף אבן דרך</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cash flow forecast */}
            {(() => {
              const allUpcoming = projectQuotes.flatMap(q =>
                q.milestones.filter(m => m.due_date).map(m => ({ ...m, quoteTitle: q.title, vendor: q.vendor }))
              ).sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
              if (allUpcoming.length === 0) return null;
              // group by year-quarter
              const groups: Record<string, typeof allUpcoming> = {};
              allUpcoming.forEach(m => {
                const d = new Date(m.due_date!);
                const q = Math.ceil((d.getMonth() + 1) / 3);
                const key = `${d.getFullYear()} Q${q}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(m);
              });
              return (
                <div className="border-t border-gray-100 px-5 pt-4 pb-2">
                  <div className="text-xs font-semibold text-gray-500 mb-3">תזרים תשלומים צפוי</div>
                  <div className="space-y-3">
                    {Object.entries(groups).map(([period, items]) => {
                      const totalPeriod = items.reduce((s, m) => s + m.amount, 0);
                      const paidPeriod = items.filter(m => m.is_paid).reduce((s, m) => s + m.amount, 0);
                      const isPast = items.every(m => m.is_paid);
                      return (
                        <div key={period}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium" style={{ color: isPast ? "#aaa" : "#011e41" }}>{period}</span>
                            <span className="text-xs" style={{ color: isPast ? "#27ae60" : "#e67e22" }}>
                              {isPast ? `שולם: ${fmt(paidPeriod)}` : `צפוי: ${fmt(totalPeriod - paidPeriod)}`}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {items.map(m => (
                              <div key={m.id} className="flex items-center justify-between text-xs px-2 py-0.5 rounded"
                                style={{ background: m.is_paid ? "#f0fdf4" : "#fafaf0", color: m.is_paid ? "#aaa" : "#555" }}>
                                <span style={{ textDecoration: m.is_paid ? "line-through" : "none" }}>
                                  {m.vendor || m.quoteTitle} — {m.description}
                                </span>
                                <span>{fmt(m.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
            if (f) uploadProjectDoc(f, uploadTaskId || undefined, uploadExpiryDate || undefined);
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
              <div className="flex flex-col gap-1 min-w-56">
                <label className="text-xs text-gray-500">שיוך (אופציונלי)</label>
                <select
                  value={uploadTaskId}
                  onChange={e => setUploadTaskId(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                >
                  <option value="">— ללא שיוך —</option>
                  {stages.map(stage => {
                    const stageTasks = tasks.filter(t => t.stage_id === stage.id);
                    return [
                      <option key={`stage-${stage.id}`} value={`stage:${stage.id}`} style={{ fontWeight: "bold" }}>
                        📁 {stage.name}
                      </option>,
                      ...stageTasks.map(t => (
                        <option key={t.id} value={t.id}>
                          {"　　"}📌 {t.title}
                        </option>
                      )),
                    ];
                  })}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">תאריך תפוגה (אופציונלי)</label>
                <input
                  type="date"
                  value={uploadExpiryDate}
                  onChange={e => setUploadExpiryDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none"
                />
              </div>
              <button
                disabled={docsUploading}
                onClick={() => {
                  const f = docFileRef.current?.files?.[0];
                  if (f) uploadProjectDoc(f, uploadTaskId || undefined, uploadExpiryDate || undefined);
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
                const taskName = doc.task_id ? tasks.find(t => t.id === doc.task_id)?.title : null;
                const stageName = doc.stage_id ? stages.find(s => s.id === doc.stage_id)?.name : null;
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
                      {stageName && !taskName && <div className="text-xs text-gray-400 mt-0.5">📁 {stageName}</div>}
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
                <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0 flex items-center justify-between">
                  <div className="font-semibold text-gray-800">{selectedTask?.title}</div>
                  <button onClick={() => setSelectedTaskId(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
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

      {/* Tab: Professionals */}
      {tab === "professionals" && (
        <div className="flex-1 overflow-y-auto p-8" dir="rtl">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">אנשי מקצוע בפרויקט</h2>
              <button
                onClick={() => setAddingProf(true)}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ background: "#011e41" }}
              >
                + הוסף איש מקצוע
              </button>
            </div>

            {addingProf && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">הוספת איש מקצוע</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">מקצוע</label>
                    <ProfessionCombobox
                      value={newProfProfession}
                      onChange={setNewProfProfession}
                      placeholder="בחר מקצוע..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">איש קשר</label>
                    <select
                      value={newProfContactId}
                      onChange={e => setNewProfContactId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                    >
                      <option value="">בחר איש קשר...</option>
                      {contacts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.profession ? ` (${c.profession})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={addProfessional}
                      disabled={!newProfProfession || !newProfContactId}
                      className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40"
                      style={{ background: "#011e41" }}
                    >
                      שמור
                    </button>
                    <button
                      onClick={() => { setAddingProf(false); setNewProfProfession(""); setNewProfContactId(""); }}
                      className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              </div>
            )}

            {professionals.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">👷</div>
                <div className="text-sm">לא הוגדרו אנשי מקצוע לפרויקט זה</div>
                <div className="text-xs mt-1">הוסף אנשי מקצוע כדי שהטמפלייט יוכל לשייך משימות אוטומטית</div>
              </div>
            ) : (
              <div className="space-y-2">
                {professionals.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        {p.profession}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-800">{p.contact_name}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                          {p.contact_phone && <span>{p.contact_phone}</span>}
                          {p.contact_email && <span>{p.contact_email}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeProfessional(p.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      הסר
                    </button>
                  </div>
                ))}
              </div>
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
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const val = e.currentTarget.value; if (val !== (t.description || "")) updateTask(t.id, { description: val }); e.currentTarget.blur(); } }}
                    rows={3}
                    placeholder="הוסף הערה... (Enter לשמירה, Shift+Enter לשורה חדשה)"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 resize-none"
                  />
                </div>

                {/* Documents */}
                <div>
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <label className="text-xs text-gray-400">קבצים מצורפים</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={taskDocExpiry}
                        onChange={e => setTaskDocExpiry(e.target.value)}
                        className="text-xs border border-gray-200 rounded px-1.5 py-1 outline-none"
                        title="תאריך תוקף (אופציונלי)"
                        placeholder="תוקף"
                      />
                      <label className={`text-xs px-2 py-1 rounded cursor-pointer text-white ${taskDocsUploading ? "opacity-60" : ""}`} style={{ background: "#011e41" }}>
                        {taskDocsUploading ? "..." : "+ צרף"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={taskDocsUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadTaskDoc(f, t.id, taskDocExpiry || undefined); e.target.value = ""; }}
                        />
                      </label>
                    </div>
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
      {/* Tab: Meetings */}
      {tab === "meetings" && (
        <ProjectMeetingsTab projectId={projectId} tenantId={TENANT_ID} stages={stages} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Meetings Tab — inline component
// ---------------------------------------------------------------------------
function ProjectMeetingsTab({ projectId, tenantId, stages }: {
  projectId: string;
  tenantId: string;
  stages: { id: string; name: string }[];
}) {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [rawText, setRawText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState(stages[0]?.id || "");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [taskCreating, setTaskCreating] = useState(false);

  useEffect(() => { loadMeetings(); }, []);

  async function loadMeetings() {
    setLoading(true);
    try {
      const ms = await apiFetch(`/tenants/${tenantId}/meetings/?project_id=${projectId}`);
      setMeetings(ms);
    } catch {}
    finally { setLoading(false); }
  }

  async function processNew() {
    if (!rawText.trim()) { setProcessError("יש להדביק טקסט"); return; }
    setProcessing(true); setProcessError("");
    try {
      const m = await apiFetch(`/tenants/${tenantId}/meetings/process`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, raw_text: rawText }),
      });
      setMeetings(prev => [m, ...prev]);
      setShowNew(false); setRawText("");
      setExpandedId(m.id); setEditing({ ...m });
    } catch (err: any) { setProcessError(err.message || "שגיאה"); }
    finally { setProcessing(false); }
  }

  async function saveMeeting() {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/tenants/${tenantId}/meetings/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editing.title, meeting_date: editing.meeting_date,
          participants: editing.participants, overview: editing.overview,
          decisions: editing.decisions, action_items: editing.action_items,
        }),
      });
      setMeetings(prev => prev.map((m: any) => m.id === updated.id ? updated : m));
      setEditing(null);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function deleteMeeting(id: string) {
    if (!confirm("למחוק?")) return;
    await apiFetch(`/tenants/${tenantId}/meetings/${id}`, { method: "DELETE" });
    setMeetings(prev => prev.filter((m: any) => m.id !== id));
  }

  async function submitCreateTasks(meeting: any) {
    if (!selectedStageId) { alert("יש לבחור קבוצה"); return; }
    const items = (meeting.action_items || []).filter((_: any, i: number) => selectedItems.has(i));
    if (!items.length) { alert("יש לבחור משימות"); return; }
    setTaskCreating(true);
    try {
      const res = await apiFetch(`/tenants/${tenantId}/meetings/${meeting.id}/create-tasks`, {
        method: "POST",
        body: JSON.stringify({ stage_id: selectedStageId, items }),
      });
      alert(`נוצרו ${res.count} משימות`);
      setMeetings(prev => prev.map((m: any) => m.id === meeting.id ? { ...m, status: "finalized" } : m));
      setCreatingTasks(null); setSelectedItems(new Set());
    } catch (err: any) { alert(err.message); }
    finally { setTaskCreating(false); }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "#011e41" }}>סיכומי פגישות</h2>
          <button
            onClick={() => { setShowNew(true); setProcessError(""); }}
            className="text-sm px-3 py-1.5 rounded-lg text-white"
            style={{ background: "#011e41" }}
          >+ פגישה חדשה</button>
        </div>

        {/* New meeting */}
        {showNew && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="text-sm font-medium" style={{ color: "#011e41" }}>הדבק טקסט פגישה</div>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={7}
              placeholder="הדבק ציון / נקודות פגישה..."
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none resize-y w-full"
            />
            {processError && <div className="text-sm text-red-600">{processError}</div>}
            <div className="flex gap-2">
              <button onClick={processNew} disabled={processing}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ background: "#011e41", opacity: processing ? 0.6 : 1 }}>
                {processing ? "⏳ Claude מעבד..." : "✨ עבד עם AI"}
              </button>
              <button onClick={() => { setShowNew(false); setRawText(""); }}
                className="px-3 py-2 rounded-lg text-sm text-gray-500" style={{ background: "#f5f5f5" }}>
                ביטול
              </button>
            </div>
            {processing && <p className="text-xs text-gray-400">Claude Sonnet מנתח... כ-15 שניות</p>}
          </div>
        )}

        {loading && <div className="text-center py-10 text-gray-400">טוען...</div>}
        {!loading && meetings.length === 0 && !showNew && (
          <div className="text-center py-10 text-gray-400">אין סיכומי פגישות לפרויקט זה</div>
        )}

        {meetings.map((m: any) => {
          const isExpanded = expandedId === m.id;
          const isEditing = editing?.id === m.id;
          const ed = isEditing ? editing : m;

          return (
            <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                <span className="text-gray-300 text-xs">{isExpanded ? "▲" : "▼"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{m.title}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: m.status === "finalized" ? "#d1fae5" : "#fef9c3", color: m.status === "finalized" ? "#16a34a" : "#b45309" }}>
                      {m.status === "finalized" ? "מאושר" : "טיוטה"}
                    </span>
                  </div>
                  {m.meeting_date && <div className="text-xs text-gray-400 mt-0.5">{m.meeting_date}</div>}
                </div>
                <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                  <a href={`${API_BASE}/tenants/${tenantId}/meetings/${m.id}/pdf`} target="_blank" rel="noreferrer"
                    className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
                    🖨️ PDF
                  </a>
                  <button onClick={() => deleteMeeting(m.id)}
                    className="text-xs text-gray-300 hover:text-red-400 px-1">✕</button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                  <div className="flex gap-2">
                    {!isEditing ? (
                      <button onClick={() => setEditing({ ...m })}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                        ✏️ ערוך
                      </button>
                    ) : (
                      <>
                        <button onClick={saveMeeting} disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg text-white"
                          style={{ background: "#011e41", opacity: saving ? 0.6 : 1 }}>
                          {saving ? "שומר..." : "שמור"}
                        </button>
                        <button onClick={() => setEditing(null)}
                          className="text-xs px-2 py-1 rounded text-gray-400" style={{ background: "#f5f5f5" }}>ביטול</button>
                      </>
                    )}
                    {m.status !== "finalized" && creatingTasks !== m.id && (
                      <button onClick={() => {
                        setCreatingTasks(m.id);
                        setSelectedItems(new Set((m.action_items || []).map((_: any, i: number) => i)));
                        setSelectedStageId(stages[0]?.id || "");
                      }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "#011e4110", color: "#011e41" }}>
                        ✓ צור משימות
                      </button>
                    )}
                  </div>

                  {/* Overview */}
                  {isEditing ? (
                    <textarea value={ed.overview || ""} onChange={e => setEditing((p: any) => ({ ...p, overview: e.target.value }))}
                      rows={3} className="border border-gray-200 rounded px-2 py-1 text-sm outline-none w-full resize-y" />
                  ) : (
                    m.overview && <p className="text-sm text-gray-700 leading-relaxed">{m.overview}</p>
                  )}

                  {/* Decisions */}
                  {(m.decisions || []).length > 0 && !isEditing && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">החלטות</div>
                      <ul className="space-y-1">
                        {m.decisions.map((d: string, i: number) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-700">
                            <span className="text-yellow-400 shrink-0">◆</span>{d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action items table */}
                  {(m.action_items || []).length > 0 && !isEditing && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">משימות</div>
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50 text-gray-400">
                          <th className="text-right px-2 py-1.5 font-medium">משימה</th>
                          <th className="text-right px-2 py-1.5 font-medium">אחראי</th>
                          <th className="text-right px-2 py-1.5 font-medium">יעד</th>
                        </tr></thead>
                        <tbody>{m.action_items.map((a: any, i: number) => (
                          <tr key={i} className="border-t border-gray-50">
                            <td className="px-2 py-1.5 font-medium">{a.title}</td>
                            <td className="px-2 py-1.5 text-gray-500">{a.assignee || "—"}</td>
                            <td className="px-2 py-1.5 text-gray-500">{a.due_date || "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}

                  {/* Create tasks */}
                  {creatingTasks === m.id && (
                    <div className="border border-blue-100 rounded-xl bg-blue-50 p-3 space-y-2">
                      <div className="text-xs font-semibold" style={{ color: "#011e41" }}>יצירת משימות</div>
                      <select value={selectedStageId} onChange={e => setSelectedStageId(e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs bg-white outline-none">
                        <option value="">בחר קבוצה...</option>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <div className="space-y-1">
                        {(m.action_items || []).map((a: any, i: number) => (
                          <label key={i} className="flex items-center gap-2 cursor-pointer text-xs">
                            <input type="checkbox" checked={selectedItems.has(i)}
                              onChange={() => setSelectedItems(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i); else next.add(i);
                                return next;
                              })} className="accent-blue-600" />
                            <span className="font-medium">{a.title}</span>
                            {a.assignee && <span className="text-gray-400">· {a.assignee}</span>}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => submitCreateTasks(m)} disabled={taskCreating}
                          className="text-xs px-3 py-1.5 rounded-lg text-white"
                          style={{ background: "#011e41", opacity: taskCreating ? 0.6 : 1 }}>
                          {taskCreating ? "יוצר..." : `צור ${selectedItems.size} משימות`}
                        </button>
                        <button onClick={() => setCreatingTasks(null)}
                          className="text-xs px-2 py-1 rounded text-gray-400" style={{ background: "#f5f5f5" }}>ביטול</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
