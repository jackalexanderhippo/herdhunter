import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const positions = await prisma.openPosition.findMany({
    include: {
      _count: { select: { candidates: true, assessments: true } },
      candidates: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json(positions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCandidates(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    title,
    team,
    level,
    targetHires,
    status,
    description,
    eployPositionId,
  } = body;

  if (!title?.toString().trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const position = await prisma.openPosition.create({
    data: {
      title: title.toString().trim(),
      team: team?.toString().trim() || null,
      level: level?.toString().trim() || null,
      targetHires: typeof targetHires === "number" && targetHires > 0 ? targetHires : 1,
      status: status ?? "OPEN",
      hiringLead: null,
      interviewLead: null,
      description: description?.toString() || null,
      eployPositionId: eployPositionId?.toString().trim() || null,
    },
    include: {
      _count: { select: { candidates: true, assessments: true } },
      candidates: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json(position, { status: 201 });
}
