import Sidebar from "@/components/Sidebar";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#f5f6f8" }}>
      <Sidebar />
      <main className="mr-56 p-8 min-h-screen">{children}</main>
    </div>
  );
}
