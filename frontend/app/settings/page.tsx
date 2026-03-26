"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { apiFetch } from "@/lib/api";

const TENANT_ID = getTenantId();

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface Project {
  id: string;
  name: string;
}

interface ProjectAssignment {
  project_id: string;
  role: string;
  member_record_id?: string;
}

interface Profession {
  id: string;
  name: string;
  order: number;
}

const PROJECT_ROLES = [
  { value: "manager", label: "מנהל פרויקט" },
  { value: "member",  label: "חבר צוות" },
  { value: "viewer",  label: "צפייה בלבד" },
];

const statusLabel: Record<string, { text: string; color: string; bg: string }> = {
  active:   { text: "פעיל",  color: "#166534", bg: "#dcfce7" },
  pending:  { text: "ממתין", color: "#92400e", bg: "#fef3c7" },
  rejected: { text: "נדחה",  color: "#991b1b", bg: "#fee2e2" },
};

const roleBadge: Record<string, { text: string; color: string; bg: string }> = {
  super_admin: { text: "סופר מנהל", color: "#5b21b6", bg: "#ede9fe" },
  admin:       { text: "מנהל",      color: "#1e40af", bg: "#dbeafe" },
  member:      { text: "",          color: "",         bg: "" },
};

export default function SettingsPage() {
  const router = useRouter();

  // Open sections
  const [openSection, setOpenSection] = useState<"team" | "professions">("team");

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inviteAssignments, setInviteAssignments] = useState<ProjectAssignment[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editAssignments, setEditAssignments] = useState<ProjectAssignment[]>([]);
  const [editAssignLoading, setEditAssignLoading] = useState(false);

  // Name editing (my profile + others)
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  // Professions
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [profLoading, setProfLoading] = useState(false);
  const [newProfName, setNewProfName] = useState("");
  const [editingProfId, setEditingProfId] = useState<string | null>(null);
  const [editingProfName, setEditingProfName] = useState("");
  const [profSaving, setProfSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    loadData();
  }, [router]);

  async function loadData() {
    try {
      const [usersData, meData, projectsData] = await Promise.all([
        apiFetch(`/tenants/${TENANT_ID}/users/`),
        apiFetch("/auth/me"),
        apiFetch(`/tenants/${TENANT_ID}/projects/`),
      ]);
      setUsers(usersData);
      setMe(meData);
      setProjects(projectsData);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfessions() {
    setProfLoading(true);
    try {
      const data = await apiFetch(`/tenants/${TENANT_ID}/professions/`);
      setProfessions(data);
    } finally { setProfLoading(false); }
  }

  useEffect(() => {
    if (openSection === "professions" && professions.length === 0) loadProfessions();
  }, [openSection]);

  // ── Profession CRUD ──────────────────────────────────────────────────────

  async function addProfession() {
    if (!newProfName.trim()) return;
    setProfSaving(true);
    try {
      const p = await apiFetch(`/tenants/${TENANT_ID}/professions/`, {
        method: "POST", body: JSON.stringify({ name: newProfName.trim() }),
      });
      setProfessions(prev => [...prev, p]);
      setNewProfName("");
    } catch (e: any) { alert("שגיאה: " + e.message); }
    finally { setProfSaving(false); }
  }

  async function saveProfession(id: string) {
    if (!editingProfName.trim()) return;
    setProfSaving(true);
    try {
      const p = await apiFetch(`/tenants/${TENANT_ID}/professions/${id}`, {
        method: "PUT", body: JSON.stringify({ name: editingProfName.trim() }),
      });
      setProfessions(prev => prev.map(x => x.id === id ? p : x));
      setEditingProfId(null);
    } catch (e: any) { alert("שגיאה: " + e.message); }
    finally { setProfSaving(false); }
  }

  async function deleteProfession(id: string, name: string) {
    if (!confirm(`למחוק את המקצוע "${name}"?`)) return;
    try {
      await apiFetch(`/tenants/${TENANT_ID}/professions/${id}`, { method: "DELETE" });
      setProfessions(prev => prev.filter(p => p.id !== id));
    } catch (e: any) { alert("שגיאה: " + e.message); }
  }

  // ── User management ──────────────────────────────────────────────────────

  async function loadUserAssignments(userId: string) {
    setEditAssignLoading(true);
    try {
      const results = await Promise.all(
        projects.map(p =>
          apiFetch(`/tenants/${TENANT_ID}/projects/${p.id}/members/`)
            .then((members: any[]) => {
              const m = members.find((x: any) => x.user_id === userId);
              return m ? { project_id: p.id, role: m.role, member_record_id: m.id } : null;
            })
            .catch(() => null)
        )
      );
      setEditAssignments(results.filter(Boolean) as ProjectAssignment[]);
    } finally { setEditAssignLoading(false); }
  }

  function toggleInviteProject(projectId: string) {
    setInviteAssignments(prev =>
      prev.find(a => a.project_id === projectId)
        ? prev.filter(a => a.project_id !== projectId)
        : [...prev, { project_id: projectId, role: "member" }]
    );
  }

  function setInviteAssignmentRole(projectId: string, role: string) {
    setInviteAssignments(prev => prev.map(a => a.project_id === projectId ? { ...a, role } : a));
  }

  function toggleEditProject(projectId: string) {
    setEditAssignments(prev =>
      prev.find(a => a.project_id === projectId)
        ? prev.filter(a => a.project_id !== projectId)
        : [...prev, { project_id: projectId, role: "member" }]
    );
  }

  function setEditAssignmentRole(projectId: string, role: string) {
    setEditAssignments(prev => prev.map(a => a.project_id === projectId ? { ...a, role } : a));
  }

  async function saveEditAssignments(userId: string, originalAssignments: ProjectAssignment[]) {
    const originalMap = new Map(originalAssignments.map(a => [a.project_id, a]));
    const newMap = new Map(editAssignments.map(a => [a.project_id, a]));
    const adds = editAssignments.filter(a => !originalMap.has(a.project_id));
    const removes = originalAssignments.filter(a => !newMap.has(a.project_id));
    const updates = editAssignments.filter(a => {
      const orig = originalMap.get(a.project_id);
      return orig && orig.role !== a.role;
    });
    await Promise.all([
      ...adds.map(a => apiFetch(`/tenants/${TENANT_ID}/projects/${a.project_id}/members/`, {
        method: "POST", body: JSON.stringify({ user_id: userId, role: a.role }),
      })),
      ...removes.map(a => apiFetch(`/tenants/${TENANT_ID}/projects/${a.project_id}/members/${userId}`, { method: "DELETE" })),
      ...updates.map(a => apiFetch(`/tenants/${TENANT_ID}/projects/${a.project_id}/members/${userId}`, {
        method: "PUT", body: JSON.stringify({ role: a.role }),
      })),
    ]);
    setEditingUserId(null);
  }

  async function approve(userId: string) {
    setActionLoading(userId + "_approve");
    try {
      await apiFetch(`/tenants/${TENANT_ID}/users/${userId}/approve`, { method: "POST" });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: "active" } : u));
    } finally { setActionLoading(null); }
  }

  async function reject(userId: string) {
    setActionLoading(userId + "_reject");
    try {
      await apiFetch(`/tenants/${TENANT_ID}/users/${userId}/reject`, { method: "POST" });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: "rejected" } : u));
    } finally { setActionLoading(null); }
  }

  async function deleteUser(userId: string) {
    if (!confirm("למחוק משתמש זה לצמיתות?")) return;
    setActionLoading(userId + "_delete");
    try {
      await apiFetch(`/tenants/${TENANT_ID}/users/${userId}`, { method: "DELETE" });
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      alert(err?.message || "שגיאה במחיקה");
    } finally { setActionLoading(null); }
  }

  async function changeRole(userId: string, newRole: string) {
    setActionLoading(userId + "_role");
    try {
      await apiFetch(`/tenants/${TENANT_ID}/users/${userId}/role?role=${newRole}`, { method: "PATCH" });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      alert(err?.message || "שגיאה בשינוי תפקיד");
    } finally { setActionLoading(null); }
  }

  async function saveName(userId: string) {
    if (!nameInput.trim()) return;
    const user = users.find(u => u.id === userId);
    if (!user) return;
    await apiFetch(`/tenants/${TENANT_ID}/users/${userId}`, {
      method: "PUT", body: JSON.stringify({ email: user.email, name: nameInput.trim() }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, name: nameInput.trim() } : u));
    if (me?.id === userId) setMe(prev => prev ? { ...prev, name: nameInput.trim() } : prev);
    setEditingNameId(null);
  }

  async function sendInvite() {
    if (!inviteEmail || !inviteName) return;
    setInviting(true);
    try {
      const newUser = await apiFetch(`/tenants/${TENANT_ID}/users/invite`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
      });
      await Promise.all(inviteAssignments.map(a =>
        apiFetch(`/tenants/${TENANT_ID}/projects/${a.project_id}/members/`, {
          method: "POST", body: JSON.stringify({ user_id: newUser.id, role: a.role }),
        }).catch(() => {})
      ));
      setUsers(prev => [...prev, newUser]);
      setInviteEmail(""); setInviteName(""); setInviteRole("member"); setInviteAssignments([]);
      setShowInvite(false);
    } catch (err: any) {
      alert(err?.message || "שגיאה בהזמנה");
    } finally { setInviting(false); }
  }

  const myRole = me?.role || "member";
  const isAdmin = myRole === "admin" || myRole === "super_admin";
  const isSuperAdmin = myRole === "super_admin";

  const pending  = users.filter(u => u.status === "pending");
  const active   = users.filter(u => u.status === "active");
  const rejected = users.filter(u => u.status === "rejected");

  function SectionHeader({ id, label, count }: { id: "team" | "professions"; label: string; count?: number }) {
    const isOpen = openSection === id;
    return (
      <button
        onClick={() => setOpenSection(isOpen ? "team" : id)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-xl shadow-sm mb-1 hover:bg-gray-50 transition-colors"
        style={{ direction: "rtl" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm" style={{ color: "#011e41" }}>{label}</span>
          {count !== undefined && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
      </button>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#011e41" }}>הגדרות</h1>

      {/* ── אנשי צוות ── */}
      <div className="mb-4">
        <SectionHeader id="team" label="אנשי צוות" count={users.filter(u => u.status !== "rejected").length} />

        {openSection === "team" && (
          <div className="bg-white rounded-xl shadow-sm p-5 border-t-0">

            {/* My profile */}
            {me && (
              <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0" style={{ background: "#011e41" }}>
                  {me.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  {editingNameId === me.id ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveName(me.id); if (e.key === "Escape") setEditingNameId(null); }}
                        className="border border-blue-300 rounded px-3 py-1.5 text-sm outline-none w-44" />
                      <button onClick={() => saveName(me.id)} className="text-xs px-3 py-1.5 rounded text-white" style={{ background: "#011e41" }}>שמור</button>
                      <button onClick={() => setEditingNameId(null)} className="text-xs text-gray-400 hover:text-gray-600">ביטול</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-800">{me.name}</span>
                      <button onClick={() => { setNameInput(me.name); setEditingNameId(me.id); }} className="text-xs text-gray-400 hover:text-gray-600">✏️</button>
                      <span className="text-xs text-gray-400">(אתה)</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400">{me.email}</div>
                </div>
                {roleBadge[me.role]?.text && (
                  <span className="text-xs px-2 py-1 rounded-full font-medium flex-shrink-0"
                    style={{ background: roleBadge[me.role].bg, color: roleBadge[me.role].color }}>
                    {roleBadge[me.role].text}
                  </span>
                )}
              </div>
            )}

            {/* Invite button + form */}
            {isAdmin && (
              <div className="mb-4">
                {!showInvite ? (
                  <button onClick={() => setShowInvite(true)}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: "#011e41" }}>
                    + הזמן משתמש
                  </button>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 flex gap-3 flex-wrap items-end border border-gray-200">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">שם <span className="text-red-400">*</span></label>
                      <input value={inviteName} onChange={e => setInviteName(e.target.value)} onKeyDown={e => e.key === "Enter" && sendInvite()}
                        className="border rounded px-3 py-2 text-sm outline-none w-40 border-gray-200" placeholder="שם מלא" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">אימייל <span className="text-red-400">*</span></label>
                      <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email"
                        className="border rounded px-3 py-2 text-sm outline-none w-52 border-gray-200" placeholder="user@example.com" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">תפקיד</label>
                      <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                        className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none">
                        <option value="member">חבר צוות</option>
                        <option value="admin">מנהל</option>
                        {isSuperAdmin && <option value="super_admin">סופר מנהל</option>}
                      </select>
                    </div>
                    <div className="w-full border-t border-gray-200 pt-3 mt-1">
                      <div className="text-xs font-semibold text-gray-500 mb-2">שיוך לפרויקטים (אופציונלי)</div>
                      <div className="flex flex-wrap gap-2">
                        {projects.map(p => {
                          const assigned = inviteAssignments.find(a => a.project_id === p.id);
                          return (
                            <div key={p.id} className="flex items-center gap-1.5 border rounded-lg px-2 py-1"
                              style={{ borderColor: assigned ? "#3b82f6" : "#e5e7eb", background: assigned ? "#eff6ff" : "#fff" }}>
                              <input type="checkbox" checked={!!assigned} onChange={() => toggleInviteProject(p.id)} className="accent-blue-600" />
                              <span className="text-xs text-gray-700">{p.name}</span>
                              {assigned && (
                                <select value={assigned.role} onChange={e => setInviteAssignmentRole(p.id, e.target.value)}
                                  className="text-xs border-0 bg-transparent outline-none text-blue-700">
                                  {PROJECT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="w-full flex gap-2 pt-1">
                      <button onClick={sendInvite} disabled={inviting}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: "#27ae60" }}>
                        {inviting ? "שולח..." : "הוסף"}
                      </button>
                      <button onClick={() => { setShowInvite(false); setInviteAssignments([]); }}
                        className="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700">ביטול</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Users list */}
            {loading ? (
              <div className="text-gray-400 text-sm">טוען...</div>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.length > 0 && (
                  <>
                    <div className="text-xs font-semibold text-orange-600 mb-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                      ממתינים לאישור ({pending.length})
                    </div>
                    {pending.map(u => (
                      <UserRow key={u.id} user={u} me={me} myRole={myRole} actionLoading={actionLoading}
                        editingNameId={editingNameId} nameInput={nameInput}
                        onStartEditName={() => { setNameInput(u.name); setEditingNameId(u.id); }}
                        onSaveName={() => saveName(u.id)}
                        onNameInput={setNameInput}
                        onCancelEditName={() => setEditingNameId(null)}
                        onApprove={approve} onReject={reject} onRoleChange={changeRole} onDelete={deleteUser}
                        onEditProjects={(id) => { setEditingUserId(id); loadUserAssignments(id); }} />
                    ))}
                    <div className="border-t border-gray-100 my-2" />
                  </>
                )}
                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                  פעילים ({active.length})
                </div>
                {active.map(u => (
                  <UserRow key={u.id} user={u} me={me} myRole={myRole} actionLoading={actionLoading}
                    editingNameId={editingNameId} nameInput={nameInput}
                    onStartEditName={() => { setNameInput(u.name); setEditingNameId(u.id); }}
                    onSaveName={() => saveName(u.id)}
                    onNameInput={setNameInput}
                    onCancelEditName={() => setEditingNameId(null)}
                    onApprove={approve} onReject={reject} onRoleChange={changeRole} onDelete={deleteUser}
                    onEditProjects={(id) => { setEditingUserId(id); loadUserAssignments(id); }} />
                ))}
                {rejected.length > 0 && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <div className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-300 inline-block" />
                      נדחו ({rejected.length})
                    </div>
                    {rejected.map(u => (
                      <UserRow key={u.id} user={u} me={me} myRole={myRole} actionLoading={actionLoading}
                        editingNameId={editingNameId} nameInput={nameInput}
                        onStartEditName={() => { setNameInput(u.name); setEditingNameId(u.id); }}
                        onSaveName={() => saveName(u.id)}
                        onNameInput={setNameInput}
                        onCancelEditName={() => setEditingNameId(null)}
                        onApprove={approve} onReject={reject} onRoleChange={changeRole} onDelete={deleteUser}
                        onEditProjects={(id) => { setEditingUserId(id); loadUserAssignments(id); }} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── מקצועות (super_admin only) ── */}
      {isSuperAdmin && (
        <div className="mb-4">
          <SectionHeader id="professions" label="מקצועות" count={professions.length || undefined} />

          {openSection === "professions" && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              {profLoading ? (
                <div className="text-sm text-gray-400">טוען...</div>
              ) : (
                <>
                  {/* Add new */}
                  <div className="flex gap-2 mb-4">
                    <input
                      value={newProfName}
                      onChange={e => setNewProfName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addProfession()}
                      placeholder="שם מקצוע חדש..."
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
                      style={{ direction: "rtl" }}
                    />
                    <button
                      onClick={addProfession}
                      disabled={profSaving || !newProfName.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: "#011e41" }}
                    >+ הוסף</button>
                  </div>

                  {/* List */}
                  <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
                    {professions.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 group">
                        {editingProfId === p.id ? (
                          <>
                            <input
                              autoFocus
                              value={editingProfName}
                              onChange={e => setEditingProfName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveProfession(p.id); if (e.key === "Escape") setEditingProfId(null); }}
                              className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm outline-none"
                              style={{ direction: "rtl" }}
                            />
                            <button onClick={() => saveProfession(p.id)} disabled={profSaving}
                              className="text-xs px-3 py-1 rounded text-white" style={{ background: "#011e41" }}>שמור</button>
                            <button onClick={() => setEditingProfId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600">ביטול</button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-gray-700">{p.name}</span>
                            <button
                              onClick={() => { setEditingProfId(p.id); setEditingProfName(p.name); }}
                              className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-gray-600 transition-opacity"
                            >✏️</button>
                            <button
                              onClick={() => deleteProfession(p.id, p.name)}
                              className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-opacity"
                            >✕</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit user project assignments modal */}
      {editingUserId && (() => {
        const editUser = users.find(u => u.id === editingUserId);
        if (!editUser) return null;
        const originalAssignments = [...editAssignments];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingUserId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-bold text-gray-800">{editUser.name}</div>
                  <div className="text-xs text-gray-400">{editUser.email}</div>
                </div>
                <button onClick={() => setEditingUserId(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="text-xs font-semibold text-gray-500 mb-3">שיוך לפרויקטים</div>
              {editAssignLoading ? (
                <div className="text-sm text-gray-400 py-4 text-center">טוען...</div>
              ) : (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  {projects.map(p => {
                    const assigned = editAssignments.find(a => a.project_id === p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 border rounded-xl px-3 py-2"
                        style={{ borderColor: assigned ? "#3b82f6" : "#e5e7eb", background: assigned ? "#eff6ff" : "#fafafa" }}>
                        <input type="checkbox" checked={!!assigned} onChange={() => toggleEditProject(p.id)} className="accent-blue-600" />
                        <span className="text-sm text-gray-700 flex-1">{p.name}</span>
                        {assigned && (
                          <select value={assigned.role} onChange={e => setEditAssignmentRole(p.id, e.target.value)}
                            className="text-xs border border-blue-200 rounded px-2 py-1 outline-none bg-white text-blue-700">
                            {PROJECT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 mt-4 justify-end">
                <button onClick={() => saveEditAssignments(editingUserId, originalAssignments)}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#011e41" }}>שמור</button>
                <button onClick={() => setEditingUserId(null)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 border border-gray-200">ביטול</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function UserRow({ user, me, myRole, actionLoading, editingNameId, nameInput, onStartEditName, onSaveName, onNameInput, onCancelEditName, onApprove, onReject, onRoleChange, onDelete, onEditProjects }: {
  user: User;
  me: User | null;
  myRole: string;
  actionLoading: string | null;
  editingNameId: string | null;
  nameInput: string;
  onStartEditName: () => void;
  onSaveName: () => void;
  onNameInput: (v: string) => void;
  onCancelEditName: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRoleChange: (id: string, role: string) => void;
  onDelete: (id: string) => void;
  onEditProjects: (id: string) => void;
}) {
  const s = statusLabel[user.status] || statusLabel.active;
  const rb = roleBadge[user.role];
  const isSuperAdmin = myRole === "super_admin";
  const isAdmin = myRole === "admin" || isSuperAdmin;
  const isSelf = user.id === me?.id;
  const canEdit = isAdmin && !isSelf && (isSuperAdmin || user.role !== "super_admin");
  const isEditingName = editingNameId === user.id;

  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
        style={{ background: "#011e41" }}>
        {user.name[0]}
      </div>

      <div className="flex-1 min-w-0">
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <input autoFocus value={nameInput}
              onChange={e => onNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onSaveName(); if (e.key === "Escape") onCancelEditName(); }}
              className="border border-blue-300 rounded px-2 py-1 text-sm outline-none w-36" />
            <button onClick={onSaveName} className="text-xs px-2 py-1 rounded text-white" style={{ background: "#011e41" }}>שמור</button>
            <button onClick={onCancelEditName} className="text-xs text-gray-400 hover:text-gray-600">ביטול</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm" style={{ color: "#011e41" }}>{user.name}</span>
            {isSelf && <span className="text-xs text-gray-400">(אתה)</span>}
            {rb?.text && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: rb.color, background: rb.bg }}>{rb.text}</span>
            )}
            {(canEdit || isSelf) && (
              <button onClick={onStartEditName} className="text-xs text-gray-300 hover:text-gray-500">✏️</button>
            )}
          </div>
        )}
        <div className="text-xs text-gray-400 truncate">{user.email}</div>
      </div>

      <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ color: s.color, background: s.bg }}>{s.text}</span>

      {canEdit && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {user.status === "active" && (
            <select value={user.role} onChange={e => onRoleChange(user.id, e.target.value)}
              disabled={actionLoading === user.id + "_role"}
              className="text-xs border border-gray-200 rounded px-2 py-1 outline-none">
              <option value="member">חבר צוות</option>
              <option value="admin">מנהל</option>
              {isSuperAdmin && <option value="super_admin">סופר מנהל</option>}
            </select>
          )}
          {user.status === "pending" && (
            <>
              <button onClick={() => onApprove(user.id)} disabled={actionLoading === user.id + "_approve"}
                className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ background: "#27ae60" }}>
                {actionLoading === user.id + "_approve" ? "..." : "אשר"}
              </button>
              <button onClick={() => onReject(user.id)} disabled={actionLoading === user.id + "_reject"}
                className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ background: "#e74c3c" }}>
                {actionLoading === user.id + "_reject" ? "..." : "דחה"}
              </button>
            </>
          )}
          {user.status === "rejected" && (
            <button onClick={() => onApprove(user.id)} disabled={actionLoading === user.id + "_approve"}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              {actionLoading === user.id + "_approve" ? "..." : "הפעל מחדש"}
            </button>
          )}
          {user.status === "active" && (
            <button onClick={() => onEditProjects(user.id)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">פרויקטים</button>
          )}
          {isSuperAdmin && (
            <button onClick={() => onDelete(user.id)} disabled={actionLoading === user.id + "_delete"}
              className="text-xs px-2 py-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50">
              {actionLoading === user.id + "_delete" ? "..." : "🗑"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
