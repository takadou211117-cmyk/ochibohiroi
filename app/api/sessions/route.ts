import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/utils";
import { analyzeImageWithGemini, detectSubjectFromTimestamp } from "@/lib/gemini";
import { uploadPhoto } from "@/lib/supabase";

export const maxDuration = 60;

// GET: セッション一覧
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");
  const sessionId = searchParams.get("sessionId"); // 個別セッション詳細取得

  try {
    // 個別セッション詳細（写真URL含む完全データ）
    if (sessionId) {
      const session = await prisma.lectureSession.findFirst({
        where: {
          id: sessionId,
          subject: { userId: user!.id },
        },
        include: {
          photos: { orderBy: { sortOrder: "asc" } },
          note: true,
          subject: { select: { id: true, name: true, color: true } },
        },
      });
      if (!session) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
      return NextResponse.json(session);
    }

    // セッション一覧（軽量: 写真URLを除外、カウントと先頭サムネイルのみ）
    const sessions = await prisma.lectureSession.findMany({
      where: {
        subjectId: subjectId || undefined,
        subject: { userId: user!.id },
      },
      select: {
        id: true,
        date: true,
        sessionNum: true,
        subjectId: true,
        subject: { select: { id: true, name: true, color: true } },
        note: { select: { id: true, title: true } },
        _count: { select: { photos: true } },
        // 先頭4枚のサムネイルURLのみ取得（一覧表示用）
        photos: {
          orderBy: { sortOrder: "asc" },
          take: 4,
          select: { id: true, url: true },
        },
      },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(sessions);
  } catch (err: any) {
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

// POST: 板書写真アップロード + セッション自動作成 + AI振り分け
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const formData = await req.formData();
    const files = formData.getAll("photos") as File[];
    const subjectIdParam = formData.get("subjectId") as string | null;
    const subjectNameParam = formData.get("subjectName") as string | null;
    const dateParam = formData.get("date") as string | null;

    if (!files.length) {
      return NextResponse.json({ error: "写真が見つかりません" }, { status: 400 });
    }

    // ===== 科目判定（最速ルートから順に試みる） =====
    let targetSubjectId: string | null = subjectIdParam;

    if (!targetSubjectId) {
      // 科目判定が必要な場合のみDBから取得
      const allSubjects = await prisma.subject.findMany({
        where: { userId: user!.id },
        include: { schedules: true },
      });

      if (subjectNameParam) {
        // ルート2: 科目名直接指定
        const existingSubject = allSubjects.find((s) => s.name === subjectNameParam.trim());
        if (existingSubject) {
          targetSubjectId = existingSubject.id;
        } else {
          const newSubject = await prisma.subject.create({
            data: { userId: user!.id, name: subjectNameParam.trim(), color: "#6d28d9" },
            select: { id: true },
          });
          targetSubjectId = newSubject.id;
        }
      } else {
        // ルート3: タイムスタンプ判定（無料・即時）
        const firstFileDate = files[0].lastModified ? new Date(files[0].lastModified) : new Date();
        const allSchedules = allSubjects.flatMap((s) =>
          s.schedules.map((sch) => ({ ...sch, subjectId: s.id }))
        );
        targetSubjectId = detectSubjectFromTimestamp(firstFileDate, allSchedules);

        // ルート4: AI判定（タイムスタンプで分からない場合のフォールバック）
        if (!targetSubjectId && allSubjects.length > 0 && process.env.GEMINI_API_KEY) {
          try {
            const bytes = await files[0].arrayBuffer();
            const base64 = Buffer.from(bytes).toString("base64");
            const subjectNames = allSubjects.map((s) => s.name).join("、");
            // analyzeImageWithGemini（JSON modeあり）を使用して高速化
            const aiPrompt = `板書写真から科目を特定してください。候補:「${subjectNames}」\n{"subjectName":"科目名または null"}`;
            const aiResult = await analyzeImageWithGemini(base64, files[0].type, aiPrompt, true);
            const parsed = JSON.parse(aiResult.trim());
            if (parsed.subjectName) {
              const matchedSubject = allSubjects.find((s) => s.name === parsed.subjectName);
              if (matchedSubject) targetSubjectId = matchedSubject.id;
            }
          } catch (aiErr: any) {
            console.error("[Sessions] AI subject detection failed:", aiErr.message);
          }
        }

        // 最終フォールバック: 最初の科目に割り当て
        if (!targetSubjectId && allSubjects.length > 0) {
          targetSubjectId = allSubjects[0].id;
        }
      }
    }

    if (!targetSubjectId) {
      return NextResponse.json({ error: "科目が見つかりません。先に時間割を登録してください。" }, { status: 400 });
    }

    // ===== セッション取得 or 作成 =====
    const firstFileDate = files[0].lastModified ? new Date(files[0].lastModified) : new Date();
    const sessionDate = dateParam ? new Date(dateParam) : firstFileDate;
    const dayStart = new Date(sessionDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(sessionDate); dayEnd.setHours(23, 59, 59, 999);

    // findFirst + count を並列実行して1ラウンドトリップを節約
    let session = await prisma.lectureSession.findFirst({
      where: { subjectId: targetSubjectId, date: { gte: dayStart, lte: dayEnd } },
      select: { id: true, sessionNum: true },
    });

    if (!session) {
      const sessionCount = await prisma.lectureSession.count({ where: { subjectId: targetSubjectId } });
      session = await prisma.lectureSession.create({
        data: { subjectId: targetSubjectId, date: sessionDate, sessionNum: sessionCount + 1 },
        select: { id: true, sessionNum: true },
      });
    }

    const hasSupabaseConfig = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL;
    const initialPhotoCount = await prisma.photo.count({ where: { sessionId: session.id } });

    // ===== 全画像の並列アップロード & DB保存 =====
    const results = await Promise.all(files.map(async (file, index) => {
      try {
        const takenAt = file.lastModified ? new Date(file.lastModified) : new Date();
        let photoUrl = "";
        let storageKey = "";

        if (hasSupabaseConfig) {
          const uploaded = await uploadPhoto(file, user!.id, targetSubjectId!, session!.id);
          if (uploaded) { photoUrl = uploaded.url; storageKey = uploaded.key; }
        }

        if (!photoUrl) {
          const bytes = await file.arrayBuffer();
          photoUrl = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
        }

        // 不要なJOIN（session+subject）を除去して軽量に
        const photo = await prisma.photo.create({
          data: {
            sessionId: session!.id,
            url: photoUrl,
            storageKey: storageKey || null,
            takenAt,
            sortOrder: initialPhotoCount + index,
          },
          select: { id: true },
        });

        return { success: true, photoId: photo.id };
      } catch (fileErr: any) {
        console.error(`[Sessions] Error processing file ${file.name}:`, fileErr.message);
        return { error: fileErr.message, file: file.name };
      }
    }));

    const successCount = results.filter((r) => "success" in r).length;
    return NextResponse.json({ success: true, sessionId: session.id, count: successCount });
  } catch (err: any) {
    console.error("Photos upload error:", err);
    return NextResponse.json({ error: "アップロード失敗", details: err.message }, { status: 500 });
  }
}


