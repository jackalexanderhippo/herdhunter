"use client";

import { useEffect, useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from "recharts";
import { Users, CalendarCheck, TrendingUp, UserCheck } from "lucide-react";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa", "#34d399"];

interface Metrics {
    totalCandidates: number;
    hired: number;
    rejected: number;
    interviews: number;
    hireRate: number;
    byProfession: { profession: string; count: number }[];
    monthlyInterviews: { month: string; count: number }[];
    outcomesByProfession: { profession: string; hired: number; rejected: number }[];
}

export default function DashboardPage() {
    const [data, setData] = useState<Metrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/metrics").then((r) => r.json()).then(setData).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="empty-state">Loading metrics…</div>;
    if (!data) return <div className="empty-state">Failed to load metrics</div>;

    const pieData = data.byProfession.map((d) => ({ name: d.profession, value: d.count }));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <div className="page-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Hiring pipeline overview and metrics</p>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid-4">
                <div className="stat-card">
                    <div className="stat-label">Total Candidates</div>
                    <div className="stat-value">{data.totalCandidates}</div>
                    <div className="stat-sub">In the pipeline</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Interviews</div>
                    <div className="stat-value">{data.interviews}</div>
                    <div className="stat-sub">Completed &amp; scheduled</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Hired</div>
                    <div className="stat-value" style={{ color: "var(--success)" }}>{data.hired}</div>
                    <div className="stat-sub">Offers accepted</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Hire Rate</div>
                    <div className="stat-value" style={{ color: "var(--accent)" }}>{data.hireRate}%</div>
                    <div className="stat-sub">{data.rejected} rejected</div>
                </div>
            </div>

            <div className="grid-2">
                {/* Monthly interviews */}
                <div className="card">
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>Interviews per Month</h2>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data.monthlyInterviews} barSize={28}>
                            <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}
                                labelStyle={{ color: "var(--text-primary)" }}
                                itemStyle={{ color: "var(--accent)" }}
                            />
                            <Bar dataKey="count" name="Interviews" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* By profession pie */}
                <div className="card">
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>Candidates by Profession</h2>
                    {pieData.length === 0 ? (
                        <div className="empty-state" style={{ padding: "3rem 0" }}>No profession data yet</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Legend wrapperStyle={{ fontSize: "0.8rem", color: "var(--text-secondary)" }} />
                                <Tooltip
                                    contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}
                                    itemStyle={{ color: "var(--text-primary)" }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Outcomes by profession */}
            {data.outcomesByProfession.length > 0 && (
                <div className="card">
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>Hired vs Rejected by Profession</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={data.outcomesByProfession} barGap={4}>
                            <XAxis dataKey="profession" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}
                                labelStyle={{ color: "var(--text-primary)" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "0.8rem", color: "var(--text-secondary)" }} />
                            <Bar dataKey="hired" name="Hired" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={24} />
                            <Bar dataKey="rejected" name="Rejected" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={24} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
