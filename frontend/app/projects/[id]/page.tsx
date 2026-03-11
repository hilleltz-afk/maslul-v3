"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

const STATUS_OPTIONS = [
  { value: "todo",        label: "לביצוע",      bg: "#e0e0e0", text: "#555" },
  { value: "in_progress", label: "בעבודה",      bg: "#2980b9", text: "#fff" },
  { value: "done",        label: "הושלם",       bg: "#27ae60", text: "#fff" },
  { value: "blocked",     label: "חסום",        bg: "#c0392b", text: "#fff" },
  { value: "review",      label: "לבדיקה",      bg: "#8e44ad", text: "#fff" },
];

const PRIORITY_OPTIONS = [
  { value: "high",   label: "גבוהה", color: "#c0392b" },
  { value: "medium", label: "בינונית", color: "#e67e22" },
  { value: "low",    label: "נמוכה",  color: "#27ae60" },
];

const GROUP_COLORS = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#011e41"];

interface Task { id: string; title: string; status: string; priority: string; description?: string; assignee_id?: string; start_date?: string; end_date?: string; stage_id: string; }
interface Stage { id: string; name: string; color: string; handling_authority: string; }
interface User { id: string; name: string; email: string; }
interface Project { id: string; name: string; gush: string; helka: string; }

// Default column widths
const DEFAULT_WIDTHS: Record<string, number> = { title: 300, assignee: 130, status: 140, priority: 110, start_date: 120, end_date: 120, notes: 200 };

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

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

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/${projectId}`),
      apiFetch(`/tenants/${TENANT_ID}/stages/?project_id=${projectId}`),
      apiFetch(`/tenants/${TENANT_ID}/tasks/?project_id=${projectId}`),
      apiFetch(`/tenants/${TENANT_ID}/users/`),
    ]).then(([proj, stgs, tsks, usrs]) => {
      setProject(proj);
      setStages(stgs);
      setTasks(tsks);
      setUsers(usrs);
    }).catch(console.error);
  }, [projectId, router]);

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
    await apiFetch(`/tenants/${TENANT_ID}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...data } : t));
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

  function getW(col: string) { return colWidths[col] ?? DEFAULT_WIDTHS[col] ?? 120; }
  function getUser(id?: string) { return users.find(u => u.id === id); }
  function getStatus(val: string) { return STATUS_OPTIONS.find(s => s.value === val) || STATUS_OPTIONS[0]; }
  function getPriority(val: string) { return PRIORITY_OPTIONS.find(p => p.value === val) || PRIORITY_OPTIONS[1]; }

  const columns = [
    { key: "title", label: "משימה" },
    { key: "assignee", label: "איש צוות" },
    { key: "status", label: "סטטוס" },
    { key: "priority", label: "עדיפות" },
    { key: "start_date", label: "התחלה" },
    { key: "end_date", label: "סיום" },
    { key: "notes", label: "הערות" },
  ];

  if (!project) return <div className="p-8 text-gray-400">טוען...</div>;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-8 py-4 bg-white border-b border-gray-200 flex items-center gap-3">
        <button onClick={() => router.push("/projects")} className="text-gray-400 hover:text-gray-600 text-sm">← פרויקטים</button>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold" style={{ color: "#011e41" }}>{project.name}</h1>
        <span className="text-xs text-gray-400 mr-auto">גוש {project.gush} חלקה {project.helka}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {stages.map((stage) => {
          const stageTasks = tasks.filter(t => t.stage_id === stage.id);
          const isCollapsed = collapsed[stage.id];
          return (
            <div key={stage.id} className="mb-6">
              {/* Group header */}
              <div className="flex items-center gap-2 mb-1 cursor-pointer select-none" onClick={() => setCollapsed(p => ({ ...p, [stage.id]: !p[stage.id] }))}>
                <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: stage.color || "#011e41" }} />
                <span className="font-semibold text-sm" style={{ color: stage.color || "#011e41" }}>{stage.name}</span>
                <span className="text-xs text-gray-400">({stageTasks.length})</span>
                <span className="text-xs text-gray-400 mr-auto">{isCollapsed ? "▶" : "▼"}</span>
              </div>

              {!isCollapsed && (
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                  {/* Column headers */}
                  <div className="flex bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium select-none">
                    <div style={{ width: 32, minWidth: 32 }} />
                    {columns.map((col) => (
                      <div key={col.key} className="relative flex items-center px-3 py-2 border-r border-gray-200" style={{ width: getW(col.key), minWidth: getW(col.key) }}>
                        {col.label}
                        <div
                          className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 hover:opacity-100"
                          onMouseDown={(e) => startResize(col.key, e)}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  {stageTasks.map((task) => {
                    const status = getStatus(task.status);
                    const priority = getPriority(task.priority);
                    const assignee = getUser(task.assignee_id);
                    return (
                      <div key={task.id} className="flex items-center border-b border-gray-100 hover:bg-gray-50 group text-sm">
                        <div style={{ width: 32, minWidth: 32 }} className="flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full" style={{ background: stage.color || "#011e41" }} />
                        </div>

                        {/* Title */}
                        <div className="flex items-center px-2 py-1.5 border-r border-gray-100" style={{ width: getW("title"), minWidth: getW("title") }}>
                          {editingTask === task.id + "_title" ? (
                            <input
                              autoFocus
                              defaultValue={task.title}
                              className="w-full text-sm outline-none border-b border-blue-400"
                              onBlur={e => { updateTask(task.id, { title: e.target.value }); setEditingTask(null); }}
                              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            />
                          ) : (
                            <span className="truncate cursor-pointer hover:text-blue-600" onClick={() => setEditingTask(task.id + "_title")}>{task.title}</span>
                          )}
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
                        <div className="px-2 py-1.5" style={{ width: getW("notes"), minWidth: getW("notes") }}>
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
                      </div>
                    );
                  })}

                  {/* Add item */}
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

        {/* Add group */}
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
    </div>
  );
}
