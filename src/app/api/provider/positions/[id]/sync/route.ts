import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getRecruitmentSource } from "@/lib/recruitment-source";
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCandidates(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const position = await prisma.openPosition.findUnique({
    where: { id },
    include: {
      _count: { select: { candidates: true, assessments: true } },
      candidates: { select: { id: true, status: true } },
    },
  });
  if (!position) return NextResponse.json({ error: "Open position not found" }, { status: 404 });
  if (!position.eployPositionId) {
    return NextResponse.json({ error: "Open position has no external vacancy ID" }, { status: 400 });
  }

  try {
    const snapshot = await getRecruitmentSource().lookupPosition(position.eployPositionId);
    const updated = await prisma.openPosition.update({
      where: { id },
      data: {
        title: snapshot.title ?? position.title,
        description: snapshot.description ?? position.description,
        team: snapshot.team ?? position.team,
        level: snapshot.level ?? position.level,
      },
      include: {
        _count: { select: { candidates: true, assessments: true } },
        candidates: { select: { id: true, status: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync open position" },
      { status: 400 },
    );
  }
}
