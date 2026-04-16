import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const providers = Array.from(new Set(user.accounts.map((a) => a.provider)));
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    hasPassword: Boolean(user.passwordHash),
    providers,
  });
}
