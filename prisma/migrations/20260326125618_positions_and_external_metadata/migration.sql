-- AlterTable
ALTER TABLE "Interview" ADD COLUMN "calendarEventId" TEXT;
ALTER TABLE "Interview" ADD COLUMN "calendarEventUrl" TEXT;
ALTER TABLE "Interview" ADD COLUMN "geminiNotes" TEXT;
ALTER TABLE "Interview" ADD COLUMN "geminiNotesImportedAt" DATETIME;

-- CreateTable
CREATE TABLE "OpenPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "team" TEXT,
    "level" TEXT,
    "hippoBand" TEXT,
    "targetHires" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "hiringLead" TEXT,
    "interviewLead" TEXT,
    "description" TEXT,
    "eployPositionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PositionCandidateAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "openPositionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL DEFAULT 'HOLD',
    "summary" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PositionCandidateAssessment_openPositionId_fkey" FOREIGN KEY ("openPositionId") REFERENCES "OpenPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PositionCandidateAssessment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PositionCandidateAssessment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT NOT NULL,
    "openPositionId" TEXT,
    "noticePeriodDays" INTEGER,
    "salaryExpectation" INTEGER,
    "recommendedSalary" INTEGER,
    "salaryExpectationBand" TEXT,
    "recommendedBand" TEXT,
    "hiringSummary" TEXT,
    "eployCandidateId" TEXT,
    "eployCvUrl" TEXT,
    "eployMetadata" TEXT,
    "eployLastSyncAt" DATETIME,
    "eployFeedbackSummary" TEXT,
    "eployFeedbackPushedAt" DATETIME,
    "professionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "cvPath" TEXT,
    "cvFilename" TEXT,
    "cvUploadedAt" DATETIME,
    "cvDeleteAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Candidate_openPositionId_fkey" FOREIGN KEY ("openPositionId") REFERENCES "OpenPosition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Candidate_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Candidate" ("createdAt", "cvDeleteAt", "cvFilename", "cvPath", "cvUploadedAt", "email", "hiringSummary", "id", "name", "noticePeriodDays", "phone", "position", "professionId", "recommendedSalary", "salaryExpectation", "status", "updatedAt") SELECT "createdAt", "cvDeleteAt", "cvFilename", "cvPath", "cvUploadedAt", "email", "hiringSummary", "id", "name", "noticePeriodDays", "phone", "position", "professionId", "recommendedSalary", "salaryExpectation", "status", "updatedAt" FROM "Candidate";
DROP TABLE "Candidate";
ALTER TABLE "new_Candidate" RENAME TO "Candidate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PositionCandidateAssessment_openPositionId_candidateId_key" ON "PositionCandidateAssessment"("openPositionId", "candidateId");
