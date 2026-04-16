import { auth } from "@/lib/auth";
import { canAccessAdminArea, canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const candidate = await prisma.candidate.findUnique({
        where: { id },
        include: {
            profession: true,
            openPosition: true,
            assessments: {
                include: {
                    openPosition: true,
                    updatedBy: { select: PUBLIC_USER_SELECT },
                },
                orderBy: { updatedAt: "desc" },
            },
            notes: { include: { author: { select: PUBLIC_USER_SELECT } }, orderBy: { createdAt: "desc" } },
            chatMessages: { include: { author: { select: PUBLIC_USER_SELECT } }, orderBy: { createdAt: "asc" } },
            interviews: {
                include: {
                    interviewers: { include: { user: { select: PUBLIC_USER_SELECT } } },
                    notes: { include: { author: { select: PUBLIC_USER_SELECT } }, orderBy: { createdAt: "desc" } },
                    template: true,
                    questionResponses: { include: { author: { select: PUBLIC_USER_SELECT } } },
                    sectionScores: { include: { author: { select: PUBLIC_USER_SELECT } } },
                    recommendations: {
                        include: {
                            author: { select: PUBLIC_USER_SELECT },
                            alternativeOpenPosition: { select: { id: true, title: true, level: true, team: true } },
                        },
                        orderBy: { updatedAt: "desc" },
                    },
                },
                orderBy: { scheduledAt: "asc" },
            },
        },
    });

    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(candidate);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageCandidates(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const updateData = { ...body } as Record<string, unknown>;
    const existing = await prisma.candidate.findUnique({
        where: { id },
        select: { id: true, position: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (Object.prototype.hasOwnProperty.call(body, "openPositionId")) {
        const openPositionId =
            typeof body.openPositionId === "string" && body.openPositionId.trim().length > 0
                ? body.openPositionId.trim()
                : null;
        updateData.openPositionId = openPositionId;

        if (openPositionId) {
            const openPosition = await prisma.openPosition.findUnique({
                where: { id: openPositionId },
                select: { title: true, level: true },
            });
            if (!openPosition) {
                return NextResponse.json({ error: "Open position not found" }, { status: 400 });
            }
            updateData.position = openPosition.title;
            if (!body.salaryExpectationBand) updateData.salaryExpectationBand = openPosition.level ?? null;
            if (!body.recommendedBand) updateData.recommendedBand = openPosition.level ?? null;
        } else if (typeof body.position !== "string" || !body.position.trim()) {
            updateData.position = existing.position;
        }
    }

    const candidate = await prisma.candidate.update({
        where: { id },
        data: updateData,
        include: { profession: true, openPosition: true },
    });

    return NextResponse.json(candidate);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessAdminArea(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.candidate.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
