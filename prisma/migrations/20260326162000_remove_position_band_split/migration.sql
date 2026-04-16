-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpenPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "team" TEXT,
    "level" TEXT,
    "targetHires" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "hiringLead" TEXT,
    "interviewLead" TEXT,
    "description" TEXT,
    "eployPositionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OpenPosition" ("createdAt", "description", "eployPositionId", "hiringLead", "id", "interviewLead", "level", "status", "targetHires", "team", "title", "updatedAt")
SELECT
    "createdAt",
    "description",
    "eployPositionId",
    "hiringLead",
    "id",
    "interviewLead",
    COALESCE("level", "hippoBand"),
    "status",
    "targetHires",
    "team",
    "title",
    "updatedAt"
FROM "OpenPosition";
DROP TABLE "OpenPosition";
ALTER TABLE "new_OpenPosition" RENAME TO "OpenPosition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
