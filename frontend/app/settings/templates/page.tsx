"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface TemplateTask {
  id: string;
  title: string;
  priority: string;
  description?: string;
  order: number;
}

interface TemplateStage {
  id: string;
  name: string;
  handling_authority: string;
  color: string;
  order: number;
  estimated_days?: number;
  tasks: TemplateTask[];
}

interface Template {
  id: string;
  name: string;
  description?: string;
  stages: TemplateStage[];
  created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "#e74c3c",
  medium: "#e67e22",
  low: "#27ae60",
  urgent: "#c0392b",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
  urgent: "דחוף",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit task inline
  const [editingTask, setEditingTask] = useState<{ templateId: string; stageId: string; taskId: string } | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState("medium");

  // Add task inline
  const [addingTask, setAddingTask] = useState<{ templateId: string; stageId: string } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch(`/tenants/${TENANT_ID}/templates/`);
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createTemplate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/templates/`, {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined, stages: [] }),
      });
      setNewName(""); setNewDesc(""); setShowCreate(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    await apiFetch(`/tenants/${TENANT_ID}/templates/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    await load();
  }

  async function saveTaskEdit(templateId: string, stageId: string, taskId: string) {
    if (!editTaskTitle.trim()) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${templateId}/stages/${stageId}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ title: editTaskTitle.trim(), priority: editTaskPriority }),
    });
    setEditingTask(null);
    await load();
  }

  async function deleteTask(templateId: string, stageId: string, taskId: string) {
    await apiFetch(`/tenants/${TENANT_ID}/templates/${templateId}/stages/${stageId}/tasks/${taskId}`, {
      method: "DELETE",
    });
    await load();
  }

  async function addTask(templateId: string, stageId: string) {
    if (!newTaskTitle.trim()) return;
    await apiFetch(`/tenants/${TENANT_ID}/templates/${templateId}/stages/${stageId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title: newTaskTitle.trim(), priority: newTaskPriority }),
    });
    setAddingTask(null); setNewTaskTitle(""); setNewTaskPriority("medium");
    await load();
  }

  async function deleteStage(templateId: string, stageId: string) {
    await apiFetch(`/tenants/${TENANT_ID}/templates/${templateId}/stages/${stageId}`, { method: "DELETE" });
    await load();
  }

  const totalTasks = (t: Template) => t.stages.reduce((s, st) => s + st.tasks.length, 0);

  if (loading) return (
    <div className="min-h-screen" style={{ background: "#f5f6f8" }}>
      <Sidebar />
      <main className="md:mr-56 p-8"><p style={{ color: "#64748b" }}>טוען...</p></main>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#f5f6f8" }}>
      <Sidebar />
      <main className="md:mr-56 p-8">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#011e41", margin: 0 }}>טמפלייטים</h1>
            <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>
              תבניות שלבים ומשימות להחלה על פרויקטים חדשים וקיימים
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: "#011e41", color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14,
            }}
          >
            + טמפלייט חדש
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{
            background: "#fff", borderRadius: 12, padding: 20, marginBottom: 20,
            border: "2px solid #011e41", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <h3 style={{ margin: "0 0 12px", color: "#011e41", fontSize: 16 }}>טמפלייט חדש</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="שם הטמפלייט *"
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, direction: "rtl" }}
              />
              <input
                value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="תיאור (אופציונלי)"
                style={{ flex: 2, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, direction: "rtl" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={createTemplate} disabled={saving || !newName.trim()}
                style={{
                  background: "#011e41", color: "#fff", border: "none", borderRadius: 7,
                  padding: "7px 16px", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
                  opacity: (!newName.trim() || saving) ? 0.5 : 1,
                }}
              >
                {saving ? "שומר..." : "צור"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}
                style={{
                  background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 7,
                  padding: "7px 14px", cursor: "pointer", fontSize: 13,
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Templates list */}
        {templates.length === 0 && !showCreate && (
          <div style={{
            textAlign: "center", padding: "60px 0", color: "#94a3b8",
            background: "#fff", borderRadius: 12, border: "1px dashed #cbd5e1",
          }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>אין טמפלייטים עדיין</p>
            <p style={{ fontSize: 13 }}>צור טמפלייט חדש כדי להתחיל</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {templates.map(t => {
            const isExpanded = !!expanded[t.id];
            const nTasks = totalTasks(t);
            return (
              <div key={t.id} style={{
                background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                overflow: "hidden",
              }}>
                {/* Template header */}
                <div
                  style={{
                    display: "flex", alignItems: "center", padding: "14px 18px",
                    cursor: "pointer", gap: 12,
                  }}
                  onClick={() => setExpanded(e => ({ ...e, [t.id]: !e[t.id] }))}
                >
                  <span style={{ fontSize: 16, color: "#94a3b8" }}>{isExpanded ? "▾" : "▸"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "#011e41", fontSize: 15 }}>{t.name}</div>
                    {t.description && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{t.description}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      background: "#f0f4ff", color: "#3b5bdb", borderRadius: 12,
                      padding: "2px 10px", fontSize: 12, fontWeight: 600,
                    }}>
                      {t.stages.length} שלבים
                    </span>
                    <span style={{
                      background: "#f0fdf4", color: "#166534", borderRadius: 12,
                      padding: "2px 10px", fontSize: 12, fontWeight: 600,
                    }}>
                      {nTasks} משימות
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(t.id); }}
                      style={{
                        background: "transparent", border: "none", cursor: "pointer",
                        color: "#ef4444", fontSize: 18, padding: "0 4px", lineHeight: 1,
                      }}
                      title="מחק טמפלייט"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Delete confirm */}
                {confirmDelete === t.id && (
                  <div style={{
                    background: "#fff7f7", borderTop: "1px solid #fecaca",
                    padding: "10px 18px", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ color: "#dc2626", fontSize: 13 }}>למחוק את הטמפלייט "{t.name}"?</span>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 13 }}
                    >מחק</button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13 }}
                    >ביטול</button>
                  </div>
                )}

                {/* Expanded: stages + tasks */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #f1f5f9" }}>
                    {t.stages.map((stage, si) => (
                      <div key={stage.id} style={{
                        borderTop: si > 0 ? "1px solid #f8fafc" : undefined,
                        padding: "12px 18px 12px 18px",
                      }}>
                        {/* Stage header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{
                            width: 12, height: 12, borderRadius: "50%",
                            background: stage.color || "#011e41", flexShrink: 0,
                          }} />
                          <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>{stage.name}</span>
                          {stage.handling_authority && (
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>· {stage.handling_authority}</span>
                          )}
                          {stage.estimated_days && (
                            <span style={{
                              fontSize: 11, background: "#f0f4ff", color: "#3b5bdb",
                              borderRadius: 8, padding: "1px 7px",
                            }}>
                              ~{stage.estimated_days} יום
                            </span>
                          )}
                          <div style={{ flex: 1 }} />
                          <button
                            onClick={() => setAddingTask({ templateId: t.id, stageId: stage.id })}
                            style={{
                              background: "transparent", border: "1px dashed #cbd5e1", borderRadius: 6,
                              padding: "2px 8px", cursor: "pointer", fontSize: 11, color: "#64748b",
                            }}
                          >
                            + משימה
                          </button>
                          <button
                            onClick={() => deleteStage(t.id, stage.id)}
                            style={{
                              background: "transparent", border: "none", cursor: "pointer",
                              color: "#ef4444", fontSize: 14, padding: "0 2px",
                            }}
                            title="מחק שלב"
                          >✕</button>
                        </div>

                        {/* Tasks */}
                        <div style={{ paddingRight: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                          {stage.tasks.map(task => (
                            <div key={task.id}>
                              {editingTask?.taskId === task.id ? (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input
                                    value={editTaskTitle}
                                    onChange={e => setEditTaskTitle(e.target.value)}
                                    autoFocus
                                    style={{ flex: 1, padding: "4px 8px", border: "1px solid #3b82f6", borderRadius: 6, fontSize: 13, direction: "rtl" }}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") saveTaskEdit(t.id, stage.id, task.id);
                                      if (e.key === "Escape") setEditingTask(null);
                                    }}
                                  />
                                  <select
                                    value={editTaskPriority}
                                    onChange={e => setEditTaskPriority(e.target.value)}
                                    style={{ padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12 }}
                                  >
                                    {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                                      <option key={v} value={v}>{l}</option>
                                    ))}
                                  </select>
                                  <button onClick={() => saveTaskEdit(t.id, stage.id, task.id)} style={{ background: "#011e41", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>שמור</button>
                                  <button onClick={() => setEditingTask(null)} style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>
                                </div>
                              ) : (
                                <div style={{
                                  display: "flex", alignItems: "center", gap: 6,
                                  padding: "4px 8px", borderRadius: 6,
                                  background: "#f8fafc",
                                }}>
                                  <span style={{
                                    width: 7, height: 7, borderRadius: "50%",
                                    background: PRIORITY_COLORS[task.priority] || "#94a3b8",
                                    flexShrink: 0,
                                  }} />
                                  <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{task.title}</span>
                                  <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority] || "#94a3b8" }}>
                                    {PRIORITY_LABELS[task.priority] || task.priority}
                                  </span>
                                  <button
                                    onClick={() => { setEditingTask({ templateId: t.id, stageId: stage.id, taskId: task.id }); setEditTaskTitle(task.title); setEditTaskPriority(task.priority); }}
                                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 13, padding: "0 2px" }}
                                    title="ערוך"
                                  >✏</button>
                                  <button
                                    onClick={() => deleteTask(t.id, stage.id, task.id)}
                                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, padding: "0 2px" }}
                                    title="מחק"
                                  >✕</button>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Add task inline */}
                          {addingTask?.templateId === t.id && addingTask?.stageId === stage.id && (
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                              <input
                                value={newTaskTitle}
                                onChange={e => setNewTaskTitle(e.target.value)}
                                placeholder="כותרת משימה"
                                autoFocus
                                style={{ flex: 1, padding: "4px 8px", border: "1px dashed #3b82f6", borderRadius: 6, fontSize: 13, direction: "rtl" }}
                                onKeyDown={e => {
                                  if (e.key === "Enter") addTask(t.id, stage.id);
                                  if (e.key === "Escape") { setAddingTask(null); setNewTaskTitle(""); }
                                }}
                              />
                              <select
                                value={newTaskPriority}
                                onChange={e => setNewTaskPriority(e.target.value)}
                                style={{ padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12 }}
                              >
                                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                                  <option key={v} value={v}>{l}</option>
                                ))}
                              </select>
                              <button onClick={() => addTask(t.id, stage.id)} style={{ background: "#011e41", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>הוסף</button>
                              <button onClick={() => { setAddingTask(null); setNewTaskTitle(""); }} style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {t.stages.length === 0 && (
                      <div style={{ padding: "16px 18px", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
                        אין שלבים — הטמפלייט ריק
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
