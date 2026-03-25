"use client";

import { useEffect, useState } from "react";
import { getTenantId } from "@/lib/tenant";
import { apiFetch } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import ProfessionCombobox from "@/components/ProfessionCombobox";

const TENANT_ID = getTenantId();

const GROUP_COLORS = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#011e41"];

const PRIORITY_OPTIONS = [
  { value: "high",   label: "גבוהה",   color: "#c0392b" },
  { value: "medium", label: "בינונית", color: "#e67e22" },
  { value: "low",    label: "נמוכה",   color: "#27ae60" },
  { value: "urgent", label: "דחוף",    color: "#8e44ad" },
];

interface TemplateTask  { id: string; title: string; priority: string; order: number; assignee_role?: string; }
interface TemplateStage { id: string; name: string; color: string; order: number; estimated_days?: number; handling_authority: string; tasks: TemplateTask[]; }
interface Template      { id: string; name: string; description?: string; stages: TemplateStage[]; }

export default function TemplatesPage() {
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<string | null>(null);
  const [collapsed, setCollapsed]   = useState<Record<string, boolean>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [addingStage, setAddingStage]     = useState(false);
  const [newStageName, setNewStageName]   = useState("");
  const [newStageColor, setNewStageColor] = useState(GROUP_COLORS[0]);
  const [newStageDays, setNewStageDays]   = useState("");

  const [addingTask, setAddingTask]           = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle]       = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskRole, setNewTaskRole]         = useState("");
  const [editTask, setEditTask] = useState<{ stageId: string; taskId: string; title: string; priority: string; assignee_role: string } | null>(null);

  // Stage menu / inline edit
  const [stageMenu, setStageMenu]               = useState<string | null>(null);
  const [editingStageId, setEditingStageId]     = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");

  useEffect(() => {
    if (!stageMenu) return;
    function handler() { setStageMenu(null); setEditingStageId(null); }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [stageMenu]);

  async function saveEditedStage(stageId: string) {
    if (!selected || !editingStageName.trim()) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${stageId}`, {
      method: "PUT", body: JSON.stringify({ name: editingStageName.trim() }),
    });
    setEditingStageId(null);
    await load();
  }

  async function updateStageColor(stageId: string, color: string) {
    if (!selected) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${stageId}`, {
      method: "PUT", body: JSON.stringify({ color }),
    });
    await load();
  }

  // Drag state
  const [dragStageId, setDragStageId]     = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId]       = useState<{ stageId: string; taskId: string } | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  function reorderStages(fromId: string, toId: string) {
    if (!selected || fromId === toId) return;
    setTemplates(prev => prev.map(t => {
      if (t.id !== selected) return t;
      const stages = [...t.stages];
      const from = stages.findIndex(s => s.id === fromId);
      const to   = stages.findIndex(s => s.id === toId);
      if (from === -1 || to === -1) return t;
      stages.splice(to, 0, stages.splice(from, 1)[0]);
      stages.forEach((s, i) => { s.order = i; });
      // persist
      stages.forEach((s, i) => apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${s.id}`, {
        method: "PUT", body: JSON.stringify({ order: i }),
      }).catch(() => {}));
      return { ...t, stages };
    }));
  }

  function reorderTasks(stageId: string, fromId: string, toId: string) {
    if (!selected || fromId === toId) return;
    setTemplates(prev => prev.map(t => {
      if (t.id !== selected) return t;
      return { ...t, stages: t.stages.map(s => {
        if (s.id !== stageId) return s;
        const tasks = [...s.tasks];
        const from = tasks.findIndex(x => x.id === fromId);
        const to   = tasks.findIndex(x => x.id === toId);
        if (from === -1 || to === -1) return s;
        tasks.splice(to, 0, tasks.splice(from, 1)[0]);
        tasks.forEach((x, i) => { x.order = i; });
        tasks.forEach((x, i) => apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${stageId}/tasks/${x.id}`, {
          method: "PUT", body: JSON.stringify({ order: i }),
        }).catch(() => {}));
        return { ...s, tasks };
      })};
    }));
  }

  async function load() {
    setLoading(true);
    try { setTemplates(await apiFetch(`/tenants/${TENANT_ID}/templates/`)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // Collapse all stages when template selection changes
  useEffect(() => {
    if (!selected) return;
    const tpl = templates.find(t => t.id === selected);
    if (!tpl) return;
    const allCollapsed: Record<string, boolean> = {};
    tpl.stages.forEach(s => { allCollapsed[s.id] = true; });
    setCollapsed(allCollapsed);
  }, [selected]);

  const current = templates.find(t => t.id === selected) ?? null;

  async function createTemplate() {
    if (!newName.trim()) return;
    const t = await apiFetch(`/tenants/${TENANT_ID}/templates/`, {
      method: "POST",
      body: JSON.stringify({ name: newName.trim(), stages: [] }),
    });
    setNewName(""); setShowCreate(false);
    await load();
    setSelected(t.id);
  }

  async function deleteTemplate(id: string) {
    await apiFetch(`/tenants/${TENANT_ID}/templates/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (selected === id) setSelected(null);
    await load();
  }

  async function addStage() {
    if (!newStageName.trim() || !selected) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages`, {
      method: "POST",
      body: JSON.stringify({
        name: newStageName.trim(), handling_authority: "", color: newStageColor,
        estimated_days: newStageDays ? parseInt(newStageDays) : undefined, tasks: [],
      }),
    });
    setAddingStage(false); setNewStageName(""); setNewStageDays("");
    await load();
  }

  async function deleteStage(stageId: string) {
    if (!selected) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${stageId}`, { method: "DELETE" });
    await load();
  }

  async function addTask(stageId: string) {
    if (!newTaskTitle.trim() || !selected) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${stageId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title: newTaskTitle.trim(), priority: newTaskPriority, assignee_role: newTaskRole || null }),
    });
    setAddingTask(null); setNewTaskTitle(""); setNewTaskPriority("medium"); setNewTaskRole("");
    await load();
  }

  async function saveTask() {
    if (!editTask || !selected || !editTask.title.trim()) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${editTask.stageId}/tasks/${editTask.taskId}`, {
      method: "PUT",
      body: JSON.stringify({ title: editTask.title.trim(), priority: editTask.priority, assignee_role: editTask.assignee_role || null }),
    });
    setEditTask(null); await load();
  }

  async function deleteTask(stageId: string, taskId: string) {
    if (!selected) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/stages/${stageId}/tasks/${taskId}`, { method: "DELETE" });
    await load();
  }

  if (loading) return (
    <div className="min-h-screen" style={{ background: "#f5f6f8" }}>
      <Sidebar />
      <main className="md:mr-56 p-8"><p style={{ color: "#64748b" }}>טוען...</p></main>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#f5f6f8" }}>
      <Sidebar />

      {/* Template list: fixed panel, right of editor, left of sidebar */}
      <div style={{
        position: "fixed", top: 0, right: 224, width: 260, height: "100vh", zIndex: 30,
        background: "#fff", borderLeft: "1px solid #e2e8f0",
        display: "flex", flexDirection: "column", overflow: "hidden", direction: "rtl",
      }}>
          <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#011e41", fontSize: 15 }}>טמפלייטים</span>
              <button onClick={() => setShowCreate(true)}
                style={{ background: "#011e41", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
                + חדש
              </button>
            </div>
            {showCreate && (
              <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="שם הטמפלייט" autoFocus
                  onKeyDown={e => { if (e.key === "Enter") createTemplate(); if (e.key === "Escape") { setShowCreate(false); setNewName(""); } }}
                  style={{ flex: 1, padding: "5px 8px", border: "1px solid #3b82f6", borderRadius: 6, fontSize: 13, direction: "rtl" }}
                />
                <button onClick={createTemplate} disabled={!newName.trim()}
                  style={{ background: "#011e41", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", opacity: !newName.trim() ? 0.5 : 1 }}>
                  צור
                </button>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {templates.length === 0 && (
              <p style={{ padding: 16, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>אין טמפלייטים עדיין</p>
            )}
            {templates.map(t => (
              <div key={t.id} onClick={() => setSelected(t.id)} style={{
                padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                background: selected === t.id ? "#f0f4ff" : "transparent",
                borderRight: selected === t.id ? "3px solid #3b5bdb" : "3px solid transparent",
              }}>
                <span style={{ flex: 1, fontWeight: selected === t.id ? 600 : 400, color: "#1e293b", fontSize: 14 }}>{t.name}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{t.stages.length}</span>
                {confirmDelete === t.id ? (
                  <>
                    <button onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}
                      style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", fontSize: 11, cursor: "pointer" }}>מחק</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                      style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 11, cursor: "pointer" }}>ביטול</button>
                  </>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(t.id); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 14, padding: 0 }}
                    title="מחק">🗑</button>
                )}
              </div>
            ))}
          </div>
        </div>

      {/* Editor: margin-right = sidebar(224) + list(260) = 484px */}
      <main style={{ marginRight: 484, overflowY: "auto", minHeight: "100vh", padding: "24px 28px", direction: "rtl" }}>
          {!current ? (
            <div style={{ textAlign: "center", paddingTop: 80, color: "#94a3b8" }}>
              <p style={{ fontSize: 16 }}>בחר טמפלייט מהרשימה או צור חדש</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#011e41" }}>{current.name}</h2>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>
                  {current.stages.length} קבוצות · {current.stages.reduce((s, st) => s + st.tasks.length, 0)} משימות
                </span>
              </div>

              {current.stages.map(stage => {
                const isCollapsed = !!collapsed[stage.id];
                return (
                  <div key={stage.id} style={{ marginBottom: 8 }}
                    draggable
                    onDragStart={() => setDragStageId(stage.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverStageId(stage.id); }}
                    onDrop={() => { if (dragStageId) reorderStages(dragStageId, stage.id); setDragStageId(null); setDragOverStageId(null); }}
                    onDragEnd={() => { setDragStageId(null); setDragOverStageId(null); }}
                  >
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: dragOverStageId === stage.id && dragStageId !== stage.id ? "#f0f4ff" : "#fff",
                      borderRadius: 8, padding: "8px 12px",
                      border: dragOverStageId === stage.id && dragStageId !== stage.id ? "1px solid #3b5bdb" : "1px solid #e2e8f0",
                      transition: "background 0.1s",
                    }}>
                      <span style={{ cursor: "grab", color: "#cbd5e1", fontSize: 14, userSelect: "none", paddingLeft: 2 }} title="גרור לסידור מחדש">⠿</span>
                      <span onClick={() => setCollapsed(c => ({ ...c, [stage.id]: !c[stage.id] }))}
                        style={{ cursor: "pointer", color: "#94a3b8", fontSize: 13, userSelect: "none" }}>
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 14, flex: 1 }}>{stage.name}</span>
                      {stage.estimated_days && (
                        <span style={{ fontSize: 11, background: "#f0f4ff", color: "#3b5bdb", borderRadius: 6, padding: "2px 8px" }}>
                          ~{stage.estimated_days} יום
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{stage.tasks.length} משימות</span>
                      <button onClick={() => { setAddingTask(stage.id); setCollapsed(c => ({ ...c, [stage.id]: false })); }}
                        style={{ background: "transparent", border: "1px dashed #cbd5e1", borderRadius: 5, padding: "2px 8px", fontSize: 11, color: "#64748b", cursor: "pointer" }}>
                        + משימה
                      </button>
                      {/* ⋮ menu */}
                      <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
                        <button
                          onClick={e => { e.stopPropagation(); setStageMenu(stageMenu === stage.id ? null : stage.id); }}
                          style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, padding: "2px 6px", lineHeight: 1 }}>⋮</button>
                        {stageMenu === stage.id && (
                          <div style={{
                            position: "absolute", top: "100%", right: 0, background: "#fff",
                            border: "1px solid #e2e8f0", borderRadius: 8, zIndex: 9999,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.15)", minWidth: 160, direction: "rtl",
                          }}
                            onClick={e => e.stopPropagation()}
                          >
                            {editingStageId === stage.id ? (
                              <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                                <input
                                  value={editingStageName}
                                  onChange={e => setEditingStageName(e.target.value)}
                                  autoFocus
                                  onKeyDown={e => { if (e.key === "Enter") saveEditedStage(stage.id); if (e.key === "Escape") { setEditingStageId(null); } }}
                                  style={{ width: "100%", padding: "4px 8px", border: "1px solid #3b82f6", borderRadius: 5, fontSize: 13, direction: "rtl", boxSizing: "border-box" }}
                                />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => saveEditedStage(stage.id)}
                                    style={{ flex: 1, background: "#011e41", color: "#fff", border: "none", borderRadius: 5, padding: "4px 0", fontSize: 12, cursor: "pointer" }}>✓ שמור</button>
                                  <button onClick={() => setEditingStageId(null)}
                                    style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 5, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>✕</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingStageId(stage.id); setEditingStageName(stage.name); }}
                                style={{ display: "block", width: "100%", textAlign: "right", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#374151" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                                onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                                ✏️ שינוי שם
                              </button>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "#374151", cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              <span>🎨 צבע</span>
                              <input type="color"
                                value={stage.color || "#011e41"}
                                onChange={e => { updateStageColor(stage.id, e.target.value); setStageMenu(null); }}
                                style={{ width: 28, height: 22, cursor: "pointer", border: "none", background: "none" }} />
                            </div>
                            <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #f1f5f9" }} />
                            <button onClick={() => { deleteStage(stage.id); setStageMenu(null); }}
                              style={{ display: "block", width: "100%", textAlign: "right", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#ef4444" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              🗑️ מחיקה
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div style={{ marginRight: 24, marginTop: 2 }}>
                        {stage.tasks.map(task => (
                          <div key={task.id}
                            draggable
                            onDragStart={e => { e.stopPropagation(); setDragTaskId({ stageId: stage.id, taskId: task.id }); }}
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverTaskId(task.id); }}
                            onDrop={e => { e.stopPropagation(); if (dragTaskId?.stageId === stage.id) reorderTasks(stage.id, dragTaskId.taskId, task.id); setDragTaskId(null); setDragOverTaskId(null); }}
                            onDragEnd={e => { e.stopPropagation(); setDragTaskId(null); setDragOverTaskId(null); }}
                            style={{
                            display: "flex", alignItems: "center", gap: 8,
                            background: dragOverTaskId === task.id && dragTaskId?.taskId !== task.id ? "#f0f4ff" : "#fff",
                            borderRadius: 6, padding: "7px 12px", marginBottom: 2,
                            border: dragOverTaskId === task.id && dragTaskId?.taskId !== task.id ? "1px solid #3b5bdb" : "1px solid #f1f5f9",
                            cursor: "default", transition: "background 0.1s",
                          }}>
                            {editTask?.taskId === task.id ? (
                              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input value={editTask.title}
                                    onChange={e => setEditTask({ ...editTask, title: e.target.value })}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === "Enter") saveTask(); if (e.key === "Escape") setEditTask(null); }}
                                    style={{ flex: 1, padding: "3px 8px", border: "1px solid #3b82f6", borderRadius: 5, fontSize: 13, direction: "rtl" }}
                                  />
                                  <select value={editTask.priority}
                                    onChange={e => setEditTask({ ...editTask, priority: e.target.value })}
                                    style={{ padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 12 }}>
                                    {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                  </select>
                                  <button onClick={saveTask} style={{ background: "#011e41", color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>שמור</button>
                                  <button onClick={() => setEditTask(null)} style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 5, padding: "3px 8px", fontSize: 12, cursor: "pointer" }}>✕</button>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>איש מקצוע:</span>
                                  <ProfessionCombobox
                                    value={editTask.assignee_role}
                                    onChange={v => setEditTask({ ...editTask, assignee_role: v })}
                                    placeholder="ללא שיוך..."
                                  />
                                </div>
                              </div>
                            ) : (
                              <>
                                <span style={{ cursor: "grab", color: "#cbd5e1", fontSize: 14, userSelect: "none" }} title="גרור לסידור מחדש">⠿</span>
                                <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{task.title}</span>
                                {task.assignee_role && (
                                  <span style={{ fontSize: 11, borderRadius: 5, padding: "2px 8px", background: "#e8f0fe", color: "#3b5bdb" }}>
                                    {task.assignee_role}
                                  </span>
                                )}
                                <span style={{
                                  fontSize: 11, borderRadius: 5, padding: "2px 8px",
                                  background: (PRIORITY_OPTIONS.find(p => p.value === task.priority)?.color ?? "#94a3b8") + "22",
                                  color: PRIORITY_OPTIONS.find(p => p.value === task.priority)?.color ?? "#94a3b8",
                                }}>
                                  {PRIORITY_OPTIONS.find(p => p.value === task.priority)?.label ?? task.priority}
                                </span>
                                <button onClick={() => setEditTask({ stageId: stage.id, taskId: task.id, title: task.title, priority: task.priority, assignee_role: task.assignee_role ?? "" })}
                                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 13, padding: 0 }}>✏</button>
                                <button onClick={() => deleteTask(stage.id, task.id)}
                                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, padding: 0 }}>✕</button>
                              </>
                            )}
                          </div>
                        ))}

                        {addingTask === stage.id && (
                          <div style={{ padding: "6px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                                placeholder="שם המשימה" autoFocus
                                onKeyDown={e => { if (e.key === "Enter") addTask(stage.id); if (e.key === "Escape") { setAddingTask(null); setNewTaskTitle(""); setNewTaskRole(""); } }}
                                style={{ flex: 1, padding: "5px 10px", border: "1px dashed #3b82f6", borderRadius: 6, fontSize: 13, direction: "rtl" }}
                              />
                              <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)}
                                style={{ padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12 }}>
                                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                              </select>
                              <button onClick={() => addTask(stage.id)} disabled={!newTaskTitle.trim()}
                                style={{ background: "#011e41", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", opacity: !newTaskTitle.trim() ? 0.5 : 1 }}>הוסף</button>
                              <button onClick={() => { setAddingTask(null); setNewTaskTitle(""); setNewTaskRole(""); }}
                                style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>ביטול</button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 2 }}>
                              <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>איש מקצוע:</span>
                              <ProfessionCombobox value={newTaskRole} onChange={setNewTaskRole} placeholder="ללא שיוך (אופציונלי)" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {addingStage ? (
                <div style={{ background: "#fff", borderRadius: 8, border: "2px dashed #3b82f6", padding: "14px 16px", marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input value={newStageName} onChange={e => setNewStageName(e.target.value)}
                      placeholder="שם הקבוצה *" autoFocus
                      onKeyDown={e => { if (e.key === "Enter") addStage(); if (e.key === "Escape") { setAddingStage(false); setNewStageName(""); } }}
                      style={{ flex: 2, minWidth: 140, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, direction: "rtl" }}
                    />
                    <input value={newStageDays} onChange={e => setNewStageDays(e.target.value)}
                      placeholder="ימים (משוער)" type="number" min={1}
                      style={{ width: 120, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13 }}
                    />
                    <div style={{ display: "flex", gap: 4 }}>
                      {GROUP_COLORS.map(c => (
                        <div key={c} onClick={() => setNewStageColor(c)} style={{
                          width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer",
                          outline: newStageColor === c ? "2px solid #011e41" : "none", outlineOffset: 2,
                        }} />
                      ))}
                    </div>
                    <button onClick={addStage} disabled={!newStageName.trim()}
                      style={{ background: "#011e41", color: "#fff", border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600, opacity: !newStageName.trim() ? 0.5 : 1 }}>
                      הוסף קבוצה
                    </button>
                    <button onClick={() => { setAddingStage(false); setNewStageName(""); setNewStageDays(""); }}
                      style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>ביטול</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingStage(true)} style={{
                  marginTop: 8, background: "transparent", border: "1px dashed #cbd5e1",
                  borderRadius: 8, padding: "8px 18px", color: "#64748b", fontSize: 13,
                  cursor: "pointer", width: "100%",
                }}>
                  + הוסף קבוצת משימות
                </button>
              )}
            </>
          )}

      </main>

    </div>
  );
}
