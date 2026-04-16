import { auth } from "@/lib/auth";
import { canAccessAdminArea } from "@/lib/access";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessAdminArea(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const invitations = await prisma.invitation.findMany({
        include: { invitedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invitations);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessAdminArea(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, role } = await req.json() as { email: string; role: Role };
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    // Check if already invited and pending
    const existing = await prisma.invitation.findFirst({
        where: { email, usedAt: null },
    });
    if (existing) {
        return NextResponse.json({ error: "Pending invitation already exists for this email" }, { status: 409 });
    }

    const invitation = await prisma.invitation.create({
        data: {
            email,
            role: role ?? "HIRING_TEAM",
            invitedById: session.user.id,
        },
    });

    return NextResponse.json(invitation, { status: 201 });
}
