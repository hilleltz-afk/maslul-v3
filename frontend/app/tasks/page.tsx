"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  todo:        { label: "לביצוע",      color: "#7f8c8d" },
  in_progress: { label: "בעבודה",      color: "#2980b9" },
  done:        { label: "הושלם",       color: "#27ae60" },
  blocked:     { label: "חסום",        color: "#c0392b" },
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "#c0392b",
  medium: "#e67e22",
  low:    "#27ae60",
};

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string;
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    apiFetch(`/tenants/${TENANT_ID}/tasks/`)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#011e41" }}>משימות</h1>

      {/* פילטר */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[["all", "הכל"], ["todo", "לביצוע"], ["in_progress", "בעבודה"], ["done", "הושלם"], ["blocked", "חסום"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              background: filter === val ? "#011e41" : "#e5e7eb",
              color: filter === val ? "white" : "#374151",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400">אין משימות</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => {
            const s = STATUS_LABELS[t.status] || { label: t.status, color: "#7f8c8d" };
            return (
              <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4">
                <div
                  className="w-1 self-stretch rounded-full flex-shrink-0"
                  style={{ background: PRIORITY_COLORS[t.priority] || "#ccc" }}
                />
                <div className="flex-1">
                  <div className="font-medium" style={{ color: "#011e41" }}>{t.title}</div>
                  {t.description && <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>}
                </div>
                <span
                  className="text-xs px-3 py-1 rounded-full font-medium"
                  style={{ background: s.color + "20", color: s.color }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
