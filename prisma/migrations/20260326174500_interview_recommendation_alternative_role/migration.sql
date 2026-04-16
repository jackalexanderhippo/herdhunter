-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InterviewRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interviewId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "recommendedLevel" TEXT,
    "levelCalibration" TEXT,
    "alternativeOpenPositionId" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "candidateFeedback" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InterviewRecommendation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewRecommendation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewRecommendation_alternativeOpenPositionId_fkey" FOREIGN KEY ("alternativeOpenPositionId") REFERENCES "OpenPosition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InterviewRecommendation" ("authorId", "candidateFeedback", "id", "interviewId", "levelCalibration", "recommendedLevel", "recommendation", "summary", "updatedAt")
SELECT "authorId", "candidateFeedback", "id", "interviewId", "levelCalibration", "recommendedLevel", "recommendation", "summary", "updatedAt" FROM "InterviewRecommendation";
DROP TABLE "InterviewRecommendation";
ALTER TABLE "new_InterviewRecommendation" RENAME TO "InterviewRecommendation";
CREATE UNIQUE INDEX "InterviewRecommendation_interviewId_authorId_key" ON "InterviewRecommendation"("interviewId", "authorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
