import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const position = await prisma.openPosition.findUnique({
    where: { id },
    include: {
      candidates: {
        include: {
          profession: true,
          notes: {
            include: { author: { select: PUBLIC_USER_SELECT } },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
          interviews: {
            include: {
              notes: {
                include: { author: { select: PUBLIC_USER_SELECT } },
                orderBy: { createdAt: "desc" },
              },
              sectionScores: {
                include: { author: { select: PUBLIC_USER_SELECT } },
                orderBy: { updatedAt: "desc" },
              },
            },
            orderBy: { scheduledAt: "desc" },
          },
          assessments: {
            include: { updatedBy: { select: PUBLIC_USER_SELECT } },
            where: { openPositionId: id },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      assessments: {
        include: {
          candidate: { select: { id: true, name: true, status: true } },
          updatedBy: { select: PUBLIC_USER_SELECT },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!position) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(position);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCandidates(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const position = await prisma.openPosition.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title?.toString().trim() || "" }),
      ...(body.team !== undefined && { team: body.team?.toString().trim() || null }),
      ...(body.level !== undefined && { level: body.level?.toString().trim() || null }),
      ...(body.targetHires !== undefined && { targetHires: typeof body.targetHires === "number" && body.targetHires > 0 ? body.targetHires : 1 }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.hiringLead !== undefined && { hiringLead: null }),
      ...(body.interviewLead !== undefined && { interviewLead: null }),
      ...(body.description !== undefined && { description: body.description?.toString() || null }),
      ...(body.eployPositionId !== undefined && { eployPositionId: body.eployPositionId?.toString().trim() || null }),
    },
  });

  return NextResponse.json(position);
}
