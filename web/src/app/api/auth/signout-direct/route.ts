import { signOut } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  // Sign out and redirect to home
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/", process.env.NEXTAUTH_URL ?? "http://localhost:3001"));
}
