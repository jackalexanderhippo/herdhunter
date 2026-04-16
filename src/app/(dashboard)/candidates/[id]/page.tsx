"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { format, formatDistanceToNow } from "date-fns";
import {
    ArrowLeft, Trash2, FileText, Calendar, MessageSquare,
    Plus, X, Layers,
} from "lucide-react";
import { TemplateContent } from "@/components/templates/TemplateContent";
import { parseTemplateQuestions } from "@/lib/interview-templates";
import { STATUS_LABELS, STATUS_COLORS, ROLE_LABELS, canManageCandidates, canInterview, getInterviewerHighlight } from "@/lib/utils";
import type { CandidateStatus, NoteType, InterviewStatus, Role } from "@prisma/client";

interface User { id: string; name?: string | null; image?: string | null; role: Role; }
interface Note { id: string; content: string; type: NoteType; author: User; createdAt: string; }
interface Template { id: string; name: string; questions: string; }
interface OpenPosition {
    id: string;
    title: string;
    team?: string | null;
    level?: string | null;
}
interface Interview {
    id: string;
    scheduledAt: string;
    location?: string;
    calendarEventId?: string | null;
    calendarEventUrl?: string | null;
    geminiNotes?: string | null;
    geminiNotesImportedAt?: string | null;
    status: InterviewStatus;
    stage: number;
    stageName?: string | null;
    templateId?: string | null;
    template?: Template | null;
    interviewers: { user: User }[];
    notes: InterviewNote[];
    recommendations?: Array<{
        id: string;
        recommendation: "UNSUCCESSFUL" | "YES_AT_DIFFERENT_LEVEL" | "PROCEED_TO_NEXT_ROUND";
        recommendedLevel?: "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "LEAD" | "PRINCIPAL" | null;
        levelCalibration?: "LOW" | "MID" | "HIGH" | null;
        alternativeOpenPosition?: { id: string; title: string; level?: string | null; team?: string | null } | null;
        summary: string;
        candidateFeedback: string;
        updatedAt: string;
        author: User;
    }>;
}
interface InterviewNote { id: string; content: string; rating?: number | null; author: User; createdAt: string; }
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
interface Candidate {
    id: string; name: string; email?: string; phone?: string; position: string;
    noticePeriodDays?: number | null; salaryExpectation?: number | null; recommendedSalary?: number | null;
    salaryExpectationBand?: string | null; recommendedBand?: string | null; hiringSummary?: string | null;
    eployCandidateId?: string | null; eployCvUrl?: string | null; eployMetadata?: string | null;
    eployLastSyncAt?: string | null; eployFeedbackSummary?: string | null; eployFeedbackPushedAt?: string | null;
    status: CandidateStatus; profession?: { id: string; name: string } | null;
    openPosition?: { id: string; title: string; level?: string | null; targetHires: number } | null;
    assessments?: Array<{
        id: string;
        recommendation: "STRONG_YES" | "YES" | "HOLD" | "NO";
        summary: string;
        updatedAt: string;
        openPosition: { id: string; title: string };
        updatedBy?: User | null;
    }>;
    notes: Note[]; interviews: Interview[]; createdAt: string;
}

interface UnifiedComment {
    id: string;
    content: string;
    createdAt: string;
    author: User;
    source: "CANDIDATE" | "INTERVIEW";
    interviewLabel?: string;
    rating?: number | null;
}

function Avatar({ user }: { user: User }) {
    const initials = user.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
    return <div className="avatar">{user.image ? <img src={user.image} alt={user.name ?? ""} /> : initials}</div>;
}

