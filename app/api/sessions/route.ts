import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/utils";
import { analyzeMultipleImagesWithGemini, detectSubjectFromTimestamp } from "@/lib/gemini";
import { uploadPhoto } from "@/lib/supabase";

export const maxDuration = 60;

// GET: セッション一覧
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");

  try {
    const sessions = await prisma.lectureSession.findMany({
      where: {
        subjectId: subjectId || undefined,
        subject: { userId: user!.id },
      },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        note: true,
        subject: { select: { id: true, name: true, color: true } },
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
    const dateParam = formData.get("date") as string | null;

    if (!files.length) {
      return NextResponse.json({ error: "写真が見つかりません" }, { status: 400 });
    }

    // 全科目のスケジュールを取得（AI振り分け用）
    const allSubjects = await prisma.subject.findMany({
      where: { userId: user!.id },
      include: { schedules: true },
    });

    const allSchedules = allSubjects.flatMap((s) =>
      s.schedules.map((sch) => ({ ...sch, subjectId: s.id }))
    );

    const results = [];

    for (const file of files) {
      try {
        // 撮影時刻の取得（ファイルの最終更新時刻またはnow）
        const takenAt = file.lastModified ? new Date(file.lastModified) : new Date();

        // 科目の自動判定
        let targetSubjectId = subjectIdParam;
        if (!targetSubjectId) {
          targetSubjectId = detectSubjectFromTimestamp(takenAt, allSchedules);
        }

        // それでも判定できない場合はAI解析
        if (!targetSubjectId && allSubjects.length > 0 && process.env.GEMINI_API_KEY) {
          try {
            const bytes = await file.arrayBuffer();
            const base64 = Buffer.from(bytes).toString("base64");

            const subjectNames = allSubjects.map((s) => s.name).join("、");
            const aiPrompt = `この写真は大学の授業の板書です。登録されている科目は「${subjectNames}」です。
写真の内容から最も関連する科目名だけを返してください（JSON形式で）。
{"subjectName": "科目名"}
判断できない場合は{"subjectName": null}を返してください。
マークダウンやコードブロックは使わず、純粋なJSONのみを返してください。`;

            const aiResult = await analyzeMultipleImagesWithGemini(
              [{ base64, mimeType: file.type }],
              aiPrompt
            );
            
            // JSON パース（堅牢に）
            let cleanResult = aiResult.trim();
            const codeBlockMatch = cleanResult.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
            if (codeBlockMatch) cleanResult = codeBlockMatch[1].trim();
            
            const parsed = JSON.parse(cleanResult);
            if (parsed.subjectName) {
              const matchedSubject = allSubjects.find((s) => s.name === parsed.subjectName);
              if (matchedSubject) targetSubjectId = matchedSubject.id;
            }
          } catch (aiErr: any) {
            console.error("[Sessions] AI subject detection failed:", aiErr.message);
            // AI判定失敗しても処理は続行
          }
        }

        // 科目が特定できない場合は最初の科目に割り当て
        if (!targetSubjectId && allSubjects.length > 0) {
          targetSubjectId = allSubjects[0].id;
        }

        if (!targetSubjectId) {
          results.push({ error: "科目が見つかりません。先に時間割を登録してください。", file: file.name });
          continue;
        }

        // セッション（授業回）を取得または作成
        const sessionDate = dateParam ? new Date(dateParam) : takenAt;
        const dayStart = new Date(sessionDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(sessionDate);
        dayEnd.setHours(23, 59, 59, 999);

        let session = await prisma.lectureSession.findFirst({
          where: {
            subjectId: targetSubjectId,
            date: { gte: dayStart, lte: dayEnd },
          },
        });

        if (!session) {
          const sessionCount = await prisma.lectureSession.count({
            where: { subjectId: targetSubjectId },
          });
          session = await prisma.lectureSession.create({
            data: {
              subjectId: targetSubjectId,
              date: sessionDate,
              sessionNum: sessionCount + 1,
            },
          });
        }

        // Supabase Storageに写真をアップロード
        let photoUrl = "";
        let storageKey = "";

        const hasSupabaseConfig = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (hasSupabaseConfig) {
          const uploaded = await uploadPhoto(file, user!.id, targetSubjectId, session.id);
          if (uploaded) {
            photoUrl = uploaded.url;
            storageKey = uploaded.key;
          }
        }
        
        if (!photoUrl) {
          // Supabase未設定またはアップロード失敗の場合はBase64でDBに直接保存
          const bytes = await file.arrayBuffer();
          const base64 = Buffer.from(bytes).toString("base64");
          photoUrl = `data:${file.type};base64,${base64}`;
          storageKey = "";
        }

        const photoCount = await prisma.photo.count({ where: { sessionId: session.id } });

        const photo = await prisma.photo.create({
          data: {
            sessionId: session.id,
            url: photoUrl,
            storageKey: storageKey || null,
            takenAt,
            sortOrder: photoCount,
          },
          include: { session: { include: { subject: true } } },
        });

        results.push({ success: true, photo, session });
      } catch (fileErr: any) {
        console.error(`[Sessions] Error processing file ${file.name}:`, fileErr.message);
        results.push({ error: fileErr.message, file: file.name });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error("Photos upload error:", err);
    return NextResponse.json({ error: "アップロード失敗", details: err.message }, { status: 500 });
  }
}
