"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Search, Target } from "lucide-react";
import { OPEN_POSITION_STATUS_COLORS, OPEN_POSITION_STATUS_LABELS, STATUS_LABELS } from "@/lib/utils";

type CandidateStatus = "NEW" | "SCREENING" | "INTERVIEW_SCHEDULED" | "INTERVIEW_DONE" | "OFFERED" | "HIRED" | "REJECTED";
type OpenPositionStatus = "OPEN" | "ON_HOLD" | "FILLED" | "CLOSED";

interface OpenPosition {
    id: string;
    title: string;
    team?: string | null;
    level?: string | null;
    targetHires: number;
    status: OpenPositionStatus;
    hiringLead?: string | null;
    interviewLead?: string | null;
    eployPositionId?: string | null;
    _count: { candidates: number; assessments: number };
    candidates: Array<{ id: string; status: CandidateStatus }>;
    updatedAt: string;
}



export default function PositionsPage() {
    const [positions, setPositions] = useState<OpenPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<OpenPositionStatus | "ALL">("ALL");

    useEffect(() => {
        fetch("/api/open-positions")
            .then(async (res) => {
                const text = await res.text();
                const data = text ? JSON.parse(text) : null;
                if (!res.ok) {
                    throw new Error((data && typeof data.error === "string" && data.error) || "Failed to load open positions");
                }
                setPositions(Array.isArray(data) ? data : []);
                setLoadError(null);
            })
            .catch((error: unknown) => {
                setPositions([]);
                setLoadError(error instanceof Error ? error.message : "Failed to load open positions");
            })
            .finally(() => setLoading(false));
    }, []);



    const filtered = positions.filter((position) => {
        const haystack = [position.title, position.team, position.level, position.hiringLead, position.interviewLead]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        const matchesSearch = haystack.includes(search.toLowerCase());
        const matchesStatus = statusFilter === "ALL" || position.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="page-header">
                <div>
                    <h1>Open Positions</h1>
                    <p>{positions.length} active records for role-based hiring decisions</p>
                </div>
            </div>



            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <div className="search-wrap" style={{ flex: 1, minWidth: "220px", maxWidth: "360px" }}>
                    <Search size={14} />
                    <input className="input search-input" placeholder="Search positions…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <select className="input" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OpenPositionStatus | "ALL")}>
                    <option value="ALL">All statuses</option>
                    <option value="OPEN">Open</option>
                    <option value="ON_HOLD">On hold</option>
                    <option value="FILLED">Filled</option>
                    <option value="CLOSED">Closed</option>
                </select>
            </div>

            {loading ? (
                <div className="empty-state">Loading positions…</div>
            ) : loadError ? (
                <div className="empty-state">
                    <Briefcase size={40} />
                    <p>{loadError}</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <Briefcase size={40} />
                    <p>No positions found</p>
                </div>
            ) : (
                <div className="grid-2">
                    {filtered.map((position) => {
                        const activeCandidates = position.candidates.filter((candidate) => candidate.status !== "REJECTED" && candidate.status !== "HIRED").length;
                        return (
                            <Link key={position.id} href={`/positions/${position.id}`} style={{ textDecoration: "none" }}>
                                <div className="card" style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
                                        <div>
                                            <div style={{ fontSize: "1rem", fontWeight: 700 }}>{position.title}</div>
                                            <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                                                {[position.team, position.level].filter(Boolean).join(" · ") || "No role metadata yet"}
                                            </div>
                                        </div>
                                        <span className={`badge ${OPEN_POSITION_STATUS_COLORS[position.status]}`}>
                                            {OPEN_POSITION_STATUS_LABELS[position.status]}
                                        </span>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem" }}>
                                        <div className="surface-2" style={{ padding: "0.75rem" }}>
                                            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{position._count.candidates}</div>
                                            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Candidates</div>
                                        </div>
                                        <div className="surface-2" style={{ padding: "0.75rem" }}>
                                            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{activeCandidates}</div>
                                            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Active</div>
                                        </div>
                                        <div className="surface-2" style={{ padding: "0.75rem" }}>
                                            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{position.targetHires}</div>
                                            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Target hires</div>
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                                        {position.hiringLead && <div>Hiring lead: {position.hiringLead}</div>}
                                        {position.interviewLead && <div>Interview lead: {position.interviewLead}</div>}
                                        {position.eployPositionId && <div>Source vacancy ID: {position.eployPositionId}</div>}
                                        <div style={{ color: "var(--text-muted)" }}>
                                            <Target size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "0.3rem" }} />
                                            {position.candidates.slice(0, 3).map((candidate) => STATUS_LABELS[candidate.status]).join(", ") || "No pipeline activity yet"}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
