"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Save, Send } from "lucide-react";
import { TemplateContent } from "@/components/templates/TemplateContent";
import { parseTemplateQuestions } from "@/lib/interview-templates";
import { getInterviewerHighlight } from "@/lib/utils";
import type { Role } from "@prisma/client";

type User = { id: string; name: string | null; email: string | null; image: string | null; role: Role };
type QuestionResponse = {
  id: string;
  questionKey: string;
  questionText: string;
  answer: string;
  score: number | null;
  author: User;
};
type SectionScore = {
  id: string;
  section: string;
  score: number;
  notes: string | null;
  author: User;
};
type FinalRecommendation = {
  id: string;
  recommendation: "UNSUCCESSFUL" | "YES_AT_DIFFERENT_LEVEL" | "PROCEED_TO_NEXT_ROUND";
  recommendedLevel: "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "LEAD" | "PRINCIPAL" | null;
  levelCalibration: "LOW" | "MID" | "HIGH" | null;
  alternativeOpenPosition?: { id: string; title: string; level?: string | null; team?: string | null } | null;
  summary: string;
  candidateFeedback: string;
  updatedAt: string;
  author: User;
};
type Workspace = {
  id: string;
  stage: number;
  stageName: string | null;
  status: string;
  scheduledAt: string;
  location: string | null;
  candidate: {
    id: string;
    name: string;
    position: string;
    status: string;
    openPosition?: { id: string; title: string; level?: string | null; targetHires: number } | null;
  };
  template: { id: string; name: string; questions: string } | null;
  notes: Array<{ id: string; content: string; rating: number | null; createdAt: string; author: User }>;
  questionResponses: QuestionResponse[];
  sectionScores: SectionScore[];
  recommendations: FinalRecommendation[];
  sharedNote: { interviewId: string; content: string; version: number; updatedAt: string; updatedBy: User | null } | null;
};

type ResponseDraft = { questionText: string; answer: string; score: number | null };
type SectionDraft = { score: number; notes: string };
type RecommendationDraft = {
  recommendation: "UNSUCCESSFUL" | "YES_AT_DIFFERENT_LEVEL" | "PROCEED_TO_NEXT_ROUND";
  recommendedLevel: "" | "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "LEAD" | "PRINCIPAL";
  levelCalibration: "" | "LOW" | "MID" | "HIGH";
  alternativeOpenPositionId: string;
  summary: string;
  candidateFeedback: string;
};
type OpenPositionOption = { id: string; title: string; level?: string | null; team?: string | null };

const SCORE_SECTIONS = ["Technical depth", "Problem solving", "Communication", "Culture fit"];
const RECOMMENDATION_LABELS = {
  UNSUCCESSFUL: "Unsuccessful",
  YES_AT_DIFFERENT_LEVEL: "Yes at different level",
  PROCEED_TO_NEXT_ROUND: "Proceed to next round",
} as const;
const LEVEL_LABELS = {
  JUNIOR: "Junior",
  INTERMEDIATE: "Intermediate",
  SENIOR: "Senior",
  LEAD: "Lead",
  PRINCIPAL: "Principal",
} as const;
const CALIBRATION_LABELS = {
  LOW: "Low",
  MID: "Mid",
  HIGH: "High",
} as const;

