"use client";
import { useState, useEffect } from "react";
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
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [noteProgress, setNoteProgress] = useState(0);
  // photos はオンデマンド取得（一覧では軽量データのみ）
  const [fullSession, setFullSession] = useState<any>(session);
  const [loadingFull, setLoadingFull] = useState(
    // 写真URLが含まれているかチェック。なければ取得が必要
    !session.photos?.[0]?.url && session._count?.photos > 0
  );

  // コンポーネントマウント時に完全データをフェッチ（まだ取得していない場合）
  useEffect(() => {
    if (loadingFull) {
      fetch(`/api/sessions?sessionId=${session.id}`)
        .then((r) => r.json())
        .then((data) => { setFullSession(data); setLoadingFull(false); })
        .catch(() => { setFullSession(session); setLoadingFull(false); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // フルデータまたは一覧データを使用
  const s = fullSession;

  const handleDeletePhoto = async (id: string) => {
    if (!confirm("この写真を削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/photos?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        addToast("写真を削除しました");
        if (selectedPhoto?.id === id) setSelectedPhoto(null);
        setSelectedPhotoIds((prev) => prev.filter((item) => item !== id));
        // 削除後に完全データを再取得
        const refreshed = await fetch(`/api/sessions?sessionId=${session.id}`);
        if (refreshed.ok) setFullSession(await refreshed.json());
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

  const handleTogglePhotoFavorite = async (photo: any) => {
    try {
      setBulkActionLoading(true);
      const res = await fetch(`/api/photos?id=${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !photo.isFavorite }),
      });
      if (res.ok) {
        addToast(photo.isFavorite ? "お気に入りを解除しました" : "お気に入り登録しました");
        onRefresh();
      }
    } catch (e) {
      addToast("お気に入り操作に失敗しました", "error");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedPhotoIds.length === session.photos.length) {
      setSelectedPhotoIds([]);
    } else {
      setSelectedPhotoIds(session.photos.map((photo: any) => photo.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedPhotoIds.length) return;
    if (!confirm(`${selectedPhotoIds.length}件をまとめて削除しますか？`)) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch(`/api/photos?ids=${selectedPhotoIds.join(",")}`, { method: "DELETE" });
      if (res.ok) {
        addToast("選択した写真を削除しました");
        setSelectedPhotoIds([]);
        if (selectedPhoto && selectedPhotoIds.includes(selectedPhoto.id)) {
          setSelectedPhoto(null);
        }
        onRefresh();
      }
    } catch (e) {
      addToast("複数削除に失敗しました", "error");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkFavorite = async (favorite: boolean) => {
    if (!selectedPhotoIds.length) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedPhotoIds.map((id) =>
          fetch(`/api/photos?id=${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isFavorite: favorite }),
          })
        )
      );
      addToast(favorite ? "選択した写真をお気に入り登録しました" : "選択した写真のお気に入りを解除しました");
      setSelectedPhotoIds([]);
      onRefresh();
    } catch (e) {
      addToast("お気に入り変更に失敗しました", "error");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleGenerateNote = async () => {
    setGeneratingNote(true);
    setNoteProgress(0);

    // 推定進捗アニメーション（返り値は実際の進捗に非連動）
    const ESTIMATED_MS = 20000; // 約2秒が目安
    const INTERVAL_MS = 300;
    const maxFake = 92; // 100%はAI完了時のみ
    let current = 0;
    const timer = setInterval(() => {
      current += (maxFake - current) * (INTERVAL_MS / ESTIMATED_MS) * 2.5;
      setNoteProgress(Math.min(current, maxFake));
    }, INTERVAL_MS);

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: s.id }),
      });
      const data = await res.json();
      clearInterval(timer);
      if (!res.ok) throw new Error(data.error);

      // 100%にジャンプしてからリフレッシュ
      setNoteProgress(100);
      addToast("✨ ノートを生成しました！", "success");
      const refreshed = await fetch(`/api/sessions?sessionId=${session.id}`);
      if (refreshed.ok) setFullSession(await refreshed.json());
      onRefresh();
      // 短い遅延の後にバーを消す
      setTimeout(() => { setGeneratingNote(false); setNoteProgress(0); }, 600);
    } catch (err: any) {
      clearInterval(timer);
      setNoteProgress(0);
      setGeneratingNote(false);
      addToast(err.message || "ノート生成に失敗しました", "error");
    }
  };

  // ローディング中は最小限のUIを表示
  if (loadingFull) {
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
              <p className={styles.subtitle}>{session.subject?.name} - 第{session.sessionNum}回</p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300, gap: 12 }}>
          <div className="spinner" />
          <p style={{ color: "var(--text-secondary)" }}>写真を読み込んでいます...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← 科目に戻る</button>
        <div className={styles.headerContent}>
          <div className="badge">{s.sessionNum}</div>
          <div>
            <h2 className={styles.title}>
              {new Date(s.date).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
            </h2>
            <p className={styles.subtitle}>{s.subject.name} - 第{s.sessionNum}回</p>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* Photos Grid */}
        <div className={styles.photosSection}>
          <h3 className={styles.sectionTitle}>📸 板書写真 ({s.photos.length}枚)</h3>
          {selectedPhotoIds.length > 0 && (
            <div className={styles.bulkActions}>
              <div>{selectedPhotoIds.length}枚選択中</div>
              <div className={styles.bulkButtons}>
                <button className="btn btn-secondary btn-sm" onClick={handleSelectAll} disabled={bulkActionLoading}>
                  {selectedPhotoIds.length === s.photos.length ? "全解除" : "すべて選択"}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleBulkFavorite(true)} disabled={bulkActionLoading}>
                  ⭐ お気に入り登録
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleBulkFavorite(false)} disabled={bulkActionLoading}>
                  ☆ お気に入り解除
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={bulkActionLoading}>
                  🗑️ 選択削除
                </button>
              </div>
            </div>
          )}
          {s.photos.length === 0 ? (
            <div className={styles.emptyCard}>写真がありません</div>
          ) : (
            <div className={styles.photoGrid}>
              {s.photos.map((p: any) => (
                <div
                key={p.id}
                className={`${styles.photoCard} ${selectedPhotoIds.includes(p.id) ? styles.selectedPhotoCard : ""}`}
                onClick={() => setSelectedPhoto(p)}
              >
                <img src={p.url} alt="板書" className={styles.photoImg} loading="lazy" decoding="async" />
                <div className={styles.photoOverlay} onClick={(e) => e.stopPropagation()}>
                  <label className={styles.photoCheckbox} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedPhotoIds.includes(p.id)}
                      onChange={() => togglePhotoSelection(p.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span />
                  </label>
                  <button
                    className={`${styles.favoriteBtn} ${p.isFavorite ? styles.favoriteActive : ""}`}
                    onClick={(e) => { e.stopPropagation(); handleTogglePhotoFavorite(p); }}
                    disabled={bulkActionLoading}
                    title={p.isFavorite ? "お気に入り解除" : "お気に入り登録"}
                  >
                    {p.isFavorite ? "★" : "☆"}
                  </button>
                </div>
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
            {s.note ? (
              <button className="btn btn-secondary btn-sm" onClick={() => onEditNote(s.note)}>
                ✏️ 編集する
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                disabled={s.photos.length === 0 || generatingNote}
                onClick={handleGenerateNote}
                style={{ minWidth: 140 }}
              >
                {generatingNote ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    {Math.round(noteProgress)}%
                  </span>
                ) : (
                  "✨ AIノート生成"
                )}
              </button>
            )}
          </div>
          {!s.note && s.photos.length > NOTE_IMAGE_LIMIT && (
            <div className={styles.limitNotice}>
              このセッションには{s.photos.length}枚の写真があります。ノート生成には最大{NOTE_IMAGE_LIMIT}枚を使用します。
            </div>
          )}

          {s.note ? (
            <div className={`glass ${styles.noteCard} markdown-body`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.note.content}</ReactMarkdown>
            </div>
          ) : generatingNote ? (
            <div className={styles.generatingCard}>
              <div className={styles.generatingHeader}>
                <span className={styles.generatingLabel}>🧠 AIが板書を解析中...</span>
                <span className={styles.generatingPercent}>{Math.round(noteProgress)}%</span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${noteProgress}%` }}
                />
              </div>
              <p className={styles.generatingHint}>
                {noteProgress < 30 ? "画像を読み込んでいます..."
                  : noteProgress < 60 ? "Gemini AIが板書を解読中..."
                  : noteProgress < 85 ? "ノートを構築中..."
                  : "もうすぐ完成！"}
              </p>
            </div>
          ) : (
            <div className={styles.emptyCard}>
              {s.photos.length > 0
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
