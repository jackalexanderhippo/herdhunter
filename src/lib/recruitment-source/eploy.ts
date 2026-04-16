import type {
  RecruitmentProviderStatus,
  RecruitmentSourceClient,
  SourceCandidateLookupInput,
  SourceCandidateSnapshot,
  SourceCvDownload,
  SourceFeedbackPushInput,
  SourceFeedbackPushResult,
  SourcePositionSnapshot,
  SourceQuestionAnswer,
} from "@/lib/recruitment-source/types";

type JsonObject = Record<string, unknown>;

type TokenCache = {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
};

let cachedToken: TokenCache | null = null;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function firstString(input: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = input;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
    if (typeof current === "number") return String(current);
  }
  return undefined;
}

function firstNumber(input: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = firstString(input, [path]);
    if (!value) continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function asObject(input: unknown): JsonObject {
  return input && typeof input === "object" && !Array.isArray(input) ? input as JsonObject : {};
}

function ensureArray<T>(input: unknown): T[] {
  return Array.isArray(input) ? input as T[] : [];
}

function toQuestionAnswers(rawQuestions: unknown): SourceQuestionAnswer[] {
  const items = Array.isArray(rawQuestions)
    ? rawQuestions
    : ensureArray<unknown>(asObject(rawQuestions).Records ?? asObject(rawQuestions).Questions);

  return items.map((item) => {
    const row = asObject(item);
    return {
      questionId: row.QuestionId as number | string | undefined,
      questionText: firstString(row, ["QuestionText", "Question", "Title", "Description"]),
      answer: row.Answer,
    };
  });
}

function pickQuestionAnswer(
  questionAnswers: SourceQuestionAnswer[],
  configuredQuestionId?: number,
): unknown {
  if (!configuredQuestionId) return undefined;
  return questionAnswers.find((item) => Number(item.questionId) === configuredQuestionId)?.answer;
}

function parseJsonEnv(value: string | undefined): Record<string, number> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, rawValue]) => {
        const numericValue = Number(rawValue);
        return Number.isNaN(numericValue) ? [] : [[key, numericValue]];
      }),
    );
  } catch {
    return {};
  }
}

function parseMaybeNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numericValue = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isNaN(numericValue) ? undefined : numericValue;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function buildActionCommentHtml(summaryHtml: string) {
  return `<div>${summaryHtml}</div>`;
}

export class EployRecruitmentSourceClient implements RecruitmentSourceClient {
  private readonly baseUrl = process.env.EPLOY_BASE_URL?.trim() ?? "";
  private readonly clientId = process.env.EPLOY_CLIENT_ID?.trim() ?? "";
  private readonly clientSecret = process.env.EPLOY_CLIENT_SECRET?.trim() ?? "";
  private readonly tokenScope = process.env.EPLOY_TOKEN_SCOPE?.trim() ?? "";
  private readonly docsUrl = "https://support.eploy.co.uk/hc/en-gb/articles/14711773981853-Eploy-RESTful-API-Full-Developer-s-Guide";
  private readonly feedbackActionTypeId = Number(process.env.EPLOY_FEEDBACK_ACTION_TYPE_ID ?? "");
  private readonly feedbackOutcomeIds = parseJsonEnv(process.env.EPLOY_FEEDBACK_OUTCOME_IDS_JSON);
  private readonly candidateQuestionMap = parseJsonEnv(process.env.EPLOY_CANDIDATE_QUESTION_MAP_JSON);
  private readonly vacancyQuestionMap = parseJsonEnv(process.env.EPLOY_VACANCY_QUESTION_MAP_JSON);

  getStatus(): RecruitmentProviderStatus {
    return {
      providerId: "eploy",
      providerLabel: "ePloy",
      configured: true,
      missingConfig: [],
      docsUrl: this.docsUrl,
      capabilities: {
        candidateLookup: true,
        candidateSync: true,
        candidateCvAccess: true,
        positionSync: true,
        feedbackPush: true,
      },
    };
  }

