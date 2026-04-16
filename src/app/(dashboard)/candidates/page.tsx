"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Search, Users } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import type { CandidateStatus } from "@prisma/client";

interface Candidate {
    id: string;
    name: string;
    email?: string;
    position: string;
    openPosition?: { id: string; title: string; level?: string | null } | null;
    status: CandidateStatus;
    createdAt: string;
    profession?: { name: string } | null;
    _count: { notes: number; interviews: number };
}

export default function CandidatesPage() {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");

    useEffect(() => {
        let active = true;
        fetch("/api/candidates")
            .then(async (res) => {
                if (!active || !res.ok) return;
                setCandidates(await res.json());
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const filtered = candidates.filter((c) => {
        const matchesSearch =
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.position.toLowerCase().includes(search.toLowerCase()) ||
            c.openPosition?.title.toLowerCase().includes(search.toLowerCase()) ||
            c.email?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statuses: Array<CandidateStatus | "ALL"> = [
        "ALL", "NEW", "SCREENING", "INTERVIEW_SCHEDULED", "INTERVIEW_DONE", "OFFERED", "HIRED", "REJECTED",
    ];

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Candidates</h1>
                    <p>{candidates.length} total candidates</p>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <div className="search-wrap" style={{ flex: 1, minWidth: "200px", maxWidth: "360px" }}>
                    <Search size={14} />
                    <input
                        className="input search-input"
                        placeholder="Search candidates…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select className="input" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    {statuses.map((s) => (
                        <option key={s} value={s}>{s === "ALL" ? "All Statuses" : STATUS_LABELS[s]}</option>
                    ))}
                </select>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {loading ? (
                    <div className="empty-state">Loading…</div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <Users size={40} />
                        <p>No candidates found</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Position</th>
                                    <th>Profession</th>
                                    <th>Status</th>
                                    <th>Notes</th>
                                    <th>Interviews</th>
                                    <th>Added</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((c) => (
                                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => window.location.href = `/candidates/${c.id}`}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                                            {c.email && <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{c.email}</div>}
                                        </td>
                                        <td>
                                            <div>{c.openPosition?.title ?? c.position}</div>
                                            {c.openPosition?.level && (
                                                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{c.openPosition.level}</div>
                                            )}
                                        </td>
                                        <td>{c.profession?.name ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                                        <td>
                                            <span className={`badge ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                                        </td>
                                        <td style={{ color: "var(--text-secondary)" }}>{c._count.notes}</td>
                                        <td style={{ color: "var(--text-secondary)" }}>{c._count.interviews}</td>
                                        <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                                            {format(new Date(c.createdAt), "d MMM yyyy")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
