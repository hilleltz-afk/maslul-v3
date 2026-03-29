"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getTenantId } from "@/lib/tenant";
import { apiFetch } from "@/lib/api";

const TENANT_ID = getTenantId();

interface PipelineItem {
  id: string;
  sender: string;
  subject: string;
  body_preview?: string;
  full_body?: string;
  status: string;
  suggested_task_name?: string;
  suggested_priority?: string;
  suggested_project_id?: string;
  project_match_confidence?: number;
  suggested_due_date?: string;
  budget_mentioned?: number;
  triage_confidence?: number;
  triage_reason?: string;
  analysis_notes?: string;
  created_at: string;
}
interface Project { id: string; name: string; }
interface Stage { id: string; name: string; project_id: string; }
interface User { id: string; name: string; }

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "דחוף", high: "גבוהה", medium: "בינונית", low: "נמוכה",
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

function PipelineCard({
  item,
  projects,
  stages,
  users,
  onApproved,
  onDismissed,
}: {
  item: PipelineItem;
  projects: Project[];
  stages: Stage[];
  users: User[];
  onApproved: () => void;
  onDismissed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [acting, setActing] = useState(false);

  // Form state — pre-filled with AI suggestions
  const [taskTitle, setTaskTitle] = useState(item.suggested_task_name || item.subject);
  const [projectId, setProjectId] = useState(item.suggested_project_id || "");
  const [stageId, setStageId] = useState("");
  const [priority, setPriority] = useState(item.suggested_priority || "medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState(item.suggested_due_date ? item.suggested_due_date.slice(0, 10) : "");

  // New stage creation
  const [newStageName, setNewStageName] = useState("");
  const [creatingStage, setCreatingStage] = useState(false);

  const filteredStages = stages.filter(s => s.project_id === projectId);
  const suggestedProject = projects.find(p => p.id === item.suggested_project_id);
  const aiMissed = item.suggested_project_id && projectId && projectId !== item.suggested_project_id;

  async function createStageAndSelect() {
    if (!newStageName.trim() || !projectId) return;
    setCreatingStage(true);
    try {
      const s = await apiFetch(`/tenants/${TENANT_ID}/stages/`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, name: newStageName.trim(), color: "#011e41" }),
      });
      setStageId(s.id);
      setNewStageName("");
      // reload stages will happen via parent, for now just set the id
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreatingStage(false);
    }
  }

  async function approve() {
    if (!projectId || !stageId || !taskTitle.trim()) {
      alert("יש לבחור פרויקט, קבוצה וכותרת משימה");
      return;
    }
    setActing(true);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/pipeline/${item.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          stage_id: stageId,
          task_title: taskTitle.trim(),
          priority,
          assignee_id: assigneeId || null,
          due_date: dueDate || null,
        }),
      });
      onApproved();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  async function dismiss() {
    setActing(true);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/pipeline/${item.id}/dismiss`, { method: "POST" });
      onDismissed();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden" dir="rtl">
      {/* Header — always visible */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm" style={{ color: "#011e41" }}>{item.subject}</div>
            <div className="text-xs text-gray-400 mt-0.5">{item.sender}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {item.suggested_priority && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[item.suggested_priority] || "bg-gray-100 text-gray-600"}`}>
                {PRIORITY_LABELS[item.suggested_priority] || item.suggested_priority}
              </span>
            )}
            {suggestedProject && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium max-w-32 truncate">
                {suggestedProject.name}
                {item.project_match_confidence ? ` ${Math.round(item.project_match_confidence * 100)}%` : ""}
              </span>
            )}
            <span className="text-gray-300 text-lg">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {!expanded && item.suggested_task_name && (
          <div className="mt-2 text-xs text-gray-500 truncate">
            <span className="font-medium">משימה מוצעת: </span>{item.suggested_task_name}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4">
          {/* Email preview / full body */}
          <div className="mt-3">
            <button
              onClick={() => setShowBody(v => !v)}
              className="text-xs text-blue-600 hover:underline mb-2"
            >
              {showBody ? "הסתר מייל" : "הצג מייל מלא"}
            </button>
            {showBody ? (
              <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {item.full_body || item.body_preview || "אין תוכן"}
              </div>
            ) : (
              item.body_preview && (
                <div className="text-xs text-gray-400 line-clamp-2">{item.body_preview}</div>
              )
            )}
          </div>

          {/* AI context */}
          {(item.triage_reason || item.analysis_notes || item.budget_mentioned) && (
            <div className="mt-3 text-xs text-gray-400 space-y-0.5">
              {item.triage_reason && <div>🤖 {item.triage_reason}</div>}
              {item.analysis_notes && <div>📝 {item.analysis_notes}</div>}
              {item.budget_mentioned && <div>💰 סכום שהוזכר: ₪{item.budget_mentioned.toLocaleString("he-IL")}</div>}
            </div>
          )}

          {/* Edit form */}
          <div className="mt-4 grid gap-3">
            {/* Task title */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">כותרת המשימה *</label>
              <input
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
              />
            </div>

            {/* Project */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">
                פרויקט *
                {aiMissed && (
                  <span className="mr-2 text-orange-500 font-normal">(תיקנת את הצעת ה-AI)</span>
                )}
              </label>
              <select
                value={projectId}
                onChange={e => { setProjectId(e.target.value); setStageId(""); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">בחר פרויקט...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.id === item.suggested_project_id ? `✓ ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Stage */}
            {projectId && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">קבוצת משימות *</label>
                <select
                  value={stageId}
                  onChange={e => setStageId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="">בחר קבוצה...</option>
                  {filteredStages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  <option value="__new__">+ צור קבוצה חדשה</option>
                </select>

                {stageId === "__new__" && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newStageName}
                      onChange={e => setNewStageName(e.target.value)}
                      placeholder="שם הקבוצה החדשה..."
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
                      onKeyDown={e => { if (e.key === "Enter") createStageAndSelect(); }}
                    />
                    <button
                      onClick={createStageAndSelect}
                      disabled={creatingStage || !newStageName.trim()}
                      className="px-3 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50"
                      style={{ background: "#011e41" }}
                    >
                      {creatingStage ? "..." : "צור"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Priority + Due date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">עדיפות</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="urgent">דחוף</option>
                  <option value="high">גבוהה</option>
                  <option value="medium">בינונית</option>
                  <option value="low">נמוכה</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">תאריך יעד</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">שייך לאיש צוות</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">—</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={approve}
              disabled={acting}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
              style={{ background: "#27ae60" }}
            >
              {acting ? "שומר..." : "אשר וצור משימה ✓"}
            </button>
            <button
              onClick={dismiss}
              disabled={acting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              דחה ✗
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [fetchingGmail, setFetchingGmail] = useState(false);
  const [gmailMsg, setGmailMsg] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
    checkGmail();
    if (searchParams.get("gmail_connected")) setGmailMsg("Gmail חובר בהצלחה!");
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/`),
      apiFetch(`/tenants/${TENANT_ID}/stages/`),
      apiFetch(`/tenants/${TENANT_ID}/users/`),
    ]).then(([p, s, u]) => { setProjects(p); setStages(s); setUsers(u); }).catch(() => {});
  }, [router]);

  function load() {
    setLoading(true);
    apiFetch(`/tenants/${TENANT_ID}/pipeline/pending`)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  // Reload stages after a new one is created
  function reloadStages() {
    apiFetch(`/tenants/${TENANT_ID}/stages/`).then(setStages).catch(() => {});
  }

  async function checkGmail() {
    try {
      const s = await apiFetch("/auth/gmail/status");
      setGmailConnected(s.connected);
    } catch {}
  }

  async function connectGmail() {
    try {
      const { url } = await apiFetch("/auth/gmail/connect");
      window.location.href = url;
    } catch (e: any) { alert(e.message); }
  }

  async function fetchGmail() {
    setFetchingGmail(true);
    setGmailMsg("");
    try {
      const res = await apiFetch(`/auth/gmail/fetch?tenant_id=${TENANT_ID}`, { method: "POST" });
      setGmailMsg(`נוספו ${res.added} מיילים חדשים`);
      if (res.added > 0) load();
    } catch (e: any) {
      setGmailMsg(e.message || "שגיאה");
    } finally {
      setFetchingGmail(false);
    }
  }

  function handleApproved() {
    load();
    reloadStages();
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>Email AI Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">מיילים שעברו triage ומחכים לאישורך</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {gmailMsg && <span className="text-sm text-green-600">{gmailMsg}</span>}
          {gmailConnected === false && (
            <button
              onClick={connectGmail}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#011e41" }}
            >
              חבר Gmail
            </button>
          )}
          {gmailConnected === true && (
            <button
              onClick={fetchGmail}
              disabled={fetchingGmail}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
              style={{ background: "#27ae60" }}
            >
              {fetchingGmail ? "שולף..." : "רענן מ-Gmail"}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
          אין מיילים ממתינים
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map(item => (
            <PipelineCard
              key={item.id}
              item={item}
              projects={projects}
              stages={stages}
              users={users}
              onApproved={handleApproved}
              onDismissed={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense>
      <PipelineContent />
    </Suspense>
  );
}
