import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    if (!session) redirect("/login");

    return (
        <div className="app-layout">
            <Sidebar user={session.user} />
            <main className="main-content">
                <div className="page-content fade-in">{children}</div>
            </main>
        </div>
    );
}
