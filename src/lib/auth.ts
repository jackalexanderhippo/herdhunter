import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";

const DEV_USER = {
  id: "dev-user-local",
  name: "Dev Admin",
  email: "dev@herdhunter.local",
  image: null,
  role: "ADMIN_INTERVIEWER" as Role,
};

const isDev = process.env.NODE_ENV === "development";
const isDemoAuthBypass = process.env.DEMO_AUTH_BYPASS === "true";

function isDevAdminIdentity(input: { id?: string | null; email?: string | null }) {
  return input.id === DEV_USER.id || input.email?.toLowerCase() === DEV_USER.email;
}

function createDemoSession(): Session {
  return {
    user: {
      id: DEV_USER.id,
      name: DEV_USER.name,
      email: DEV_USER.email,
      image: DEV_USER.image,
      role: DEV_USER.role,
    },
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function ensureDemoUserExists() {
  await prisma.user.upsert({
    where: { id: DEV_USER.id },
    update: { name: DEV_USER.name, email: DEV_USER.email, role: DEV_USER.role },
    create: { id: DEV_USER.id, name: DEV_USER.name, email: DEV_USER.email, role: DEV_USER.role },
  });
}

const nextAuth = NextAuth({
  // In dev, use JWT sessions so we don't need a DB-backed user for the credentials provider
  session: { strategy: isDev ? "jwt" : "database" },
  adapter: isDev ? undefined : PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim();
        const password = credentials?.password?.toString();
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, image: true, role: true, passwordHash: true },
        });
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
    ...(isDev
      ? [
        CredentialsProvider({
          id: "dev-login",
          name: "Dev Login",
          credentials: {},
          async authorize() {
            // Upsert the dev user in the DB so candidate/note relations work
            await prisma.user.upsert({
              where: { id: DEV_USER.id },
              update: {},
              create: { id: DEV_USER.id, name: DEV_USER.name, email: DEV_USER.email, role: DEV_USER.role },
            });
            return DEV_USER;
          },
        }),
      ]
      : [
        GoogleProvider({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
      ]),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        if (isDevAdminIdentity({ id: user.id, email: user.email })) {
          token.role = DEV_USER.role;
          return token;
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        token.role = dbUser?.role ?? (user as typeof DEV_USER).role ?? "HIRING_TEAM";
      } else if (isDevAdminIdentity({ id: token.id as string | undefined, email: token.email as string | undefined })) {
        token.role = DEV_USER.role;
      }
      return token;
    },
    async session({ session, token, user }) {
      if (!session.user) return session;

      const resolvedUserId = isDev
        ? (token.id as string | undefined)
        : user?.id ?? token.sub;

      if (!resolvedUserId) return session;

      session.user.id = resolvedUserId;
      if (isDevAdminIdentity({ id: resolvedUserId, email: session.user.email ?? (token.email as string | undefined) })) {
        session.user.role = DEV_USER.role;
        return session;
      }
      const dbUser = await prisma.user.findUnique({
        where: { id: resolvedUserId },
        select: { role: true },
      });
      if (dbUser?.role) {
        session.user.role = dbUser.role;
      } else {
        session.user.role = (token.role as Role) ?? "HIRING_TEAM";
      }
      return session;
    },
    async signIn({ user, account }) {
      if (isDev) return true;
      if (!user.email) return true;
      if (account?.provider === "credentials") return true;

      // Check if there's a pending invitation for this email
      const invitation = await prisma.invitation.findFirst({
        where: { email: user.email, usedAt: null },
      });

      if (invitation) {
        // Assign the invited role and mark invitation as used
        await prisma.user.update({
          where: { email: user.email },
          data: { role: invitation.role },
        }).catch(() => { });
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { usedAt: new Date() },
        }).catch(() => { });
      } else {
        // First user becomes admin; all others stay HIRING_TEAM
        const count = await prisma.user.count();
        if (count === 0) {
          await prisma.user.update({
            where: { email: user.email },
            data: { role: "ADMIN_INTERVIEWER" },
          }).catch(() => { });
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
});

const nextAuthAuth = nextAuth.auth;

export const { handlers, signIn, signOut } = nextAuth;
export const authMiddleware = nextAuthAuth;

export async function auth() {
  if (!isDemoAuthBypass) {
    return nextAuthAuth();
  }
  await ensureDemoUserExists();
  return createDemoSession();
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}
