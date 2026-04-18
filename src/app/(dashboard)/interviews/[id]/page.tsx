"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { TemplateContent } from "@/components/templates/TemplateContent";
import {
  RECOMMENDATION_FEEDBACK_FIELD_KEY,
  RECOMMENDATION_META_FIELD_KEY,
  RECOMMENDATION_SUMMARY_FIELD_KEY,
  SHARED_NOTE_FIELD_KEY,
  getResponseFieldKey,
} from "@/lib/interview-workspace";
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
type WorkspaceLock = {
  id: string;
  fieldKey: string;
  expiresAt: string;
  updatedAt: string;
  lockedBy: User;
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
  recommendations: FinalRecommendation[];
  sharedNote: { interviewId: string; content: string; version: number; updatedAt: string; updatedBy: User | null } | null;
  workspaceLocks: WorkspaceLock[];
};

type ResponseDraft = { questionText: string; answer: string; score: number | null };
type RecommendationDraft = {
  recommendation: "UNSUCCESSFUL" | "YES_AT_DIFFERENT_LEVEL" | "PROCEED_TO_NEXT_ROUND";
  recommendedLevel: "" | "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "LEAD" | "PRINCIPAL";
  levelCalibration: "" | "LOW" | "MID" | "HIGH";
  alternativeOpenPositionId: string;
  summary: string;
  candidateFeedback: string;
};
type OpenPositionOption = { id: string; title: string; level?: string | null; team?: string | null };
type FieldState = { state: "idle" | "saving" | "saved" | "error"; message?: string };

