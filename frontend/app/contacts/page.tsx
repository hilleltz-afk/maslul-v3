"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Contact { id: string; name: string; phone?: string; mobile_phone?: string; email?: string; profession?: string; office_name?: string; notes?: string; }

const EMPTY_FORM = { name: "", phone: "", mobile_phone: "", email: "", profession: "", office_name: "", notes: "" };

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
  }, [router]);

  function load() {
    apiFetch(`/tenants/${TENANT_ID}/contacts/`).then(setContacts).catch(console.error).finally(() => setLoading(false));
  }

  function downloadTemplate() {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/tenants/${TENANT_ID}/contacts/template-xlsx`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "contacts_template.xlsx";
        a.click();
      });
  }

  async function handleXlsxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/tenants/${TENANT_ID}/contacts/import-xlsx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "שגיאה");
      alert(`יובאו ${data.imported} אנשי קשר`);
      load();
    } catch (err: any) {
      alert(err.message || "שגיאה בייבוא");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openAdd() { setForm({ ...EMPTY_FORM }); setEditingContact(null); setShowForm(true); }
  function openEdit(c: Contact) { setForm({ name: c.name, phone: c.phone || "", mobile_phone: c.mobile_phone || "", email: c.email || "", profession: c.profession || "", office_name: c.office_name || "", notes: c.notes || "" }); setEditingContact(c); setShowForm(true); }

  async function saveContact() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingContact) {
        const updated = await apiFetch(`/tenants/${TENANT_ID}/contacts/${editingContact.id}`, { method: "PUT", body: JSON.stringify(form) });
        setContacts(prev => prev.map(c => c.id === editingContact.id ? updated : c));
      } else {
        const created = await apiFetch(`/tenants/${TENANT_ID}/contacts/`, { method: "POST", body: JSON.stringify(form) });
        setContacts(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function deleteContact(id: string, name: string) {
    if (!confirm(`למחוק את "${name}"?`)) return;
    await apiFetch(`/tenants/${TENANT_ID}/contacts/${id}`, { method: "DELETE" });
    setContacts(prev => prev.filter(c => c.id !== id));
  }

  const filtered = contacts.filter(c =>
    c.name.includes(search) || c.email?.includes(search) || c.profession?.includes(search) || c.office_name?.includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>אנשי קשר</h1>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white hover:bg-gray-50 text-gray-600">⬇ תבנית Excel</button>
          <label className="px-3 py-2 rounded-lg text-sm text-white cursor-pointer" style={{ background: "#27ae60" }}>
            {importing ? "מייבא..." : "⬆ ייבא Excel"}
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleXlsxUpload} disabled={importing} />
          </label>
          <button onClick={openAdd} className="px-3 py-2 rounded-lg text-sm text-white font-medium" style={{ background: "#011e41" }}>+ הוסף</button>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4" style={{ color: "#011e41" }}>{editingContact ? "עריכת איש קשר" : "איש קשר חדש"}</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "name", label: "שם *", full: true },
                { key: "profession", label: "מקצוע" },
                { key: "office_name", label: "משרד/חברה" },
                { key: "phone", label: "טלפון" },
                { key: "mobile_phone", label: "נייד" },
                { key: "email", label: "אימייל" },
              ].map(({ key, label, full }) => (
                <div key={key} className={full ? "col-span-2" : ""}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input
                    value={(form as any)[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && saveContact()}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300"
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">הערות</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-300 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ביטול</button>
              <button onClick={saveContact} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ background: "#011e41", opacity: saving ? 0.6 : 1 }}>
                {saving ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full max-w-sm mb-6 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none" />

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400">אין תוצאות</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm flex items-start gap-4 group">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: "#011e41" }}>
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium" style={{ color: "#011e41" }}>{c.name}</div>
                {c.profession && <div className="text-xs font-medium mt-0.5" style={{ color: "#a4742d" }}>{c.profession}{c.office_name ? ` · ${c.office_name}` : ""}</div>}
                {c.mobile_phone && <div className="text-xs text-gray-500 mt-0.5">📱 {c.mobile_phone}</div>}
                {c.phone && <div className="text-xs text-gray-500">📞 {c.phone}</div>}
                {c.email && <div className="text-xs text-gray-400 truncate">{c.email}</div>}
                {c.notes && <div className="text-xs text-gray-300 mt-1 truncate">{c.notes}</div>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => openEdit(c)} className="text-sm text-gray-400 hover:text-blue-600 px-3 py-1.5 rounded hover:bg-gray-50">✏️</button>
                <button onClick={() => deleteContact(c.id, c.name)} className="text-sm text-gray-400 hover:text-red-500 px-3 py-1.5 rounded hover:bg-red-50">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
