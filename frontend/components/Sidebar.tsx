"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const mainNavItems = [
  { href: "/dashboard", label: "דשבורד", icon: "⊞" },
  { href: "/projects", label: "פרויקטים", icon: "🏗" },
  { href: "/budget", label: "תקציב", icon: "₪" },
  { href: "/pipeline", label: "Pipeline AI", icon: "✉" },
];

const bottomNavItems = [
  { href: "/documents", label: "מסמכים", icon: "📄" },
  { href: "/contacts", label: "אנשי קשר", icon: "👤" },
  { href: "/history", label: "היסטוריה", icon: "📋" },
];

interface SearchResult {
  id: string; name?: string; title?: string; type: string;
  address?: string; status?: string; project_id?: string; email?: string; profession?: string;
}

function NavLink({ href, label, icon, pathname, badge }: {
  href: string; label: string; icon: string; pathname: string; badge?: number;
}) {
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-6 py-3 text-sm transition-colors"
      style={{
        color: active ? "#fcd562" : "rgba(255,255,255,0.75)",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        borderRight: active ? "3px solid #fcd562" : "3px solid transparent",
      }}
    >
      <span className="text-base">{icon}</span>
      {label}
      {badge && badge > 0 ? (
        <span
          className="mr-auto text-xs font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: "#fcd562", color: "#011e41" }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [tenantId, setTenantId] = useState("");

  // Search
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ projects: SearchResult[]; tasks: SearchResult[]; contacts: SearchResult[]; documents: SearchResult[] } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    apiFetch("/auth/me").then((me: any) => {
      setTenantId(me.tenant_id || "");
      if (me?.role === "admin" || me?.role === "super_admin") {
        setIsAdmin(true);
        apiFetch(`/tenants/${me.tenant_id}/users/`).then((users: any[]) => {
          setPendingCount(users.filter((u: any) => u.status === "pending").length);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQ.trim() || searchQ.length < 2 || !tenantId) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/tenants/${tenantId}/search?q=${encodeURIComponent(searchQ)}`);
        setSearchResults(res);
      } catch {}
      setSearchLoading(false);
    }, 300);
  }, [searchQ, tenantId]);

  // Close search on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults(null);
        setSearchQ("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function navigateTo(result: SearchResult) {
    setSearchResults(null);
    setSearchQ("");
    if (result.type === "project") router.push(`/projects/${result.id}`);
    else if (result.type === "task") router.push(`/projects/${result.project_id}`);
    else if (result.type === "contact") router.push("/contacts");
    else if (result.type === "document") router.push("/documents");
  }

  function logout() {
    localStorage.removeItem("token");
    router.replace("/login");
  }

  const totalResults = searchResults
    ? searchResults.projects.length + searchResults.tasks.length + searchResults.contacts.length + searchResults.documents.length
    : 0;

  return (
    <aside
      className="fixed top-0 right-0 h-screen w-56 flex flex-col z-40"
      style={{ background: "#011e41" }}
    >
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/10">
        <div className="text-white font-bold text-lg leading-tight">Hadas Capital</div>
        <div className="text-xs mt-0.5" style={{ color: "#fcd562" }}>מסלול</div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-white/10 relative" ref={searchRef}>
        <input
          type="text"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="חיפוש..."
          className="w-full bg-white/10 text-white placeholder-white/40 text-sm rounded-lg px-3 py-2 outline-none focus:bg-white/15"
          dir="rtl"
        />
        {searchQ.length > 0 && (
          <button
            onClick={() => { setSearchQ(""); setSearchResults(null); }}
            className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs mt-px"
          >
            ✕
          </button>
        )}

        {/* Search dropdown */}
        {(searchResults || searchLoading) && (
          <div
            className="absolute top-full right-0 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
            style={{ marginTop: 4 }}
          >
            {searchLoading && (
              <div className="px-4 py-3 text-sm text-gray-400">מחפש...</div>
            )}
            {!searchLoading && searchResults && totalResults === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400">אין תוצאות</div>
            )}
            {!searchLoading && searchResults && totalResults > 0 && (
              <div className="max-h-80 overflow-y-auto" dir="rtl">
                {searchResults.projects.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50">פרויקטים</div>
                    {searchResults.projects.map(r => (
                      <button key={r.id} onClick={() => navigateTo(r)}
                        className="w-full text-right px-3 py-2 hover:bg-blue-50 flex items-start gap-2">
                        <span className="text-sm">🏗</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{r.name}</div>
                          {r.address && <div className="text-xs text-gray-400">{r.address}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.tasks.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50">משימות</div>
                    {searchResults.tasks.map(r => (
                      <button key={r.id} onClick={() => navigateTo(r)}
                        className="w-full text-right px-3 py-2 hover:bg-blue-50 flex items-start gap-2">
                        <span className="text-sm">✓</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{r.title}</div>
                          <div className="text-xs text-gray-400">{r.status}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.contacts.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50">אנשי קשר</div>
                    {searchResults.contacts.map(r => (
                      <button key={r.id} onClick={() => navigateTo(r)}
                        className="w-full text-right px-3 py-2 hover:bg-blue-50 flex items-start gap-2">
                        <span className="text-sm">👤</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{r.name}</div>
                          {r.profession && <div className="text-xs text-gray-400">{r.profession}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.documents.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50">מסמכים</div>
                    {searchResults.documents.map(r => (
                      <button key={r.id} onClick={() => navigateTo(r)}
                        className="w-full text-right px-3 py-2 hover:bg-blue-50 flex items-start gap-2">
                        <span className="text-sm">📄</span>
                        <div className="text-sm font-medium text-gray-800">{r.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {mainNavItems.map(item => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-white/10 py-2">
        {bottomNavItems.map(item => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}

        {isAdmin && (
          <NavLink
            href="/settings"
            label="הגדרות"
            icon="⚙"
            pathname={pathname}
            badge={pendingCount}
          />
        )}
      </div>

      {/* Logout */}
      <div className="px-6 py-4 border-t border-white/10">
        <button
          onClick={logout}
          className="text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          יציאה
        </button>
      </div>
    </aside>
  );
}
