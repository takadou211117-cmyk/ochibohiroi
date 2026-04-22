import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, randomColor } from "@/lib/utils";

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const subjects = await prisma.subject.findMany({
      where: { userId: user!.id },
      include: {
        schedules: true,
        _count: { select: { sessions: true, notes: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(subjects);
  } catch (err: any) {
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const { name, color, emoji, professor, room, dayOfWeek, period, startTime, endTime } = await req.json();
    if (!name) return NextResponse.json({ error: "科目名は必須です" }, { status: 400 });

    const subject = await prisma.subject.create({
      data: {
        userId: user!.id,
        name,
        color: color || randomColor(),
        emoji: emoji || null,
        professor: professor || null,
        room: room || null,
        schedules: dayOfWeek !== undefined && period
          ? { create: { dayOfWeek: parseInt(dayOfWeek), period: parseInt(period), startTime: startTime || null, endTime: endTime || null } }
          : undefined,
      },
      include: { schedules: true },
    });
    return NextResponse.json(subject, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: "作成失敗" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const { id, name, color, emoji, professor, room } = await req.json();
    const subject = await prisma.subject.findFirst({ where: { id, userId: user!.id } });
    if (!subject) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

    const updated = await prisma.subject.update({
      where: { id },
      data: { name, color, emoji, professor, room },
      include: { schedules: true },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    const subject = await prisma.subject.findFirst({ where: { id, userId: user!.id } });
    if (!subject) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

    await prisma.subject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "削除失敗" }, { status: 500 });
  }
}
