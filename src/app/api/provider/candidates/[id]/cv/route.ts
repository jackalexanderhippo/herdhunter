import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRecruitmentSource } from "@/lib/recruitment-source";
import { NextResponse } from "next/server";

function toSafeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, eployCandidateId: true, email: true },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  try {
    const snapshot = await getRecruitmentSource().lookupCandidate({
      externalCandidateId: candidate.eployCandidateId ?? undefined,
      email: candidate.email ?? undefined,
    });
    const cv = await getRecruitmentSource().downloadCandidateCv(snapshot.externalCandidateId);

    await prisma.candidate.update({
      where: { id },
      data: {
        eployCandidateId: snapshot.externalCandidateId,
        eployCvUrl: snapshot.cv?.downloadUrl ?? null,
        eployLastSyncAt: new Date(),
      },
    });

    return new NextResponse(new Uint8Array(cv.bytes), {
      headers: {
        "Content-Type": cv.contentType || "application/pdf",
        "Content-Disposition": `inline; filename="${toSafeFileName(cv.fileName || `candidate-${snapshot.externalCandidateId}.pdf`)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch CV from provider" },
      { status: 400 },
    );
  }
}