export default function InterviewWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [openPositions, setOpenPositions] = useState<OpenPositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharedNote, setSharedNote] = useState("");
  const [sharedVersion, setSharedVersion] = useState<number | null>(null);
  const [sharedDirty, setSharedDirty] = useState(false);
  const [responses, setResponses] = useState<Record<string, ResponseDraft>>({});
  const [sectionScores, setSectionScores] = useState<Record<string, SectionDraft>>({});
  const [recommendationDraft, setRecommendationDraft] = useState<RecommendationDraft>({
    recommendation: "PROCEED_TO_NEXT_ROUND",
    recommendedLevel: "",
    levelCalibration: "",
    alternativeOpenPositionId: "",
    summary: "",
    candidateFeedback: "",
  });
  const [noteContent, setNoteContent] = useState("");
  const [noteRating, setNoteRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const loadWorkspace = useCallback(
    async (initial = false) => {
      const res = await fetch(`/api/interviews/${id}/workspace`);
      if (!res.ok) {
        if (initial) setLoading(false);
        return;
      }
      const data: Workspace = await res.json();
      setWorkspace(data);
      if (!sharedDirty) {
        setSharedNote(data.sharedNote?.content ?? "");
        setSharedVersion(data.sharedNote?.version ?? null);
      }
      if (!initialized && session?.user?.id) {
        const mineResponses = data.questionResponses.filter((r) => r.author.id === session.user.id);
        const nextResponses: Record<string, ResponseDraft> = {};
        mineResponses.forEach((r) => {
          nextResponses[r.questionKey] = {
            questionText: r.questionText,
            answer: r.answer,
            score: r.score,
          };
        });
        setResponses(nextResponses);

        const mineSectionScores = data.sectionScores.filter((r) => r.author.id === session.user.id);
        const nextSections: Record<string, SectionDraft> = {};
        mineSectionScores.forEach((row) => {
          nextSections[row.section] = { score: row.score, notes: row.notes ?? "" };
        });
        setSectionScores(nextSections);

        const mineRecommendation = data.recommendations.find((row) => row.author.id === session.user.id);
        if (mineRecommendation) {
          setRecommendationDraft({
            recommendation: mineRecommendation.recommendation,
            recommendedLevel: mineRecommendation.recommendedLevel ?? "",
            levelCalibration: mineRecommendation.levelCalibration ?? "",
            alternativeOpenPositionId: mineRecommendation.alternativeOpenPosition?.id ?? "",
            summary: mineRecommendation.summary ?? "",
            candidateFeedback: mineRecommendation.candidateFeedback ?? "",
          });
        }
        setInitialized(true);
      }
      if (initial) setLoading(false);
    },
    [id, initialized, session, sharedDirty],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadWorkspace(true).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadWorkspace(false).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    fetch("/api/open-positions")
      .then((res) => res.json())
      .then((data) => setOpenPositions(Array.isArray(data) ? data : []))
      .catch(() => undefined);
  }, []);

  const templateQuestions = useMemo(
    () => parseTemplateQuestions(workspace?.template?.questions),
    [workspace?.template?.questions],
  );

  const teammateResponsesByQuestion = useMemo(() => {
    const currentUserId = session?.user?.id;
    const grouped: Record<string, QuestionResponse[]> = {};
    (workspace?.questionResponses ?? []).forEach((row) => {
      if (row.author.id === currentUserId) return;
      if (!grouped[row.questionKey]) grouped[row.questionKey] = [];
      grouped[row.questionKey].push(row);
    });
    return grouped;
  }, [session?.user?.id, workspace?.questionResponses]);

  const teamSectionScores = useMemo(() => {
    const currentUserId = session?.user?.id;
    return (workspace?.sectionScores ?? []).filter((row) => row.author.id !== currentUserId);
  }, [session?.user?.id, workspace?.sectionScores]);

  const teamRecommendations = useMemo(() => {
    const currentUserId = session?.user?.id;
    return (workspace?.recommendations ?? []).filter((row) => row.author.id !== currentUserId);
  }, [session?.user?.id, workspace?.recommendations]);

  const interviewerSummaries = useMemo(() => {
    const grouped = new Map<string, { author: User; notes: string[]; ratings: number[] }>();
    for (const note of workspace?.notes ?? []) {
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
  }, [workspace?.notes]);

  const updateResponseDraft = (questionKey: string, questionText: string, patch: Partial<ResponseDraft>) => {
    setResponses((prev) => ({
      ...prev,
      [questionKey]: {
        questionText,
        answer: prev[questionKey]?.answer ?? "",
        score: prev[questionKey]?.score ?? null,
        ...patch,
      },
    }));
  };

  const saveSharedNote = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/interviews/${id}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "shared-note",
        content: sharedNote,
        baseVersion: sharedVersion,
      }),
    });
    if (res.status === 409) {
      const body = await res.json();
      setError("Shared note updated by someone else. Your view has been refreshed.");
      setSharedNote(body.current?.content ?? "");
      setSharedVersion(body.current?.version ?? null);
      setSharedDirty(false);
      setSaving(false);
      return;
    }
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save shared note");
      setSaving(false);
      return;
    }
    const saved = await res.json();
    setSharedVersion(saved.version);
    setSharedDirty(false);
    setSaving(false);
    await loadWorkspace(false);
  };

  const saveResponses = async () => {
    const items = templateQuestions.map((q, index) => {
      const questionKey = `q-${index}`;
      return {
        questionKey,
        questionText: q,
        answer: responses[questionKey]?.answer ?? "",
        score: responses[questionKey]?.score ?? null,
      };
    });
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/interviews/${id}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "responses", items }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save question responses");
      setSaving(false);
      return;
    }
    setSaving(false);
    await loadWorkspace(false);
  };

  const saveSectionScores = async () => {
    const items = SCORE_SECTIONS.map((section) => ({
      section,
      score: sectionScores[section]?.score ?? 3,
      notes: sectionScores[section]?.notes ?? "",
    }));
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/interviews/${id}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "section-scores", items }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save section scores");
      setSaving(false);
      return;
    }
    setSaving(false);
    await loadWorkspace(false);
  };

  const saveRecommendation = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/interviews/${id}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "recommendation",
        recommendation: recommendationDraft.recommendation,
        recommendedLevel: recommendationDraft.recommendedLevel || null,
        levelCalibration: recommendationDraft.levelCalibration || null,
        alternativeOpenPositionId: recommendationDraft.alternativeOpenPositionId || null,
        summary: recommendationDraft.summary,
        candidateFeedback: recommendationDraft.candidateFeedback,
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save final recommendation");
      setSaving(false);
      return;
    }
    setSaving(false);
    await loadWorkspace(false);
  };

  const addLiveNote = async () => {
    if (!noteContent.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/interviews/${id}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "note",
        content: noteContent,
        rating: noteRating || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to add live note");
      setSaving(false);
      return;
    }
    setNoteContent("");
    setNoteRating(0);
    setSaving(false);
    await loadWorkspace(false);
  };

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!workspace) return <div className="empty-state">Interview not found</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="page-header">
        <div>
          <Link href={`/candidates/${workspace.candidate.id}`} className="btn btn-ghost btn-sm" style={{ marginBottom: "0.75rem" }}>
            <ArrowLeft size={14} /> Back to candidate
          </Link>
          <h1>{workspace.candidate.name} · Interview Workspace</h1>
          <p>
            {workspace.candidate.openPosition?.title ?? workspace.candidate.position}
            {workspace.candidate.openPosition?.level ? ` · ${workspace.candidate.openPosition.level}` : ""}
            {" · "}
            Stage {workspace.stage}
            {workspace.stageName ? ` — ${workspace.stageName}` : ""}
            {" · "}
            {format(new Date(workspace.scheduledAt), "d MMM yyyy HH:mm")}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Shared Live Notes</h2>
          <button className="btn btn-primary btn-sm" onClick={saveSharedNote} disabled={saving || !sharedDirty}>
            <Save size={12} /> Save Shared Note
          </button>
        </div>
        <textarea
          className="input"
          rows={6}
          value={sharedNote}
          onChange={(e) => {
            setSharedNote(e.target.value);
            setSharedDirty(true);
          }}
          placeholder="Interviewers can edit this shared note collaboratively."
          style={{ resize: "vertical" }}
        />
        <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Refreshes every 2 seconds. Last update version: {sharedVersion ?? 0}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>
            Structured Question Answers {workspace.template ? `(${workspace.template.name})` : ""}
          </h2>
          <button className="btn btn-secondary btn-sm" onClick={saveResponses} disabled={saving}>
            <Save size={12} /> Save My Answers
          </button>
        </div>

        {templateQuestions.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            This interview has no template questions attached.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {templateQuestions.map((question, index) => {
              const questionKey = `q-${index}`;
              const draft = responses[questionKey] ?? { questionText: question, answer: "", score: null };
              const peerRows = teammateResponsesByQuestion[questionKey] ?? [];
              return (
                <div key={questionKey} className="surface-2">
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(280px, 1.6fr)", gap: "0.75rem", alignItems: "start", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 600 }}>
                      <div style={{ marginBottom: "0.35rem" }}>Q{index + 1}.</div>
                      <TemplateContent content={question} compact />
                    </div>
                    <div>
                      <textarea
                        className="input"
                        rows={3}
                        placeholder="Notes for this question"
                        value={draft.answer}
                        onChange={(e) => updateResponseDraft(questionKey, question, { answer: e.target.value })}
                        style={{ resize: "vertical", marginBottom: "0.5rem" }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Score</label>
                        <select
                          className="input"
                          style={{ width: "100px" }}
                          value={draft.score ?? ""}
                          onChange={(e) => updateResponseDraft(questionKey, question, {
                            score: e.target.value ? Number(e.target.value) : null,
                          })}
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((score) => (
                            <option key={score} value={score}>
                              {score}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {peerRows.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Team updates
                      </div>
                      {peerRows.map((row) => (
                        <div
                          key={row.id}
                          style={{
                            fontSize: "0.82rem",
                            borderLeft: `3px solid ${getInterviewerHighlight(row.author.id).border}`,
                            background: getInterviewerHighlight(row.author.id).background,
                            borderRadius: "8px",
                            padding: "0.45rem 0.55rem",
                          }}
                        >
                          <strong>{row.author.name ?? row.author.email}</strong>
                          {row.score ? ` · score ${row.score}` : ""}
                          <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{row.answer || "No answer yet"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Section Scorecard</h2>
          <button className="btn btn-secondary btn-sm" onClick={saveSectionScores} disabled={saving}>
            <Save size={12} /> Save My Scorecard
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
          {SCORE_SECTIONS.map((section) => (
            <div key={section} className="surface-2">
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.35rem" }}>{section}</div>
              <select
                className="input"
                value={sectionScores[section]?.score ?? 3}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSectionScores((prev) => ({
                    ...prev,
                    [section]: { score: next, notes: prev[section]?.notes ?? "" },
                  }));
                }}
              >
                {[1, 2, 3, 4, 5].map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </select>
              <textarea
                className="input"
                rows={2}
                placeholder="Notes"
                value={sectionScores[section]?.notes ?? ""}
                onChange={(e) => {
                  const next = e.target.value;
                  setSectionScores((prev) => ({
                    ...prev,
                    [section]: { score: prev[section]?.score ?? 3, notes: next },
                  }));
                }}
                style={{ resize: "vertical", marginTop: "0.5rem" }}
              />
            </div>
          ))}
        </div>
        {teamSectionScores.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
              Team Scorecards
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {teamSectionScores.map((row) => (
                <div
                  key={row.id}
                  style={{
                    fontSize: "0.82rem",
                    borderLeft: `3px solid ${getInterviewerHighlight(row.author.id).border}`,
                    background: getInterviewerHighlight(row.author.id).background,
                    borderRadius: "8px",
                    padding: "0.45rem 0.55rem",
                  }}
                >
                  <strong>{row.author.name ?? row.author.email}</strong> · {row.section}: {row.score}
                  {row.notes ? <div style={{ color: "var(--text-secondary)" }}>{row.notes}</div> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Final Recommendation</h2>
          <button className="btn btn-primary btn-sm" onClick={saveRecommendation} disabled={saving}>
            <Save size={12} /> Save Final Recommendation
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Outcome</label>
            <select
              className="input"
              value={recommendationDraft.recommendation}
              onChange={(e) => setRecommendationDraft((prev) => ({
                ...prev,
                recommendation: e.target.value as RecommendationDraft["recommendation"],
              }))}
            >
              {Object.entries(RECOMMENDATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Recommended level</label>
            <select
              className="input"
              value={recommendationDraft.recommendedLevel}
              onChange={(e) => setRecommendationDraft((prev) => ({
                ...prev,
                recommendedLevel: e.target.value as RecommendationDraft["recommendedLevel"],
              }))}
            >
              <option value="">No level set</option>
              {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Low / mid / high</label>
            <select
              className="input"
              value={recommendationDraft.levelCalibration}
              onChange={(e) => setRecommendationDraft((prev) => ({
                ...prev,
                levelCalibration: e.target.value as RecommendationDraft["levelCalibration"],
              }))}
            >
              <option value="">No calibration</option>
              {Object.entries(CALIBRATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Alternative role</label>
            <select
              className="input"
              value={recommendationDraft.alternativeOpenPositionId}
              onChange={(e) => setRecommendationDraft((prev) => ({
                ...prev,
                alternativeOpenPositionId: e.target.value,
              }))}
            >
              <option value="">No alternative role</option>
              {openPositions
                .filter((position) => position.id !== workspace.candidate.openPosition?.id)
                .map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}{position.team ? ` · ${position.team}` : ""}{position.level ? ` · ${position.level}` : ""}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Internal recommendation summary</label>
          <textarea
            className="input"
            rows={4}
            placeholder="Examples: high Intermediate, low Senior; strong delivery, weaker architecture depth."
            value={recommendationDraft.summary}
            onChange={(e) => setRecommendationDraft((prev) => ({ ...prev, summary: e.target.value }))}
            style={{ resize: "vertical" }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Feedback to share with candidate</label>
          <textarea
            className="input"
            rows={4}
            placeholder="Candidate-facing feedback and development points."
            value={recommendationDraft.candidateFeedback}
            onChange={(e) => setRecommendationDraft((prev) => ({ ...prev, candidateFeedback: e.target.value }))}
            style={{ resize: "vertical" }}
          />
        </div>

        {teamRecommendations.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
              Team recommendations
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {teamRecommendations.map((row) => (
                <div
                  key={row.id}
                  style={{
                    fontSize: "0.82rem",
                    borderLeft: `3px solid ${getInterviewerHighlight(row.author.id).border}`,
                    background: getInterviewerHighlight(row.author.id).background,
                    borderRadius: "8px",
                    padding: "0.45rem 0.55rem",
                  }}
                >
                  <strong>{row.author.name ?? row.author.email}</strong>
                  <div style={{ color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                    {RECOMMENDATION_LABELS[row.recommendation]}
                    {row.recommendedLevel ? ` · ${LEVEL_LABELS[row.recommendedLevel]}` : ""}
                    {row.levelCalibration ? ` (${CALIBRATION_LABELS[row.levelCalibration].toLowerCase()})` : ""}
                  </div>
                  {row.alternativeOpenPosition ? (
                    <div style={{ color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                      Alternative role: {row.alternativeOpenPosition.title}
                      {row.alternativeOpenPosition.team ? ` · ${row.alternativeOpenPosition.team}` : ""}
                      {row.alternativeOpenPosition.level ? ` · ${row.alternativeOpenPosition.level}` : ""}
                    </div>
                  ) : null}
                  {row.summary ? <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", marginTop: "0.2rem" }}>{row.summary}</div> : null}
                  {row.candidateFeedback ? <div style={{ color: "var(--text-muted)", whiteSpace: "pre-wrap", marginTop: "0.2rem" }}>Candidate feedback: {row.candidateFeedback}</div> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Live Interview Feed</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "260px", overflowY: "auto", marginBottom: "0.75rem" }}>
          {workspace.notes.length === 0 ? (
            <div className="empty-state" style={{ padding: "1.5rem" }}>No notes yet</div>
          ) : (
            workspace.notes.map((note) => (
              <div
                key={note.id}
                className="surface-2"
                style={{
                  borderLeft: `3px solid ${getInterviewerHighlight(note.author.id).border}`,
                  background: getInterviewerHighlight(note.author.id).background,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.25rem", fontSize: "0.8rem" }}>
                  <strong>{note.author.name ?? note.author.email}</strong>
                  {note.rating ? <span className="chip">Score {note.rating}</span> : null}
                  <span style={{ color: "var(--text-muted)" }}>{formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}</span>
                </div>
                <div style={{ whiteSpace: "pre-wrap", color: "var(--text-secondary)", fontSize: "0.84rem" }}>{note.content}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: "0.5rem", alignItems: "center" }}>
          <select className="input" value={noteRating} onChange={(e) => setNoteRating(Number(e.target.value))}>
            <option value={0}>No score</option>
            {[1, 2, 3, 4, 5].map((score) => (
              <option key={score} value={score}>
                {score}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Add a live interview note"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLiveNote()}
          />
          <button className="btn btn-primary btn-sm" onClick={addLiveNote} disabled={saving || !noteContent.trim()}>
            <Send size={12} />
          </button>
        </div>
      </div>

      {interviewerSummaries.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Post-Interview Summary by Interviewer</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {interviewerSummaries.map((summary) => (
              <div
                key={summary.author.id}
                style={{
                  borderLeft: `3px solid ${getInterviewerHighlight(summary.author.id).border}`,
                  background: getInterviewerHighlight(summary.author.id).background,
                  borderRadius: "8px",
                  padding: "0.5rem 0.65rem",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>
                  {summary.author.name ?? summary.author.email}
                  {summary.avgRating ? ` · avg score ${summary.avgRating.toFixed(1)}` : ""}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.84rem", marginTop: "0.2rem", whiteSpace: "pre-wrap" }}>
                  {summary.summary}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
