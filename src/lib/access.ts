import type { Role } from "@prisma/client";

export const POC_OPEN_ACCESS = process.env.POC_OPEN_ACCESS !== "false";

export function canAccessAdminArea(role?: Role | string | null) {
  if (POC_OPEN_ACCESS) return true;
  return Boolean(role) && role === "ADMIN_INTERVIEWER";
}

export function canManageCandidates(role?: Role | string | null) {
  if (POC_OPEN_ACCESS) return true;
  return Boolean(role) && (role === "HIRING_TEAM" || role === "ADMIN_INTERVIEWER");
}

export function canConductInterviews(role?: Role | string | null) {
  if (POC_OPEN_ACCESS) return true;
  return Boolean(role) && (role === "MAIN_INTERVIEWER" || role === "ADMIN_INTERVIEWER");
}

export function canManageTemplates(role?: Role | string | null) {
  if (POC_OPEN_ACCESS) return true;
  return Boolean(role) && (role === "MAIN_INTERVIEWER" || role === "ADMIN_INTERVIEWER");
}

export function canSeeAllInterviews(role?: Role | string | null) {
  if (POC_OPEN_ACCESS) return true;
  return Boolean(role) && role === "ADMIN_INTERVIEWER";
}
