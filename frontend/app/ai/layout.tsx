import Sidebar from "@/components/Sidebar";

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <main className="flex-1 md:mr-56 p-4 pt-16 md:p-8 md:pt-8">{children}</main>
    </div>
  );
}
