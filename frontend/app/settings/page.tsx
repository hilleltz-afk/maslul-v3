"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }
    loadData();
  }, [router]);

  async function loadData() {
    try {
      const [usersData, meData] = await Promise.all([
        apiFetch(`/tenants/${TENANT_ID}/users/`),
        apiFetch("/auth/me"),
      ]);
      setUsers(usersData);
      setMe(meData);
    } finally {
      setLoading(false);
    }
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

  async function sendInvite() {
    if (!inviteEmail || !inviteName) return;
    setInviting(true);
    try {
      const newUser = await apiFetch(`/tenants/${TENANT_ID}/users/invite`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
      });
      setUsers(prev => [...prev, newUser]);
      setInviteEmail(""); setInviteName(""); setInviteRole("member");
      setShowInvite(false);
    } catch (err: any) {
      alert(err?.message || "שגיאה בהזמנה");
    } finally { setInviting(false); }
  }

  const myRole = me?.role || "member";
  const isAdmin = myRole === "admin" || myRole === "super_admin";
  const isSuperAdmin = myRole === "super_admin";

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  async function saveName() {
    if (!me || !nameInput.trim()) return;
    await apiFetch(`/tenants/${TENANT_ID}/users/${me.id}`, {
      method: "PUT",
      body: JSON.stringify({ email: me.email, name: nameInput }),
    });
    setMe(prev => prev ? { ...prev, name: nameInput } : prev);
    setUsers(prev => prev.map(u => u.id === me.id ? { ...u, name: nameInput } : u));
    setEditingName(false);
  }

  const pending  = users.filter(u => u.status === "pending");
  const active   = users.filter(u => u.status === "active");
  const rejected = users.filter(u => u.status === "rejected");

  const rowProps = { myRole, isSelf: false, actionLoading, onApprove: approve, onReject: reject, onRoleChange: changeRole, onDelete: deleteUser };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>הגדרות</h1>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#011e41" }}>
            + הזמן משתמש
          </button>
        )}
      </div>

      {/* My profile */}
      {me && (
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
          <div className="text-sm font-semibold text-gray-700 mb-3">הפרופיל שלי</div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ background: "#011e41" }}>
              {me.name[0]}
            </div>
            <div className="flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none"
                  />
                  <button onClick={saveName} className="text-xs px-3 py-1.5 rounded text-white" style={{ background: "#011e41" }}>שמור</button>
                  <button onClick={() => setEditingName(false)} className="text-xs text-gray-400 hover:text-gray-600">ביטול</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{me.name}</span>
                  <button
                    onClick={() => { setNameInput(me.name); setEditingName(true); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >✏️</button>
                </div>
              )}
              <div className="text-sm text-gray-400">{me.email}</div>
            </div>
            {roleBadge[me.role]?.text && (
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: roleBadge[me.role].bg, color: roleBadge[me.role].color }}>
                {roleBadge[me.role].text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6 flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">שם</label>
            <input value={inviteName} onChange={e => setInviteName(e.target.value)}
              className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none w-44" placeholder="ישראל ישראלי" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">אימייל</label>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email"
              className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none w-56" placeholder="user@hadas-capital.com" />
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
          <button onClick={sendInvite} disabled={inviting}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: "#27ae60" }}>
            {inviting ? "שולח..." : "הוסף"}
          </button>
          <button onClick={() => setShowInvite(false)} className="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700">ביטול</button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : (
        <div className="flex flex-col gap-6">
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-orange-600 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                ממתינים לאישור ({pending.length})
              </h2>
              <div className="flex flex-col gap-2">
                {pending.map(u => <UserRow key={u.id} user={u} {...rowProps} isSelf={u.id === me?.id} myRole={myRole} />)}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              משתמשים פעילים ({active.length})
            </h2>
            <div className="flex flex-col gap-2">
              {active.map(u => <UserRow key={u.id} user={u} {...rowProps} isSelf={u.id === me?.id} myRole={myRole} />)}
            </div>
          </div>

          {rejected.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-300 inline-block" />
                נדחו ({rejected.length})
              </h2>
              <div className="flex flex-col gap-2">
                {rejected.map(u => <UserRow key={u.id} user={u} {...rowProps} isSelf={u.id === me?.id} myRole={myRole} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, myRole, isSelf, actionLoading, onApprove, onReject, onRoleChange, onDelete }: {
  user: User;
  myRole: string;
  isSelf: boolean;
  actionLoading: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRoleChange: (id: string, role: string) => void;
  onDelete: (id: string) => void;
}) {
  const s = statusLabel[user.status] || statusLabel.active;
  const rb = roleBadge[user.role];

  const isSuperAdmin = myRole === "super_admin";
  const isAdmin = myRole === "admin" || isSuperAdmin;

  // Can edit: admin can edit members/other admins but NOT super_admins; super_admin can edit anyone
  const canEdit = isAdmin && !isSelf && (isSuperAdmin || user.role !== "super_admin");

  return (
    <div className="bg-white rounded-xl px-5 py-3 shadow-sm flex items-center gap-4">
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
        style={{ background: "#011e41" }}>
        {user.name[0]}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm flex items-center gap-2 flex-wrap" style={{ color: "#011e41" }}>
          {user.name}
          {isSelf && <span className="text-xs text-gray-400">(אתה)</span>}
          {rb?.text && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ color: rb.color, background: rb.bg }}>
              {rb.text}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400 truncate">{user.email}</div>
      </div>

      <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ color: s.color, background: s.bg }}>
        {s.text}
      </span>

      {canEdit && (
        <div className="flex items-center gap-2 flex-shrink-0">
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
                className="text-xs px-3 py-1 rounded-lg text-white font-medium" style={{ background: "#27ae60" }}>
                {actionLoading === user.id + "_approve" ? "..." : "אשר"}
              </button>
              <button onClick={() => onReject(user.id)} disabled={actionLoading === user.id + "_reject"}
                className="text-xs px-3 py-1 rounded-lg text-white font-medium" style={{ background: "#e74c3c" }}>
                {actionLoading === user.id + "_reject" ? "..." : "דחה"}
              </button>
            </>
          )}

          {user.status === "rejected" && (
            <button onClick={() => onApprove(user.id)} disabled={actionLoading === user.id + "_approve"}
              className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              {actionLoading === user.id + "_approve" ? "..." : "הפעל מחדש"}
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={() => onDelete(user.id)}
              disabled={actionLoading === user.id + "_delete"}
              className="text-xs px-2 py-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="מחק משתמש"
            >
              {actionLoading === user.id + "_delete" ? "..." : "🗑"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
