# ePloy Integration Notes

This app now has a provider abstraction for external recruitment systems, with an `ePloy` implementation behind it. The goal is to let ePloy remain the short-term source of truth while keeping the app switchable to another provider later.

Code entry points:

- [`src/lib/recruitment-source/index.ts`](../src/lib/recruitment-source/index.ts)
- [`src/lib/recruitment-source/eploy.ts`](../src/lib/recruitment-source/eploy.ts)
- [`src/app/api/provider/route.ts`](../src/app/api/provider/route.ts)
- [`src/app/api/provider/candidates`](../src/app/api/provider/candidates)
- [`src/app/api/provider/positions/[id]/sync/route.ts`](../src/app/api/provider/positions/%5Bid%5D/sync/route.ts)

## Official docs reviewed

- [Eploy RESTful API: Full Developer's Guide](https://support.eploy.co.uk/hc/en-gb/articles/14711773981853-Eploy-RESTful-API-Full-Developer-s-Guide)
- [Eploy RESTful API: Requesting a Token](https://support.eploy.co.uk/hc/en-gb/articles/14740862162717-Eploy-RESTful-API-Requesting-a-Token)
- [Eploy RESTful API: Document Exports](https://support.eploy.co.uk/hc/en-gb/articles/22001543522845-Eploy-RESTful-API-Document-Exports)
- [Eploy RESTful API: Workflow-based Integrations](https://support.eploy.co.uk/hc/en-gb/articles/14089926025757-Eploy-RESTful-API-Workflow-based-Integrations)
- [Custom Questions in the Eploy API](https://support.eploy.co.uk/hc/en-gb/articles/19384051595805-Custom-Questions-in-the-Eploy-API)

## What ePloy can give us

### Candidate data

Supported by the current implementation:

- Request OAuth2 bearer tokens using `POST /api/token`
- Read a candidate directly by ID using `GET /api/candidates/{candidateId}`
- Search candidates by email using `POST /api/candidates/search`
- Read candidate custom questions using `GET /api/candidates/{candidateId}/questions`

What the app does with that:

- Prefills the new candidate form from ePloy
- Syncs an existing candidate's name, email, phone, source CV URL and raw payload
- Optionally maps candidate custom question answers into local `noticePeriodDays` and `salaryExpectation`

### Candidate CVs and files

Supported by the docs and implemented:

- Find candidate CV file IDs using `POST /api/files/cv/search`
- Read CV metadata using `GET /api/files/cv/{storedFileId}`
- Download the CV using `GET /api/files/cv/{storedFileId}/download`

What the app does with that:

- Streams the current CV from ePloy on demand through the app
- Avoids storing provider CV files inside Herdhunter for the current integration model

### Vacancies / open positions

Supported by the current implementation:

- Read a vacancy by ID using `GET /api/vacancies/{vacancyId}`
- Read vacancy custom questions using `GET /api/vacancies/{vacancyId}/questions`

What the app does with that:

- Syncs a local open position from its ePloy vacancy ID
- Updates title and description directly
- Optionally maps vacancy custom questions into local `team` and `level`

### Applications and related records

Supported in the docs and useful for future expansion:

- Find application IDs by candidate ID and vacancy ID using `POST /api/applications/search`
- This is particularly useful where data or files are attached to the Application rather than the Candidate or Vacancy record

Current app status:

- Not yet surfaced in the UI
- Not currently required for the implemented CV sync flow
- Likely useful if we later need application-specific answers, workflow state, or application-linked files

### Feedback / write-back

Supported in the docs and partially implemented:

- Workflow-based integrations use Actions as the visible workflow artifact in ePloy
- Create an Action with `POST /api/actions`
- Update an Action with `PATCH /api/actions/{actionId}`

What the app does with that:

- Pushes the latest interview recommendation summary into ePloy as a workflow Action
- Stores the created Action ID in metadata so later pushes can update the same Action

Important constraint:

- ePloy write-back is tenant-specific. Action Type IDs and Action Outcome IDs come from your ePloy setup, not from the generic API docs.

### Custom questions

Supported in the docs and exposed through config:

- Read questions with `GET /api/{recordtype}/{recordid}/questions`
- Update question answers with `PATCH /api/{recordtype}/{recordid}/questions`
- Include question answers in search results using ResponseBlocks

What this means for us:

- We can map custom ePloy questions into local fields without hardcoding tenant-specific IDs
- We can also write back to custom questions later if that ends up being a better fit than workflow Actions

## What is implemented in the app

### Backend

Implemented:

- Provider abstraction with a swappable interface
- `Noop` provider for non-configured environments
- `ePloy` provider for:
  - candidate lookup
  - candidate sync
  - live CV retrieval
  - vacancy lookup/sync
  - interview feedback push via workflow action

Routes added:

- `GET /api/provider`
- `POST /api/provider/candidates/lookup`
- `POST /api/provider/candidates/:id/sync`
- `GET /api/provider/candidates/:id/cv`
- `POST /api/provider/candidates/:id/push-feedback`
- `POST /api/provider/positions/:id/sync`

### Frontend

Implemented:

- New candidate page can import candidate data from the configured source provider before local creation
- Candidate detail page now supports:
  - `Sync Candidate`
  - `Open CV`
  - `Push Interview Feedback`
- Position detail page can sync a position from its source vacancy ID

## Current data model note

The runtime integration is provider-based, but the persistent fields are still the existing compatibility fields:

- `Candidate.eployCandidateId`
- `Candidate.eployCvUrl`
- `Candidate.eployMetadata`
- `Candidate.eployLastSyncAt`
- `Candidate.eployFeedbackSummary`
- `Candidate.eployFeedbackPushedAt`
- `OpenPosition.eployPositionId`

That means the app is already switchable in code, but the storage naming is still ePloy-flavoured. If you want fully provider-neutral persistence next, the right follow-up is to rename these columns to something like `externalCandidateId`, `externalMetadata`, `externalPositionId` and add a `sourceProvider` column.

## Configuration required

Minimum config for read/sync:

- `RECRUITMENT_PROVIDER=eploy`
- `EPLOY_BASE_URL`
- `EPLOY_CLIENT_ID`
- `EPLOY_CLIENT_SECRET`

Optional config:

- `EPLOY_TOKEN_SCOPE`
- `EPLOY_CANDIDATE_QUESTION_MAP_JSON`
- `EPLOY_VACANCY_QUESTION_MAP_JSON`

Required for feedback push:

- `EPLOY_FEEDBACK_ACTION_TYPE_ID`
- `EPLOY_FEEDBACK_OUTCOME_IDS_JSON`

Example:

```env
RECRUITMENT_PROVIDER=eploy
EPLOY_BASE_URL=https://yourtenant.eploy.net
EPLOY_CLIENT_ID=...
EPLOY_CLIENT_SECRET=...
EPLOY_CANDIDATE_QUESTION_MAP_JSON={"noticePeriodDays":325,"salaryExpectation":333}
EPLOY_VACANCY_QUESTION_MAP_JSON={"team":338,"level":339}
EPLOY_FEEDBACK_ACTION_TYPE_ID=42
EPLOY_FEEDBACK_OUTCOME_IDS_JSON={"UNSUCCESSFUL":12,"YES_AT_DIFFERENT_LEVEL":13,"PROCEED_TO_NEXT_ROUND":14}
```

## Inputs still needed from you

To complete this against your real tenant, I need:

- `EPLOY_BASE_URL`, `EPLOY_CLIENT_ID`, `EPLOY_CLIENT_SECRET`
- The ePloy vacancy IDs you want linked to local open positions
- The candidate custom question IDs for any fields you want mapped in automatically
  - likely notice period
  - likely salary expectation
  - any other candidate metadata you care about
- The vacancy custom question IDs for any vacancy metadata you want mapped
  - likely team
  - likely level
- The Action Type ID to use when pushing interview feedback
- The Action Outcome IDs for:
  - `UNSUCCESSFUL`
  - `YES_AT_DIFFERENT_LEVEL`
  - `PROCEED_TO_NEXT_ROUND`

## Recommended next steps

1. Put the tenant credentials and ID mappings into `.env`
2. Test provider status at `/api/provider`
3. Import a known candidate on the new candidate page
4. Sync a known vacancy on a position page
5. Decide whether feedback should live in ePloy as:
   - workflow actions
   - application custom questions
   - candidate custom questions

My recommendation is to keep feedback push in workflow actions first, because that aligns with ePloy's documented workflow-integration model and keeps the hiring team visible state inside ePloy.
