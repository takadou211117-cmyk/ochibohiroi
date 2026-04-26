"use client";
import { useState } from "react";
import styles from "./SessionView.module.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const NOTE_IMAGE_LIMIT = 12;

interface Props {
  session: any;
  onBack: () => void;
  onEditNote: (note: any) => void;
  onRefresh: () => void;
  addToast: (msg: string, type?: any) => void;
}

export default function SessionView({ session, onBack, onEditNote, onRefresh, addToast }: Props) {
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [editingMemo, setEditingMemo] = useState<string | null>(null);
  const [memoText, setMemoText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeletePhoto = async (id: string) => {
    if (!confirm("この写真を削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/photos?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        addToast("写真を削除しました");
        if (selectedPhoto?.id === id) setSelectedPhoto(null);
        onRefresh();
      }
    } catch (e) {
      addToast("削除に失敗しました", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveMemo = async (id: string) => {
    try {
      const res = await fetch(`/api/photos?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: memoText }),
      });
      if (res.ok) {
        addToast("メモを保存しました");
        setEditingMemo(null);
        onRefresh();
      }
    } catch (e) {
      addToast("メモの保存に失敗しました", "error");
    }
  };

  const handleGenerateNote = async () => {
    addToast("AIがノートを生成しています...", "info");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast("ノートを生成しました！", "success");
      onRefresh();
    } catch (err: any) {
      addToast(err.message || "ノート生成に失敗しました", "error");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← 科目に戻る</button>
        <div className={styles.headerContent}>
          <div className="badge">{session.sessionNum}</div>
          <div>
            <h2 className={styles.title}>
              {new Date(session.date).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
            </h2>
            <p className={styles.subtitle}>{session.subject.name} - 第{session.sessionNum}回</p>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* Photos Grid */}
        <div className={styles.photosSection}>
          <h3 className={styles.sectionTitle}>📸 板書写真 ({session.photos.length}枚)</h3>
          {session.photos.length === 0 ? (
            <div className={styles.emptyCard}>写真がありません</div>
          ) : (
            <div className={styles.photoGrid}>
              {session.photos.map((p: any) => (
                <div key={p.id} className={styles.photoCard} onClick={() => setSelectedPhoto(p)}>
                  <img src={p.url} alt="板書" className={styles.photoImg} />
                  {p.memo && <div className={styles.photoMemoPreview}>{p.memo}</div>}
                  <button
                    className={styles.deletePhotoBtn}
                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(p.id); }}
                    disabled={deletingId === p.id}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Note Section */}
        <div className={styles.noteSection}>
          <div className={styles.noteHeader}>
            <h3 className={styles.sectionTitle}>📖 授業ノート</h3>
            {session.note ? (
              <button className="btn btn-secondary btn-sm" onClick={() => onEditNote(session.note)}>
                ✏️ 編集する
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                disabled={session.photos.length === 0}
                onClick={handleGenerateNote}
              >
                ✨ AIノート生成
              </button>
            )}
          </div>
          {!session.note && session.photos.length > NOTE_IMAGE_LIMIT && (
            <div className={styles.limitNotice}>
              このセッションには{session.photos.length}枚の写真があります。ノート生成には最大{NOTE_IMAGE_LIMIT}枚を使用します。
            </div>
          )}

          {session.note ? (
            <div className={`glass ${styles.noteCard} markdown-body`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.note.content}</ReactMarkdown>
            </div>
          ) : (
            <div className={styles.emptyCard}>
              {session.photos.length > 0
                ? "右上の「AIノート生成」ボタンを押すと、写真からノートが自動生成されます。"
                : "写真をアップロードするとノートを生成できます。"}
            </div>
          )}
        </div>
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className={styles.photoModal} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedPhoto(null)}>×</button>
            
            <div className={styles.photoModalLayout}>
              <div className={styles.photoModalImgContainer}>
                <img src={selectedPhoto.url} alt="板書拡大" className={styles.photoModalImg} />
              </div>
              
              <div className={styles.photoModalSidebar}>
                <h4 style={{ marginBottom: 16 }}>写真の詳細</h4>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
                  アップロード: {new Date(selectedPhoto.createdAt).toLocaleString()}
                </div>

                <div className={styles.memoArea}>
                  <label className="label">📝 メモ</label>
                  {editingMemo === selectedPhoto.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea
                        className="input"
                        rows={4}
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        placeholder="写真に関するメモを記述..."
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveMemo(selectedPhoto.id)}>保存</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingMemo(null)}>キャンセル</button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.memoView} onClick={() => { setEditingMemo(selectedPhoto.id); setMemoText(selectedPhoto.memo || ""); }}>
                      {selectedPhoto.memo ? (
                        <p>{selectedPhoto.memo}</p>
                      ) : (
                        <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>メモを追加 (クリックして編集)</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