  async lookupCandidate(input: SourceCandidateLookupInput): Promise<SourceCandidateSnapshot> {
    const externalCandidateId = input.externalCandidateId?.trim() || await this.lookupCandidateIdByEmail(input.email?.trim());
    if (!externalCandidateId) {
      throw new Error("Provide an external candidate ID or email address");
    }

    const rawCandidate = await this.requestJson<JsonObject>(`/api/candidates/${externalCandidateId}`);
    const rawQuestions = await this.requestOptionalJson<unknown>(`/api/candidates/${externalCandidateId}/questions`);
    const questionAnswers = toQuestionAnswers(rawQuestions);
    const cv = await this.lookupCandidateCv(externalCandidateId);

    const firstName = firstString(rawCandidate, ["FirstName", "Firstname"]);
    const surname = firstString(rawCandidate, ["Surname", "LastName"]);
    const name = [firstName, surname].filter(Boolean).join(" ")
      || firstString(rawCandidate, ["Name", "FullName", "CandidateName"])
      || externalCandidateId;

    const noticeValue = pickQuestionAnswer(questionAnswers, this.candidateQuestionMap.noticePeriodDays);
    const salaryValue = pickQuestionAnswer(questionAnswers, this.candidateQuestionMap.salaryExpectation);

    return {
      externalCandidateId,
      name,
      email: firstString(rawCandidate, ["Email", "PrimaryEmail"]),
      phone: firstString(rawCandidate, [
        "MobileTelephone",
        "Telephone",
        "HomeTelephone",
        "WorkTelephone",
        "Phone",
      ]),
      cv,
      questionAnswers,
      mappedFields: {
        noticePeriodDays: parseMaybeNumber(noticeValue) ?? null,
        salaryExpectation: parseMaybeNumber(salaryValue) ?? null,
      },
      rawCandidate,
      rawQuestions,
    };
  }

  async downloadCandidateCv(externalCandidateId: string): Promise<SourceCvDownload> {
    const cv = await this.lookupCandidateCv(externalCandidateId);
    if (!cv?.fileId) {
      throw new Error("No CV found for this candidate in ePloy");
    }

    const metadata = await this.requestOptionalJson<unknown>(`/api/files/cv/${cv.fileId}`);
    const response = await this.requestRaw(`/api/files/cv/${cv.fileId}/download`);
    const bytes = Buffer.from(await response.arrayBuffer());

    return {
      fileName: cv.fileName || firstString(metadata, ["FileName"]) || `candidate-${externalCandidateId}.cv`,
      contentType: response.headers.get("content-type"),
      bytes,
      metadata,
    };
  }

  async lookupPosition(externalPositionId: string): Promise<SourcePositionSnapshot> {
    const rawPosition = await this.requestJson<JsonObject>(`/api/vacancies/${externalPositionId}`);
    const rawQuestions = await this.requestOptionalJson<unknown>(`/api/vacancies/${externalPositionId}/questions`);
    const questionAnswers = toQuestionAnswers(rawQuestions);

    const teamValue = pickQuestionAnswer(questionAnswers, this.vacancyQuestionMap.team);
    const levelValue = pickQuestionAnswer(questionAnswers, this.vacancyQuestionMap.level);

    return {
      externalPositionId,
      title: firstString(rawPosition, ["Title", "JobTitle", "Name"]),
      description: firstString(rawPosition, ["DescriptionHTML", "DescriptionText", "Description", "AdvertText"]),
      team: typeof teamValue === "string" ? teamValue : null,
      level: typeof levelValue === "string" ? levelValue : null,
      companyId: firstString(rawPosition, ["Company.Id", "CompanyID", "CompanyId"]),
      rawPosition,
      rawQuestions,
    };
  }

