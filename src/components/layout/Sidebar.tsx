"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
    LayoutDashboard,
    Users,
    Briefcase,
    Calendar,
    Settings,
    LogOut,
    ChevronRight,
    FileText,
    UserCog,
} from "lucide-react";
import { canAccessAdminArea, canManageTemplates } from "@/lib/access";
import { ROLE_LABELS } from "@/lib/utils";
import type { Role } from "@prisma/client";

interface SidebarProps {
    user: { name?: string | null; email?: string | null; image?: string | null; role: Role };
}

const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/positions", label: "Open Positions", icon: Briefcase },
    { href: "/candidates", label: "Candidates", icon: Users },
    { href: "/interviews", label: "My Interviews", icon: Calendar },
];

const adminItems = [
    { href: "/admin", label: "Settings", icon: Settings },
];

const templateItems = [
    { href: "/admin/templates", label: "Templates", icon: FileText },
];

export default function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname();

    const initials = user.name
        ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
        : "??";

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", paddingLeft: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <img src="/herdhunter-mark.svg" alt="Herdhunter" style={{ width: "28px", height: "28px" }} />
                        <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>
                            Herdhunter
                        </div>
                    </div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                        Hiring workspace
                    </div>
                </div>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section-label">Menu</div>
                {navItems.map(({ href, label, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className={`nav-item ${pathname.startsWith(href) ? "active" : ""}`}
                    >
                        <Icon size={16} />
                        {label}
                        {pathname.startsWith(href) && <ChevronRight size={12} style={{ marginLeft: "auto", opacity: 0.5 }} />}
                    </Link>
                ))}

                {(canAccessAdminArea(user.role) || canManageTemplates(user.role)) && (
                    <>
                        <div className="nav-section-label" style={{ marginTop: "0.5rem" }}>Admin</div>
                        {(canAccessAdminArea(user.role) ? adminItems : []).map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`nav-item ${pathname.startsWith(href) && !pathname.startsWith("/admin/templates") ? "active" : ""}`}
                            >
                                <Icon size={16} />
                                {label}
                            </Link>
                        ))}
                        {canManageTemplates(user.role) && templateItems.map(({ href, label, icon: Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`nav-item ${pathname.startsWith(href) ? "active" : ""}`}
                            >
                                <Icon size={16} />
                                {label}
                            </Link>
                        ))}
                    </>
                )}
            </nav>

            <div className="sidebar-footer">
                <div className="user-info">
                    <div className="avatar">
                        {user.image ? <img src={user.image} alt={user.name ?? ""} /> : initials}
                    </div>
                    <div className="user-info-text">
                        <div className="user-name">{user.name ?? user.email}</div>
                        <div className="user-role">{ROLE_LABELS[user.role]}</div>
                    </div>
                </div>
                <Link
                    href="/account"
                    className={`nav-item ${pathname.startsWith("/account") ? "active" : ""}`}
                >
                    <UserCog size={16} />
                    Account
                </Link>
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    onClick={() => signOut({ callbackUrl: "/login" })}
                >
                    <LogOut size={14} />
                    Sign out
                </button>
            </div>
        </aside>
    );
}
