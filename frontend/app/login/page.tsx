"use client";

import { Suspense, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { getLoginUrl } from "@/lib/api";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pending = searchParams.get("pending");
  const rejected = searchParams.get("rejected");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) router.replace("/dashboard");
  }, [router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #011e41 0%, #02306a 100%)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-12 flex flex-col items-center gap-8 w-full max-w-md">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Hadas Capital" width={90} height={90} className="rounded-xl" />
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-wide" style={{ color: "#011e41" }}>
              Hadas Capital
            </h1>
            <p className="text-sm mt-1" style={{ color: "#a4742d" }}>מערכת ניהול משרד</p>
          </div>
        </div>

        <div className="w-full h-px" style={{ background: "linear-gradient(90deg, #683918, #fcd562, #683918)" }} />

        {pending && (
          <div className="w-full bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <div className="text-yellow-700 font-medium text-sm">בקשתך התקבלה ✓</div>
            <div className="text-yellow-600 text-xs mt-1">ממתין לאישור מנהל המערכת. תקבל גישה בקרוב.</div>
          </div>
        )}

        {rejected && (
          <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-red-700 font-medium text-sm">גישה נדחתה</div>
            <div className="text-red-600 text-xs mt-1">פנה למנהל המערכת לקבלת הרשאה.</div>
          </div>
        )}

        <div className="text-center">
          <p className="text-gray-500 text-sm mb-6">כניסה עם חשבון Google של החברה</p>
          <a
            href={getLoginUrl()}
            className="flex items-center gap-3 px-8 py-3 rounded-xl text-white font-medium transition-all hover:opacity-90 hover:shadow-lg"
            style={{ background: "#011e41" }}
          >
            <GoogleIcon />
            כניסה עם Google
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
