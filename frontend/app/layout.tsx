import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מסלול | Hadas Capital",
  description: "מערכת ניהול משרד",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
