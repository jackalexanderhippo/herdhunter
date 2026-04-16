"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, MessageSquare, Save, Star } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
    ASSESSMENT_COLORS,
    ASSESSMENT_LABELS,
    OPEN_POSITION_STATUS_COLORS,
    OPEN_POSITION_STATUS_LABELS,
    STATUS_COLORS,
    STATUS_LABELS,
} from "@/lib/utils";

type CandidateStatus = "NEW" | "SCREENING" | "INTERVIEW_SCHEDULED" | "INTERVIEW_DONE" | "OFFERED" | "HIRED" | "REJECTED";
type OpenPositionStatus = "OPEN" | "ON_HOLD" | "FILLED" | "CLOSED";
type AssessmentRecommendation = "STRONG_YES" | "YES" | "HOLD" | "NO";

interface Person {
    id: string;
    name?: string | null;
}

interface PositionAssessment {
    id: string;
    candidateId: string;
    recommendation: AssessmentRecommendation;
    summary: string;
    updatedAt: string;
    updatedBy?: Person | null;
}

interface CandidateRow {
    id: string;
    name: string;
    email?: string | null;
    position: string;
    status: CandidateStatus;
    hiringSummary?: string | null;
    profession?: { name: string } | null;
    notes: Array<{ id: string; content: string; createdAt: string; author: Person }>;
    interviews: Array<{
        id: string;
        stage: number;
        stageName?: string | null;
        scheduledAt: string;
        notes: Array<{ id: string; content: string; createdAt: string; author: Person }>;
        sectionScores: Array<{ id: string; section: string; score: number; author: Person }>;
    }>;
    assessments: PositionAssessment[];
}

interface PositionDetail {
    id: string;
    title: string;
    team?: string | null;
    level?: string | null;
    targetHires: number;
    status: OpenPositionStatus;
    hiringLead?: string | null;
    interviewLead?: string | null;
    description?: string | null;
    eployPositionId?: string | null;
    candidates: CandidateRow[];
}
interface ProviderStatus {
    providerId: string;
    providerLabel: string;
    configured: boolean;
    missingConfig: string[];
    capabilities: {
        candidateLookup: boolean;
        candidateSync: boolean;
        candidateCvAccess: boolean;
        positionSync: boolean;
        feedbackPush: boolean;
    };
}

