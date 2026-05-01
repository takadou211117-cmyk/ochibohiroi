"use client";
import { useState, useRef } from "react";
import styles from "./UploadModal.module.css";

const compressImage = async (file: File, maxWidth = 720, quality = 0.45): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else {
          if (height > maxWidth) { width = Math.round((width * maxWidth) / height); height = maxWidth; }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg", lastModified: Date.now() }));
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};

const pdfPageToFile = async (pdfPage: any, pageNumber: number, originalName: string): Promise<File> => {
  const viewport = pdfPage.getViewport({ scale: 1.5 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  await pdfPage.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("PDF page render failed"));
      resolve(new File([blob], `${originalName}-page-${pageNumber}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    }, "image/jpeg", 0.8);
  });
};

const pdfToImages = async (file: File): Promise<File[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
  const pdfWorker = await import("pdfjs-dist/build/pdf.worker.min.js");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default || pdfWorker;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;
  const pagesToConvert = Math.min(pageCount, 20);

  const pageNumbers = Array.from({ length: pagesToConvert }, (_, i) => i + 1);
  const imageFiles = await Promise.all(
    pageNumbers.map(async (pageNumber) => {
      const page = await pdf.getPage(pageNumber);
      return pdfPageToFile(page, pageNumber, file.name.replace(/\.[^.]+$/, ""));
    })
  );

  return imageFiles;
};

const isPdf = (file: File) => file.type === "application/pdf";

interface UploadModalProps {
  type: "timetable" | "board";
  subjects: any[];
  onClose: () => void;
  onSuccess: (data: any) => void;
  addToast: (msg: string, type?: any) => void;
  aiMode?: boolean;
}

const DAY_OPTIONS = [
  { label: "月", value: 1 }, { label: "火", value: 2 }, { label: "水", value: 3 },
  { label: "木", value: 4 }, { label: "金", value: 5 }, { label: "土", value: 6 },
];

export default function UploadModal({ type, subjects, onClose, onSuccess, addToast, aiMode = true }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [manualSubjectName, setManualSubjectName] = useState("");

  // 手動時間割フォーム用 state
  const [manualForm, setManualForm] = useState({
    name: "", dayOfWeek: "1", period: "1", professor: "", room: ""
  });
  const [manualSaving, setManualSaving] = useState(false);

  // プログレス管理
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState("");
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: File[]) => {
    const validImages = newFiles.filter((f) => f.type.startsWith("image/"));
    const validPdfs = newFiles.filter(isPdf);
    const validFiles = [...validImages, ...validPdfs];
    if (!validFiles.length) return;
    if (type === "timetable") {
      setFiles([validFiles[0]]);
    } else {
      setFiles((prev) => [...prev, ...validFiles].slice(0, 30));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  // フェーズ付きプログレス更新ヘルパー
  const startPhaseProgress = (phase: string, fromPct: number, toPct: number, durationMs: number) => {
    setUploadPhase(phase);
    setUploadProgress(fromPct);
    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    const INTERVAL = 250;
    let current = fromPct;
    uploadTimerRef.current = setInterval(() => {
      current += (toPct - current) * (INTERVAL / durationMs) * 2;
      setUploadProgress(Math.min(current, toPct));
    }, INTERVAL);
  };

  const stopProgress = () => {
    if (uploadTimerRef.current) { clearInterval(uploadTimerRef.current); uploadTimerRef.current = null; }
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setUploadProgress(0);

    try {
      const imageFiles: File[] = [];
      const pdfFiles = files.filter(isPdf);
      const rawImages = files.filter((f) => f.type.startsWith("image/"));

      if (pdfFiles.length) {
        startPhaseProgress("📄 PDFを画像に変換中...", 0, 20, 4000);
        const converted = await Promise.all(pdfFiles.map((pdf) => pdfToImages(pdf)));
        imageFiles.push(...converted.flat());
        stopProgress();
        setUploadProgress(20);
      }

      imageFiles.push(...rawImages);

      if (!imageFiles.length) {
        throw new Error("有効な画像またはPDFが見つかりませんでした");
      }

      const formData = new FormData();

      if (type === "timetable") {
        const sourceFile = imageFiles[0];

        // フェーズ1: 圧縮 (→25%)
        startPhaseProgress("🗜️ 画像を圧縮中...", pdfFiles.length ? 20 : 0, 25, 1500);
        const compressed = await compressImage(sourceFile, 800, 0.5);
        stopProgress();
        setUploadProgress(25);

        // フェーズ2: AI解析 (25→95%)
        startPhaseProgress("🧠 AIが時間割を解析中...", 25, 95, 4000);
        formData.append("image", compressed);
        const res = await fetch("/api/timetable", { method: "POST", body: formData });
        const data = await res.json();
        stopProgress();
        if (!res.ok) throw new Error(data.error || "時間割読み取りに失敗しました");

        setUploadPhase("✅ 完了！");
        setUploadProgress(100);
        await new Promise((r) => setTimeout(r, 400));
        onSuccess(data);

      } else {
        const selectedFiles = imageFiles.slice(0, 30);
        const totalFiles = selectedFiles.length;

        // フェーズ1: 圧縮 (→40%)
        const compressStart = pdfFiles.length ? 20 : 0;
        startPhaseProgress(`🗜️ ${totalFiles}枚を圧縮中...`, compressStart, 40, Math.max(totalFiles * 400, 1500));
        const compressedFiles = await Promise.all(selectedFiles.map((f) => compressImage(f)));
        stopProgress();
        setUploadProgress(40);

        for (const file of compressedFiles) {
          formData.append("photos", file);
        }
        if (selectedSubjectId) {
          formData.append("subjectId", selectedSubjectId);
        } else if (manualSubjectName.trim()) {
          formData.append("subjectName", manualSubjectName.trim());
        }

        // フェーズ2: アップロード + AI判定 (40→95%)
        const hasAiDetection = !selectedSubjectId && !manualSubjectName.trim();
        const phase2Label = hasAiDetection
          ? `📡 ${totalFiles}枚をアップロード中（AI科目判定あり）...`
          : `📡 ${totalFiles}枚をアップロード中...`;
        startPhaseProgress(phase2Label, 40, 95, hasAiDetection ? 4000 : 2000);

        const res = await fetch("/api/sessions", { method: "POST", body: formData });
        const data = await res.json();
        stopProgress();
        if (!res.ok) throw new Error(data.error || "板書アップロードに失敗しました");

        setUploadPhase("✅ 完了！");
        setUploadProgress(100);
        await new Promise((r) => setTimeout(r, 400));
        onSuccess(data);
      }
    } catch (err: any) {
      stopProgress();
      setUploadProgress(0);
      setUploadPhase("");
      addToast(err.message || "アップロードに失敗しました", "error");
    } finally {
      setUploading(false);
      stopProgress();
    }
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className={styles.title}>
          {type === "timetable"
            ? (aiMode ? "📅 時間割を読み込む" : "📅 時間割を登録")
            : "📸 板書PDF/写真をアップロード"}
        </h2>
        <p className={styles.subtitle}>
          {type === "timetable"
            ? (aiMode
              ? "時間割の写真、スクリーンショット、またはPDFをアップロードしてください。AIが科目と時限を自動で読み取ります。"
              : "科目名・曜日・時限を直接入力して登録。AI不要・即度完了。")
            : (aiMode
              ? "写真やPDFの各ページをまとめてアップロードできます（最大30枚相当）。AIが自動で科目に振り分けます。"
              : "科目を選んで即アップロード。AI不要・爆速。")}
        </p>

        {/* 手動時間割フォーム（AIoff + 時間割登録） */}
        {type === "timetable" && !aiMode && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label className="label">科目名 *</label>
                <input
                  className="input"
                  placeholder="例: 応用数学、英語コミュニケーション"
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="label">曜日</label>
                  <select className="input" value={manualForm.dayOfWeek} onChange={(e) => setManualForm({ ...manualForm, dayOfWeek: e.target.value })}>
                    {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}曜日</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">時限</label>
                  <select className="input" value={manualForm.period} onChange={(e) => setManualForm({ ...manualForm, period: e.target.value })}>
                    {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}限</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="label">教授名（任意）</label>
                  <input className="input" placeholder="田中教授" value={manualForm.professor} onChange={(e) => setManualForm({ ...manualForm, professor: e.target.value })} />
                </div>
                <div>
                  <label className="label">教室（任意）</label>
                  <input className="input" placeholder="101教室" value={manualForm.room} onChange={(e) => setManualForm({ ...manualForm, room: e.target.value })} />
                </div>
              </div>
            </div>
            <div className={styles.actions} style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
              <button
                className="btn btn-primary"
                disabled={!manualForm.name.trim() || manualSaving}
                onClick={async () => {
                  setManualSaving(true);
                  try {
                    const res = await fetch("/api/subjects", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: manualForm.name.trim(),
                        dayOfWeek: manualForm.dayOfWeek,
                        period: manualForm.period,
                        professor: manualForm.professor || null,
                        room: manualForm.room || null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    onSuccess({ subjects: [data], count: 1 });
                  } catch (err: any) {
                    addToast(err.message || "登録に失敗しました", "error");
                  } finally {
                    setManualSaving(false);
                  }
                }}
              >
                {manualSaving ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    登録中...
                  </span>
                ) : "✓ 登録する"}
              </button>
            </div>
          </div>
        )}

        {type === "board" && (
          <div className={styles.subjectSelect}>
            <label className="label">
              {aiMode ? "科目を指定（AI判定なしで高速アップロード）" : "科目を選択 *"}
            </label>
            <select className="input" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
              {aiMode && <option value="">🤖 AIが自動で判定する</option>}
              {!aiMode && <option value="">— 選んでください —</option>}
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className={styles.subjectHint}>
              既存科目を選ぶか、下に科目名を直接入力するとAI判定をスキップしてダイレクト保存できます。
            </p>
            <input
              className="input"
              type="text"
              placeholder="科目名を直接入力（例: 物理、数学）"
              value={manualSubjectName}
              onChange={(e) => setManualSubjectName(e.target.value)}
            />
          </div>
        )}

        <div
          className={`upload-zone ${dragOver ? "drag-over" : ""} ${styles.zone}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple={type === "board"}
            style={{ display: "none" }}
            onChange={(e) => addFiles(Array.from(e.target.files || []))}
          />
          <div className={styles.zoneIcon}>{files.length > 0 ? "✅" : "📄"}</div>
          <div className={styles.zoneText}>
            {files.length > 0
              ? `${files.length}件選択済み — クリックで追加`
              : "クリックまたはドラッグ＆ドロップで画像/PDFを選択"}
          </div>
          <div className={styles.zoneHint}>JPG, PNG, HEIC, PDF対応</div>
        </div>

        {files.length > 0 && !uploading && (
          <div className={styles.previews}>
            {files.map((f, i) => (
              <div key={i} className={styles.previewItem}>
                {f.type === "application/pdf" ? (
                  <div className={styles.pdfPreview}>
                    <div>📄</div>
                    <div>{f.name}</div>
                  </div>
                ) : (
                  <img src={URL.createObjectURL(f)} alt={f.name} className={styles.previewImg} />
                )}
                <button className={styles.removeBtn} onClick={() => removeFile(i)}>×</button>
                <div className={styles.previewName}>{f.name.slice(0, 16)}</div>
              </div>
            ))}
          </div>
        )}

        {uploading && (
          <div className={styles.progressBlock}>
            <div className={styles.progressTopRow}>
              <span className={styles.progressPhase}>{uploadPhase}</span>
              <span className={styles.progressPct}>{Math.round(uploadProgress)}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>キャンセル</button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!files.length || uploading}
            style={{ minWidth: 160 }}
          >
            {uploading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                {Math.round(uploadProgress)}%
              </span>
            ) : type === "timetable"
              ? "AIで読み取る"
              : (selectedSubjectId || manualSubjectName.trim())
              ? "AIなしで直接アップロード"
              : `${files.length}枚アップロード`}
          </button>
        </div>
      </div>
    </div>
  );
}
