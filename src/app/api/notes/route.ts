import { auth } from "@/lib/auth";
import { canConductInterviews } from "@/lib/access";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { content, type, candidateId, interviewId, rating } = await req.json();

    if (interviewId) {
        if (!canConductInterviews(session.user.role)) {
            return NextResponse.json({ error: "Only interviewers can add interview notes" }, { status: 403 });
        }
        const note = await prisma.interviewNote.create({
            data: { content, rating: rating ?? null, authorId: session.user.id, interviewId },
            include: { author: { select: PUBLIC_USER_SELECT } },
        });
        return NextResponse.json(note, { status: 201 });
    }

    if (!candidateId) {
        return NextResponse.json({ error: "candidateId or interviewId required" }, { status: 400 });
    }

    const note = await prisma.note.create({
        data: { content, type: type ?? "GENERAL", authorId: session.user.id, candidateId },
        include: { author: { select: PUBLIC_USER_SELECT } },
    });
    return NextResponse.json(note, { status: 201 });
}

export async function DELETE(req: Request) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type");

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (type === "interview") {
        await prisma.interviewNote.delete({ where: { id } });
    } else {
        await prisma.note.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
}
