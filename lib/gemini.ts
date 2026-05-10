import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

const PRIMARY_MODEL = "gemini-2.0-pro-exp-02-05"; // or gemini-2.5-pro if available, let's stick to gemini-2.5-flash or 2.0-flash which are stable. Let's use gemini-1.5-pro for best reasoning if 2.0-pro is not stable, or just stick to gemini-2.0-flash but improve prompts. Let's use gemini-2.0-flash as it is good, but without token limits.
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

export async function analyzeImageWithGemini(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  fast = false
): Promise<string> {
  const ai = getGeminiClient();

  // 単純タスク用: 2.0-flash を直接呼び出し
  if (fast) {
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
      },
    });
    const raw = response.text || "";
    if (!raw.trim()) throw new Error("Empty response from Gemini");
    return cleanResponseText(raw);
  }

  // 精度重視タスク
  let lastError: Error | null = null;
  // Use gemini-2.0-flash or gemini-1.5-pro
  for (const model of ["gemini-1.5-pro", "gemini-2.0-flash"]) {
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
  for (const model of ["gemini-1.5-pro", "gemini-2.0-flash"]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { 
          // maxOutputTokens制限を削除して詳細なノートを生成可能にする
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

export const TIMETABLE_PROMPT = `時間割の画像から授業データを抽出し、以下のJSONスキーマに従って出力してください。
必ずJSON形式で出力し、他のテキストやマークダウンブロック(\`\`\`json)などは含めないでください。

出力フォーマット:
{"subjects":[{"name":"科目名","dayOfWeek":"月","period":1,"startTime":"09:00","endTime":"10:30","professor":"教員名","room":"教室名"}]}

ルール:
- 曜日(dayOfWeek)は "月", "火", "水", "木", "金", "土", "日" のいずれか
- 時限(period)は 1〜7の数値
- 連続するコマは、それぞれ別のオブジェクトとして配列に含めること
- 該当する情報がない項目は null にすること
- 抽出漏れがないように、画像内のすべての授業を網羅すること
`;

export const NOTE_GENERATION_PROMPT = `提供された複数の板書写真から、学習用の高品質なマークダウンノートを作成してください。

要件:
1. **構造化**: 見出し（#、##、###）を適切に使用し、情報の階層を明確にすること。
2. **網羅性**: 写真に記載されている重要な定理、公式、概念、説明を可能な限り詳細に書き起こすこと。
3. **視認性**:
   - 重要なキーワードは太字（**文字**）にする
   - 公式や数式はブロック（$$数式$$）やインライン（$数式$）で記述する
   - 順序立てられたプロセスや手順は番号付きリスト（1. 2. 3.）を使用する
   - 補足や注意点は引用ブロック（>）を使用する
4. **論理的補完**: 写真の文字が一部見切れていたり読みにくい場合は、文脈から推測して自然な文章に補完すること。

出力の形式（例）:
# [講義の主題または主要なトピック]

## 重要な概念・定義
- **〇〇の定義**: （説明）
- ...

## 詳細・解説
（板書の内容を構造化して詳細に記載）

## 重要公式・まとめ
（公式や最終的な結論など）
`;

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
