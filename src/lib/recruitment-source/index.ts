import { EployRecruitmentSourceClient } from "@/lib/recruitment-source/eploy";
import { NoopRecruitmentSourceClient } from "@/lib/recruitment-source/noop";
import type { RecruitmentSourceClient } from "@/lib/recruitment-source/types";

export function getRecruitmentSource(): RecruitmentSourceClient {
  const provider = process.env.RECRUITMENT_PROVIDER?.trim().toLowerCase();

  if (provider === "eploy" || (!provider && process.env.EPLOY_BASE_URL)) {
    return new EployRecruitmentSourceClient();
  }

  return new NoopRecruitmentSourceClient();
}
