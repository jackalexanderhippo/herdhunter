import { auth } from "@/lib/auth";
import { canAccessAdminArea } from "@/lib/access";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { subDays } from "date-fns";

type InterviewRow = {
    id: string;
    scheduledAt: Date;
    status: string;
    candidate: { name: string; position: string };
};

type UserRow = {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string;
    interviews: Array<{ interview: InterviewRow }>;
};

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessAdminArea(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const thirtyDaysAgo = subDays(new Date(), 30);
    const now = new Date();

    const interviewers = (await prisma.user.findMany({
        where: { role: { in: ["MAIN_INTERVIEWER", "ADMIN_INTERVIEWER"] } },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            interviews: {
                select: {
                    interview: {
                        select: {
                            id: true,
                            scheduledAt: true,
                            status: true,
                            candidate: { select: { name: true, position: true } },
                        },
                    },
                },
            },
        },
        orderBy: { name: "asc" },
    })) as UserRow[];

    const workload = interviewers.map((u) => {
        const allInterviews = u.interviews.map((iv) => iv.interview);
        const upcoming = allInterviews.filter(
            (iv) => iv.status === "SCHEDULED" && new Date(iv.scheduledAt) >= now
        );
        const recentCompleted = allInterviews.filter(
            (iv) => iv.status === "COMPLETED" && new Date(iv.scheduledAt) >= thirtyDaysAgo
        );
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image,
            role: u.role,
            upcomingCount: upcoming.length,
            recentCompletedCount: recentCompleted.length,
            totalCount: allInterviews.length,
            upcomingInterviews: upcoming.slice(0, 5).map((iv) => ({
                id: iv.id,
                scheduledAt: iv.scheduledAt,
                candidateName: iv.candidate.name,
                candidatePosition: iv.candidate.position,
            })),
        };
    });

    return NextResponse.json(workload);
}
