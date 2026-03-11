"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "דשבורד", icon: "⊞" },
  { href: "/projects", label: "פרויקטים", icon: "🏗" },
  { href: "/contacts", label: "אנשי מקצוע", icon: "👤" },
  { href: "/documents", label: "מסמכים", icon: "📄" },
  { href: "/pipeline", label: "Pipeline AI", icon: "✉" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-6 py-3 text-sm transition-colors"
              style={{
                color: active ? "#fcd562" : "rgba(255,255,255,0.75)",
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                borderRight: active ? "3px solid #fcd562" : "3px solid transparent",
              }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

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
