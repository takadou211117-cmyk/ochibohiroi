import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

// すべてのタスクで最速モデルを強制
const PRIMARY_MODEL = "gemini-2.0-flash";
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
        config: { 
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 800, // 生成上限を設けて速度を担保
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
 * ノート生成用プロンプト（超爆速・要約特化版）
 */
export const NOTE_GENERATION_PROMPT = `板書写真から試験対策の「要点まとめ」をMarkdownで超簡潔に作成してください。

要件:
- 長文は書かず、箇条書きで極限まで短くまとめる
- 最も重要な公式・キーワードのみを抽出
- 余計な挨拶や説明は一切省く

形式: # [科目名] → ## 重要ポイント → (箇条書き)`;

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
