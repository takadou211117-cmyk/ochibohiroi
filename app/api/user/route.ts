import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/utils";

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const fullUser = await prisma.user.findUnique({
      where: { id: user!.id },
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
        subjects: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            color: true,
            professor: true,
            room: true,
            schedules: true,
            _count: { select: { sessions: true, notes: true } },
          },
        },
      },
    });
    return NextResponse.json(fullUser);
  } catch (err: any) {
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const { name, age, grade, school, department } = await req.json();
    const updated = await prisma.user.update({
      where: { id: user!.id },
      data: {
        name: name || null,
        age: age ? parseInt(age) : null,
        grade: grade ? parseInt(grade) : null,
        school: school || null,
        department: department || null,
      },
      select: { id: true, email: true, name: true, age: true, grade: true, school: true, department: true, role: true },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  }
}
