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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const interview = await prisma.interview.findUnique({
        where: { id },
        include: {
            candidate: { include: { profession: true, openPosition: true } },
            interviewers: { include: { user: { select: PUBLIC_USER_SELECT } } },
            notes: { include: { author: { select: PUBLIC_USER_SELECT } }, orderBy: { createdAt: "desc" } },
            template: true,
            sectionScores: { include: { author: { select: PUBLIC_USER_SELECT } } },
        },
    });

    if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(interview);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const {
        status,
        templateId,
        scheduledAt,
        calendarEventId,
        interviewerIds,
    } = await req.json();
    const hasTemplateUpdate = templateId !== undefined;
    const resolvedTemplateId = hasTemplateUpdate ? normalizeOptionalString(templateId) : undefined;
    const resolvedStageName = hasTemplateUpdate ? await resolveTemplateStageName(templateId) : undefined;

    const interview = await prisma.interview.update({
        where: { id },
        data: {
            ...(status !== undefined && { status }),
            ...(hasTemplateUpdate && { templateId: resolvedTemplateId, stageName: resolvedStageName }),
            ...(scheduledAt !== undefined && { scheduledAt: new Date(scheduledAt) }),
            ...(calendarEventId !== undefined && { calendarEventId: normalizeOptionalString(calendarEventId) }),
            ...(interviewerIds !== undefined && Array.isArray(interviewerIds) && {
                interviewers: {
                    deleteMany: {},
                    create: interviewerIds
                        .filter((userId: unknown): userId is string => typeof userId === "string" && userId.trim().length > 0)
                        .map((userId: string) => ({ userId })),
                },
            }),
        },
        include: { template: true, interviewers: { include: { user: { select: PUBLIC_USER_SELECT } } } },
    });
    return NextResponse.json(interview);
}
