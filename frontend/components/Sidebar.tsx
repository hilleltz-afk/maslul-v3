"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const mainNavItems = [
  { href: "/dashboard", label: "דשבורד", icon: "⊞" },
  { href: "/projects", label: "פרויקטים", icon: "🏗" },
  { href: "/tasks", label: "משימות", icon: "✓" },
  { href: "/calendar", label: "לוח שנה", icon: "📅" },
  { href: "/budget", label: "תקציב", icon: "₪" },
  { href: "/pipeline", label: "Pipeline AI", icon: "✉" },
  { href: "/ai", label: "AI עוזר", icon: "✨" },
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

interface NotifItem {
  id: string; type: "task" | "document"; title: string; detail: string; href: string;
}

function NavLink({ href, label, icon, pathname, badge, onClick }: {
  href: string; label: string; icon: string; pathname: string; badge?: number; onClick?: () => void;
}) {
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onClick}
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
  const [expiringDocs, setExpiringDocs] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  // PWA install
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<NotifItem[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  // Search
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ projects: SearchResult[]; tasks: SearchResult[]; contacts: SearchResult[]; documents: SearchResult[] } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // PWA install detection
  useEffect(() => {
    // iOS detection
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);
    // Already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone) {
      setIsInstalled(true);
      return;
    }
    // Chrome/Edge desktop install prompt
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

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
      apiFetch(`/tenants/${me.tenant_id}/documents/expiring?days=30`)
        .then((docs: any[]) => {
          setExpiringDocs(docs.length);
          setNotifItems(prev => [
            ...prev.filter(n => n.type !== "document"),
            ...docs.map((d: any) => ({
              id: d.id,
              type: "document" as const,
              title: d.name,
              detail: `פג תוקף בעוד ${d.days_left != null ? d.days_left + " ימים" : "פחות מ-30 יום"}`,
              href: "/documents",
            })),
          ]);
        })
        .catch(() => {});
      const today = new Date().toISOString().slice(0, 10);
      apiFetch(`/tenants/${me.tenant_id}/tasks/`)
        .then((ts: any[]) => {
          const overdue = ts.filter((t: any) => t.end_date && t.end_date.slice(0, 10) < today && t.status !== "done");
          setOverdueTasks(overdue.length);
          setNotifItems(prev => [
            ...prev.filter(n => n.type !== "task"),
            ...overdue.slice(0, 10).map((t: any) => ({
              id: t.id,
              type: "task" as const,
              title: t.title,
              detail: `באיחור מ-${new Date(t.end_date).toLocaleDateString("he-IL")}`,
              href: t.project_id ? `/projects/${t.project_id}` : "/tasks",
            })),
          ]);
        })
        .catch(() => {});
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

  // Close notif on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

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

  const closeDrawer = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="fixed top-4 right-4 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-xl shadow-lg"
        style={{ background: "#011e41" }}
        onClick={() => setMobileOpen(o => !o)}
        aria-label="תפריט"
      >
        <span className="text-white text-lg">{mobileOpen ? "✕" : "☰"}</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={closeDrawer}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 right-0 h-screen w-56 flex flex-col z-40 transition-transform duration-300
          ${mobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
        `}
        style={{ background: "#011e41" }}
      >
        {/* Logo + Bell */}
        <div className="px-4 py-5 border-b border-white/10 flex flex-col items-center gap-1 relative">
          <Image src="/logo.png" alt="Hadas Capital" width={72} height={72} className="rounded-lg" />
          <div className="text-center">
            <div className="text-white font-bold text-lg leading-tight">Hadas Capital</div>
            <div className="text-xs mt-0.5" style={{ color: "#fcd562" }}>מסלול</div>
          </div>
          {/* Notification bell */}
          <div className="absolute top-4 left-4" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(o => !o)}
              className="relative w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="התראות"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {notifItems.length > 0 && (
                <span
                  className="absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold"
                  style={{ background: "#fcd562", color: "#011e41", fontSize: 10 }}
                >
                  {notifItems.length > 9 ? "9+" : notifItems.length}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {notifOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
                style={{ maxHeight: 380 }}
              >
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: "#011e41" }}>התראות</span>
                  {notifItems.length > 0 && (
                    <span className="text-xs text-gray-400">{notifItems.length} פריטים</span>
                  )}
                </div>
                {notifItems.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-400 text-center">אין התראות</div>
                ) : (
                  <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
                    {notifItems.map(n => (
                      <a
                        key={n.id}
                        href={n.href}
                        onClick={() => setNotifOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        style={{ textDecoration: "none" }}
                      >
                        <span className="text-base mt-0.5">{n.type === "task" ? "⚠️" : "📄"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{n.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{n.detail}</div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
            <NavLink
              key={item.href}
              {...item}
              pathname={pathname}
              badge={item.href === "/tasks" ? overdueTasks : undefined}
              onClick={closeDrawer}
            />
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="border-t border-white/10 py-2">
          {bottomNavItems.map(item => (
            <NavLink
              key={item.href}
              {...item}
              pathname={pathname}
              badge={item.href === "/documents" ? expiringDocs : undefined}
              onClick={closeDrawer}
            />
          ))}

          {isAdmin && (
            <NavLink
              href="/settings"
              label="הגדרות"
              icon="⚙"
              pathname={pathname}
              badge={pendingCount}
              onClick={closeDrawer}
            />
          )}
          <NavLink
            href="/settings/templates"
            label="טמפלייטים"
            icon="📋"
            pathname={pathname}
            onClick={closeDrawer}
          />
        </div>

        {/* PWA Install */}
        {!isInstalled && (installPrompt || isIOS) && (
          <div className="px-4 pb-2">
            <button
              onClick={() => {
                if (installPrompt) {
                  (installPrompt as any).prompt();
                  (installPrompt as any).userChoice.then(() => { setInstallPrompt(null); setIsInstalled(true); });
                } else {
                  setShowIOSHint(v => !v);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: "rgba(252,213,98,0.15)", color: "#fcd562", border: "1px solid rgba(252,213,98,0.3)" }}
            >
              <span>⬇️</span> התקן אפליקציה
            </button>
            {showIOSHint && (
              <div className="mt-2 p-3 rounded-lg text-xs leading-relaxed" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
                ב-Safari: לחץ על <strong style={{ color: "#fcd562" }}>📤</strong> ובחר<br />
                <strong style={{ color: "#fcd562" }}>"הוסף למסך הבית"</strong>
              </div>
            )}
          </div>
        )}

        {/* Copyright */}
        <div className="px-6 py-1.5 text-center" style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
          כל הזכויות שמורות להלל צייגר
        </div>

        {/* Profile + Logout */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          <Link
            href="/profile"
            onClick={closeDrawer}
            className="text-sm transition-colors"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            הפרופיל שלי
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
            title="רענן עמוד"
          >
            🔄 רענן
          </button>
          <button
            onClick={logout}
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            יציאה
          </button>
        </div>
      </aside>
    </>
  );
}
