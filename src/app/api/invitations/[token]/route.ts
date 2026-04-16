import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Public endpoint — used by auth callback to lookup invitation by token
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    const invitation = await prisma.invitation.findUnique({
        where: { token },
        select: { id: true, email: true, role: true, usedAt: true },
    });

    if (!invitation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invitation);
}
