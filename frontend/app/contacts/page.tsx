"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    apiFetch(`/tenants/${TENANT_ID}/contacts/`)
      .then(setContacts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = contacts.filter(c =>
    c.name.includes(search) || c.email?.includes(search) || c.phone?.includes(search)
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#011e41" }}>אנשי קשר</h1>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="חיפוש..."
        className="w-full max-w-sm mb-6 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-300"
      />

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400">אין תוצאות</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: "#011e41" }}
              >
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: "#011e41" }}>{c.name}</div>
                {c.phone && <div className="text-xs text-gray-500 mt-0.5">{c.phone}</div>}
                {c.email && <div className="text-xs text-gray-400 truncate">{c.email}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
