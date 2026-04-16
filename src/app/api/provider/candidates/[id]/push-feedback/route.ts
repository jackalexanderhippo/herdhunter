import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getRecruitmentSource } from "@/lib/recruitment-source";
import { mergeSourceMetadata, parseSourceMetadata } from "@/lib/recruitment-source/metadata";
import { NextResponse } from "next/server";

type CandidateWithInterviewRecommendations = {
  name: string;
  interviews: Array<{
    stage: number;
    stageName: string | null;
    scheduledAt: Date;
    recommendations: Array<{
      recommendation: "UNSUCCESSFUL" | "YES_AT_DIFFERENT_LEVEL" | "PROCEED_TO_NEXT_ROUND";
      recommendedLevel: "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "LEAD" | "PRINCIPAL" | null;
      levelCalibration: "LOW" | "MID" | "HIGH" | null;
      summary: string;
      candidateFeedback: string;
      updatedAt: Date;
      alternativeOpenPosition?: {
        title: string;
        level: string | null;
      } | null;
      author: {
        name: string | null;
      };
    }>;
  }>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function buildRecommendationHtml(candidate: CandidateWithInterviewRecommendations) {
  const latestInterview = [...candidate.interviews].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  )[0];
  if (!latestInterview) {
    throw new Error("No interviews found for this candidate");
  }

  const recommendations = [...latestInterview.recommendations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  if (recommendations.length === 0) {
    throw new Error("No interviewer recommendations found to push");
  }

  const primary = recommendations[0];
  const recommendationLabel = primary.recommendation.replaceAll("_", " ").toLowerCase();
  const levelLabel = primary.recommendedLevel
    ? `${primary.levelCalibration ? `${primary.levelCalibration.toLowerCase()} ` : ""}${primary.recommendedLevel.toLowerCase()}`
    : "No level recommendation";

  const recommendationHtml = recommendations.map((row) => {
    const rowLevel = row.recommendedLevel
      ? `${row.levelCalibration ? `${row.levelCalibration.toLowerCase()} ` : ""}${row.recommendedLevel.toLowerCase()}`
      : "No level recommendation";
    const alternativeRole = row.alternativeOpenPosition
      ? `${row.alternativeOpenPosition.title}${row.alternativeOpenPosition.level ? ` (${row.alternativeOpenPosition.level})` : ""}`
      : "";
    return `<li><strong>${escapeHtml(row.author.name ?? "Unknown interviewer")}</strong>: ${escapeHtml(row.recommendation.replaceAll("_", " ").toLowerCase())} (${escapeHtml(rowLevel)})${alternativeRole ? `<br/><em>Alternative role:</em> ${escapeHtml(alternativeRole)}` : ""}${row.summary ? `<br/>${escapeHtml(row.summary)}` : ""}${row.candidateFeedback ? `<br/><em>Candidate feedback:</em> ${escapeHtml(row.candidateFeedback)}` : ""}</li>`;
  }).join("");

  const summaryHtml = [
    `<h3>${escapeHtml(candidate.name)}</h3>`,
    `<p><strong>Outcome:</strong> ${escapeHtml(recommendationLabel)}</p>`,
    `<p><strong>Level recommendation:</strong> ${escapeHtml(levelLabel)}</p>`,
    primary.summary ? `<p><strong>Internal summary:</strong><br/>${escapeHtml(primary.summary)}</p>` : "",
    primary.candidateFeedback ? `<p><strong>Candidate feedback:</strong><br/>${escapeHtml(primary.candidateFeedback)}</p>` : "",
    primary.alternativeOpenPosition ? `<p><strong>Alternative role:</strong> ${escapeHtml(primary.alternativeOpenPosition.title)}${primary.alternativeOpenPosition.level ? ` (${escapeHtml(primary.alternativeOpenPosition.level)})` : ""}</p>` : "",
    `<p><strong>Interviewer recommendations</strong></p><ul>${recommendationHtml}</ul>`,
    `<p><strong>Interview:</strong> Stage ${latestInterview.stage}${latestInterview.stageName ? ` - ${escapeHtml(latestInterview.stageName)}` : ""}</p>`,
  ].filter(Boolean).join("");

  return {
    latestInterview,
    primary,
    summaryHtml,
    summaryText: `${candidate.name}: ${recommendationLabel}${primary.recommendedLevel ? ` (${levelLabel})` : ""}`,
  };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCandidates(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      openPosition: true,
      interviews: {
        include: {
          recommendations: {
            include: {
              author: true,
              alternativeOpenPosition: { select: { title: true, level: true } },
            },
            orderBy: { updatedAt: "desc" },
          },
        },
        orderBy: { scheduledAt: "desc" },
      },
    },
  });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (!candidate.eployCandidateId) {
    return NextResponse.json({ error: "Candidate has no external source ID" }, { status: 400 });
  }
  if (!candidate.openPosition?.eployPositionId) {
    return NextResponse.json({ error: "Linked open position has no external vacancy ID" }, { status: 400 });
  }

  try {
    const metadata = parseSourceMetadata(candidate.eployMetadata);
    const integration = metadata.integration && typeof metadata.integration === "object"
      ? metadata.integration as Record<string, unknown>
      : {};

    const recommendation = buildRecommendationHtml(candidate);
    const result = await getRecruitmentSource().pushInterviewFeedback({
      candidateExternalId: candidate.eployCandidateId,
      vacancyExternalId: candidate.openPosition.eployPositionId,
      existingActionId: typeof integration.actionId === "string" ? integration.actionId : null,
      summaryHtml: recommendation.summaryHtml,
      recommendationKey: recommendation.primary.recommendation,
      externalProviderUrl: null,
    });

    const updated = await prisma.candidate.update({
      where: { id },
      data: {
        eployFeedbackSummary: recommendation.summaryText,
        eployFeedbackPushedAt: new Date(result.pushedAt),
        eployMetadata: mergeSourceMetadata(candidate.eployMetadata, {
          provider: "eploy",
          integration: {
            ...integration,
            actionId: result.actionId ?? null,
            lastFeedbackPushAt: result.pushedAt,
          },
        }),
      },
      include: { profession: true, openPosition: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to push feedback" },
      { status: 400 },
    );
  }
}
