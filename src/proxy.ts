import { authMiddleware } from "@/lib/auth";
import { canAccessAdminArea } from "@/lib/access";
import { NextResponse } from "next/server";

const isDemoAuthBypass = process.env.DEMO_AUTH_BYPASS === "true";

export default authMiddleware((req) => {
    const { pathname } = req.nextUrl;

    if (isDemoAuthBypass) {
        if (pathname === "/login") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
        return NextResponse.next();
    }

    const session = req.auth;

    if (!session && pathname !== "/login") {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    if (session && pathname === "/login") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (session && pathname.startsWith("/admin") && !canAccessAdminArea(session.user.role)) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
