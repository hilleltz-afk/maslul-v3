"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const mainNavItems = [
  { href: "/dashboard", label: "דשבורד", icon: "⊞" },
  { href: "/projects", label: "פרויקטים", icon: "🏗" },
  { href: "/pipeline", label: "Pipeline AI", icon: "✉" },
];

const bottomNavItems = [
  { href: "/documents", label: "מסמכים", icon: "📄" },
  { href: "/contacts", label: "אנשי קשר", icon: "👤" },
];

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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    apiFetch("/auth/me").then((me: any) => {
      if (me?.role === "admin" || me?.role === "super_admin") {
        setIsAdmin(true);
        apiFetch(`/tenants/${me.tenant_id}/users/`).then((users: any[]) => {
          setPendingCount(users.filter((u: any) => u.status === "pending").length);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  function logout() {
    localStorage.removeItem("token");
    router.replace("/login");
  }

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

      {/* Main nav */}
      <nav className="flex-1 py-4">
        {mainNavItems.map(item => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </nav>

      {/* Bottom nav — ניהולי */}
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
