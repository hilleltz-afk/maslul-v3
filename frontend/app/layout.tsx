import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מסלול | Hadas Capital",
  description: "מערכת ניהול משרד לנדל\"ן",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "מסלול",
  },
};

export const viewport: Viewport = {
  themeColor: "#011e41",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
