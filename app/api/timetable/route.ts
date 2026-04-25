import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, dayNameToNumber, randomColor } from "@/lib/utils";
import { analyzeImageWithGemini, TIMETABLE_PROMPT } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    const formData = await req.formData();
    const image = formData.get("image") as File;

    if (!image) {
      return NextResponse.json({ error: "画像が見つかりません" }, { status: 400 });
    }

    const HAS_API_KEY = !!process.env.GEMINI_API_KEY;
    let parsedSubjects: any[] = [];

    if (!HAS_API_KEY) {
      parsedSubjects = [
        { name: "デモ: AI基礎論", dayOfWeek: "月", period: 1, professor: "田中教授", room: "101教室" },
        { name: "デモ: データ科学", dayOfWeek: "火", period: 3, professor: null, room: null },
        { name: "デモ: プログラミング演習", dayOfWeek: "水", period: 2, professor: "鈴木教授", room: "PC室A" },
        { name: "デモ: 数理統計学", dayOfWeek: "木", period: 4, professor: null, room: null },
        { name: "デモ: 情報理論", dayOfWeek: "金", period: 1, professor: "佐藤教授", room: "302教室" },
      ];
    } else {
      const bytes = await image.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      
      console.log("[Timetable] Starting AI analysis...");
      console.log("[Timetable] Image type:", image.type, "Size:", bytes.byteLength, "bytes");
      
      const resultText = await analyzeImageWithGemini(base64, image.type, TIMETABLE_PROMPT);
      console.log("[Timetable] AI result:", resultText.substring(0, 500));
      
      // JSON パース（より堅牢に）
      let parsed: any;
      try {
        parsed = JSON.parse(resultText);
      } catch (parseErr) {
        console.error("[Timetable] JSON parse failed, attempting to extract JSON...");
        console.error("[Timetable] Raw text:", resultText);
        
        // JSON部分を抽出する試み
        const jsonMatch = resultText.match(/\{[\s\S]*"subjects"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw new Error(`AIの応答をJSONとしてパースできませんでした: ${resultText.substring(0, 200)}`);
          }
        } else {
          throw new Error(`AIの応答にsubjectsデータが見つかりません: ${resultText.substring(0, 200)}`);
        }
      }

      parsedSubjects = parsed.subjects || parsed.Subjects || [];
      
      if (!Array.isArray(parsedSubjects)) {
        throw new Error("AIの応答からsubjects配列を取得できませんでした");
      }
      
      console.log(`[Timetable] Parsed ${parsedSubjects.length} subjects`);
    }

    // メモリ上で科目名ごとにグループ化（複数コマの同名科目の重複作成を防ぐため）
    const subjectsMap = new Map();
    for (const s of parsedSubjects) {
      if (!s.name || !s.dayOfWeek) continue;
      const dayOfWeek = dayNameToNumber(s.dayOfWeek);
      const period = typeof s.period === "number" ? s.period : parseInt(s.period) || 1;

      if (!subjectsMap.has(s.name)) {
        subjectsMap.set(s.name, {
          name: s.name,
          professor: s.professor || null,
          room: s.room || null,
          schedules: []
        });
      }
      subjectsMap.get(s.name).schedules.push({
        dayOfWeek,
        period,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
      });
    }

    // 科目ごとに並列でDBに保存（超高速化）
    const createdSubjects = await Promise.all(
      Array.from(subjectsMap.values()).map(async (s) => {
        const existing = await prisma.subject.findFirst({
          where: { userId: user!.id, name: s.name },
        });

        if (existing) {
          console.log(`[Timetable] Subject already exists: ${s.name}, checking schedules`);
          // 既存科目の場合、スケジュールを並列で追加
          await Promise.all(s.schedules.map(async (sch: any) => {
            const existingSch = await prisma.schedule.findFirst({
              where: { subjectId: existing.id, dayOfWeek: sch.dayOfWeek, period: sch.period },
            });
            if (!existingSch) {
              await prisma.schedule.create({
                data: {
                  subjectId: existing.id,
                  dayOfWeek: sch.dayOfWeek,
                  period: sch.period,
                  startTime: sch.startTime,
                  endTime: sch.endTime,
                }
              });
            }
          }));
          return existing;
        } else {
          // 新規科目の場合、すべてのスケジュールを一度に作成（ネスト作成で1クエリに！）
          console.log(`[Timetable] Creating new subject: ${s.name} with ${s.schedules.length} schedules`);
          const subject = await prisma.subject.create({
            data: {
              userId: user!.id,
              name: s.name,
              color: randomColor(),
              professor: s.professor,
              room: s.room,
              schedules: {
                create: s.schedules,
              },
            },
            include: { schedules: true },
          });
          return subject;
        }
      })
    );

    return NextResponse.json({ success: true, subjects: createdSubjects, count: createdSubjects.length });
  } catch (err: any) {
    console.error("Timetable error:", err);
    return NextResponse.json(
      { error: "時間割の解析に失敗しました", details: err.message },
      { status: 500 }
    );
  }
}
