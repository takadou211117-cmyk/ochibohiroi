"use client";
import { useState } from "react";
import styles from "./NoteEditor.module.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  note: any;
  onClose: () => void;
  onSave: () => void;
  addToast: (msg: string, type?: any) => void;
}

export default function NoteEditor({ note, onClose, onSave, addToast }: Props) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: note.id,
          title,
          content,
        }),
      });
      if (res.ok) {
        onSave(); // parent component will call addToast
      } else {
        throw new Error();
      }
    } catch (e) {
      addToast("保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
            ← 戻る
          </button>
          <input
            className={styles.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ノートのタイトル"
          />
        </div>
        <div className={styles.actions}>
          <div className={styles.toggleGroup}>
            <button
              className={`${styles.toggleBtn} ${!previewMode ? styles.active : ""}`}
              onClick={() => setPreviewMode(false)}
            >
              📝 編集
            </button>
            <button
              className={`${styles.toggleBtn} ${previewMode ? styles.active : ""}`}
              onClick={() => setPreviewMode(true)}
            >
              👁️ プレビュー
            </button>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>

      <div className={styles.editorArea}>
        {!previewMode ? (
          <textarea
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Markdownでノートを入力..."
          />
        ) : (
          <div className={`glass ${styles.preview} markdown-body`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
