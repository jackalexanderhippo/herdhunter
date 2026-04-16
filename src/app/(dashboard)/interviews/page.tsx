"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Calendar, Clock, MapPin } from "lucide-react";
import { canSeeAllInterviews } from "@/lib/access";
import type { InterviewStatus, Role } from "@prisma/client";

interface User { id: string; name?: string | null; image?: string | null; role: Role; }
interface Interview {
    id: string;
    scheduledAt: string;
    location?: string;
    status: InterviewStatus;
    candidate: { id: string; name: string; position: string; profession?: { name: string } | null; openPosition?: { title: string; level?: string | null } | null };
    interviewers: { user: User }[];
    notes: { id: string }[];
}

const STATUS_STYLE: Record<InterviewStatus, string> = {
    SCHEDULED: "bg-violet-100 text-violet-700",
    COMPLETED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-red-100 text-red-700",
};

export default function InterviewsPage() {
    const { data: session } = useSession();
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<InterviewStatus | "ALL">("ALL");

    useEffect(() => {
        fetch("/api/interviews").then((r) => r.json()).then((data) => {
            const mine = data.filter((iv: Interview) =>
                canSeeAllInterviews(session?.user.role) ||
                iv.interviewers.some((i) => i.user.id === session?.user.id)
            );
            setInterviews(mine);
        }).finally(() => setLoading(false));
    }, [session]);

    const filtered = interviews.filter((iv) => filter === "ALL" || iv.status === filter);

    const upcoming = filtered.filter((iv) => iv.status === "SCHEDULED" && new Date(iv.scheduledAt) >= new Date());
    const past = filtered.filter((iv) => iv.status !== "SCHEDULED" || new Date(iv.scheduledAt) < new Date());

    const Card = ({ iv }: { iv: Interview }) => (
        <Link href={`/candidates/${iv.candidate.id}`} style={{ textDecoration: "none" }}>
            <div className="card" style={{ cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column", gap: "0.75rem" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>{iv.candidate.name}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            {(iv.candidate.openPosition?.title ?? iv.candidate.position)}
                            {iv.candidate.openPosition?.level && ` · ${iv.candidate.openPosition.level}`}
                            {iv.candidate.profession && ` · ${iv.candidate.profession.name}`}
                        </div>
                    </div>
                    <span className={`badge ${STATUS_STYLE[iv.status]}`}>{iv.status}</span>
                </div>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Calendar size={12} />
                        {format(new Date(iv.scheduledAt), "d MMM yyyy")}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Clock size={12} />
                        {format(new Date(iv.scheduledAt), "HH:mm")}
                    </div>
                    {iv.location && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <MapPin size={12} />{iv.location}
                        </div>
                    )}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {iv.notes.length} note{iv.notes.length !== 1 ? "s" : ""} · {iv.interviewers.length} interviewer{iv.interviewers.length !== 1 ? "s" : ""}
                </div>
            </div>
        </Link>
    );

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>My Interviews</h1>
                    <p>Interviews you&apos;re assigned to</p>
                </div>
                <select className="input" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value as InterviewStatus | "ALL")}>
                    <option value="ALL">All</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>
            </div>

            {loading ? (
                <div className="empty-state">Loading…</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    {upcoming.length > 0 && (
                        <div>
                            <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Upcoming ({upcoming.length})
                            </h2>
                            <div className="grid-2">
                                {upcoming.map((iv) => <Card key={iv.id} iv={iv} />)}
                            </div>
                        </div>
                    )}
                    {past.length > 0 && (
                        <div>
                            <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Past &amp; Other ({past.length})
                            </h2>
                            <div className="grid-2">
                                {past.map((iv) => <Card key={iv.id} iv={iv} />)}
                            </div>
                        </div>
                    )}
                    {filtered.length === 0 && (
                        <div className="empty-state"><Calendar size={40} /><p>No interviews assigned to you</p></div>
                    )}
                </div>
            )}
        </div>
    );
}
