"use client";
import { useState, useRef } from "react";
import styles from "./UploadModal.module.css";

const compressImage = async (file: File, maxWidth = 900, quality = 0.55): Promise<File> => {
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
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
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
  const imageFiles: File[] = [];

  for (let pageNumber = 1; pageNumber <= pagesToConvert; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const imageFile = await pdfPageToFile(page, pageNumber, file.name.replace(/\.[^.]+$/, ""));
    imageFiles.push(imageFile);
  }

  return imageFiles;
};

const isPdf = (file: File) => file.type === "application/pdf";

interface UploadModalProps {
  type: "timetable" | "board";
  subjects: any[];
  onClose: () => void;
  onSuccess: (data: any) => void;
  addToast: (msg: string, type?: any) => void;
}

export default function UploadModal({ type, subjects, onClose, onSuccess, addToast }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [manualSubjectName, setManualSubjectName] = useState("");
  const [progress, setProgress] = useState("");
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

  const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime, lastModified: Date.now() });
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);

    try {
      const imageFiles: File[] = [];
      const pdfFiles = files.filter(isPdf);
      const rawImages = files.filter((f) => f.type.startsWith("image/"));

      if (pdfFiles.length) {
        setProgress("PDFを画像に変換中...");
        const converted = await Promise.all(pdfFiles.map((pdf) => pdfToImages(pdf)));
        imageFiles.push(...converted.flat());
      }

      imageFiles.push(...rawImages);

      if (!imageFiles.length) {
        throw new Error("有効な画像またはPDFが見つかりませんでした");
      }

      const formData = new FormData();
      if (type === "timetable") {
        const sourceFile = imageFiles[0];
        setProgress("画像を圧縮中...");
        const compressed = await compressImage(sourceFile, 800, 0.5);
        formData.append("image", compressed);
        setProgress("AIが時間割を解析中...");
        const res = await fetch("/api/timetable", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "時間割読み取りに失敗しました");
        onSuccess(data);
      } else {
        const selectedFiles = imageFiles.slice(0, 30);
        setProgress(`${selectedFiles.length}枚の画像を圧縮中...`);
        const compressedFiles = await Promise.all(selectedFiles.map((f) => compressImage(f)));
        for (const file of compressedFiles) {
          formData.append("photos", file);
        }
        if (selectedSubjectId) {
          formData.append("subjectId", selectedSubjectId);
        } else if (manualSubjectName.trim()) {
          formData.append("subjectName", manualSubjectName.trim());
        }
        setProgress(`${compressedFiles.length}枚の写真をアップロード中...`);
        const res = await fetch("/api/sessions", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "板書アップロードに失敗しました");
        onSuccess(data);
      }
    } catch (err: any) {
      addToast(err.message || "アップロードに失敗しました", "error");
    } finally {
      setUploading(false);
      setProgress("");
    }
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className={styles.title}>
          {type === "timetable" ? "📅 時間割を読み込む" : "📸 板書PDF/写真をアップロード"}
        </h2>
        <p className={styles.subtitle}>
          {type === "timetable"
            ? "時間割の写真、スクリーンショット、またはPDFをアップロードしてください。AIが科目と時限を自動で読み取ります。"
            : "写真やPDFの各ページをまとめてアップロードできます（最大30枚相当）。AIが自動で科目に振り分けます。"}
        </p>

        {type === "board" && (
          <div className={styles.subjectSelect}>
            <label className="label">科目を指定（AI判定なしで高速アップロード）</label>
            <select className="input" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
              <option value="">🤖 AIが自動で判定する</option>
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

        {files.length > 0 && (
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
          <div className={styles.progressBar}>
            <div className={styles.progressText}>{progress}</div>
            <div className={styles.bar}><div className={styles.barFill} /></div>
          </div>
        )}

        <div className={styles.actions}>
          <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>キャンセル</button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!files.length || uploading}
          >
            {uploading
              ? "処理中..."
              : type === "timetable"
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
