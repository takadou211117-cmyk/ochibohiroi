import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export function getGeminiClient() {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export async function analyzeImageWithGemini(
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<string> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
  });
  return response.text?.replace(/```json/g, "").replace(/```/g, "").trim() || "";
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
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts }],
  });
  return response.text?.trim() || "";
}

export const TIMETABLE_PROMPT = `
この画像は学生の大学の時間割表です。
画像から全ての授業科目を抽出し、以下のJSON形式で返してください。
JSON以外の文章は一切含めないでください。

フォーマット:
{
  "subjects": [
    {
      "name": "科目名（正確に）",
      "dayOfWeek": "月/火/水/木/金/土のいずれか",
      "period": 時限の数字（1,2,3,4,5,6のいずれか）,
      "startTime": "HH:MM形式（分かる場合）",
      "endTime": "HH:MM形式（分かる場合）",
      "professor": "教授名（分かる場合、なければnull）",
      "room": "教室名（分かる場合、なければnull）"
    }
  ]
}
`;

export const NOTE_GENERATION_PROMPT = `
あなたは東京大学で首席を取った優秀な学生です。
以下の板書写真から、試験勉強に最適な完璧なノートを作成してください。

## ノートの要件：
1. **構造化**: 章・節・箇条書きで論理的に整理
2. **網羅性**: 重要な概念・定義・公式・例題を全て含める
3. **試験対策**: 試験に出やすいポイントを「⭐️ 重要」でマーク
4. **理解促進**: 図や表をMarkdownで再現し、関連性を明確に
5. **日本語**: 専門用語は英語のまま残し、説明は分かりやすい日本語で
6. **補足**: 板書に不足している背景知識や関連事項も適宜補足

## 形式：
- Markdown形式で出力
- 最初に「# [科目名] - [日付] 授業[回数]回目」という見出し
- 「## 本日の要点」から始め、最後に「## 試験対策チェックリスト」で締める

板書の写真を分析して、上記の形式でノートを作成してください。
`;

export function detectSubjectFromTimestamp(
  timestamp: Date,
  schedules: { dayOfWeek: number; period: number; subjectId: string; startTime?: string | null; endTime?: string | null }[]
): string | null {
  const dayOfWeek = timestamp.getDay();
  const hour = timestamp.getHours();
  const minute = timestamp.getMinutes();
  const totalMinutes = hour * 60 + minute;

  // 一般的な時限の時間帯（大学標準）
  const periodTimes = [
    { period: 1, start: 8 * 60 + 30, end: 10 * 60 + 0 },
    { period: 2, start: 10 * 60 + 10, end: 11 * 60 + 40 },
    { period: 3, start: 12 * 60 + 30, end: 14 * 60 + 0 },
    { period: 4, start: 14 * 60 + 10, end: 15 * 60 + 40 },
    { period: 5, start: 15 * 60 + 50, end: 17 * 60 + 20 },
    { period: 6, start: 17 * 60 + 30, end: 19 * 60 + 0 },
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
