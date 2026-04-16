"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ROLE_LABELS } from "@/lib/utils";
import { canAccessAdminArea } from "@/lib/access";
import type { Role } from "@prisma/client";
import { Plus, Mail, Calendar, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface UserRow { id: string; name?: string | null; email?: string | null; image?: string | null; role: Role; createdAt: string; }
interface Profession { id: string; name: string; }
interface Invitation { id: string; email: string; role: Role; createdAt: string; usedAt: string | null; invitedBy: { name: string | null }; }
interface WorkloadUser {
    id: string; name: string | null; email: string | null; image: string | null; role: Role;
    upcomingCount: number; recentCompletedCount: number; totalCount: number;
    upcomingInterviews: Array<{ id: string; scheduledAt: string; candidateName: string; candidatePosition: string }>;
}

const ROLES: Role[] = ["HIRING_TEAM", "MAIN_INTERVIEWER", "ADMIN_INTERVIEWER"];

export default function AdminPage() {
    const { data: session } = useSession();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [professions, setProfessions] = useState<Profession[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [workload, setWorkload] = useState<WorkloadUser[]>([]);
    const [newProfession, setNewProfession] = useState("");
    const [updating, setUpdating] = useState<string | null>(null);
    const [addingProfession, setAddingProfession] = useState(false);
    const [tab, setTab] = useState<"users" | "invitations" | "workload" | "professions">("users");
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<Role>("HIRING_TEAM");
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch("/api/users").then((r) => r.json()),
            fetch("/api/professions").then((r) => r.json()),
            fetch("/api/invitations").then((r) => r.json()),
            fetch("/api/admin/workload").then((r) => r.json()),
        ]).then(([u, p, inv, wl]) => {
            setUsers(u);
            setProfessions(p);
            setInvitations(Array.isArray(inv) ? inv : []);
            setWorkload(Array.isArray(wl) ? wl : []);
        });
    }, [session]);

    const updateRole = async (userId: string, role: Role) => {
        setUpdating(userId);
        const res = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) });
        if (res.ok) setUsers((u) => u.map((x) => x.id === userId ? { ...x, role } : x));
        setUpdating(null);
    };

    const sendInvite = async () => {
        if (!inviteEmail.trim()) return;
        setInviting(true); setInviteError(null);
        const res = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) });
        if (res.ok) {
            const inv = await res.json();
            setInvitations((i) => [inv, ...i]);
            setInviteEmail("");
        } else {
            const e = await res.json();
            setInviteError(e.error ?? "Failed to send invitation");
        }
        setInviting(false);
    };

    const addProfession = async () => {
        if (!newProfession.trim()) return;
        setAddingProfession(true);
        const res = await fetch("/api/professions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newProfession.trim() }) });
        if (res.ok) { const p = await res.json(); setProfessions((ps) => [...ps, p]); setNewProfession(""); }
        setAddingProfession(false);
    };

    const initials = (u: { name?: string | null }) => u.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

    const TABS = ["users", "invitations", "workload", "professions"] as const;
    const TAB_LABELS: Record<string, string> = { users: "Users", invitations: "Invitations", workload: "Workload", professions: "Professions" };
    const canAdmin = canAccessAdminArea(session?.user.role);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Admin Settings</h1>
                    <p>Manage users, invitations, workload, professions and system tasks</p>
                </div>
            </div>

            <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border)" }}>
                {TABS.map((t) => (
                    <button key={t} className="btn btn-ghost" onClick={() => setTab(t)} style={{
                        borderRadius: "6px 6px 0 0",
                        borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                        color: tab === t ? "var(--accent)" : "var(--text-secondary)",
                        fontWeight: tab === t ? 600 : 400,
                        paddingBottom: "0.75rem",
                    }}>
                        {TAB_LABELS[t]}
                    </button>
                ))}
            </div>

            {/* USERS TAB */}
            {tab === "users" && (
                <div className="card" style={{ padding: 0 }}>
                    <div className="table-wrapper">
                        <table>
                            <thead><tr><th>User</th><th>Email</th><th>Role</th></tr></thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id}>
                                        <td>
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                                <div className="avatar">{u.image ? <img src={u.image} alt="" /> : initials(u)}</div>
                                                <span style={{ fontWeight: 500 }}>{u.name ?? "—"}</span>
                                                {u.id === session?.user.id && <span className="chip">You</span>}
                                            </div>
                                        </td>
                                        <td style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                                        <td>
                                            <select className="input" style={{ width: "auto", fontSize: "0.8rem" }} value={u.role}
                                                disabled={!canAdmin || updating === u.id || u.id === session?.user.id}
                                                onChange={(e) => updateRole(u.id, e.target.value as Role)}>
                                                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* INVITATIONS TAB */}
            {tab === "invitations" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div className="card">
                        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Mail size={16} style={{ color: "var(--accent)" }} /> Invite a User
                        </h2>
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                            <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                                <label>Email Address</label>
                                <input className="input" type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canAdmin && sendInvite()} />
                            </div>
                            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label>Role</label>
                                <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={sendInvite} disabled={!canAdmin || inviting || !inviteEmail.trim()} style={{ flexShrink: 0 }}>
                                <Plus size={14} /> {inviting ? "Sending…" : "Send Invite"}
                            </button>
                        </div>
                        {inviteError && <div style={{ color: "#f87171", fontSize: "0.8rem", marginTop: "0.5rem" }}>{inviteError}</div>}
                        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.75rem" }}>
                            Roles remain in place for later RBAC work, but PoC access is currently broad for signed-in users.
                        </p>
                    </div>

                    <div className="card" style={{ padding: 0 }}>
                        <div className="table-wrapper">
                            <table>
                                <thead><tr><th>Email</th><th>Role</th><th>Invited By</th><th>Sent</th><th>Status</th></tr></thead>
                                <tbody>
                                    {invitations.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>No invitations sent yet</td></tr>
                                    ) : invitations.map((inv) => (
                                        <tr key={inv.id}>
                                            <td style={{ fontWeight: 500 }}>{inv.email}</td>
                                            <td><span className="chip">{ROLE_LABELS[inv.role]}</span></td>
                                            <td style={{ color: "var(--text-secondary)" }}>{inv.invitedBy.name ?? "—"}</td>
                                            <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{format(new Date(inv.createdAt), "MMM d, yyyy")}</td>
                                            <td>
                                                {inv.usedAt ? (
                                                    <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#4ade80", fontSize: "0.8rem" }}>
                                                        <CheckCircle size={12} /> Accepted
                                                    </span>
                                                ) : (
                                                    <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                                                        <Clock size={12} /> Pending
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* WORKLOAD TAB */}
            {tab === "workload" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
                        {workload.length === 0 ? (
                            <div className="empty-state">No interviewers found</div>
                        ) : workload.map((u) => (
                            <div key={u.id} className="card">
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                                    <div className="avatar" style={{ width: "2.5rem", height: "2.5rem", fontSize: "0.9rem" }}>
                                        {u.image ? <img src={u.image} alt="" /> : initials(u)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{u.name ?? u.email}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{ROLE_LABELS[u.role]}</div>
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                                    {[
                                        { label: "Upcoming", value: u.upcomingCount, color: "var(--accent)" },
                                        { label: "30-day done", value: u.recentCompletedCount, color: "#4ade80" },
                                        { label: "All-time", value: u.totalCount, color: "var(--text-secondary)" },
                                    ].map(({ label, value, color }) => (
                                        <div key={label} style={{ textAlign: "center", padding: "0.5rem", background: "var(--surface)", borderRadius: "6px" }}>
                                            <div style={{ fontSize: "1.4rem", fontWeight: 700, color }}>{value}</div>
                                            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>{label}</div>
                                        </div>
                                    ))}
                                </div>
                                {u.upcomingInterviews.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>Next up</div>
                                        {u.upcomingInterviews.slice(0, 3).map((iv) => (
                                            <div key={iv.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8rem", padding: "0.3rem 0", borderBottom: "1px solid var(--border-subtle)" }}>
                                                <Calendar size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                                <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>{format(new Date(iv.scheduledAt), "MMM d")}</span>
                                                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iv.candidateName}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* PROFESSIONS TAB */}
            {tab === "professions" && (
                <div className="card">
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Professions &amp; Departments</h2>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                        <input className="input" placeholder="New profession name…" value={newProfession} onChange={(e) => setNewProfession(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addProfession()} />
                        <button className="btn btn-primary" onClick={addProfession} disabled={addingProfession || !newProfession.trim()}><Plus size={14} /> Add</button>
                    </div>
                    {professions.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No professions yet</p>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            {professions.map((p) => <div key={p.id} className="chip" style={{ fontSize: "0.875rem", padding: "0.4rem 0.75rem" }}>{p.name}</div>)}
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
