import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCandidates(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { candidateId, recommendation, summary } = await req.json();

  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const assessment = await prisma.positionCandidateAssessment.upsert({
    where: {
      openPositionId_candidateId: {
        openPositionId: id,
        candidateId,
      },
    },
    update: {
      recommendation: recommendation ?? "HOLD",
      summary: typeof summary === "string" ? summary : "",
      updatedById: session.user.id,
    },
    create: {
      openPositionId: id,
      candidateId,
      recommendation: recommendation ?? "HOLD",
      summary: typeof summary === "string" ? summary : "",
      updatedById: session.user.id,
    },
    include: {
      candidate: { select: { id: true, name: true, status: true } },
      updatedBy: { select: PUBLIC_USER_SELECT },
    },
  });

  return NextResponse.json(assessment);
}
