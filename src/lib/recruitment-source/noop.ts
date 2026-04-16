import type {
  RecruitmentProviderStatus,
  RecruitmentSourceClient,
  SourceCandidateLookupInput,
  SourceCvDownload,
  SourceFeedbackPushInput,
  SourceFeedbackPushResult,
  SourcePositionSnapshot,
  SourceCandidateSnapshot,
} from "@/lib/recruitment-source/types";

function notConfigured(): never {
  throw new Error("Recruitment provider is not configured");
}

export class NoopRecruitmentSourceClient implements RecruitmentSourceClient {
  getStatus(): RecruitmentProviderStatus {
    return {
      providerId: "none",
      providerLabel: "No source provider",
      configured: false,
      missingConfig: ["RECRUITMENT_PROVIDER"],
      docsUrl: undefined,
      capabilities: {
        candidateLookup: false,
        candidateSync: false,
        candidateCvAccess: false,
        positionSync: false,
        feedbackPush: false,
      },
    };
  }

  async lookupCandidate(_input: SourceCandidateLookupInput): Promise<SourceCandidateSnapshot> {
    return notConfigured();
  }

  async downloadCandidateCv(_externalCandidateId: string): Promise<SourceCvDownload> {
    return notConfigured();
  }

  async lookupPosition(_externalPositionId: string): Promise<SourcePositionSnapshot> {
    return notConfigured();
  }

  async pushInterviewFeedback(_input: SourceFeedbackPushInput): Promise<SourceFeedbackPushResult> {
    return notConfigured();
  }
}
