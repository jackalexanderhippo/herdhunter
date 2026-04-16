import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [totalCandidates, hired, rejected, interviews, byProfession, recentInterviews] = await Promise.all([
        prisma.candidate.count(),
        prisma.candidate.count({ where: { status: "HIRED" } }),
        prisma.candidate.count({ where: { status: "REJECTED" } }),
        prisma.interview.count(),
        prisma.candidate.groupBy({
            by: ["professionId"],
            _count: { id: true },
            where: { professionId: { not: null } },
        }),
        prisma.interview.findMany({
            take: 12,
            orderBy: { scheduledAt: "desc" },
            include: { candidate: { include: { profession: true } } },
        }),
    ]);

    const professions = await prisma.profession.findMany();
    const professionMap = Object.fromEntries(professions.map((p) => [p.id, p.name]));

    const byProfessionLabelled = byProfession.map((r) => ({
        profession: r.professionId ? professionMap[r.professionId] ?? "Unknown" : "Unknown",
        count: r._count.id,
    }));

    // Build monthly interviews array for last 6 months
    const now = new Date();
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { month: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), count: 0 };
    });

    recentInterviews.forEach((iv) => {
        const d = new Date(iv.scheduledAt);
        const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
        const slot = monthlyData.find((m) => m.month === label);
        if (slot) slot.count++;
    });

    const [hiredByProfession, rejectedByProfession] = await Promise.all([
        prisma.candidate.groupBy({ by: ["professionId"], _count: { id: true }, where: { status: "HIRED", professionId: { not: null } } }),
        prisma.candidate.groupBy({ by: ["professionId"], _count: { id: true }, where: { status: "REJECTED", professionId: { not: null } } }),
    ]);

    const outcomesByProfession = professions.map((p) => ({
        profession: p.name,
        hired: hiredByProfession.find((r) => r.professionId === p.id)?._count.id ?? 0,
        rejected: rejectedByProfession.find((r) => r.professionId === p.id)?._count.id ?? 0,
    }));

    return NextResponse.json({
        totalCandidates,
        hired,
        rejected,
        interviews,
        hireRate: totalCandidates > 0 ? Math.round((hired / totalCandidates) * 100) : 0,
        byProfession: byProfessionLabelled,
        monthlyInterviews: monthlyData,
        outcomesByProfession,
    });
}
