import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

function normalizeOptionalString(value: unknown) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

async function resolveTemplateStageName(templateId: unknown) {
    const normalizedTemplateId = normalizeOptionalString(templateId);
    if (!normalizedTemplateId) return null;

    const template = await prisma.interviewTemplate.findUnique({
        where: { id: normalizedTemplateId },
        select: { name: true },
    });

    return template?.name ?? null;
}

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const interviews = await prisma.interview.findMany({
        include: {
            candidate: { include: { profession: true, openPosition: true } },
            interviewers: { include: { user: { select: PUBLIC_USER_SELECT } } },
            notes: { include: { author: { select: PUBLIC_USER_SELECT } } },
            template: true,
            sectionScores: true,
        },
        orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json(interviews);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
        candidateId,
        scheduledAt,
        interviewerIds,
        templateId,
        calendarEventId,
    } = await req.json();
    if (!candidateId || !scheduledAt) {
        return NextResponse.json({ error: "candidateId and scheduledAt are required" }, { status: 400 });
    }

    const latestInterview = await prisma.interview.findFirst({
        where: { candidateId },
        orderBy: { stage: "desc" },
        select: { stage: true },
    });
    const resolvedTemplateId = normalizeOptionalString(templateId);
    const nextStage = (latestInterview?.stage ?? 0) + 1;
    const stageName = await resolveTemplateStageName(resolvedTemplateId);

    const interview = await prisma.interview.create({
        data: {
            candidateId,
            scheduledAt: new Date(scheduledAt),
            location: null,
            stage: nextStage,
            stageName,
            templateId: resolvedTemplateId,
            calendarEventId: normalizeOptionalString(calendarEventId),
            calendarEventUrl: null,
            geminiNotes: null,
            geminiNotesImportedAt: null,
            interviewers: {
                create: (interviewerIds ?? [])
                    .filter((userId: unknown): userId is string => typeof userId === "string" && userId.trim().length > 0)
                    .map((userId: string) => ({ userId })),
            },
        },
        include: {
            candidate: { include: { openPosition: true } },
            interviewers: { include: { user: { select: PUBLIC_USER_SELECT } } },
            template: true,
        },
    });

    await prisma.candidate.update({ where: { id: candidateId }, data: { status: "INTERVIEW_SCHEDULED" } });

    return NextResponse.json(interview, { status: 201 });
}
