import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, dayNameToNumber, randomColor } from "@/lib/utils";
import { analyzeImageWithGemini, TIMETABLE_PROMPT } from "@/lib/gemini";

export const maxDuration = 60;

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
      const resultText = await analyzeImageWithGemini(base64, image.type, TIMETABLE_PROMPT);
      
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

    const subjectNames = Array.from(subjectsMap.keys());

    // 事前に既存科目とスケジュールをバッチで取得してDBクエリを削減
    const existingSubjects = await prisma.subject.findMany({
      where: { userId: user!.id, name: { in: subjectNames } },
      include: { schedules: true },
    });
    const existingSubjectsByName = new Map(existingSubjects.map((sub) => [sub.name, sub]));

    const createdSubjects = await Promise.all(
      Array.from(subjectsMap.values()).map(async (s) => {
        const existing = existingSubjectsByName.get(s.name);

        if (existing) {
          console.log(`[Timetable] Subject already exists: ${s.name}, checking schedules`);
          const scheduleByKey = new Set(existing.schedules.map((sch) => `${sch.dayOfWeek}:${sch.period}`));

          await Promise.all(s.schedules.map(async (sch: any) => {
            const key = `${sch.dayOfWeek}:${sch.period}`;
            if (scheduleByKey.has(key)) return;
            scheduleByKey.add(key);
            await prisma.schedule.create({
              data: {
                subjectId: existing.id,
                dayOfWeek: sch.dayOfWeek,
                period: sch.period,
                startTime: sch.startTime,
                endTime: sch.endTime,
              },
            });
          }));
          return existing;
        } else {
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
