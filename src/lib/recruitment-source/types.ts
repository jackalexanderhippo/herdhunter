export type RecruitmentCapability =
  | "candidateLookup"
  | "candidateSync"
  | "candidateCvAccess"
  | "positionSync"
  | "feedbackPush";

export interface RecruitmentProviderStatus {
  providerId: string;
  providerLabel: string;
  configured: boolean;
  missingConfig: string[];
  capabilities: Record<RecruitmentCapability, boolean>;
  docsUrl?: string;
}

export interface SourceQuestionAnswer {
  questionId?: number | string;
  questionText?: string;
  answer?: unknown;
}

export interface SourceCandidateCv {
  fileId: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: number;
  downloadUrl?: string;
  metadata?: unknown;
}

export interface SourceCandidateSnapshot {
  externalCandidateId: string;
  name: string;
  email?: string;
  phone?: string;
  cv?: SourceCandidateCv | null;
  questionAnswers?: SourceQuestionAnswer[];
  mappedFields?: {
    noticePeriodDays?: number | null;
    salaryExpectation?: number | null;
  };
  rawCandidate: Record<string, unknown>;
  rawQuestions?: unknown;
}

export interface SourcePositionSnapshot {
  externalPositionId: string;
  title?: string;
  description?: string;
  team?: string | null;
  level?: string | null;
  companyId?: string | null;
  rawPosition: Record<string, unknown>;
  rawQuestions?: unknown;
}

export interface SourceCandidateLookupInput {
  externalCandidateId?: string;
  email?: string;
}

export interface SourceCvDownload {
  fileName: string;
  contentType?: string | null;
  bytes: Buffer;
  metadata?: unknown;
}

export interface SourceFeedbackPushInput {
  candidateExternalId: string;
  vacancyExternalId?: string | null;
  existingActionId?: string | null;
  summaryHtml: string;
  recommendationKey: string;
  externalProviderUrl?: string | null;
}

export interface SourceFeedbackPushResult {
  actionId?: string | null;
  pushedAt: string;
  summary: string;
  raw?: unknown;
}

export interface RecruitmentSourceClient {
  getStatus(): RecruitmentProviderStatus;
  lookupCandidate(input: SourceCandidateLookupInput): Promise<SourceCandidateSnapshot>;
  downloadCandidateCv(externalCandidateId: string): Promise<SourceCvDownload>;
  lookupPosition(externalPositionId: string): Promise<SourcePositionSnapshot>;
  pushInterviewFeedback(input: SourceFeedbackPushInput): Promise<SourceFeedbackPushResult>;
}