const AUTO_SAVE_DELAY_MS = 900;
const LOCK_HEARTBEAT_MS = 10_000;
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

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

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
  const [responseDirty, setResponseDirty] = useState<Record<string, boolean>>({});
  const [recommendationDraft, setRecommendationDraft] = useState<RecommendationDraft>({
    recommendation: "PROCEED_TO_NEXT_ROUND",
    recommendedLevel: "",
    levelCalibration: "",
    alternativeOpenPositionId: "",
    summary: "",
    candidateFeedback: "",
  });
  const [recommendationDirty, setRecommendationDirty] = useState<Record<string, boolean>>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({});

  const setFieldState = useCallback((fieldKey: string, nextState: FieldState) => {
    setFieldStates((prev) => ({ ...prev, [fieldKey]: nextState }));
  }, []);

  const clearFieldState = useCallback((fieldKey: string) => {
    setFieldStates((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }, []);

  const markFieldSaved = useCallback(
    (fieldKey: string) => {
      setFieldState(fieldKey, { state: "saved" });
      setTimeout(() => {
        setFieldStates((prev) => {
          if (prev[fieldKey]?.state !== "saved") return prev;
          const next = { ...prev };
          delete next[fieldKey];
          return next;
        });
      }, 1800);
    },
    [setFieldState],
  );

  const applyLock = useCallback((lock: WorkspaceLock) => {
    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            workspaceLocks: [lock, ...prev.workspaceLocks.filter((item) => item.fieldKey !== lock.fieldKey)],
          }
        : prev,
    );
  }, []);

  const loadWorkspace = useCallback(
    async (initial = false) => {
      const res = await fetch(`/api/interviews/${id}/workspace`);
      if (!res.ok) {
        if (initial) setLoading(false);
        return;
      }

      const data: Workspace = await res.json();
      const currentUserId = session?.user?.id;
      const lockOwnerByField = new Map(data.workspaceLocks.map((lock) => [lock.fieldKey, lock.lockedBy.id]));

      setWorkspace(data);

      if (!sharedDirty || lockOwnerByField.get(SHARED_NOTE_FIELD_KEY) !== currentUserId) {
        setSharedNote(data.sharedNote?.content ?? "");
        setSharedVersion(data.sharedNote?.version ?? null);
        if (lockOwnerByField.get(SHARED_NOTE_FIELD_KEY) !== currentUserId) {
          setSharedDirty(false);
        }
      }

      if (currentUserId) {
        const questionList = parseTemplateQuestions(data.template?.questions);
        const mineResponsesByKey = new Map(
          data.questionResponses
            .filter((row) => row.author.id === currentUserId)
            .map((row) => [
              row.questionKey,
              {
                questionText: row.questionText,
                answer: row.answer,
                score: row.score,
              },
            ]),
        );

        setResponses((prev) => {
          const next = { ...prev };
          questionList.forEach((question, index) => {
            const questionKey = `q-${index}`;
            const fieldKey = getResponseFieldKey(questionKey);
            const shouldSync = !responseDirty[fieldKey] || lockOwnerByField.get(fieldKey) !== currentUserId;
            if (shouldSync) {
              next[questionKey] = mineResponsesByKey.get(questionKey) ?? { questionText: question, answer: "", score: null };
            }
          });
          return next;
        });

        setResponseDirty((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((fieldKey) => {
            if (lockOwnerByField.get(fieldKey) !== currentUserId) {
              next[fieldKey] = false;
            }
          });
          return next;
        });

        const mineRecommendation = data.recommendations.find((row) => row.author.id === currentUserId);
        setRecommendationDraft((prev) => {
          const next = { ...prev };
          if (!recommendationDirty[RECOMMENDATION_META_FIELD_KEY] || lockOwnerByField.get(RECOMMENDATION_META_FIELD_KEY) !== currentUserId) {
            next.recommendation = mineRecommendation?.recommendation ?? "PROCEED_TO_NEXT_ROUND";
            next.recommendedLevel = mineRecommendation?.recommendedLevel ?? "";
            next.levelCalibration = mineRecommendation?.levelCalibration ?? "";
            next.alternativeOpenPositionId = mineRecommendation?.alternativeOpenPosition?.id ?? "";
          }
          if (!recommendationDirty[RECOMMENDATION_SUMMARY_FIELD_KEY] || lockOwnerByField.get(RECOMMENDATION_SUMMARY_FIELD_KEY) !== currentUserId) {
            next.summary = mineRecommendation?.summary ?? "";
          }
          if (!recommendationDirty[RECOMMENDATION_FEEDBACK_FIELD_KEY] || lockOwnerByField.get(RECOMMENDATION_FEEDBACK_FIELD_KEY) !== currentUserId) {
            next.candidateFeedback = mineRecommendation?.candidateFeedback ?? "";
          }
          return next;
        });

        setRecommendationDirty((prev) => ({
          ...prev,
          [RECOMMENDATION_META_FIELD_KEY]:
            lockOwnerByField.get(RECOMMENDATION_META_FIELD_KEY) === currentUserId ? prev[RECOMMENDATION_META_FIELD_KEY] : false,
          [RECOMMENDATION_SUMMARY_FIELD_KEY]:
            lockOwnerByField.get(RECOMMENDATION_SUMMARY_FIELD_KEY) === currentUserId ? prev[RECOMMENDATION_SUMMARY_FIELD_KEY] : false,
          [RECOMMENDATION_FEEDBACK_FIELD_KEY]:
            lockOwnerByField.get(RECOMMENDATION_FEEDBACK_FIELD_KEY) === currentUserId ? prev[RECOMMENDATION_FEEDBACK_FIELD_KEY] : false,
        }));
      }

      if (initial) setLoading(false);
    },
    [id, recommendationDirty, responseDirty, session?.user?.id, sharedDirty],
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

  const lockMap = useMemo(() => {
    return new Map((workspace?.workspaceLocks ?? []).map((lock) => [lock.fieldKey, lock]));
  }, [workspace?.workspaceLocks]);

  const controlledFieldKeys = useMemo(() => {
    const currentUserId = session?.user?.id;
    if (!currentUserId) return [];
    return (workspace?.workspaceLocks ?? [])
      .filter((lock) => lock.lockedBy.id === currentUserId)
      .map((lock) => lock.fieldKey)
      .sort();
  }, [session?.user?.id, workspace?.workspaceLocks]);

  const hasControl = useCallback(
    (fieldKey: string) => lockMap.get(fieldKey)?.lockedBy.id === session?.user?.id,
    [lockMap, session?.user?.id],
  );

  const getLock = useCallback((fieldKey: string) => lockMap.get(fieldKey) ?? null, [lockMap]);

  useEffect(() => {
    if (controlledFieldKeys.length === 0) return;

    const timer = setInterval(() => {
      void fetch(`/api/interviews/${id}/workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "touch-locks", fieldKeys: controlledFieldKeys }),
      });
    }, LOCK_HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [controlledFieldKeys, id]);

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

  const scoreSummary = useMemo(() => {
    const scoredResponses = (workspace?.questionResponses ?? []).filter((row) => typeof row.score === "number");
    if (scoredResponses.length === 0) {
      return {
        overallAverage: null as number | null,
        questionRows: [] as Array<{ questionKey: string; questionText: string; average: number; count: number }>,
        interviewerRows: [] as Array<{ author: User; average: number; count: number }>,
      };
    }

    const questionMap = new Map<string, { questionText: string; total: number; count: number }>();
    const interviewerMap = new Map<string, { author: User; total: number; count: number }>();

    scoredResponses.forEach((row) => {
      const question = questionMap.get(row.questionKey) ?? { questionText: row.questionText, total: 0, count: 0 };
      question.total += row.score ?? 0;
      question.count += 1;
      questionMap.set(row.questionKey, question);

      const interviewer = interviewerMap.get(row.author.id) ?? { author: row.author, total: 0, count: 0 };
      interviewer.total += row.score ?? 0;
      interviewer.count += 1;
      interviewerMap.set(row.author.id, interviewer);
    });

    return {
      overallAverage: scoredResponses.reduce((sum, row) => sum + (row.score ?? 0), 0) / scoredResponses.length,
      questionRows: [...questionMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([questionKey, row]) => ({
          questionKey,
          questionText: row.questionText,
          average: row.total / row.count,
          count: row.count,
        })),
      interviewerRows: [...interviewerMap.values()].map((row) => ({
        author: row.author,
        average: row.total / row.count,
        count: row.count,
      })),
    };
  }, [workspace?.questionResponses]);

  const takeControl = useCallback(
    async (fieldKey: string) => {
      setPageError(null);
      clearFieldState(fieldKey);

      const res = await fetch(`/api/interviews/${id}/workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire-lock", fieldKey, force: true }),
      });
      const body = await readJsonSafe(res);

      if (!res.ok) {
        setFieldState(fieldKey, { state: "error", message: body?.error ?? "Failed to take control." });
        await loadWorkspace(false);
        return;
      }

      applyLock(body as WorkspaceLock);
    },
    [applyLock, clearFieldState, id, loadWorkspace, setFieldState],
  );

  const saveSharedNote = useCallback(async () => {
    if (!sharedDirty || !hasControl(SHARED_NOTE_FIELD_KEY)) return;

    setFieldState(SHARED_NOTE_FIELD_KEY, { state: "saving" });
    const res = await fetch(`/api/interviews/${id}/workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "shared-note",
        content: sharedNote,
        baseVersion: sharedVersion,
      }),
    });
    const body = await readJsonSafe(res);

    if (res.status === 409 && body?.current) {
      setFieldState(SHARED_NOTE_FIELD_KEY, { state: "error", message: "General notes changed and were refreshed." });
      setSharedNote(body.current?.content ?? "");
      setSharedVersion(body.current?.version ?? null);
      setSharedDirty(false);
      await loadWorkspace(false);
      return;
    }

    if (!res.ok) {
      setFieldState(SHARED_NOTE_FIELD_KEY, { state: "error", message: body?.error ?? "Failed to save general notes." });
      await loadWorkspace(false);
      return;
    }

    setSharedVersion(body.version);
    setSharedDirty(false);
    markFieldSaved(SHARED_NOTE_FIELD_KEY);
    await loadWorkspace(false);
  }, [hasControl, id, loadWorkspace, markFieldSaved, setFieldState, sharedDirty, sharedNote, sharedVersion]);

  const saveResponseField = useCallback(
    async (questionKey: string, draft: ResponseDraft) => {
      const fieldKey = getResponseFieldKey(questionKey);
      if (!responseDirty[fieldKey] || !hasControl(fieldKey)) return;

      setFieldState(fieldKey, { state: "saving" });
      const res = await fetch(`/api/interviews/${id}/workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "responses",
          items: [
            {
              fieldKey,
              questionKey,
              questionText: draft.questionText,
              answer: draft.answer,
              score: draft.score,
            },
          ],
        }),
      });
      const body = await readJsonSafe(res);

      if (!res.ok) {
        setFieldState(fieldKey, { state: "error", message: body?.error ?? "Failed to save this answer." });
        await loadWorkspace(false);
        return;
      }

      setResponseDirty((prev) => ({ ...prev, [fieldKey]: false }));
      markFieldSaved(fieldKey);
      await loadWorkspace(false);
    },
    [hasControl, id, loadWorkspace, markFieldSaved, responseDirty, setFieldState],
  );

  const saveRecommendationField = useCallback(
    async (fieldKey: string) => {
      if (!recommendationDirty[fieldKey] || !hasControl(fieldKey)) return;

      setFieldState(fieldKey, { state: "saving" });
      const payload: Record<string, unknown> = {
        action: "recommendation",
        fieldKey,
      };

      if (fieldKey === RECOMMENDATION_META_FIELD_KEY) {
        payload.recommendation = recommendationDraft.recommendation;
        payload.recommendedLevel = recommendationDraft.recommendedLevel || null;
        payload.levelCalibration = recommendationDraft.levelCalibration || null;
        payload.alternativeOpenPositionId = recommendationDraft.alternativeOpenPositionId || null;
      }
      if (fieldKey === RECOMMENDATION_SUMMARY_FIELD_KEY) {
        payload.summary = recommendationDraft.summary;
      }
      if (fieldKey === RECOMMENDATION_FEEDBACK_FIELD_KEY) {
        payload.candidateFeedback = recommendationDraft.candidateFeedback;
      }

      const res = await fetch(`/api/interviews/${id}/workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJsonSafe(res);

      if (!res.ok) {
        setFieldState(fieldKey, { state: "error", message: body?.error ?? "Failed to save this recommendation box." });
        await loadWorkspace(false);
        return;
      }

      setRecommendationDirty((prev) => ({ ...prev, [fieldKey]: false }));
      markFieldSaved(fieldKey);
      await loadWorkspace(false);
    },
    [hasControl, id, loadWorkspace, markFieldSaved, recommendationDirty, recommendationDraft, setFieldState],
  );

  useEffect(() => {
    if (!sharedDirty || !hasControl(SHARED_NOTE_FIELD_KEY)) return;
    const timer = setTimeout(() => {
      void saveSharedNote();
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasControl, saveSharedNote, sharedDirty, sharedNote]);

  useEffect(() => {
    const pending = templateQuestions
      .map((question, index) => {
        const questionKey = `q-${index}`;
        const fieldKey = getResponseFieldKey(questionKey);
        if (!responseDirty[fieldKey] || !hasControl(fieldKey)) return null;
        return {
          questionKey,
          draft: responses[questionKey] ?? { questionText: question, answer: "", score: null },
        };
      })
      .filter((value): value is { questionKey: string; draft: ResponseDraft } => Boolean(value));

    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      pending.forEach((item) => {
        void saveResponseField(item.questionKey, item.draft);
      });
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [hasControl, responseDirty, responses, saveResponseField, templateQuestions]);

  useEffect(() => {
    const pending = [
      RECOMMENDATION_META_FIELD_KEY,
      RECOMMENDATION_SUMMARY_FIELD_KEY,
      RECOMMENDATION_FEEDBACK_FIELD_KEY,
    ].filter((fieldKey) => recommendationDirty[fieldKey] && hasControl(fieldKey));

    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      pending.forEach((fieldKey) => {
        void saveRecommendationField(fieldKey);
      });
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [hasControl, recommendationDirty, recommendationDraft, saveRecommendationField]);

  const updateResponseDraft = (questionKey: string, questionText: string, patch: Partial<ResponseDraft>) => {
    const fieldKey = getResponseFieldKey(questionKey);
    clearFieldState(fieldKey);
    setResponses((prev) => ({
      ...prev,
      [questionKey]: {
        questionText,
        answer: prev[questionKey]?.answer ?? "",
        score: prev[questionKey]?.score ?? null,
        ...patch,
      },
    }));
    setResponseDirty((prev) => ({ ...prev, [fieldKey]: true }));
  };

  const updateRecommendation = (fieldKey: string, patch: Partial<RecommendationDraft>) => {
    clearFieldState(fieldKey);
    setRecommendationDraft((prev) => ({ ...prev, ...patch }));
    setRecommendationDirty((prev) => ({ ...prev, [fieldKey]: true }));
  };

  const getFieldStatus = useCallback(
    (fieldKey: string) => {
      const fieldState = fieldStates[fieldKey];
      if (fieldState?.state === "saving") return { text: "Saving...", color: "var(--text-muted)" };
      if (fieldState?.state === "saved") return { text: "Saved", color: "var(--success, #15803d)" };
      if (fieldState?.state === "error") return { text: fieldState.message ?? "Unable to save", color: "var(--danger, #b91c1c)" };

      const lock = getLock(fieldKey);
      if (lock?.lockedBy.id === session?.user?.id) {
        return { text: "Writing: You", color: "var(--text-muted)" };
      }
      if (lock) {
        return { text: `Writing: ${lock.lockedBy.name ?? lock.lockedBy.email ?? "Another interviewer"}`, color: "var(--text-muted)" };
      }
      return { text: "Writing: No one", color: "var(--text-muted)" };
    },
    [fieldStates, getLock, session?.user?.id],
  );

  const getFieldInputStyle = useCallback(
    (fieldKey: string) => {
      const editable = hasControl(fieldKey);
      return {
        resize: "vertical" as const,
        background: editable ? "rgba(255,255,255,0.98)" : "rgba(148,163,184,0.18)",
        borderColor: editable ? "var(--border)" : "rgba(148,163,184,0.32)",
        color: editable ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: editable ? "text" : "not-allowed",
        boxShadow: editable ? "0 1px 0 rgba(15,23,42,0.03)" : "none",
      };
    },
    [hasControl],
  );

  const getFieldSelectStyle = useCallback(
    (fieldKey: string) => {
      const editable = hasControl(fieldKey);
      return {
        background: editable ? "rgba(255,255,255,0.98)" : "rgba(148,163,184,0.18)",
        borderColor: editable ? "var(--border)" : "rgba(148,163,184,0.32)",
        color: editable ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: editable ? "pointer" : "not-allowed",
      };
    },
    [hasControl],
  );

  const renderFieldToolbar = useCallback(
    (fieldKey: string) => {
      const status = getFieldStatus(fieldKey);
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ fontSize: "0.75rem", color: status.color }}>{status.text}</span>
          {!hasControl(fieldKey) ? (
            <button className="btn btn-ghost btn-sm" onClick={() => void takeControl(fieldKey)}>
              Take control
            </button>
          ) : null}
        </div>
      );
    },
    [getFieldStatus, hasControl, takeControl],
  );

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

      {pageError && <div className="alert alert-error">{pageError}</div>}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>General Interview notes</h2>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              One interviewer writes here at a time. Everyone else sees the latest synced text.
            </div>
          </div>
          {renderFieldToolbar(SHARED_NOTE_FIELD_KEY)}
        </div>
        <textarea
          className="input"
          rows={6}
          value={sharedNote}
          disabled={!hasControl(SHARED_NOTE_FIELD_KEY)}
          onChange={(e) => {
            clearFieldState(SHARED_NOTE_FIELD_KEY);
            setSharedNote(e.target.value);
            setSharedDirty(true);
          }}
          placeholder="Shared notes for the interview."
          style={getFieldInputStyle(SHARED_NOTE_FIELD_KEY)}
        />
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>
              Structured Question Answers {workspace.template ? `(${workspace.template.name})` : ""}
            </h2>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              Question text stays fixed. Notes and per-question scores are collaborative with one active writer per box.
            </div>
          </div>
        </div>

        {templateQuestions.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            This interview has no template questions attached.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {templateQuestions.map((question, index) => {
              const questionKey = `q-${index}`;
              const fieldKey = getResponseFieldKey(questionKey);
              const draft = responses[questionKey] ?? { questionText: question, answer: "", score: null };
              const peerRows = teammateResponsesByQuestion[questionKey] ?? [];

              return (
                <div key={questionKey} className="surface-2" style={{ padding: "0.9rem" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                    <div
                      style={{
                        flex: "1 1 260px",
                        padding: "0.75rem",
                        borderRadius: "10px",
                        background: "rgba(15,23,42,0.045)",
                      }}
                    >
                      <div style={{ marginBottom: "0.35rem", fontWeight: 700, fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Q{index + 1}
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        <TemplateContent content={question} compact />
                      </div>
                    </div>
                    {renderFieldToolbar(fieldKey)}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.6fr) 120px", gap: "0.75rem", alignItems: "start" }}>
                    <textarea
                      className="input"
                      rows={3}
                      disabled={!hasControl(fieldKey)}
                      placeholder="Notes for this question"
                      value={draft.answer}
                      onChange={(e) => updateResponseDraft(questionKey, question, { answer: e.target.value })}
                      style={getFieldInputStyle(fieldKey)}
                    />
                    <div>
                      <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                        Score
                      </label>
                      <select
                        className="input"
                        disabled={!hasControl(fieldKey)}
                        value={draft.score ?? ""}
                        onChange={(e) =>
                          updateResponseDraft(questionKey, question, {
                            score: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        style={getFieldSelectStyle(fieldKey)}
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

                  {peerRows.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Score Summary</h2>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              Aggregated from the per-question scores above.
            </div>
          </div>
          {scoreSummary.overallAverage !== null ? (
            <div className="chip" style={{ fontWeight: 700 }}>
              Overall {scoreSummary.overallAverage.toFixed(1)}/5
            </div>
          ) : null}
        </div>

        {scoreSummary.overallAverage === null ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            No question scores have been added yet.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
              {scoreSummary.questionRows.map((row, index) => (
                <div key={row.questionKey} className="surface-2" style={{ padding: "0.7rem 0.8rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>Q{index + 1}</div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>{row.questionText}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>{row.average.toFixed(1)}/5</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{row.count} score{row.count === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
              {scoreSummary.interviewerRows.map((row) => (
                <div
                  key={row.author.id}
                  style={{
                    borderLeft: `3px solid ${getInterviewerHighlight(row.author.id).border}`,
                    background: getInterviewerHighlight(row.author.id).background,
                    borderRadius: "8px",
                    padding: "0.6rem 0.7rem",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{row.author.name ?? row.author.email}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginTop: "0.2rem" }}>
                    Average {row.average.toFixed(1)}/5 across {row.count} scored answer{row.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Final Recommendation</h2>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Recommendation boxes autosave while you control them.
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "0.85rem", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>Outcome and level</div>
            {renderFieldToolbar(RECOMMENDATION_META_FIELD_KEY)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Outcome</label>
              <select
                className="input"
                disabled={!hasControl(RECOMMENDATION_META_FIELD_KEY)}
                value={recommendationDraft.recommendation}
                onChange={(e) =>
                  updateRecommendation(RECOMMENDATION_META_FIELD_KEY, {
                    recommendation: e.target.value as RecommendationDraft["recommendation"],
                  })
                }
                style={getFieldSelectStyle(RECOMMENDATION_META_FIELD_KEY)}
              >
                {Object.entries(RECOMMENDATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Recommended level</label>
              <select
                className="input"
                disabled={!hasControl(RECOMMENDATION_META_FIELD_KEY)}
                value={recommendationDraft.recommendedLevel}
                onChange={(e) =>
                  updateRecommendation(RECOMMENDATION_META_FIELD_KEY, {
                    recommendedLevel: e.target.value as RecommendationDraft["recommendedLevel"],
                  })
                }
                style={getFieldSelectStyle(RECOMMENDATION_META_FIELD_KEY)}
              >
                <option value="">No level set</option>
                {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Low / mid / high</label>
              <select
                className="input"
                disabled={!hasControl(RECOMMENDATION_META_FIELD_KEY)}
                value={recommendationDraft.levelCalibration}
                onChange={(e) =>
                  updateRecommendation(RECOMMENDATION_META_FIELD_KEY, {
                    levelCalibration: e.target.value as RecommendationDraft["levelCalibration"],
                  })
                }
                style={getFieldSelectStyle(RECOMMENDATION_META_FIELD_KEY)}
              >
                <option value="">No calibration</option>
                {Object.entries(CALIBRATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Alternative role</label>
              <select
                className="input"
                disabled={!hasControl(RECOMMENDATION_META_FIELD_KEY)}
                value={recommendationDraft.alternativeOpenPositionId}
                onChange={(e) =>
                  updateRecommendation(RECOMMENDATION_META_FIELD_KEY, {
                    alternativeOpenPositionId: e.target.value,
                  })
                }
                style={getFieldSelectStyle(RECOMMENDATION_META_FIELD_KEY)}
              >
                <option value="">No alternative role</option>
                {openPositions
                  .filter((position) => position.id !== workspace.candidate.openPosition?.id)
                  .map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                      {position.team ? ` · ${position.team}` : ""}
                      {position.level ? ` · ${position.level}` : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        <div className="form-group">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <label style={{ marginBottom: 0 }}>Internal recommendation summary</label>
            {renderFieldToolbar(RECOMMENDATION_SUMMARY_FIELD_KEY)}
          </div>
          <textarea
            className="input"
            rows={4}
            disabled={!hasControl(RECOMMENDATION_SUMMARY_FIELD_KEY)}
            placeholder="Examples: high Intermediate, low Senior; strong delivery, weaker architecture depth."
            value={recommendationDraft.summary}
            onChange={(e) => updateRecommendation(RECOMMENDATION_SUMMARY_FIELD_KEY, { summary: e.target.value })}
            style={getFieldInputStyle(RECOMMENDATION_SUMMARY_FIELD_KEY)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <label style={{ marginBottom: 0 }}>Feedback to share with candidate</label>
            {renderFieldToolbar(RECOMMENDATION_FEEDBACK_FIELD_KEY)}
          </div>
          <textarea
            className="input"
            rows={4}
            disabled={!hasControl(RECOMMENDATION_FEEDBACK_FIELD_KEY)}
            placeholder="Candidate-facing feedback and development points."
            value={recommendationDraft.candidateFeedback}
            onChange={(e) =>
              updateRecommendation(RECOMMENDATION_FEEDBACK_FIELD_KEY, { candidateFeedback: e.target.value })
            }
            style={getFieldInputStyle(RECOMMENDATION_FEEDBACK_FIELD_KEY)}
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
