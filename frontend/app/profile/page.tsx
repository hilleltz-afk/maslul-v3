"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const ROLE_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  super_admin: { text: "סופר מנהל", color: "#5b21b6", bg: "#ede9fe" },
  admin:       { text: "מנהל",      color: "#1e40af", bg: "#dbeafe" },
  member:      { text: "חבר צוות",  color: "#166534", bg: "#dcfce7" },
};

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  active:   { text: "פעיל",  color: "#27ae60" },
  pending:  { text: "ממתין", color: "#e67e22" },
  rejected: { text: "נדחה",  color: "#c0392b" },
};

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  tenant_id: string;
  created_at?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    apiFetch("/auth/me")
      .then((data: Me) => { setMe(data); setName(data.name); })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function saveName() {
    if (!me || !name.trim()) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/tenants/${me.tenant_id}/users/${me.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: name.trim() }),
      });
      setMe(prev => prev ? { ...prev, name: updated.name } : prev);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      alert(e.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  function initials(n: string) {
    return n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  }

  if (loading) return <div className="text-gray-400 py-20 text-center">טוען...</div>;
  if (!me) return null;

  const role = ROLE_LABELS[me.role] || { text: me.role, color: "#555", bg: "#f5f5f5" };
  const status = STATUS_LABELS[me.status] || { text: me.status, color: "#555" };

  return (
    <div dir="rtl" className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-8" style={{ color: "#011e41" }}>הפרופיל שלי</h1>

      {/* Avatar card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ background: "#011e41" }}
          >
            {initials(me.name)}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditing(false); setName(me.name); } }}
                  className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm outline-none w-48 focus:ring-1 focus:ring-blue-300"
                  autoFocus
                />
                <button
                  onClick={saveName}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-sm text-white font-medium"
                  style={{ background: "#011e41", opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "..." : "שמור"}
                </button>
                <button
                  onClick={() => { setEditing(false); setName(me.name); }}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-700"
                >
                  ביטול
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold" style={{ color: "#011e41" }}>{me.name}</span>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-0.5 rounded hover:bg-gray-50"
                  title="ערוך שם"
                >
                  ✏️
                </button>
              </div>
            )}
            <div className="text-sm text-gray-400 mt-0.5">{me.email}</div>
          </div>
        </div>

        {saved && (
          <div className="mt-3 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
            השם עודכן בהצלחה
          </div>
        )}
      </div>

      {/* Details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {[
          { label: "אימייל", value: me.email },
          {
            label: "תפקיד",
            value: (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: role.bg, color: role.color }}>
                {role.text}
              </span>
            ),
          },
          {
            label: "סטטוס",
            value: (
              <span className="text-sm font-medium" style={{ color: status.color }}>
                {status.text}
              </span>
            ),
          },
          me.created_at
            ? { label: "הצטרף", value: new Date(me.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) }
            : null,
        ].filter(Boolean).map((row: any, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 last:border-0">
            <span className="text-sm text-gray-500">{row.label}</span>
            <span className="text-sm text-gray-800">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Logout */}
      <div className="mt-6 text-center">
        <button
          onClick={() => { localStorage.removeItem("token"); router.replace("/login"); }}
          className="text-sm text-red-400 hover:text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
        >
          התנתק מהחשבון
        </button>
      </div>
    </div>
  );
}
