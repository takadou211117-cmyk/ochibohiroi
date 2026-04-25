import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

// メインモデルとフォールバック
const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";

export function getGeminiClient() {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

/**
 * レスポンステキストからMarkdownコードブロックを除去
 */
function cleanResponseText(text: string): string {
  if (!text) return "";
  // ```json ... ``` や ``` ... ``` を除去
  let cleaned = text.trim();
  // マッチする場合のみ中身を取り出す
  const codeBlockMatch = cleaned.match(/^```(?:json|markdown)?\s*\n?([\s\S]*?)\n?\s*```$/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  return cleaned;
}

/**
 * 単一画像のAI解析（時間割パース用）
 */
export async function analyzeImageWithGemini(
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<string> {
  const ai = getGeminiClient();
  
  let lastError: Error | null = null;
  
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.log(`[Gemini] Using model: ${model} for image analysis`);
      const response = await ai.models.generateContent({
        model,
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

      const rawText = response.text || "";
      console.log(`[Gemini] Raw response (first 500 chars): ${rawText.substring(0, 500)}`);
      
      if (!rawText.trim()) {
        throw new Error("Empty response from Gemini API");
      }

      return cleanResponseText(rawText);
    } catch (err: any) {
      console.error(`[Gemini] Error with model ${model}:`, err.message);
      lastError = err;
      // フォールバックモデルで再試行
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

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.log(`[Gemini] Using model: ${model} for ${images.length} images`);
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
      });

      const rawText = response.text || "";
      console.log(`[Gemini] Response length: ${rawText.length} chars`);

      if (!rawText.trim()) {
        throw new Error("Empty response from Gemini API");
      }

      return cleanResponseText(rawText);
    } catch (err: any) {
      console.error(`[Gemini] Error with model ${model}:`, err.message);
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

export const TIMETABLE_PROMPT = `
この画像は学生の大学の時間割表です。
縦列が「曜日（月・火・水・木・金・土）」、横行が「時限（1, 2, 3, 4, 5...）」を表すグリッド（表）形式になっています。
各セルの位置（どの曜日の列か、どの時限の行か）を視覚的に正確に判断し、入力されている全ての授業科目を抽出してください。

【読み取りの注意事項】
1. 科目名が複数行に改行されている場合は、スペースなどを入れずに繋げて1つの文字列にしてください。
2. セルの下部にある青いバッジのような数字（例：531、121）やテキスト（例：オンデマンド）は「教室名 (room)」として扱ってください。
3. 同じ科目が連続する時限に入っている場合（例：4限と5限にまたがる）は、それぞれの時限ごとに独立したデータとして抽出してください。
4. 出力は必ず以下のJSON形式のみとし、マークダウン（\`\`\`json など）やその他の説明文は一切含めないでください。純粋なJSONのみを返してください。

フォーマット:
{
  "subjects": [
    {
      "name": "科目名",
      "dayOfWeek": "月/火/水/木/金/土のいずれか",
      "period": 時限の数字（1, 2, 3, 4, 5, 6のいずれか）,
      "startTime": "HH:MM形式（分かる場合、なければnull）",
      "endTime": "HH:MM形式（分かる場合、なければnull）",
      "professor": "教授名（分かる場合、なければnull）",
      "room": "教室名や受講形式（分かる場合、なければnull）"
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
