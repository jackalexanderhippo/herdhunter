import {
  RECOMMENDATION_FEEDBACK_FIELD_KEY,
  RECOMMENDATION_META_FIELD_KEY,
  RECOMMENDATION_SUMMARY_FIELD_KEY,
  SHARED_NOTE_FIELD_KEY,
  getResponseFieldKey,
  getSectionFieldKey,
  nextInterviewWorkspaceLockExpiry,
} from "@/lib/interview-workspace";
import { auth } from "@/lib/auth";
import { POC_OPEN_ACCESS, canConductInterviews } from "@/lib/access";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { Prisma } from "@prisma/client";
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

async function cleanupExpiredLocks(interviewId: string) {
  await prisma.interviewWorkspaceLock.deleteMany({
    where: {
      interviewId,
      expiresAt: { lte: new Date() },
    },
  });
}

function uniqueFieldKeys(fieldKeys: string[]) {
  return [...new Set(fieldKeys.map((fieldKey) => fieldKey.trim()).filter(Boolean))];
}

function lockConflictResponse(lock: {
  fieldKey: string;
  lockedBy: { name: string | null; email: string | null } | null;
}) {
  const holder = lock.lockedBy?.name ?? lock.lockedBy?.email ?? "another interviewer";
  return NextResponse.json(
    {
      error: `${holder} is currently controlling this box.`,
      fieldKey: lock.fieldKey,
      lock,
    },
    { status: 409 },
  );
}

async function requireOwnedLocks(interviewId: string, userId: string, fieldKeys: string[]) {
  const keys = uniqueFieldKeys(fieldKeys);
  if (keys.length === 0) {
    return null;
  }

  await cleanupExpiredLocks(interviewId);
  const locks = await prisma.interviewWorkspaceLock.findMany({
    where: { interviewId, fieldKey: { in: keys } },
    include: { lockedBy: { select: PUBLIC_USER_SELECT } },
  });

  for (const lock of locks) {
    if (lock.lockedById !== userId) {
      return lockConflictResponse(lock);
    }
  }

  const missingFieldKey = keys.find((fieldKey) => !locks.some((lock) => lock.fieldKey === fieldKey));
  if (missingFieldKey) {
    return NextResponse.json(
      {
        error: "Take control of this box before editing.",
        fieldKey: missingFieldKey,
      },
      { status: 409 },
    );
  }

  return null;
}

async function extendOwnedLocks(interviewId: string, userId: string, fieldKeys: string[]) {
  const keys = uniqueFieldKeys(fieldKeys);
  if (keys.length === 0) return;

  await prisma.interviewWorkspaceLock.updateMany({
    where: {
      interviewId,
      lockedById: userId,
      fieldKey: { in: keys },
    },
    data: { expiresAt: nextInterviewWorkspaceLockExpiry() },
  });
}

