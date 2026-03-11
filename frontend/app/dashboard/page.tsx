"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface Stats {
  projects: number;
  tasks: number;
  contacts: number;
  documents: number;
  expiring: number;
  pipeline: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }

    // parse name from JWT
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserName(payload.name || payload.email);
    } catch {}

    // fetch stats in parallel
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/tasks/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/contacts/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/documents/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/documents/expiring`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/pipeline/pending`).catch(() => []),
    ]).then(([projects, tasks, contacts, documents, expiring, pipeline]) => {
      setStats({
        projects: projects.length,
        tasks: tasks.length,
        contacts: contacts.length,
        documents: documents.length,
        expiring: expiring.length,
        pipeline: pipeline.length,
      });
    });
  }, [router]);

  const cards = stats ? [
    { label: "פרויקטים", value: stats.projects, href: "/projects", color: "#011e41" },
    { label: "משימות", value: stats.tasks, href: "/tasks", color: "#a4742d" },
    { label: "אנשי קשר", value: stats.contacts, href: "/contacts", color: "#2d6aa4" },
    { label: "מסמכים", value: stats.documents, href: "/documents", color: "#2da47a" },
    { label: "מסמכים פגי תוקף", value: stats.expiring, href: "/documents", color: stats.expiring > 0 ? "#c0392b" : "#7f8c8d" },
    { label: "מיילים ממתינים", value: stats.pipeline, href: "/pipeline", color: stats.pipeline > 0 ? "#e67e22" : "#7f8c8d" },
  ] : [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>
          שלום{userName ? `, ${userName}` : ""} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">סקירה כללית של המשרד</p>
      </div>

      {!stats ? (
        <div className="text-gray-400">טוען...</div>
      ) : (
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
          {cards.map((card) => (
            <a
              key={card.label}
              href={card.href}
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="text-4xl font-bold mb-2" style={{ color: card.color }}>
                {card.value}
              </div>
              <div className="text-sm text-gray-500">{card.label}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
