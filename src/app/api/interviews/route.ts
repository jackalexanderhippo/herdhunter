import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

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
        location,
        interviewerIds,
        stage,
        stageName,
        templateId,
        calendarEventId,
        calendarEventUrl,
        geminiNotes,
        geminiNotesImportedAt,
    } = await req.json();
    if (!candidateId || !scheduledAt) {
        return NextResponse.json({ error: "candidateId and scheduledAt are required" }, { status: 400 });
    }

    const interview = await prisma.interview.create({
        data: {
            candidateId,
            scheduledAt: new Date(scheduledAt),
            location,
            stage: stage ?? 1,
            stageName: stageName ?? null,
            templateId: templateId ?? null,
            calendarEventId: calendarEventId ?? null,
            calendarEventUrl: calendarEventUrl ?? null,
            geminiNotes: geminiNotes ?? null,
            geminiNotesImportedAt: geminiNotesImportedAt ? new Date(geminiNotesImportedAt) : null,
            interviewers: {
                create: (interviewerIds ?? []).map((userId: string) => ({ userId })),
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