export default function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data: session } = useSession();
    const router = useRouter();

    const [candidate, setCandidate] = useState<Candidate | null>(null);
    const [loading, setLoading] = useState(true);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [positions, setPositions] = useState<OpenPosition[]>([]);
    const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
    const [showInterviewNoteModal, setShowInterviewNoteModal] = useState<Interview | null>(null);
    const [commentInput, setCommentInput] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const [interviewDate, setInterviewDate] = useState("");
    const [interviewLocation, setInterviewLocation] = useState("");
    const [interviewStage, setInterviewStage] = useState(1);
    const [interviewStageName, setInterviewStageName] = useState("");
    const [interviewTemplateId, setInterviewTemplateId] = useState("");
    const [selectedInterviewers, setSelectedInterviewers] = useState<string[]>([]);
    const [calendarEventId, setCalendarEventId] = useState("");
    const [calendarEventUrl, setCalendarEventUrl] = useState("");
    const [geminiNotes, setGeminiNotes] = useState("");
    const [interviewNote, setInterviewNote] = useState("");
    const [interviewQuestionNotes, setInterviewQuestionNotes] = useState<Record<string, string>>({});
    const [interviewRating, setInterviewRating] = useState(0);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [assignmentSaving, setAssignmentSaving] = useState(false);
    const [showAssignPositionModal, setShowAssignPositionModal] = useState(false);
    const [selectedOpenPositionId, setSelectedOpenPositionId] = useState("");
    const load = useCallback(async () => {
        const [cRes, uRes, tRes, pRes, providerRes] = await Promise.all([
            fetch(`/api/candidates/${id}`),
            fetch("/api/users"),
            fetch("/api/interview-templates"),
            fetch("/api/open-positions"),
            fetch("/api/provider"),
        ]);
        if (cRes.ok) setCandidate(await cRes.json());
        if (uRes.ok) setAllUsers(await uRes.json());
        if (tRes.ok) setTemplates(await tRes.json());
        if (pRes.ok) setPositions(await pRes.json());
        if (providerRes.ok) setProviderStatus(await providerRes.json());
        setLoading(false);
    }, [id]);

    useEffect(() => {
        const timer = setTimeout(() => {
            load().catch(() => undefined);
        }, 0);
        return () => clearTimeout(timer);
    }, [load]);

    const updateStatus = async (status: CandidateStatus) => {
        setStatusUpdating(true);
        const res = await fetch(`/api/candidates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        if (res.ok) await load();
        setStatusUpdating(false);
    };

    const submitComment = async () => {
        if (!commentInput.trim()) return;
        setSubmitting(true);
        const res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: commentInput, type: "GENERAL" as NoteType, candidateId: id }),
        });
        if (res.ok) {
            await load();
            setCommentInput("");
        }
        setSubmitting(false);
    };

    const openSchedule = (interview?: Interview) => {
        if (interview) {
            setEditingInterviewId(interview.id);
            setInterviewStage(interview.stage);
            setInterviewStageName(interview.stageName ?? "");
            setInterviewTemplateId(interview.templateId ?? "");
            setInterviewDate(new Date(interview.scheduledAt).toISOString().slice(0, 16));
            setInterviewLocation(interview.location ?? "");
            setSelectedInterviewers(interview.interviewers.map(({ user }) => user.id));
            setCalendarEventId(interview.calendarEventId ?? "");
            setCalendarEventUrl(interview.calendarEventUrl ?? "");
            setGeminiNotes(interview.geminiNotes ?? "");
        } else {
            const nextStage = (candidate?.interviews.length ?? 0) + 1;
            setEditingInterviewId(null);
            setInterviewStage(nextStage);
            setInterviewStageName("");
            setInterviewTemplateId("");
            setInterviewDate("");
            setInterviewLocation("");
            setSelectedInterviewers([]);
            setCalendarEventId("");
            setCalendarEventUrl("");
            setGeminiNotes("");
            const defaultTemplate =
                templates.find((t) => t.name.toLowerCase().includes("coding")) ??
                templates[0] ??
                null;
            setInterviewTemplateId(defaultTemplate?.id ?? "");
        }
        setShowInterviewModal(true);
    };

    const submitInterview = async () => {
        if (!interviewDate) return;
        setSubmitting(true);
        const isEditing = Boolean(editingInterviewId);
        const res = await fetch(isEditing ? `/api/interviews/${editingInterviewId}` : "/api/interviews", {
            method: isEditing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...(isEditing ? {} : { candidateId: id }),
                scheduledAt: interviewDate,
                location: interviewLocation,
                stage: interviewStage,
                stageName: interviewStageName || null,
                templateId: interviewTemplateId || null,
                interviewerIds: selectedInterviewers,
                calendarEventId: calendarEventId || null,
                calendarEventUrl: calendarEventUrl || null,
                geminiNotes: geminiNotes.trim() || null,
                geminiNotesImportedAt: geminiNotes.trim() ? new Date().toISOString() : null,
            }),
        });
        if (res.ok) {
            await load();
            setShowInterviewModal(false);
            setEditingInterviewId(null);
        }
        setSubmitting(false);
    };

    const submitInterviewNote = async (interviewId: string) => {
        const structured = activeTemplateQuestions
            .map((question, index) => {
                const key = `q-${index}`;
                const value = interviewQuestionNotes[key]?.trim();
                if (!value) return null;
                return `${index + 1}. ${question}\n${value}`;
            })
            .filter((line): line is string => Boolean(line))
            .join("\n\n");
        const freeform = interviewNote.trim();
        const content = [
            structured ? `Question notes:\n${structured}` : "",
            freeform ? `General summary:\n${freeform}` : "",
        ]
            .filter(Boolean)
            .join("\n\n");

        if (!content.trim()) return;
        setSubmitting(true);
        const res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, interviewId, rating: interviewRating || null }),
        });
        if (res.ok) {
            await load();
            setInterviewNote("");
            setInterviewQuestionNotes({});
            setInterviewRating(0);
            setShowInterviewNoteModal(null);
        }
        setSubmitting(false);
    };
    const deleteCandidate = async () => {
        if (!confirm(`Delete ${candidate?.name}? This cannot be undone.`)) return;
        await fetch(`/api/candidates/${id}`, { method: "DELETE" });
        router.push("/candidates");
    };

    const assignOpenPosition = async (openPositionId: string) => {
        if (!candidate) return;
        const selected = positions.find((position) => position.id === openPositionId);
        setAssignmentSaving(true);
        const res = await fetch(`/api/candidates/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                openPositionId: openPositionId || null,
                position: selected?.title ?? candidate.position,
            }),
        });
        if (res.ok) {
            await load();
            setShowAssignPositionModal(false);
        }
        setAssignmentSaving(false);
    };

    const runSourceAction = async (url: string) => {
        const res = await fetch(url, { method: "POST" });
        if (res.ok) {
            await load();
        }
    };

    if (loading) return <div className="empty-state">Loading…</div>;
    if (!candidate) return <div className="empty-state">Candidate not found</div>;

    const role = session?.user.role ?? "HIRING_TEAM";
    const canManage = true;
    const canAssignPosition = true;
    const canInterviewNote = Boolean(session?.user) && canInterview(role);
    const interviewers = allUsers.filter((u) => u.role !== "HIRING_TEAM");
    const statuses: CandidateStatus[] = ["NEW", "SCREENING", "INTERVIEW_SCHEDULED", "INTERVIEW_DONE", "OFFERED", "HIRED", "REJECTED"];
    const formatMoney = (value?: number | null) => (typeof value === "number" ? `£${value.toLocaleString()}` : null);

    const sortedInterviews = [...candidate.interviews].sort((a, b) => a.stage - b.stage || new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    const activeTemplateQuestions: string[] = showInterviewNoteModal?.template
        ? parseTemplateQuestions(showInterviewNoteModal.template.questions)
        : [];
    const hasStructuredInterviewNote = Object.values(interviewQuestionNotes).some((value) => value.trim().length > 0);

    const candidateComments = candidate.notes.map((note) => ({
        id: `cand-${note.id}`,
        content: note.content,
        createdAt: note.createdAt,
        author: note.author,
        source: "CANDIDATE" as const,
    }));
    const interviewComments = sortedInterviews.flatMap((interview) =>
        interview.notes.map((note) => ({
            id: `iv-${note.id}`,
            content: note.content,
            createdAt: note.createdAt,
            author: note.author,
            source: "INTERVIEW" as const,
            interviewLabel: `Stage ${interview.stage}${interview.stageName ? ` — ${interview.stageName}` : ""}`,
            rating: note.rating ?? null,
        })),
    );
    const unifiedComments: UnifiedComment[] = [...candidateComments, ...interviewComments].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const getInterviewerSummaries = (interview: Interview) => {
        const grouped = new Map<string, { author: User; notes: string[]; ratings: number[] }>();
        for (const note of interview.notes) {
            const existing = grouped.get(note.author.id);
            if (existing) {
                existing.notes.push(note.content);
                if (typeof note.rating === "number") existing.ratings.push(note.rating);
            } else {
                grouped.set(note.author.id, {
                    author: note.author,
                    notes: [note.content],
                    ratings: typeof note.rating === "number" ? [note.rating] : [],
                });
            }
        }
        return [...grouped.values()].map((row) => ({
            author: row.author,
            summary: row.notes.join("\n\n"),
            avgRating: row.ratings.length > 0 ? row.ratings.reduce((a, b) => a + b, 0) / row.ratings.length : null,
        }));
    };

    const putThroughToNextInterview = async () => {
        await updateStatus("INTERVIEW_SCHEDULED");
        openSchedule();
    };

    return (
        <div>
            <div style={{ marginBottom: "1.5rem" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: "1rem" }}>
                    <ArrowLeft size={14} /> Back
                </button>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                            <h1>{candidate.name}</h1>
                            <span className={`badge ${STATUS_COLORS[candidate.status]}`}>{STATUS_LABELS[candidate.status]}</span>
                        </div>
                        <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                            {candidate.openPosition ? (
                                <Link href={`/positions/${candidate.openPosition.id}`} style={{ color: "inherit" }}>
                                    {candidate.openPosition.title}
                                </Link>
                            ) : candidate.position}
                            {candidate.profession && ` · ${candidate.profession.name}`}
                            {candidate.email && ` · ${candidate.email}`}
                            {candidate.phone && ` · ${candidate.phone}`}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {canManage && (
                            <>
                                <select className="input btn-secondary btn" style={{ paddingRight: "2rem", cursor: "pointer", fontWeight: 500 }}
                                    value={candidate.status} onChange={(e) => updateStatus(e.target.value as CandidateStatus)} disabled={statusUpdating}>
                                    {statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                                <button className="btn btn-secondary btn-sm" onClick={() => {
                                    setSelectedOpenPositionId(candidate.openPosition?.id ?? "");
                                    setShowAssignPositionModal(true);
                                }} disabled={positions.length === 0}>
                                    <Plus size={14} /> Assign Open Position
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => runSourceAction(`/api/provider/candidates/${id}/sync`)}>
                                    Sync Source
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={putThroughToNextInterview}>
                                    <Plus size={14} /> Put Through to Next Interview
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={deleteCandidate}><Trash2 size={14} /> Delete</button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    <div className="card">
                        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.85rem" }}>Candidate recommendations</h2>
                        {(candidate.hiringSummary || candidate.salaryExpectationBand || candidate.recommendedBand) ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                {candidate.hiringSummary && (
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                                        {candidate.hiringSummary}
                                    </div>
                                )}
                                {(candidate.salaryExpectationBand || candidate.recommendedBand) && (
                                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                                        {candidate.salaryExpectationBand && (
                                            <span className="chip" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                                                {candidate.salaryExpectationBand}
                                            </span>
                                        )}
                                        {candidate.recommendedBand && (
                                            <span className="chip" style={{ background: "var(--accent-light)", color: "var(--accent-dark)", fontWeight: 600 }}>
                                                {candidate.recommendedBand}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: "2rem" }}>
                                <p>No recommendations generated yet</p>
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                            <div>
                                <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Interviews</h2>
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                                    Add stages here, assign templates and interviewers, and update stages later if the panel changes.
                                </div>
                            </div>
                            {canManage && (
                                <button className="btn btn-secondary btn-sm" onClick={() => openSchedule()}><Plus size={14} /> Add Stage</button>
                            )}
                        </div>
                        {sortedInterviews.length === 0 ? (
                            <div className="empty-state" style={{ padding: "2rem" }}>
                                <Calendar size={28} />
                                <p>No interviews created yet</p>
                                <p style={{ color: "var(--text-muted)", maxWidth: "32rem" }}>
                                    Use <strong>Add Stage</strong> to choose a template, set the interview time, and assign interviewers.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                                {sortedInterviews.map((iv) => {
                                    const summaries = getInterviewerSummaries(iv);
                                    return (
                                        <div key={iv.id} className="surface-2">
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "1.5rem", height: "1.5rem", borderRadius: "50%", background: "var(--accent)", color: "#fff", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>
                                                    {iv.stage}
                                                </div>
                                                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                                                    {iv.stageName ? iv.stageName : `Stage ${iv.stage}`}
                                                </span>
                                                {iv.template && (
                                                    <span className="chip" style={{ marginLeft: "auto", fontSize: "0.7rem" }}>
                                                        <Layers size={10} style={{ marginRight: "0.25rem" }} />{iv.template.name}
                                                    </span>
                                                )}
                                                <span className="chip" style={{ ...(iv.template ? {} : { marginLeft: "auto" }) }}>{iv.status}</span>
                                            </div>

                                            <div style={{ marginBottom: "0.6rem" }}>
                                                <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>
                                                    {format(new Date(iv.scheduledAt), "d MMM yyyy 'at' HH:mm")}
                                                </div>
                                                {iv.location && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{iv.location}</div>}
                                                {(iv.calendarEventId || iv.calendarEventUrl) && (
                                                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                                                        Calendar: {iv.calendarEventUrl ? <a href={iv.calendarEventUrl} target="_blank" rel="noreferrer">open invite</a> : iv.calendarEventId}
                                                        {iv.calendarEventId && iv.calendarEventUrl ? ` · ${iv.calendarEventId}` : ""}
                                                    </div>
                                                )}
                                            </div>

                                            {iv.interviewers.length > 0 && (
                                                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                                                    {iv.interviewers.map(({ user }) => (
                                                        <div
                                                            key={user.id}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: "0.4rem",
                                                                borderLeft: `3px solid ${getInterviewerHighlight(user.id).border}`,
                                                                background: getInterviewerHighlight(user.id).background,
                                                                padding: "0.25rem 0.45rem",
                                                                borderRadius: "6px",
                                                            }}
                                                        >
                                                            <Avatar user={user} />
                                                            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{user.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {summaries.length > 0 && (
                                                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                        Summary by interviewer
                                                    </div>
                                                    {summaries.map((summary) => (
                                                        <div
                                                            key={`${iv.id}-${summary.author.id}`}
                                                            style={{
                                                                borderLeft: `3px solid ${getInterviewerHighlight(summary.author.id).border}`,
                                                                background: getInterviewerHighlight(summary.author.id).background,
                                                                borderRadius: "8px",
                                                                padding: "0.45rem 0.55rem",
                                                            }}
                                                        >
                                                            <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                                                                {summary.author.name}
                                                                {summary.avgRating ? ` · avg score ${summary.avgRating.toFixed(1)}` : ""}
                                                            </div>
                                                            <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", whiteSpace: "pre-wrap", marginTop: "0.2rem" }}>
                                                                {summary.summary}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {iv.geminiNotes && (
                                                <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.75rem", paddingTop: "0.65rem" }}>
                                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>
                                                        Gemini meeting notes
                                                    </div>
                                                    <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", whiteSpace: "pre-wrap" }}>{iv.geminiNotes}</div>
                                                </div>
                                            )}

                                            {iv.recommendations && iv.recommendations.length > 0 && (
                                                <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.75rem", paddingTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                        Final recommendations
                                                    </div>
                                                    {iv.recommendations.map((recommendation) => (
                                                        <div
                                                            key={recommendation.id}
                                                            style={{
                                                                borderLeft: `3px solid ${getInterviewerHighlight(recommendation.author.id).border}`,
                                                                background: getInterviewerHighlight(recommendation.author.id).background,
                                                                borderRadius: "8px",
                                                                padding: "0.45rem 0.55rem",
                                                            }}
                                                        >
                                                            <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                                                                {recommendation.author.name}
                                                                {` · ${recommendation.recommendation.replaceAll("_", " ").toLowerCase()}`}
                                                                {recommendation.recommendedLevel ? ` · ${recommendation.levelCalibration ? `${recommendation.levelCalibration.toLowerCase()} ` : ""}${recommendation.recommendedLevel.toLowerCase()}` : ""}
                                                            </div>
                                                            {recommendation.alternativeOpenPosition ? (
                                                                <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: "0.2rem" }}>
                                                                    Alternative role: {recommendation.alternativeOpenPosition.title}
                                                                    {recommendation.alternativeOpenPosition.team ? ` · ${recommendation.alternativeOpenPosition.team}` : ""}
                                                                    {recommendation.alternativeOpenPosition.level ? ` · ${recommendation.alternativeOpenPosition.level}` : ""}
                                                                </div>
                                                            ) : null}
                                                            {recommendation.summary ? (
                                                                <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", whiteSpace: "pre-wrap", marginTop: "0.2rem" }}>
                                                                    {recommendation.summary}
                                                                </div>
                                                            ) : null}
                                                            {recommendation.candidateFeedback ? (
                                                                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", whiteSpace: "pre-wrap", marginTop: "0.2rem" }}>
                                                                    Candidate feedback: {recommendation.candidateFeedback}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                                                <Link href={`/interviews/${iv.id}`} className="btn btn-secondary btn-sm">
                                                    Open Live Workspace
                                                </Link>
                                                {canManage && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openSchedule(iv)}>
                                                        <Plus size={12} /> Edit Stage
                                                    </button>
                                                )}
                                                {canInterviewNote && (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => {
                                                            setShowInterviewNoteModal(iv);
                                                            setInterviewNote("");
                                                            setInterviewRating(0);
                                                            const initial: Record<string, string> = {};
                                                            parseTemplateQuestions(iv.template?.questions ?? "").forEach((_, index) => {
                                                                initial[`q-${index}`] = "";
                                                            });
                                                            setInterviewQuestionNotes(initial);
                                                        }}
                                                    >
                                                        <Plus size={12} /> Add Interview Note
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ marginTop: "1.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>General Comments</h2>
                        </div>
                        {unifiedComments.length === 0 ? (
                            <div className="empty-state" style={{ padding: "2rem" }}><MessageSquare size={28} /><p>No comments yet</p></div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "360px", overflowY: "auto", marginBottom: "0.75rem" }}>
                                {unifiedComments.map((comment) => (
                                    <div key={comment.id} style={{
                                        borderLeft: `3px solid ${getInterviewerHighlight(comment.author.id).border}`,
                                        background: getInterviewerHighlight(comment.author.id).background,
                                        borderRadius: "8px",
                                        padding: "0.5rem 0.65rem",
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                                            <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{comment.author.name}</span>
                                            <span className="chip">{comment.source === "INTERVIEW" ? comment.interviewLabel : "General comment"}</span>
                                            {comment.rating ? <span className="chip">Score {comment.rating}</span> : null}
                                            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "auto" }}>
                                                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <div style={{ color: "var(--text-secondary)", fontSize: "0.86rem", whiteSpace: "pre-wrap" }}>{comment.content}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <textarea
                                className="input"
                                rows={2}
                                placeholder="Add an ad-hoc comment"
                                value={commentInput}
                                onChange={(e) => setCommentInput(e.target.value)}
                                style={{ resize: "vertical" }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={submitting || !commentInput.trim()}>
                                Add
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div className="card">
                        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem" }}>CV</h2>
                        {candidate.eployCandidateId || candidate.email ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                    CVs are fetched live from {providerStatus?.providerLabel ?? "the source provider"} when opened.
                                </p>
                                <a href={`/api/provider/candidates/${id}/cv`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ justifyContent: "center" }}>
                                    <FileText size={12} /> Open CV
                                </a>
                                {candidate.eployCvUrl && (
                                    <a href={candidate.eployCvUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ justifyContent: "center" }}>
                                        <FileText size={12} /> Open Provider Link
                                    </a>
                                )}
                            </div>
                        ) : (
                            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                No source candidate reference is available yet. Sync the candidate from ePloy first.
                            </p>
                        )}
                    </div>

                    <div className="card">
                        <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem" }}>Details</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {[
                                { label: "Open Position", value: candidate.openPosition?.title },
                                { label: "Profession", value: candidate.profession?.name },
                                { label: "Email", value: candidate.email },
                                { label: "Phone", value: candidate.phone },
                                { label: "Notice period (weeks)", value: candidate.noticePeriodDays ? (candidate.noticePeriodDays / 7).toFixed(1).replace(".0", "") : undefined },
                                { label: "Salary Expectation", value: formatMoney(candidate.salaryExpectation) },
                                { label: "Source Last Sync", value: candidate.eployLastSyncAt ? format(new Date(candidate.eployLastSyncAt), "d MMM yyyy HH:mm") : null },
                                { label: "Feedback pushed to source", value: candidate.eployFeedbackPushedAt ? format(new Date(candidate.eployFeedbackPushedAt), "d MMM yyyy HH:mm") : null },
                                { label: "Application date", value: format(new Date(candidate.createdAt), "d MMM yyyy") },
                            ].map(({ label, value }) => value && (
                                <div key={label}>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>{label}</div>
                                    <div style={{ fontSize: "0.875rem" }}>{value}</div>
                                </div>
                            ))}
                            {candidate.eployFeedbackSummary && (
                                <div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>Feedback pushed summary</div>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{candidate.eployFeedbackSummary}</div>
                                </div>
                            )}
                            {candidate.assessments && candidate.assessments.length > 0 && (
                                <div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>Position Assessments</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                                        {candidate.assessments.map((assessment) => (
                                            <div key={assessment.id} className="surface-2" style={{ padding: "0.65rem" }}>
                                                <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                                    <Link href={`/positions/${assessment.openPosition.id}`}>{assessment.openPosition.title}</Link>
                                                    {assessment.updatedBy?.name ? ` · ${assessment.updatedBy.name}` : ""}
                                                </div>
                                                <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", whiteSpace: "pre-wrap", marginTop: "0.25rem" }}>{assessment.summary || "No summary yet"}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>

            {showInterviewModal && (
                <div className="modal-overlay" onClick={() => setShowInterviewModal(false)}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>{editingInterviewId ? "Edit Stage" : "Add Stage"}</h2>
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                                    Assign the template and interviewers for {candidate.name}.
                                </div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowInterviewModal(false)}><X size={16} /></button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Stage Number</label>
                                    <input type="number" className="input" min={1} value={interviewStage} onChange={(e) => setInterviewStage(parseInt(e.target.value) || 1)} />
                                </div>
                                <div className="form-group">
                                    <label>Stage Name</label>
                                    <input className="input" placeholder="e.g. Technical Screen, Culture Fit" value={interviewStageName} onChange={(e) => setInterviewStageName(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Date &amp; Time *</label>
                                    <input type="datetime-local" className="input" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Location / Link</label>
                                    <input className="input" placeholder="e.g. Google Meet, Office Room 2" value={interviewLocation} onChange={(e) => setInterviewLocation(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Calendar Event ID</label>
                                    <input className="input" placeholder="Optional external invite reference" value={calendarEventId} onChange={(e) => setCalendarEventId(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Calendar Event URL</label>
                                    <input className="input" placeholder="Invite / Meet URL" value={calendarEventUrl} onChange={(e) => setCalendarEventUrl(e.target.value)} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Interview Template</label>
                                <select className="input" value={interviewTemplateId} onChange={(e) => setInterviewTemplateId(e.target.value)}>
                                    <option value="">— No template —</option>
                                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                {interviewTemplateId && (() => {
                                    const t = templates.find((t) => t.id === interviewTemplateId);
                                    const qs = t ? parseTemplateQuestions(t.questions) : [];
                                    return qs.length > 0 ? (
                                        <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "var(--surface)", borderRadius: "8px", fontSize: "0.8rem" }}>
                                            <div style={{ color: "var(--text-muted)", marginBottom: "0.4rem", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Template questions</div>
                                            <ol style={{ margin: "0 0 0 1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                                {qs.map((q, i) => (
                                                    <li key={i} style={{ color: "var(--text-secondary)" }}>
                                                        <TemplateContent content={q} compact />
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                            <div className="form-group">
                                <label>Gemini Meeting Notes</label>
                                <textarea
                                    className="input"
                                    rows={4}
                                    placeholder="Paste Gemini-generated notes or a meeting summary if available."
                                    value={geminiNotes}
                                    onChange={(e) => setGeminiNotes(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Interviewers</label>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "200px", overflowY: "auto" }}>
                                    {interviewers.map((u) => (
                                        <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                                            <input type="checkbox" checked={selectedInterviewers.includes(u.id)}
                                                onChange={(e) => setSelectedInterviewers(e.target.checked ? [...selectedInterviewers, u.id] : selectedInterviewers.filter((i) => i !== u.id))}
                                                style={{ accentColor: "var(--accent)" }} />
                                            <Avatar user={u} />
                                            <span>{u.name}</span>
                                            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>({ROLE_LABELS[u.role]})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                <button className="btn btn-ghost" onClick={() => setShowInterviewModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={submitInterview} disabled={submitting || !interviewDate}>
                                    {submitting ? (editingInterviewId ? "Saving…" : "Scheduling…") : (editingInterviewId ? "Save Stage" : `Add Stage ${interviewStage}`)}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showAssignPositionModal && (
                <div className="modal-overlay" onClick={() => setShowAssignPositionModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>Assign Open Position</h2>
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                                    Link {candidate.name} to the role they are being considered for.
                                </div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowAssignPositionModal(false)}><X size={16} /></button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Open Position</label>
                                <select
                                    className="input"
                                    value={selectedOpenPositionId}
                                    onChange={(e) => setSelectedOpenPositionId(e.target.value)}
                                    disabled={assignmentSaving}
                                >
                                    <option value="">No linked open position</option>
                                    {positions.map((position) => (
                                        <option key={position.id} value={position.id}>
                                            {position.title}{position.team ? ` · ${position.team}` : ""}{position.level ? ` · ${position.level}` : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                <button className="btn btn-ghost" onClick={() => setShowAssignPositionModal(false)}>Cancel</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => assignOpenPosition(selectedOpenPositionId)}
                                    disabled={assignmentSaving}
                                >
                                    {assignmentSaving ? "Saving…" : "Save Assignment"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showInterviewNoteModal && (
                <div className="modal-overlay" onClick={() => setShowInterviewNoteModal(null)}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>Interview Note</h2>
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                                    Stage {showInterviewNoteModal.stage}{showInterviewNoteModal.stageName ? ` — ${showInterviewNoteModal.stageName}` : ""}
                                </div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowInterviewNoteModal(null)}><X size={16} /></button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {activeTemplateQuestions.length > 0 && (
                                <div className="card-sm" style={{ padding: "0.85rem" }}>
                                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
                                        Question notes
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                                        {activeTemplateQuestions.map((question, index) => {
                                            const key = `q-${index}`;
                                            return (
                                                <div key={key} style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr", gap: "0.6rem", alignItems: "start" }}>
                                                    <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                                        <div style={{ marginBottom: "0.35rem" }}>Q{index + 1}.</div>
                                                        <TemplateContent content={question} compact />
                                                    </div>
                                                    <textarea
                                                        className="input"
                                                        rows={2}
                                                        placeholder="Notes for this question"
                                                        value={interviewQuestionNotes[key] ?? ""}
                                                        onChange={(e) => {
                                                            const next = e.target.value;
                                                            setInterviewQuestionNotes((prev) => ({ ...prev, [key]: next }));
                                                        }}
                                                        style={{ resize: "vertical" }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="form-group">
                                <label>Rating</label>
                                <div className="stars">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <span key={s} className={`star ${s <= interviewRating ? "filled" : ""}`} onClick={() => setInterviewRating(s)}>★</span>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="iv-note">General Summary</label>
                                <textarea
                                    id="iv-note" className="input" rows={5}
                                    placeholder="Overall summary for this interviewer"
                                    value={interviewNote} onChange={(e) => setInterviewNote(e.target.value)} style={{ resize: "vertical" }}
                                />
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                <button className="btn btn-ghost" onClick={() => setShowInterviewNoteModal(null)}>Cancel</button>
                                <button className="btn btn-primary" onClick={() => submitInterviewNote(showInterviewNoteModal.id)} disabled={submitting || (!interviewNote.trim() && !hasStructuredInterviewNote)}>
                                    {submitting ? "Saving…" : "Save Note"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
