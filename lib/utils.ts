import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function getAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { user: null, error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  return { user: session.user as { id: string; email: string; name?: string | null; role?: string }, error: null };
}

export function isAdmin(user: { role?: string }) {
  return user.role === "admin";
}

export const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
  "#a855f7", "#06b6d4",
];

export const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export function dayNameToNumber(day: string): number {
  return DAY_NAMES.indexOf(day);
}

export function numberToDayName(num: number): string {
  return DAY_NAMES[num] || "不明";
}

export function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
