import { auth } from "@/lib/auth";
import { canManageTemplates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const templates = await prisma.interviewTemplate.findMany({
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageTemplates(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, description, questions } = await req.json();
    if (!name || !Array.isArray(questions)) {
        return NextResponse.json({ error: "name and questions array required" }, { status: 400 });
    }

    const template = await prisma.interviewTemplate.create({
        data: {
            name,
            description: description ?? null,
            questions: JSON.stringify(questions),
            createdById: session.user.id,
        },
        include: { createdBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(template, { status: 201 });
}