function excerpt(text?: string | null, fallback = "No summary yet") {
    if (!text?.trim()) return fallback;
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export default function PositionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [position, setPosition] = useState<PositionDetail | null>(null);
    const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingCandidateId, setSavingCandidateId] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, { recommendation: AssessmentRecommendation; summary: string }>>({});
    const [syncingSource, setSyncingSource] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");

    useEffect(() => {
        Promise.all([
            fetch(`/api/open-positions/${id}`),
            fetch("/api/provider"),
        ])
            .then(async ([positionRes, providerRes]) => {
                const data = await positionRes.json();
                setPosition(data);
                if (providerRes.ok) setProviderStatus(await providerRes.json());
                if (data?.candidates) {
                    const nextDrafts: Record<string, { recommendation: AssessmentRecommendation; summary: string }> = {};
                    data.candidates.forEach((candidate: CandidateRow) => {
                        const current = candidate.assessments[0];
                        nextDrafts[candidate.id] = {
                            recommendation: current?.recommendation ?? "HOLD",
                            summary: current?.summary ?? "",
                        };
                    });
                    setDrafts(nextDrafts);
                }
            })
            .finally(() => setLoading(false));
    }, [id]);

    const updateDraft = (candidateId: string, patch: Partial<{ recommendation: AssessmentRecommendation; summary: string }>) => {
        setDrafts((current) => ({
            ...current,
            [candidateId]: {
                recommendation: current[candidateId]?.recommendation ?? "HOLD",
                summary: current[candidateId]?.summary ?? "",
                ...patch,
            },
        }));
    };

    const saveAssessment = async (candidateId: string) => {
        const draft = drafts[candidateId];
        if (!draft) return;
        setSavingCandidateId(candidateId);
        const res = await fetch(`/api/open-positions/${id}/assessments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                candidateId,
                recommendation: draft.recommendation,
                summary: draft.summary,
            }),
        });

        if (res.ok) {
            const saved = await res.json();
            setPosition((current) => current ? {
                ...current,
                candidates: current.candidates.map((candidate) => candidate.id === candidateId
                    ? { ...candidate, assessments: [saved] }
                    : candidate),
            } : current);
        }
        setSavingCandidateId(null);
    };

    const syncPositionFromSource = async () => {
        setSyncingSource(true);
        setSyncMessage("");
        const res = await fetch(`/api/provider/positions/${id}/sync`, { method: "POST" });
        const data = await res.json().catch(() => null);
        if (res.ok) {
            setPosition(data);
            setSyncMessage(`Synced position details from ${providerStatus?.providerLabel ?? "source"}`);
        } else {
            setSyncMessage(data?.error ?? "Failed to sync position");
        }
        setSyncingSource(false);
    };

    if (loading) return <div className="empty-state">Loading position…</div>;
    if (!position) return <div className="empty-state">Position not found</div>;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
                <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: "1rem" }}>
                    <ArrowLeft size={14} /> Back
                </button>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                            <h1>{position.title}</h1>
                            <span className={`badge ${OPEN_POSITION_STATUS_COLORS[position.status]}`}>
                                {OPEN_POSITION_STATUS_LABELS[position.status]}
                            </span>
                        </div>
                        <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                            {[position.team, position.level].filter(Boolean).join(" · ") || "No role metadata yet"}
                        </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={syncPositionFromSource}
                            disabled={syncingSource || !providerStatus?.capabilities.positionSync || !position.eployPositionId}
                        >
                            {syncingSource ? "Syncing…" : `Sync From ${providerStatus?.providerLabel ?? "Source"}`}
                        </button>
                    </div>
                </div>
                {syncMessage && (
                    <div style={{ marginTop: "0.75rem", color: "var(--text-secondary)", fontSize: "0.84rem" }}>
                        {syncMessage}
                    </div>
                )}
            </div>

            <div className="grid-2" style={{ alignItems: "start" }}>
                <div className="card">
                    <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Position Summary</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.85rem" }}>
                        {[
                            { label: "Target hires", value: position.targetHires.toString() },
                            { label: "Candidates", value: position.candidates.length.toString() },
                            { label: "Hiring lead", value: position.hiringLead },
                            { label: "Interview lead", value: position.interviewLead },
                            { label: "Level", value: position.level },
                            { label: "Source vacancy ID", value: position.eployPositionId },
                        ].map(({ label, value }) => value ? (
                            <div key={label}>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>{label}</div>
                                <div style={{ fontSize: "0.9rem" }}>{value}</div>
                            </div>
                        ) : null)}
                    </div>
                    {position.description && (
                        <div style={{ marginTop: "1rem" }}>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>Context</div>
                            <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", fontSize: "0.88rem" }}>{position.description}</div>
                        </div>
                    )}
                </div>

                <div className="card">
                    <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "1rem" }}>Decision View</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem" }}>
                        <div className="surface-2" style={{ padding: "0.85rem" }}>
                            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{position.candidates.length}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Pipeline candidates</div>
                        </div>
                        <div className="surface-2" style={{ padding: "0.85rem" }}>
                            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{position.candidates.filter((candidate) => candidate.assessments[0]?.recommendation === "STRONG_YES" || candidate.assessments[0]?.recommendation === "YES").length}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Positive assessments</div>
                        </div>
                        <div className="surface-2" style={{ padding: "0.85rem" }}>
                            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{position.targetHires}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Seats to fill</div>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {position.candidates.length === 0 ? (
                    <div className="empty-state">No candidates linked to this position yet</div>
                ) : position.candidates.map((candidate) => {
                    const assessment = candidate.assessments[0];
                    const latestInterview = candidate.interviews[0];
                    const latestInterviewNote = latestInterview?.notes[0]?.content ?? null;
                    const scoreValues = candidate.interviews.flatMap((interview) => interview.sectionScores.map((score) => score.score));
                    const averageScore = scoreValues.length > 0
                        ? scoreValues.reduce((total, score) => total + score, 0) / scoreValues.length
                        : null;

                    return (
                        <div key={candidate.id} className="card" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1rem" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
                                    <div>
                                        <div style={{ fontSize: "1rem", fontWeight: 700 }}>{candidate.name}</div>
                                        <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                                            {[candidate.position, candidate.profession?.name, candidate.email].filter(Boolean).join(" · ")}
                                        </div>
                                    </div>
                                    <span className={`badge ${STATUS_COLORS[candidate.status]}`}>{STATUS_LABELS[candidate.status]}</span>
                                </div>

                                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                    <span className="chip">{candidate.interviews.length} interview stage{candidate.interviews.length !== 1 ? "s" : ""}</span>
                                    {averageScore !== null && (
                                        <span className="chip"><Star size={11} style={{ marginRight: "0.2rem" }} />Avg section score {averageScore.toFixed(1)}/5</span>
                                    )}
                                    {latestInterview && (
                                        <span className="chip">Latest stage {latestInterview.stage}{latestInterview.stageName ? ` · ${latestInterview.stageName}` : ""}</span>
                                    )}
                                </div>

                                <div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>Hiring summary</div>
                                    <div style={{ color: "var(--text-secondary)", fontSize: "0.86rem" }}>{excerpt(candidate.hiringSummary)}</div>
                                </div>

                                <div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>Latest interviewer note</div>
                                    <div style={{ color: "var(--text-secondary)", fontSize: "0.86rem", whiteSpace: "pre-wrap" }}>{excerpt(latestInterviewNote)}</div>
                                </div>

                                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                    <Link href={`/candidates/${candidate.id}`} className="btn btn-secondary btn-sm">
                                        <FileText size={12} /> Candidate Profile
                                    </Link>
                                    {candidate.notes[0] && (
                                        <div className="chip">
                                            <MessageSquare size={11} style={{ marginRight: "0.25rem" }} />
                                            Last candidate note {formatDistanceToNow(new Date(candidate.notes[0].createdAt), { addSuffix: true })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="surface-2" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>Lead Assessment</div>
                                    {assessment && (
                                        <span className={`badge ${ASSESSMENT_COLORS[assessment.recommendation]}`}>
                                            {ASSESSMENT_LABELS[assessment.recommendation]}
                                        </span>
                                    )}
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label>Recommendation</label>
                                    <select
                                        className="input"
                                        value={drafts[candidate.id]?.recommendation ?? "HOLD"}
                                        onChange={(e) => updateDraft(candidate.id, { recommendation: e.target.value as AssessmentRecommendation })}
                                    >
                                        <option value="STRONG_YES">Strong yes</option>
                                        <option value="YES">Yes</option>
                                        <option value="HOLD">Hold</option>
                                        <option value="NO">No</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label>Decision notes</label>
                                    <textarea
                                        className="input"
                                        rows={6}
                                        value={drafts[candidate.id]?.summary ?? ""}
                                        onChange={(e) => updateDraft(candidate.id, { summary: e.target.value })}
                                        placeholder="Summarise the case for this candidate against the position."
                                    />
                                </div>
                                {assessment?.updatedAt && (
                                    <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                                        Last updated {formatDistanceToNow(new Date(assessment.updatedAt), { addSuffix: true })}
                                        {assessment.updatedBy?.name ? ` by ${assessment.updatedBy.name}` : ""}
                                    </div>
                                )}
                                <button className="btn btn-primary btn-sm" onClick={() => saveAssessment(candidate.id)} disabled={savingCandidateId === candidate.id}>
                                    <Save size={12} /> {savingCandidateId === candidate.id ? "Saving…" : "Save assessment"}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
