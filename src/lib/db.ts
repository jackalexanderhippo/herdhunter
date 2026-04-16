import { PrismaClient } from "@prisma/client";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const localDbUrl = `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
const configuredDbUrl = process.env.DATABASE_URL;
const effectiveDbUrl = configuredDbUrl?.startsWith("file:") ? configuredDbUrl : localDbUrl;

export const prisma = globalForPrisma.prisma || new PrismaClient({
    datasources: {
        db: {
            url: effectiveDbUrl,
        },
    },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
