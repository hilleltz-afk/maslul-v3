"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface TemplateTask {
  id: string;
  title: string;
  priority: string;
  order: number;
}

interface TemplateStage {
  id: string;
  name: string;
  handling_authority: string;
  color: string;
  estimated_days?: number;
  tasks: TemplateTask[];
}

interface Template {
  id: string;
  name: string;
  description?: string;
  stages: TemplateStage[];
}

interface Props {
  projectId: string;
  onClose: () => void;
  onApplied: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  high: "גבוהה", medium: "בינונית", low: "נמוכה", urgent: "דחוף",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#e74c3c", medium: "#e67e22", low: "#27ae60", urgent: "#c0392b",
};

export default function ApplyTemplateModal({ projectId, onClose, onApplied }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [useStartDate, setUseStartDate] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/tenants/${TENANT_ID}/templates/`)
      .then((data: Template[]) => { setTemplates(data); setLoading(false); });
  }, []);

  const selectedTemplate = templates.find(t => t.id === selected);

  function selectTemplate(id: string) {
    setSelected(id);
    const tmpl = templates.find(t => t.id === id);
    if (!tmpl) return;
    const checked: Record<string, boolean> = {};
    tmpl.stages.forEach(s => s.tasks.forEach(t => { checked[t.id] = true; }));
    setCheckedTasks(checked);
  }

  function toggleTask(id: string) {
    setCheckedTasks(c => ({ ...c, [id]: !c[id] }));
  }

  function toggleStage(stage: TemplateStage) {
    const allChecked = stage.tasks.every(t => checkedTasks[t.id]);
    setCheckedTasks(c => {
      const next = { ...c };
      stage.tasks.forEach(t => { next[t.id] = !allChecked; });
      return next;
    });
  }

  async function apply() {
    if (!selected) return;
    const selectedIds = Object.entries(checkedTasks)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (selectedIds.length === 0) return;

    setApplying(true);
    try {
      const res = await apiFetch(`/tenants/${TENANT_ID}/templates/${selected}/apply`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          selected_task_ids: selectedIds,
          start_date: useStartDate ? startDate : undefined,
        }),
      });
      onApplied();
      onClose();
      alert(`נוצרו ${res.created_stages} שלבים ו-${res.created_tasks} משימות`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("שגיאה: " + msg);
    } finally {
      setApplying(false);
    }
  }

  const totalSelected = Object.values(checkedTasks).filter(Boolean).length;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 24,
        width: "min(680px, 95vw)", maxHeight: "85vh",
        display: "flex", flexDirection: "column", gap: 0,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        direction: "rtl",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#011e41" }}>החל טמפלייט על פרויקט</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        {loading ? (
          <p style={{ color: "#64748b", textAlign: "center", padding: "20px 0" }}>טוען...</p>
        ) : templates.length === 0 ? (
          <p style={{ color: "#64748b", textAlign: "center", padding: "20px 0" }}>
            אין טמפלייטים — צור טמפלייט ב<a href="/settings/templates" style={{ color: "#3b82f6" }}>הגדרות</a>
          </p>
        ) : (
          <>
            {/* Template selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>
                בחר טמפלייט
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t.id)}
                    style={{
                      padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                      border: selected === t.id ? "2px solid #011e41" : "1px solid #cbd5e1",
                      background: selected === t.id ? "#f0f4ff" : "#fff",
                      color: selected === t.id ? "#011e41" : "#374151",
                      fontWeight: selected === t.id ? 700 : 400,
                    }}
                  >
                    {t.name}
                    <span style={{ fontSize: 11, color: "#94a3b8", marginRight: 6 }}>
                      ({t.stages.reduce((s, st) => s + st.tasks.length, 0)} משימות)
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Start date */}
            {selectedTemplate && (
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#374151" }}>
                  <input
                    type="checkbox"
                    checked={useStartDate}
                    onChange={e => setUseStartDate(e.target.checked)}
                    style={{ width: 14, height: 14 }}
                  />
                  חשב תאריכי יעד לפי תאריך התחלה:
                </label>
                {useStartDate && (
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13 }}
                  />
                )}
              </div>
            )}

            {/* Stages + tasks checklist */}
            {selectedTemplate && (
              <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 16 }}>
                {selectedTemplate.stages.map((stage, si) => {
                  const allChecked = stage.tasks.length > 0 && stage.tasks.every(t => checkedTasks[t.id]);
                  const someChecked = stage.tasks.some(t => checkedTasks[t.id]);
                  return (
                    <div key={stage.id} style={{
                      borderTop: si > 0 ? "1px solid #f1f5f9" : undefined,
                    }}>
                      {/* Stage row */}
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "10px 14px", background: "#f8fafc", cursor: "pointer",
                        }}
                        onClick={() => toggleStage(stage)}
                      >
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                          onChange={() => toggleStage(stage)}
                          onClick={e => e.stopPropagation()}
                          style={{ width: 15, height: 15, accentColor: "#011e41" }}
                        />
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: stage.color || "#011e41" }} />
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>{stage.name}</span>
                        {stage.estimated_days && (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>~{stage.estimated_days} יום</span>
                        )}
                        <span style={{ fontSize: 11, color: "#94a3b8", marginRight: "auto" }}>
                          {stage.tasks.filter(t => checkedTasks[t.id]).length}/{stage.tasks.length}
                        </span>
                      </div>

                      {/* Tasks */}
                      {stage.tasks.map(task => (
                        <div
                          key={task.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "7px 14px 7px 28px",
                            borderTop: "1px solid #f8fafc",
                            cursor: "pointer",
                            background: checkedTasks[task.id] ? "#fff" : "#fafafa",
                          }}
                          onClick={() => toggleTask(task.id)}
                        >
                          <input
                            type="checkbox"
                            checked={!!checkedTasks[task.id]}
                            onChange={() => toggleTask(task.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ width: 14, height: 14, accentColor: "#011e41" }}
                          />
                          <span style={{
                            flex: 1, fontSize: 13,
                            color: checkedTasks[task.id] ? "#1e293b" : "#94a3b8",
                            textDecoration: checkedTasks[task.id] ? "none" : "line-through",
                          }}>
                            {task.title}
                          </span>
                          <span style={{
                            fontSize: 11, color: PRIORITY_COLORS[task.priority] || "#94a3b8",
                          }}>
                            {PRIORITY_LABELS[task.priority] || task.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>
                {totalSelected > 0 ? `${totalSelected} משימות נבחרו` : "לא נבחרו משימות"}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onClose}
                  style={{ background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}
                >
                  ביטול
                </button>
                <button
                  onClick={apply}
                  disabled={applying || !selected || totalSelected === 0}
                  style={{
                    background: "#011e41", color: "#fff", border: "none", borderRadius: 8,
                    padding: "8px 20px", cursor: applying || !selected || totalSelected === 0 ? "not-allowed" : "pointer",
                    fontSize: 13, fontWeight: 600,
                    opacity: applying || !selected || totalSelected === 0 ? 0.5 : 1,
                  }}
                >
                  {applying ? "מחיל..." : "החל טמפלייט"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
