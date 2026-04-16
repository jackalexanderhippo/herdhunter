-- CreateTable
CREATE TABLE "InterviewRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interviewId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "recommendedLevel" TEXT,
    "levelCalibration" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "candidateFeedback" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InterviewRecommendation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewRecommendation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewRecommendation_interviewId_authorId_key" ON "InterviewRecommendation"("interviewId", "authorId");
