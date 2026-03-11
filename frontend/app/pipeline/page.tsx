"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

interface PipelineItem {
  id: string;
  sender: string;
  subject: string;
  body_preview?: string;
  status: string;
  suggested_task_name?: string;
  suggested_priority?: string;
  triage_confidence?: number;
  created_at: string;
}

export default function PipelinePage() {
  const router = useRouter();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/login"); return; }
    load();
  }, [router]);

  function load() {
    setLoading(true);
    apiFetch(`/tenants/${TENANT_ID}/pipeline/pending`)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function approve(id: string) {
    setActing(id);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/pipeline/${id}/approve`, { method: "POST" });
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(null);
    }
  }

  async function dismiss(id: string) {
    setActing(id);
    try {
      await apiFetch(`/tenants/${TENANT_ID}/pipeline/${id}/dismiss`, { method: "POST" });
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#011e41" }}>Email AI Pipeline</h1>
        <p className="text-sm text-gray-500 mt-1">מיילים שעברו triage ומחכים לאישורך</p>
      </div>

      {loading ? (
        <div className="text-gray-400">טוען...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
          אין מיילים ממתינים
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: "#011e41" }}>{item.subject}</div>
                  <div className="text-xs text-gray-500 mt-0.5">מאת: {item.sender}</div>
                  {item.body_preview && (
                    <div className="text-sm text-gray-400 mt-2 line-clamp-2">{item.body_preview}</div>
                  )}
                </div>
                {item.triage_confidence && (
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {Math.round(item.triage_confidence * 100)}% רלוונטי
                  </div>
                )}
              </div>

              {item.suggested_task_name && (
                <div
                  className="mt-3 p-3 rounded-lg text-sm"
                  style={{ background: "#f0f4ff" }}
                >
                  <span className="font-medium" style={{ color: "#011e41" }}>משימה מוצעת: </span>
                  <span className="text-gray-600">{item.suggested_task_name}</span>
                  {item.suggested_priority && (
                    <span className="mr-2 text-xs text-gray-400">({item.suggested_priority})</span>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => approve(item.id)}
                  disabled={acting === item.id}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#27ae60" }}
                >
                  אשר ✓
                </button>
                <button
                  onClick={() => dismiss(item.id)}
                  disabled={acting === item.id}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 disabled:opacity-50"
                  style={{ color: "#c0392b" }}
                >
                  דחה ✗
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
