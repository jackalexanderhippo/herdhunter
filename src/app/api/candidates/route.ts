import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const candidates = await prisma.candidate.findMany({
        include: { profession: true, openPosition: true, _count: { select: { notes: true, interviews: true } } },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(candidates);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageCandidates(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
        name,
        email,
        phone,
        openPositionId,
        professionId,
        status,
        noticePeriodDays,
        salaryExpectation,
        recommendedSalary,
        eployCandidateId,
        eployMetadata,
        eployLastSyncAt,
        eployFeedbackSummary,
        eployFeedbackPushedAt,
    } = body;

    const normalizedOpenPositionId = typeof openPositionId === "string" ? openPositionId.trim() : "";
    if (!name || !normalizedOpenPositionId) {
        return NextResponse.json({ error: "Name and open position are required" }, { status: 400 });
    }

    const openPosition = await prisma.openPosition.findUnique({
        where: { id: normalizedOpenPositionId },
        select: { title: true },
    });
    if (!openPosition) {
        return NextResponse.json({ error: "Open position not found" }, { status: 400 });
    }

    const candidate = await prisma.candidate.create({
        data: {
            name,
            email,
            phone,
            position: openPosition.title,
            openPositionId: normalizedOpenPositionId,
            professionId: professionId || null,
            status: status || "NEW",
            noticePeriodDays: typeof noticePeriodDays === "number" ? noticePeriodDays : null,
            salaryExpectation: typeof salaryExpectation === "number" ? salaryExpectation : null,
            recommendedSalary: typeof recommendedSalary === "number" ? recommendedSalary : null,
            eployCandidateId: typeof eployCandidateId === "string" ? eployCandidateId.trim() || null : null,
            eployMetadata: typeof eployMetadata === "string" ? eployMetadata : null,
            eployLastSyncAt: typeof eployLastSyncAt === "string" ? new Date(eployLastSyncAt) : null,
            eployFeedbackSummary: typeof eployFeedbackSummary === "string" ? eployFeedbackSummary : null,
            eployFeedbackPushedAt: typeof eployFeedbackPushedAt === "string" ? new Date(eployFeedbackPushedAt) : null,
        },
        include: { profession: true, openPosition: true },
    });

    return NextResponse.json(candidate, { status: 201 });
}
