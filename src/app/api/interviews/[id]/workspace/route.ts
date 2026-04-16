import { auth } from "@/lib/auth";
import { POC_OPEN_ACCESS, canConductInterviews } from "@/lib/access";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

function isInterviewerRole(role: string) {
  return canConductInterviews(role);
}

async function canEditInterview(interviewId: string, userId: string, role: string) {
  if (POC_OPEN_ACCESS) return true;
  if (role === "ADMIN_INTERVIEWER") return true;
  if (!isInterviewerRole(role)) return false;
  const assignment = await prisma.interviewInterviewer.findUnique({
    where: { interviewId_userId: { interviewId, userId } },
    select: { interviewId: true },
  });
  return Boolean(assignment);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      candidate: {
        select: {
          id: true,
          name: true,
          position: true,
          status: true,
          openPosition: { select: { id: true, title: true, level: true, targetHires: true } },
        },
      },
      template: true,
      interviewers: { include: { user: { select: PUBLIC_USER_SELECT } } },
      notes: { include: { author: { select: PUBLIC_USER_SELECT } }, orderBy: { createdAt: "desc" } },
      sharedNote: { include: { updatedBy: { select: PUBLIC_USER_SELECT } } },
      questionResponses: { include: { author: { select: PUBLIC_USER_SELECT } }, orderBy: { updatedAt: "desc" } },
      sectionScores: { include: { author: { select: PUBLIC_USER_SELECT } }, orderBy: { updatedAt: "desc" } },
      recommendations: {
        include: {
          author: { select: PUBLIC_USER_SELECT },
          alternativeOpenPosition: { select: { id: true, title: true, level: true, team: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(interview);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const canEdit = await canEditInterview(id, session.user.id, session.user.role);
  if (!canEdit) {
    return NextResponse.json({ error: "Only assigned interviewers can update this workspace" }, { status: 403 });
  }

  const action = body?.action;

  if (action === "note") {
    const content = body?.content?.toString().trim();
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });
    const rating = typeof body?.rating === "number" ? body.rating : null;

    const note = await prisma.interviewNote.create({
      data: {
        interviewId: id,
        authorId: session.user.id,
        content,
        rating,
      },
      include: { author: { select: PUBLIC_USER_SELECT } },
    });
    return NextResponse.json(note, { status: 201 });
  }

  if (action === "shared-note") {
    const content = body?.content?.toString() ?? "";
    const baseVersion = typeof body?.baseVersion === "number" ? body.baseVersion : null;

    const existing = await prisma.interviewSharedNote.findUnique({ where: { interviewId: id } });
    if (existing && baseVersion !== null && existing.version !== baseVersion) {
      return NextResponse.json(
        { error: "Version conflict", current: existing },
        { status: 409 },
      );
    }

    const updated = await prisma.interviewSharedNote.upsert({
      where: { interviewId: id },
      update: {
        content,
        version: { increment: 1 },
        updatedById: session.user.id,
      },
      create: {
        interviewId: id,
        content,
        version: 1,
        updatedById: session.user.id,
      },
      include: { updatedBy: { select: PUBLIC_USER_SELECT } },
    });
    return NextResponse.json(updated);
  }

  if (action === "responses") {
    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "items are required" }, { status: 400 });
    }

    const parsed = items.map((raw) => {
      const item = raw as {
        questionKey?: string;
        questionText?: string;
        answer?: string;
        score?: number | null;
      };
      const questionKey = item.questionKey?.toString();
      if (!questionKey) return null;
      return {
        questionKey,
        questionText: item.questionText?.toString() ?? "",
        answer: item.answer?.toString() ?? "",
        score: typeof item.score === "number" ? item.score : null,
      };
    });
    if (parsed.some((p) => p === null)) {
      return NextResponse.json({ error: "questionKey is required for every item" }, { status: 400 });
    }
    const validItems = parsed.filter((p): p is NonNullable<typeof p> => p !== null);

    await prisma.$transaction(
      validItems.map((item) => {
        return prisma.interviewQuestionResponse.upsert({
          where: {
            interviewId_authorId_questionKey: {
              interviewId: id,
              authorId: session.user.id,
              questionKey: item.questionKey,
            },
          },
          update: {
            questionText: item.questionText,
            answer: item.answer,
            score: item.score,
          },
          create: {
            interviewId: id,
            authorId: session.user.id,
            questionKey: item.questionKey,
            questionText: item.questionText,
            answer: item.answer,
            score: item.score,
          },
        });
      }),
    );

    const mine = await prisma.interviewQuestionResponse.findMany({
      where: { interviewId: id, authorId: session.user.id },
      orderBy: { questionKey: "asc" },
    });
    return NextResponse.json(mine);
  }

  if (action === "section-scores") {
    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "items are required" }, { status: 400 });
    }

    const parsed = items.map((raw) => {
      const item = raw as { section?: string; score?: number; notes?: string };
      const section = item.section?.toString().trim();
      if (!section || typeof item.score !== "number" || item.score < 1 || item.score > 5) {
        return null;
      }
      return {
        section,
        score: item.score,
        notes: item.notes?.toString().trim() || null,
      };
    });
    if (parsed.some((p) => p === null)) {
      return NextResponse.json({ error: "Invalid section score payload" }, { status: 400 });
    }
    const validItems = parsed.filter((p): p is NonNullable<typeof p> => p !== null);

    await prisma.$transaction(
      validItems.map((item) => {
        return prisma.interviewSectionScore.upsert({
          where: {
            interviewId_authorId_section: {
              interviewId: id,
              authorId: session.user.id,
              section: item.section,
            },
          },
          update: {
            score: item.score,
            notes: item.notes,
          },
          create: {
            interviewId: id,
            authorId: session.user.id,
            section: item.section,
            score: item.score,
            notes: item.notes,
          },
        });
      }),
    );

    const mine = await prisma.interviewSectionScore.findMany({
      where: { interviewId: id, authorId: session.user.id },
      orderBy: { section: "asc" },
    });
    return NextResponse.json(mine);
  }

  if (action === "recommendation") {
    const recommendation = body?.recommendation?.toString();
    const recommendedLevel = body?.recommendedLevel?.toString() || null;
    const levelCalibration = body?.levelCalibration?.toString() || null;
    const alternativeOpenPositionId = body?.alternativeOpenPositionId?.toString().trim() || null;
    const summary = body?.summary?.toString() ?? "";
    const candidateFeedback = body?.candidateFeedback?.toString() ?? "";

    if (!recommendation) {
      return NextResponse.json({ error: "recommendation is required" }, { status: 400 });
    }

    if (alternativeOpenPositionId) {
      const openPosition = await prisma.openPosition.findUnique({
        where: { id: alternativeOpenPositionId },
        select: { id: true },
      });
      if (!openPosition) {
        return NextResponse.json({ error: "Alternative open position not found" }, { status: 400 });
      }
    }

    const saved = await prisma.interviewRecommendation.upsert({
      where: {
        interviewId_authorId: {
          interviewId: id,
          authorId: session.user.id,
        },
      },
      update: {
        recommendation,
        recommendedLevel,
        levelCalibration,
        alternativeOpenPositionId,
        summary,
        candidateFeedback,
      },
      create: {
        interviewId: id,
        authorId: session.user.id,
        recommendation,
        recommendedLevel,
        levelCalibration,
        alternativeOpenPositionId,
        summary,
        candidateFeedback,
      },
      include: {
        author: { select: PUBLIC_USER_SELECT },
        alternativeOpenPosition: { select: { id: true, title: true, level: true, team: true } },
      },
    });

    return NextResponse.json(saved);
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
