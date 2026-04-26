import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/utils";
import { analyzeMultipleImagesWithGemini, NOTE_GENERATION_PROMPT } from "@/lib/gemini";

export const maxDuration = 60;

// GET: ノート取得
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");
  const sessionId = searchParams.get("sessionId");
  const id = searchParams.get("id");

  try {
    if (id) {
      const note = await prisma.note.findFirst({
        where: { id, subject: { userId: user!.id } },
        include: { subject: true, session: { include: { photos: true } } },
      });
      if (!note) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
      return NextResponse.json(note);
    }

    const notes = await prisma.note.findMany({
      where: {
        subject: { userId: user!.id },
        subjectId: subjectId || undefined,
        sessionId: sessionId || undefined,
      },
      include: { subject: { select: { id: true, name: true, color: true } }, session: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(notes);
  } catch (err: any) {
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

// POST: AIノート生成
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const { sessionId, subjectId, title } = await req.json();

    if (!sessionId) return NextResponse.json({ error: "sessionIdが必要です" }, { status: 400 });

    const session = await prisma.lectureSession.findFirst({
      where: { id: sessionId, subject: { userId: user!.id } },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        subject: true,
        note: true,
      },
    });

    if (!session) return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
    if (!session.photos.length) return NextResponse.json({ error: "写真がありません" }, { status: 400 });

    const noteTitle = title || `${session.subject.name} - ${new Date(session.date).toLocaleDateString("ja-JP")} 第${session.sessionNum}回`;

    let content = "";

    if (!process.env.GEMINI_API_KEY) {
      // デモ用コンテンツ
      content = `# ${noteTitle}

## 本日の要点

- AIノート生成のデモです（Gemini APIキー未設定）
- 実際のキーを設定すると、板書写真から自動でノートが生成されます

## 主要概念

### 1. 基本定義
- **概念A**: 重要な定義がここに記載されます
- **概念B**: 関連する理論の説明

### 2. 重要な定理・公式

> ⭐️ **重要**: 試験頻出の公式

$$E = mc^2$$（例）

## まとめ

この授業では主に〇〇について学びました。

## 試験対策チェックリスト

- [ ] 基本概念の定義を暗記する
- [ ] 公式の導出を理解する
- [ ] 演習問題を解く
`;
    } else {
      // 写真をBase64に変換してAIへ送信
      console.log(`[Notes] Starting note generation for session ${sessionId}`);
      console.log(`[Notes] Processing ${session.photos.length} photos`);

      const MAX_IMAGES = 12;
      const selectedPhotos = session.photos.slice(0, MAX_IMAGES);
      if (session.photos.length > MAX_IMAGES) {
        console.log(`[Notes] Limiting note generation to first ${MAX_IMAGES} photos for speed`);
      }

      const images = await Promise.all(
        selectedPhotos.map(async (photo) => {
          try {
            if (photo.url.startsWith("data:")) {
              const [header, data] = photo.url.split(",");
              const mimeType = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
              console.log(`[Notes] Loaded inline photo (${mimeType})`);
              return { base64: data, mimeType };
            }

            console.log(`[Notes] Fetching photo from URL: ${photo.url.substring(0, 80)}...`);
            const res = await fetch(photo.url);
            if (!res.ok) {
              console.error(`[Notes] Failed to fetch photo: ${res.status} ${res.statusText}`);
              return null;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            const mimeType = res.headers.get("content-type") || "image/jpeg";
            console.log(`[Notes] Fetched photo (${mimeType}, ${buf.byteLength} bytes)`);
            return { base64: buf.toString("base64"), mimeType };
          } catch (photoErr: any) {
            console.error(`[Notes] Error processing photo ${photo.id}:`, photoErr.message);
            return null;
          }
        })
      );

      const validImages = images.filter((img): img is { base64: string; mimeType: string } => !!img);
      if (!validImages.length) {
        return NextResponse.json({ error: "画像の読み込みに失敗しました。写真のURLが無効な可能性があります。" }, { status: 500 });
      }

      console.log(`[Notes] ${validImages.length}/${selectedPhotos.length} photos loaded successfully`);

      const prompt = `${NOTE_GENERATION_PROMPT}

科目名: ${session.subject.name}
授業日: ${new Date(session.date).toLocaleDateString("ja-JP")}
授業回: 第${session.sessionNum}回

以下の${validImages.length}枚の板書写真を元にノートを作成してください。`;

      content = await analyzeMultipleImagesWithGemini(validImages, prompt);
      console.log(`[Notes] Generated note: ${content.length} chars`);

      if (!content || content.length < 10) {
        return NextResponse.json({ error: "AIがノートを生成できませんでした。再度お試しください。" }, { status: 500 });
      }
    }

    // 既存ノートを更新 or 新規作成
    let note;
    if (session.note) {
      note = await prisma.note.update({
        where: { id: session.note.id },
        data: { title: noteTitle, content },
      });
    } else {
      note = await prisma.note.create({
        data: {
          subjectId: session.subjectId,
          sessionId,
          title: noteTitle,
          content,
        },
      });
    }

    return NextResponse.json({ success: true, note });
  } catch (err: any) {
    console.error("Note generation error:", err);
    return NextResponse.json({ error: "ノート生成失敗", details: err.message }, { status: 500 });
  }
}

// PUT: ノート手動編集
export async function PUT(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const { id, title, content, isFavorite } = await req.json();
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    const note = await prisma.note.findFirst({ where: { id, subject: { userId: user!.id } } });
    if (!note) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

    const updated = await prisma.note.update({
      where: { id },
      data: {
        title: title !== undefined ? title : note.title,
        content: content !== undefined ? content : note.content,
        isFavorite: isFavorite !== undefined ? isFavorite : note.isFavorite,
      },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  }
}

// DELETE: ノート削除
export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

  try {
    const note = await prisma.note.findFirst({ where: { id, subject: { userId: user!.id } } });
    if (!note) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

    await prisma.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "削除失敗" }, { status: 500 });
  }
}
