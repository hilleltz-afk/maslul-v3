"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

const TABLE_OPTIONS = [
  { value: "", label: "הכל" },
  { value: "tasks", label: "משימות" },
  { value: "projects", label: "פרויקטים" },
  { value: "budget_entries", label: "תקציב" },
  { value: "quotes", label: "הצעות מחיר" },
  { value: "contacts", label: "אנשי קשר" },
  { value: "documents", label: "מסמכים" },
  { value: "users", label: "משתמשים" },
];

const ACTION_COLOR: Record<string, string> = {
  CREATE: "#27ae60",
  UPDATE: "#2980b9",
  DELETE: "#c0392b",
};

interface HistoryEntry {
  id: string;
  table_he: string;
  field_he: string;
  old_value?: string;
  new_value?: string;
  changed_by_name: string;
  changed_at: string;
  action: string;
  action_he: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
  }, [tableFilter]);

  async function load() {
    setLoading(true);
    try {
      const url = `/tenants/${TENANT_ID}/history/${tableFilter ? `?table_name=${tableFilter}` : ""}`;
      const data = await apiFetch(url);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function fmtDate(s: string) {
    const d = new Date(s);
    return d.toLocaleDateString("he-IL") + " " + d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }

  function shortVal(v?: string) {
    if (!v) return "—";
    if (v.length > 60) return v.slice(0, 60) + "...";
    return v;
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>היסטוריית שינויים</h1>
            <p className="text-sm text-gray-500 mt-0.5">כל השינויים שבוצעו במערכת</p>
          </div>
          <select
            value={tableFilter}
            onChange={e => setTableFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {TABLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading && <div className="text-center py-20 text-gray-400">טוען...</div>}

        {!loading && logs.length === 0 && (
          <div className="text-center py-20 text-gray-400">אין נתוני היסטוריה</div>
        )}

        {!loading && logs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-right px-5 py-3 font-medium">תאריך</th>
                  <th className="text-right px-5 py-3 font-medium">משתמש</th>
                  <th className="text-right px-5 py-3 font-medium">ישות</th>
                  <th className="text-right px-5 py-3 font-medium">פעולה</th>
                  <th className="text-right px-5 py-3 font-medium">שדה</th>
                  <th className="text-right px-5 py-3 font-medium">מ-</th>
                  <th className="text-right px-5 py-3 font-medium">ל-</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(l.changed_at)}</td>
                    <td className="px-5 py-2.5 font-medium">{l.changed_by_name}</td>
                    <td className="px-5 py-2.5 text-gray-600">{l.table_he}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: (ACTION_COLOR[l.action] || "#888") + "20", color: ACTION_COLOR[l.action] || "#888" }}
                      >
                        {l.action_he}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-gray-500">{l.field_he}</td>
                    <td className="px-5 py-2.5 text-gray-400 max-w-32 truncate">{shortVal(l.old_value)}</td>
                    <td className="px-5 py-2.5 text-gray-700 max-w-32 truncate">{shortVal(l.new_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
