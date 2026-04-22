import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;
  if (!isAdmin(user!)) return NextResponse.json({ error: "管理者のみアクセス可能" }, { status: 403 });

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        age: true,
        grade: true,
        school: true,
        department: true,
        role: true,
        createdAt: true,
        _count: { select: { subjects: true } },
        subjects: {
          select: {
            id: true,
            name: true,
            color: true,
            schedules: true,
            _count: { select: { sessions: true, notes: true } },
          },
        },
      },
    });
    return NextResponse.json(users);
  } catch (err: any) {
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;
  if (!isAdmin(user!)) return NextResponse.json({ error: "管理者のみアクセス可能" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get("id");
  if (!targetId) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

  try {
    await prisma.user.delete({ where: { id: targetId } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "削除失敗" }, { status: 500 });
  }
}