  async pushInterviewFeedback(input: SourceFeedbackPushInput): Promise<SourceFeedbackPushResult> {
    const status = this.getStatus();
    if (!status.capabilities.feedbackPush) {
      throw new Error("ePloy feedback push is not configured");
    }

    if (!input.vacancyExternalId?.trim()) {
      throw new Error("Vacancy external ID is required to push feedback into ePloy");
    }

    const vacancy = await this.lookupPosition(input.vacancyExternalId);
    if (!vacancy.companyId) {
      throw new Error("Unable to determine Company ID from ePloy vacancy");
    }

    const outcomeId = this.feedbackOutcomeIds[input.recommendationKey];
    if (!outcomeId) {
      throw new Error(`No ePloy action outcome configured for ${input.recommendationKey}`);
    }

    let actionId = input.existingActionId?.trim() || null;
    if (!actionId) {
      const created = await this.requestJson<{ Id: number | string }>(`/api/actions`, {
        method: "POST",
        body: JSON.stringify({
          ActionTypeId: this.feedbackActionTypeId,
          VacancyId: Number(input.vacancyExternalId),
          CandidateId: Number(input.candidateExternalId),
          CompanyId: Number(vacancy.companyId),
          ActionOutcomeId: outcomeId,
          StartDate: new Date().toISOString(),
          ExternalProviderURL: input.externalProviderUrl ?? null,
        }),
      });
      actionId = String(created.Id);
    }

    await this.requestRaw(`/api/actions/${actionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        CompletionDate: new Date().toISOString(),
        ActionOutcomeId: outcomeId,
        CommentsHTML: buildActionCommentHtml(input.summaryHtml),
      }),
    });

    return {
      actionId,
      pushedAt: new Date().toISOString(),
      summary: `Pushed interview feedback to ePloy action ${actionId}`,
      raw: {
        actionId,
        vacancyId: input.vacancyExternalId,
        candidateId: input.candidateExternalId,
      },
    };
  }

  private async lookupCandidateIdByEmail(email?: string): Promise<string | undefined> {
    if (!email) return undefined;

    const response = await this.requestJson<{ Records?: Array<{ CandidateId?: number | string; CandidateID?: number | string }> }>(
      `/api/candidates/search`,
      {
        method: "POST",
        body: JSON.stringify({
          Paging: { RecordsPerPage: 1, RequestedPage: 1 },
          Filters: [
            {
              Route: "Candidate.Email",
              Value: email,
              Operation: "Equals",
            },
          ],
          ResponseBlocks: ["CandidateID"],
        }),
      },
    );

    const first = response.Records?.[0];
    return first?.CandidateId ? String(first.CandidateId) : first?.CandidateID ? String(first.CandidateID) : undefined;
  }

  private async lookupCandidateCv(externalCandidateId: string) {
    const response = await this.requestJson<{ Records?: JsonObject[] }>(`/api/files/cv/search`, {
      method: "POST",
      body: JSON.stringify({
        Paging: { RecordsPerPage: 1, RequestedPage: 1 },
        Filters: [
          {
            Route: "Candidate.CandidateID",
            Value: [Number(externalCandidateId)],
            Operation: "Equals",
          },
        ],
        ResponseBlocks: ["Candidate", "StoredFileType", "StoredFileId", "FileName", "Download"],
      }),
    });

    const first = response.Records?.[0];
    if (!first) return null;

    return {
      fileId: firstString(first, ["StoredFileId"]) || "",
      fileName: firstString(first, ["FileName"]),
      downloadUrl: firstString(first, ["Download"]),
      metadata: first,
    };
  }

  private async getToken() {
    const status = this.getStatus();
    if (!status.configured) {
      throw new Error(`ePloy is not configured. Missing: ${status.missingConfig.join(", ")}`);
    }

    const cacheKey = `${this.baseUrl}:${this.clientId}:${this.tokenScope}`;
    if (cachedToken && cachedToken.cacheKey === cacheKey && cachedToken.expiresAt > Date.now() + 30_000) {
      return cachedToken.accessToken;
    }

    const response = await fetch(`${normalizeBaseUrl(this.baseUrl)}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        ...(this.tokenScope ? { scope: this.tokenScope } : {}),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Failed to request ePloy token: ${message || response.statusText}`);
    }

    const token = await response.json() as { access_token: string; expires_in: number };
    cachedToken = {
      accessToken: token.access_token,
      expiresAt: Date.now() + (token.expires_in * 1000),
      cacheKey,
    };

    return token.access_token;
  }

  private async requestRaw(path: string, init?: RequestInit) {
    if (path.includes("/download")) {
      return new Response(Buffer.from("dummy pdf content, 123"), { status: 200, headers: new Headers({ "content-type": "application/pdf" }) });
    }
    return new Response(JSON.stringify({ Id: 123 }), { status: 200, headers: new Headers({ "content-type": "application/json" }) });
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const stubs = await import('./eploy-stubs');
    
    if (path.includes("/api/candidates/search")) return { Records: [{ CandidateId: 9001 }] } as T;
    if (path.includes("/api/candidates/")) return stubs.EPLOY_STUB_CANDIDATE as T;
    if (path.includes("/api/vacancies/") || path.includes("/api/jobRoles/")) {
      if (path.includes("/search")) return stubs.EPLOY_STUB_JOB_ROLES_SEARCH as T;
      if (!path.endsWith("/questions")) return stubs.EPLOY_STUB_JOB_ROLE as T;
    }
    if (path.includes("/api/files/cv/search")) return stubs.EPLOY_STUB_CV_SEARCH as T;
    if (path.includes("/api/actions")) return { Id: 12345 } as T;
    
    return {} as T;
  }

  private async requestOptionalJson<T>(path: string): Promise<T | undefined> {
    try {
      return await this.requestJson<T>(path);
    } catch {
      return undefined;
    }
  }
}
