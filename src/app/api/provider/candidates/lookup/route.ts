import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { getRecruitmentSource } from "@/lib/recruitment-source";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCandidates(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const externalCandidateId = typeof body.externalCandidateId === "string" ? body.externalCandidateId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!externalCandidateId && !email) {
    return NextResponse.json({ error: "External candidate ID or email is required" }, { status: 400 });
  }

  try {
    const snapshot = await getRecruitmentSource().lookupCandidate({
      externalCandidateId: externalCandidateId || undefined,
      email: email || undefined,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to look up candidate" },
      { status: 400 },
    );
  }
}
