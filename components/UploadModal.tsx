"use client";
import { useState, useRef } from "react";
import styles from "./UploadModal.module.css";

const compressImage = async (file: File, maxWidth = 1600, quality = 0.7): Promise<File> => {
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
              resolve(new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() }));
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
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(f => f.type.startsWith("image/"));
    if (type === "timetable") {
      setFiles([validFiles[0]]);
    } else {
      setFiles(prev => [...prev, ...validFiles].slice(0, 20));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);

    try {
      const formData = new FormData();
      if (type === "timetable") {
        setProgress("画像を圧縮中...");
        const compressed = await compressImage(files[0], 900, 0.55);
        formData.append("image", compressed);
        setProgress("AIが時間割を解析中...");
        const res = await fetch("/api/timetable", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        onSuccess(data);
      } else {
        setProgress(`${files.length}枚の写真を圧縮中...`);
        const compressedFiles = await Promise.all(files.map(f => compressImage(f)));
        for (const file of compressedFiles) {
          formData.append("photos", file);
        }
        if (selectedSubjectId) formData.append("subjectId", selectedSubjectId);
        setProgress(`${files.length}枚の写真をアップロード中...`);
        const res = await fetch("/api/sessions", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        onSuccess(data);
      }
    } catch (err: any) {
      addToast(err.message || "アップロードに失敗しました", "error");
    } finally {
      setUploading(false);
      setProgress("");
    }
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className={styles.title}>
          {type === "timetable" ? "📅 時間割を読み込む" : "📸 板書写真をアップロード"}
        </h2>
        <p className={styles.subtitle}>
          {type === "timetable"
            ? "時間割の写真やスクリーンショットをアップロードしてください。AIが科目と時限を自動で読み取ります。"
            : "複数枚まとめてアップロードできます（最大20枚）。AIが自動で科目に振り分けます。"}
        </p>

        {type === "board" && subjects.length > 0 && (
          <div className={styles.subjectSelect}>
            <label className="label">科目を指定（省略可・AIが自動判定）</label>
            <select className="input" value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)}>
              <option value="">🤖 AIが自動で判定する</option>
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div
          className={`upload-zone ${dragOver ? "drag-over" : ""} ${styles.zone}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple={type === "board"}
            style={{ display: "none" }}
            onChange={e => addFiles(Array.from(e.target.files || []))}
          />
          <div className={styles.zoneIcon}>{files.length > 0 ? "✅" : "🖼️"}</div>
          <div className={styles.zoneText}>
            {files.length > 0
              ? `${files.length}枚選択済み — クリックで追加`
              : "クリックまたはドラッグ＆ドロップで画像を選択"}
          </div>
          <div className={styles.zoneHint}>JPG, PNG, HEIC対応</div>
        </div>

        {files.length > 0 && (
          <div className={styles.previews}>
            {files.map((f, i) => (
              <div key={i} className={styles.previewItem}>
                <img src={URL.createObjectURL(f)} alt={f.name} className={styles.previewImg} />
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
            {uploading ? "処理中..." : type === "timetable" ? "AIで読み取る" : `${files.length}枚アップロード`}
          </button>
        </div>
      </div>
    </div>
  );
}
