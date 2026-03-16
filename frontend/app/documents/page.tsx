"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Document {
  id: string;
  name: string;
  path: string;
  expiry_date?: string;
  project_id?: string;
  task_id?: string;
}
interface Project { id: string; name: string; }
interface Task { id: string; title: string; }

function expiryStatus(expiry?: string): { label: string; color: string } | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0)   return { label: "פג תוקף",      color: "#c0392b" };
  if (days <= 30) return { label: `${days} ימים`,  color: "#e67e22" };
  return           { label: `${days} ימים`,         color: "#27ae60" };
}

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Document[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    Promise.all([
      apiFetch(`/tenants/${TENANT_ID}/documents/`),
      apiFetch(`/tenants/${TENANT_ID}/projects/`).catch(() => []),
      apiFetch(`/tenants/${TENANT_ID}/tasks/`).catch(() => []),
    ]).then(([d, p, t]) => {
      setDocs(d);
      setProjects(p);
      setTasks(t);
    }).catch(console.error).finally(() => setLoading(false));
  }, [router]);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t.title]));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#011e41" }}>מסמכים</h1>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : docs.length === 0 ? (
        <div className="text-gray-400">אין מסמכים</div>
      ) : (
        <div className="grid gap-3">
          {docs.map((d) => {
            const status = expiryStatus(d.expiry_date);
            const projectName = d.project_id ? projectMap[d.project_id] : null;
            const taskTitle = d.task_id ? taskMap[d.task_id] : null;
            return (
              <div key={d.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4">
                <div className="text-2xl">📄</div>
                <div className="flex-1 min-w-0">
                  <a
                    href={`${API_BASE}${d.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                    style={{ color: "#011e41" }}
                  >{d.name}</a>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    {projectName && <span>📁 {projectName}</span>}
                    {taskTitle && <span>📌 {taskTitle}</span>}
                    {!projectName && !taskTitle && <span>{d.path}</span>}
                  </div>
                </div>
                {status && (
                  <span
                    className="text-xs px-3 py-1 rounded-full font-medium flex-shrink-0"
                    style={{ background: status.color + "20", color: status.color }}
                  >
                    {status.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
