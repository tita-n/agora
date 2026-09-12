import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "http://localhost:3001/"));

  const role = (session.user as any).role;
  if (role === "business_owner" || role === "admin") {
    return NextResponse.redirect(new URL("/dashboard", process.env.NEXTAUTH_URL || "http://localhost:3001/"));
  }
  if (role === "developer" || role === "admin") {
    return NextResponse.redirect(new URL("/dev", process.env.NEXTAUTH_URL || "http://localhost:3001/"));
  }
  return NextResponse.redirect(new URL("/", process.env.NEXTAUTH_URL || "http://localhost:3001/"));
}
