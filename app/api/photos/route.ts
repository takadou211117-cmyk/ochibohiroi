import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/utils";
import { deletePhoto } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

  try {
    const photo = await prisma.photo.findFirst({
      where: { id, session: { subject: { userId: user!.id } } },
    });
    if (!photo) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

    const body = await req.json();
    const updated = await prisma.photo.update({
      where: { id },
      data: {
        memo: body.memo !== undefined ? body.memo : photo.memo,
        isFavorite: body.isFavorite !== undefined ? body.isFavorite : photo.isFavorite,
        sortOrder: body.sortOrder !== undefined ? body.sortOrder : photo.sortOrder,
      },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const ids = searchParams.get("ids"); // カンマ区切りで複数削除

  try {
    const photoIds = ids ? ids.split(",") : id ? [id] : [];
    if (!photoIds.length) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    const photos = await prisma.photo.findMany({
      where: { id: { in: photoIds }, session: { subject: { userId: user!.id } } },
    });

    for (const photo of photos) {
      if (photo.storageKey) await deletePhoto(photo.storageKey);
      await prisma.photo.delete({ where: { id: photo.id } });
    }

    return NextResponse.json({ success: true, deleted: photos.length });
  } catch (err: any) {
    return NextResponse.json({ error: "削除失敗" }, { status: 500 });
  }
}
