import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Role, CandidateStatus } from "@prisma/client";
import {
    canAccessAdminArea,
    canConductInterviews,
    canManageCandidates as canManageCandidatesAccess,
} from "@/lib/access";

type OpenPositionStatus = "OPEN" | "ON_HOLD" | "FILLED" | "CLOSED";
type AssessmentRecommendation = "STRONG_YES" | "YES" | "HOLD" | "NO";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const ROLE_LABELS: Record<Role, string> = {
    HIRING_TEAM: "Hiring Team",
    MAIN_INTERVIEWER: "Interview Lead",
    ADMIN_INTERVIEWER: "Engineering Hiring Team",
};

export const STATUS_LABELS: Record<CandidateStatus, string> = {
    NEW: "New",
    SCREENING: "Screening",
    INTERVIEW_SCHEDULED: "Interview Scheduled",
    INTERVIEW_DONE: "Interview Done",
    OFFERED: "Offered",
    HIRED: "Hired",
    REJECTED: "Rejected",
};

export const STATUS_COLORS: Record<CandidateStatus, string> = {
    NEW: "bg-slate-100 text-slate-700",
    SCREENING: "bg-blue-100 text-blue-700",
    INTERVIEW_SCHEDULED: "bg-violet-100 text-violet-700",
    INTERVIEW_DONE: "bg-amber-100 text-amber-700",
    OFFERED: "bg-orange-100 text-orange-700",
    HIRED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
};

export const OPEN_POSITION_STATUS_LABELS: Record<OpenPositionStatus, string> = {
    OPEN: "Open",
    ON_HOLD: "On Hold",
    FILLED: "Filled",
    CLOSED: "Closed",
};

export const OPEN_POSITION_STATUS_COLORS: Record<OpenPositionStatus, string> = {
    OPEN: "bg-emerald-100 text-emerald-700",
    ON_HOLD: "bg-amber-100 text-amber-700",
    FILLED: "bg-blue-100 text-blue-700",
    CLOSED: "bg-slate-200 text-slate-700",
};

export const ASSESSMENT_LABELS: Record<AssessmentRecommendation, string> = {
    STRONG_YES: "Strong yes",
    YES: "Yes",
    HOLD: "Hold",
    NO: "No",
};

export const ASSESSMENT_COLORS: Record<AssessmentRecommendation, string> = {
    STRONG_YES: "bg-emerald-100 text-emerald-700",
    YES: "bg-green-100 text-green-700",
    HOLD: "bg-amber-100 text-amber-700",
    NO: "bg-rose-100 text-rose-700",
};

export function canManageCandidates(role: Role) {
    return canManageCandidatesAccess(role);
}

export function canInterview(role: Role) {
    return canConductInterviews(role);
}

export function isAdmin(role: Role) {
    return canAccessAdminArea(role);
}

export function formatBytes(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const INTERVIEWER_HIGHLIGHTS = [
    { border: "#e07fa3", background: "rgba(224,127,163,0.12)" },
    { border: "#a5d0ff", background: "rgba(165,208,255,0.2)" },
    { border: "#ffc42e", background: "rgba(255,196,46,0.2)" },
    { border: "#a0f5e7", background: "rgba(160,245,231,0.22)" },
    { border: "#93cb52", background: "rgba(147,203,82,0.2)" },
];

function hashText(input: string) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}

export function getInterviewerHighlight(userId: string) {
    const index = hashText(userId) % INTERVIEWER_HIGHLIGHTS.length;
    return INTERVIEWER_HIGHLIGHTS[index];
}
