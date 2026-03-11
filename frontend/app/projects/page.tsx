"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface Project {
  id: string;
  name: string;
  description?: string;
  address?: string;
  status?: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    apiFetch(`/tenants/${TENANT_ID}/projects/`)
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#011e41" }}>פרויקטים</h1>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : projects.length === 0 ? (
        <div className="text-gray-400">אין פרויקטים עדיין</div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <div key={p.id} className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="font-semibold text-lg" style={{ color: "#011e41" }}>{p.name}</div>
              {p.address && <div className="text-sm text-gray-500 mt-1">{p.address}</div>}
              {p.description && <div className="text-sm text-gray-400 mt-1">{p.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
