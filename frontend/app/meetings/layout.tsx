import Sidebar from "@/components/Sidebar";

export default function MeetingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#f5f6f8" }}>
      <Sidebar />
      <main className="md:mr-56 min-h-screen">
        {children}
      </main>
    </div>
  );
}