async function loadWorkspace(interviewId: string) {
  await cleanupExpiredLocks(interviewId);

  return prisma.interview.findUnique({
    where: { id: interviewId },
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
      workspaceLocks: {
        include: { lockedBy: { select: PUBLIC_USER_SELECT } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const interview = await loadWorkspace(id);

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

  if (action === "acquire-lock") {
    const fieldKey = body?.fieldKey?.toString().trim();
    const force = body?.force === true;
    if (!fieldKey) return NextResponse.json({ error: "fieldKey is required" }, { status: 400 });

    await cleanupExpiredLocks(id);
    const existing = await prisma.interviewWorkspaceLock.findUnique({
      where: { interviewId_fieldKey: { interviewId: id, fieldKey } },
      include: { lockedBy: { select: PUBLIC_USER_SELECT } },
    });

    if (existing && existing.lockedById !== session.user.id && !force) {
      return lockConflictResponse(existing);
    }

    const lock = existing
      ? await prisma.interviewWorkspaceLock.update({
          where: { interviewId_fieldKey: { interviewId: id, fieldKey } },
          data: {
            lockedById: session.user.id,
            expiresAt: nextInterviewWorkspaceLockExpiry(),
          },
          include: { lockedBy: { select: PUBLIC_USER_SELECT } },
        })
      : await prisma.interviewWorkspaceLock.create({
          data: {
            interviewId: id,
            fieldKey,
            lockedById: session.user.id,
            expiresAt: nextInterviewWorkspaceLockExpiry(),
          },
          include: { lockedBy: { select: PUBLIC_USER_SELECT } },
        });

    return NextResponse.json(lock);
  }

  if (action === "release-lock") {
    const fieldKey = body?.fieldKey?.toString().trim();
    if (!fieldKey) return NextResponse.json({ error: "fieldKey is required" }, { status: 400 });

    await prisma.interviewWorkspaceLock.deleteMany({
      where: {
        interviewId: id,
        fieldKey,
        lockedById: session.user.id,
      },
    });

    return NextResponse.json({ released: true, fieldKey });
  }

  if (action === "touch-locks" || action === "release-locks") {
    const fieldKeys = uniqueFieldKeys(Array.isArray(body?.fieldKeys) ? body.fieldKeys.map(String) : []);
    if (fieldKeys.length === 0) {
      return NextResponse.json({ error: "fieldKeys are required" }, { status: 400 });
    }

    if (action === "touch-locks") {
      await cleanupExpiredLocks(id);
      await extendOwnedLocks(id, session.user.id, fieldKeys);
      const locks = await prisma.interviewWorkspaceLock.findMany({
        where: {
          interviewId: id,
          lockedById: session.user.id,
          fieldKey: { in: fieldKeys },
        },
        include: { lockedBy: { select: PUBLIC_USER_SELECT } },
      });
      return NextResponse.json(locks);
    }

    await prisma.interviewWorkspaceLock.deleteMany({
      where: {
        interviewId: id,
        lockedById: session.user.id,
        fieldKey: { in: fieldKeys },
      },
    });
    return NextResponse.json({ released: true, fieldKeys });
  }

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
    const conflict = await requireOwnedLocks(id, session.user.id, [SHARED_NOTE_FIELD_KEY]);
    if (conflict) return conflict;

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

    await extendOwnedLocks(id, session.user.id, [SHARED_NOTE_FIELD_KEY]);
    return NextResponse.json(updated);
  }

  if (action === "responses") {
    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "items are required" }, { status: 400 });
    }

    const parsed = items.map((raw) => {
      const item = raw as {
        fieldKey?: string;
        questionKey?: string;
        questionText?: string;
        answer?: string;
        score?: number | null;
      };
      const questionKey = item.questionKey?.toString();
      if (!questionKey) return null;
      return {
        fieldKey: item.fieldKey?.toString().trim() || getResponseFieldKey(questionKey),
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

    const conflict = await requireOwnedLocks(
      id,
      session.user.id,
      validItems.map((item) => item.fieldKey),
    );
    if (conflict) return conflict;

    await prisma.$transaction([
      ...validItems.map((item) =>
        prisma.interviewQuestionResponse.upsert({
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
        }),
      ),
      prisma.interviewWorkspaceLock.updateMany({
        where: {
          interviewId: id,
          lockedById: session.user.id,
          fieldKey: { in: uniqueFieldKeys(validItems.map((item) => item.fieldKey)) },
        },
        data: { expiresAt: nextInterviewWorkspaceLockExpiry() },
      }),
    ]);

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
      const item = raw as { fieldKey?: string; section?: string; score?: number; notes?: string };
      const section = item.section?.toString().trim();
      if (!section || typeof item.score !== "number" || item.score < 1 || item.score > 5) {
        return null;
      }
      return {
        fieldKey: item.fieldKey?.toString().trim() || getSectionFieldKey(section),
        section,
        score: item.score,
        notes: item.notes?.toString().trim() || null,
      };
    });
    if (parsed.some((p) => p === null)) {
      return NextResponse.json({ error: "Invalid section score payload" }, { status: 400 });
    }
    const validItems = parsed.filter((p): p is NonNullable<typeof p> => p !== null);

    const conflict = await requireOwnedLocks(
      id,
      session.user.id,
      validItems.map((item) => item.fieldKey),
    );
    if (conflict) return conflict;

    await prisma.$transaction([
      ...validItems.map((item) =>
        prisma.interviewSectionScore.upsert({
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
        }),
      ),
      prisma.interviewWorkspaceLock.updateMany({
        where: {
          interviewId: id,
          lockedById: session.user.id,
          fieldKey: { in: uniqueFieldKeys(validItems.map((item) => item.fieldKey)) },
        },
        data: { expiresAt: nextInterviewWorkspaceLockExpiry() },
      }),
    ]);

    const mine = await prisma.interviewSectionScore.findMany({
      where: { interviewId: id, authorId: session.user.id },
      orderBy: { section: "asc" },
    });
    return NextResponse.json(mine);
  }

  if (action === "recommendation") {
    const fieldKey = body?.fieldKey?.toString().trim() || null;
    const allowedFieldKeys = [
      RECOMMENDATION_META_FIELD_KEY,
      RECOMMENDATION_SUMMARY_FIELD_KEY,
      RECOMMENDATION_FEEDBACK_FIELD_KEY,
    ];

    if (fieldKey && !allowedFieldKeys.includes(fieldKey)) {
      return NextResponse.json({ error: "Invalid recommendation fieldKey" }, { status: 400 });
    }

    if (fieldKey) {
      const conflict = await requireOwnedLocks(id, session.user.id, [fieldKey]);
      if (conflict) return conflict;
    }

    const updateData: Prisma.InterviewRecommendationUncheckedUpdateInput = {};
    const createData: Prisma.InterviewRecommendationUncheckedCreateInput = {
      interviewId: id,
      authorId: session.user.id,
      recommendation: "PROCEED_TO_NEXT_ROUND",
      recommendedLevel: null,
      levelCalibration: null,
      alternativeOpenPositionId: null,
      summary: "",
      candidateFeedback: "",
    };

    const updatesMeta = !fieldKey || fieldKey === RECOMMENDATION_META_FIELD_KEY;
    const updatesSummary = !fieldKey || fieldKey === RECOMMENDATION_SUMMARY_FIELD_KEY;
    const updatesFeedback = !fieldKey || fieldKey === RECOMMENDATION_FEEDBACK_FIELD_KEY;

    if (updatesMeta) {
      const recommendation = body?.recommendation?.toString();
      if (!recommendation) {
        return NextResponse.json({ error: "recommendation is required" }, { status: 400 });
      }

      const recommendedLevel = body?.recommendedLevel?.toString() || null;
      const levelCalibration = body?.levelCalibration?.toString() || null;
      const alternativeOpenPositionId = body?.alternativeOpenPositionId?.toString().trim() || null;

      if (alternativeOpenPositionId) {
        const openPosition = await prisma.openPosition.findUnique({
          where: { id: alternativeOpenPositionId },
          select: { id: true },
        });
        if (!openPosition) {
          return NextResponse.json({ error: "Alternative open position not found" }, { status: 400 });
        }
      }

      updateData.recommendation = recommendation;
      updateData.recommendedLevel = recommendedLevel;
      updateData.levelCalibration = levelCalibration;
      updateData.alternativeOpenPositionId = alternativeOpenPositionId;
      createData.recommendation = recommendation;
      createData.recommendedLevel = recommendedLevel;
      createData.levelCalibration = levelCalibration;
      createData.alternativeOpenPositionId = alternativeOpenPositionId;
    }

    if (updatesSummary) {
      const summary = body?.summary?.toString() ?? "";
      updateData.summary = summary;
      createData.summary = summary;
    }

    if (updatesFeedback) {
      const candidateFeedback = body?.candidateFeedback?.toString() ?? "";
      updateData.candidateFeedback = candidateFeedback;
      createData.candidateFeedback = candidateFeedback;
    }

    const saved = await prisma.interviewRecommendation.upsert({
      where: {
        interviewId_authorId: {
          interviewId: id,
          authorId: session.user.id,
        },
      },
      update: updateData,
      create: createData,
      include: {
        author: { select: PUBLIC_USER_SELECT },
        alternativeOpenPosition: { select: { id: true, title: true, level: true, team: true } },
      },
    });

    if (fieldKey) {
      await extendOwnedLocks(id, session.user.id, [fieldKey]);
    }

    return NextResponse.json(saved);
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
