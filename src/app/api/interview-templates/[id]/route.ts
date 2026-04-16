import { auth } from "@/lib/auth";
import { canAccessAdminArea, canManageTemplates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!canManageTemplates(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { name, description, questions } = await req.json();

    const template = await prisma.interviewTemplate.update({
        where: { id },
        data: {
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(questions !== undefined && { questions: JSON.stringify(questions) }),
        },
    });

    return NextResponse.json(template);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!canAccessAdminArea(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.interviewTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
