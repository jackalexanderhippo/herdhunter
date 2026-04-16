import { auth } from "@/lib/auth";
import { canAccessAdminArea } from "@/lib/access";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const professions = await prisma.profession.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(professions);
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session || !canAccessAdminArea(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const profession = await prisma.profession.create({ data: { name } });
    return NextResponse.json(profession, { status: 201 });
}
