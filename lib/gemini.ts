import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

// 高精度タスク（時間割・ノート生成）
const PRIMARY_MODEL = "gemini-2.5-flash";
// 高速タスク（科目判定など単純分類）
const FAST_MODEL = "gemini-2.0-flash";

export function getGeminiClient() {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

function cleanResponseText(text: string): string {
  if (!text) return "";
  const cleaned = text.trim();
  const m = cleaned.match(/^```(?:json|markdown)?\s*\n?([\s\S]*?)\n?\s*```$/i);
  return m ? m[1].trim() : cleaned;
}

/**
 * 単一画像のAI解析
 * @param fast true にすると gemini-2.0-flash を直接使用（フォールバックなし・高速）
 */
export async function analyzeImageWithGemini(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  fast = false
): Promise<string> {
  const ai = getGeminiClient();

  if (fast) {
    // 単純タスク用: 2.0-flash を直接呼び出し（ループなし = オーバーヘッドゼロ）
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      }],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const raw = response.text || "";
    if (!raw.trim()) throw new Error("Empty response from Gemini");
    return cleanResponseText(raw);
  }

  // 精度重視タスク: PRIMARY → FALLBACK
  let lastError: Error | null = null;
  for (const model of [PRIMARY_MODEL, FAST_MODEL]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        }],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const raw = response.text || "";
      if (!raw.trim()) throw new Error("Empty response from Gemini");
      return cleanResponseText(raw);
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error("All Gemini models failed");
}

/**
 * 複数画像のAI解析（ノート生成用）
 */
export async function analyzeMultipleImagesWithGemini(
  images: { base64: string; mimeType: string }[],
  prompt: string
): Promise<string> {
  const ai = getGeminiClient();
  const parts: any[] = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }

  let lastError: Error | null = null;
  for (const model of [PRIMARY_MODEL, FAST_MODEL]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { thinkingConfig: { thinkingBudget: 0 } },
      });
      const raw = response.text || "";
      if (!raw.trim()) throw new Error("Empty response from Gemini");
      return cleanResponseText(raw);
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error("All Gemini models failed");
}

// ── プロンプト ──────────────────────────────────────────────────

/**
 * 時間割パース用プロンプト（短縮版: ~120トークン）
 * 従来の ~500トークン から75%削減
 */
export const TIMETABLE_PROMPT = `時間割表の全授業をJSONで返してください。
縦=曜日(月火水木金土)、横=時限(1〜6)のグリッドです。
ルール: 科目名が複数行なら連結する。教室番号・オンデマンド等はroomに入れる。連続時限は各時限ごとに別エントリで。
出力フォーマット（JSONのみ、マークダウン不使用）:
{"subjects":[{"name":"科目名","dayOfWeek":"月","period":1,"startTime":null,"endTime":null,"professor":null,"room":null}]}`;

/**
 * ノート生成用プロンプト
 */
export const NOTE_GENERATION_PROMPT = `板書写真から試験対策ノートをMarkdownで作成してください。

要件:
- 章・節・箇条書きで論理的に構造化
- 重要な概念・定義・公式を全て含める
- 試験に出やすいポイントは「⭐️ 重要」でマーク
- 図・表はMarkdownで再現
- 専門用語は英語のまま、説明は日本語で

形式: # [科目] 授業ノート → ## 本日の要点 → 内容 → ## 試験対策チェックリスト`;

export function detectSubjectFromTimestamp(
  timestamp: Date,
  schedules: { dayOfWeek: number; period: number; subjectId: string; startTime?: string | null; endTime?: string | null }[]
): string | null {
  const dayOfWeek = timestamp.getDay();
  const totalMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();

  const periodTimes = [
    { period: 1, start: 8 * 60 + 30,  end: 10 * 60 + 0  },
    { period: 2, start: 10 * 60 + 10, end: 11 * 60 + 40 },
    { period: 3, start: 12 * 60 + 30, end: 14 * 60 + 0  },
    { period: 4, start: 14 * 60 + 10, end: 15 * 60 + 40 },
    { period: 5, start: 15 * 60 + 50, end: 17 * 60 + 20 },
    { period: 6, start: 17 * 60 + 30, end: 19 * 60 + 0  },
  ];

  const currentPeriod = periodTimes.find(
    (p) => totalMinutes >= p.start - 30 && totalMinutes <= p.end + 30
  );
  if (!currentPeriod) return null;

  const match = schedules.find(
    (s) => s.dayOfWeek === dayOfWeek && s.period === currentPeriod.period
  );
  return match?.subjectId || null;
}
