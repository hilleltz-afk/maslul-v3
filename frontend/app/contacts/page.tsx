"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Contact { id: string; name: string; phone?: string; mobile_phone?: string; email?: string; profession?: string; office_name?: string; notes?: string; }

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
  }, [router]);

  function load() {
    apiFetch(`/tenants/${TENANT_ID}/contacts/`).then(setContacts).catch(console.error).finally(() => setLoading(false));
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/tenants/${TENANT_ID}/contacts/import-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      alert(`יובאו ${data.imported} אנשי קשר`);
      load();
    } catch {
      alert("שגיאה בייבוא");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const filtered = contacts.filter(c =>
    c.name.includes(search) || c.email?.includes(search) || c.profession?.includes(search) || c.office_name?.includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>אנשי קשר</h1>
        <div className="flex gap-2">
          <a href="/contacts_template.csv" download className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white hover:bg-gray-50 text-gray-600">
            ⬇ תבנית CSV
          </a>
          <label className="px-3 py-2 rounded-lg text-sm text-white cursor-pointer" style={{ background: "#011e41" }}>
            {importing ? "מייבא..." : "⬆ ייבא CSV"}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} disabled={importing} />
          </label>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full max-w-sm mb-6 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none" />

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400">אין תוצאות</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm flex items-start gap-4">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
