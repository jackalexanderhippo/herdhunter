import { auth } from "@/lib/auth";
import { canManageCandidates } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getRecruitmentSource } from "@/lib/recruitment-source";
import { mergeSourceMetadata } from "@/lib/recruitment-source/metadata";
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCandidates(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { openPosition: true, profession: true },
  });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  try {
    const snapshot = await getRecruitmentSource().lookupCandidate({
      externalCandidateId: candidate.eployCandidateId ?? undefined,
      email: candidate.email ?? undefined,
    });

    const updated = await prisma.candidate.update({
      where: { id },
      data: {
        name: snapshot.name || candidate.name,
        email: snapshot.email ?? candidate.email,
        phone: snapshot.phone ?? candidate.phone,
        noticePeriodDays: snapshot.mappedFields?.noticePeriodDays ?? candidate.noticePeriodDays,
        salaryExpectation: snapshot.mappedFields?.salaryExpectation ?? candidate.salaryExpectation,
        eployCandidateId: snapshot.externalCandidateId,
        eployCvUrl: snapshot.cv?.downloadUrl ?? candidate.eployCvUrl,
        eployLastSyncAt: new Date(),
        eployMetadata: mergeSourceMetadata(candidate.eployMetadata, {
          provider: "eploy",
          syncedAt: new Date().toISOString(),
          candidate: snapshot.rawCandidate,
          candidateQuestions: snapshot.rawQuestions ?? null,
          candidateCv: snapshot.cv?.metadata ?? null,
        }),
      },
      include: { profession: true, openPosition: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync candidate" },
      { status: 400 },
    );
  }
}
