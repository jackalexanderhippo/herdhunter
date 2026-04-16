import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PUBLIC_USER_SELECT } from "@/lib/public-user";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const messages = await prisma.candidateChatMessage.findMany({
    where: { candidateId: id },
    include: { author: { select: PUBLIC_USER_SELECT } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(messages);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { content } = await req.json();
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }

  const message = await prisma.candidateChatMessage.create({
    data: {
      candidateId: id,
      authorId: session.user.id,
      content: content.trim(),
    },
    include: { author: { select: PUBLIC_USER_SELECT } },
  });
  return NextResponse.json(message, { status: 201 });
}
