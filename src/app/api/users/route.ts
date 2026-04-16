import { auth } from "@/lib/auth";
import { canAccessAdminArea } from "@/lib/access";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const users = await prisma.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: { name: "asc" } });
    return NextResponse.json(users);
}

export async function PATCH(req: Request) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessAdminArea(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, role } = await req.json();
    const user = await prisma.user.update({ where: { id: userId }, data: { role } });
    return NextResponse.json(user);
}
