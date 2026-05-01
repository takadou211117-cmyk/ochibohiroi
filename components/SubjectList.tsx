"use client";
import { useState, useEffect } from "react";
import styles from "./SubjectList.module.css";

interface Props {
  subjects: any[];
  selectedSubject: any;
  onSelectSubject: (s: any) => void;
  onSelectSession: (s: any) => void;
  onRefresh: () => void;
  addToast: (msg: string, type?: any) => void;
  onUploadBoard: () => void;
  onUploadTimetable: () => void;
  aiMode?: boolean;
}

export default function SubjectList({ subjects, selectedSubject, onSelectSubject, onSelectSession, onRefresh, addToast, onUploadBoard, onUploadTimetable, aiMode = true }: Props) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    if (selectedSubject) fetchSessions(selectedSubject.id);
  }, [selectedSubject]);

  const fetchSessions = async (subjectId: string) => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/sessions?subjectId=${subjectId}`);
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      addToast("セッションの取得に失敗しました", "error");
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSubjectName.trim() }),
      });
      if (res.ok) {
        setNewSubjectName("");
        setAddingSubject(false);
        onRefresh();
        addToast("科目を追加しました");
      }
    } catch (e) {
      addToast("追加に失敗しました", "error");
    }
  };

  const handleDeleteSubject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("この科目とすべてのデータを削除しますか？")) return;
    try {
      await fetch(`/api/subjects?id=${id}`, { method: "DELETE" });
      onRefresh();
      if (selectedSubject?.id === id) onSelectSubject(null);
      addToast("科目を削除しました");
    } catch (e) {
      addToast("削除に失敗しました", "error");
    }
  };

  const handleGenerateNote = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setGenerating(sessionId);
    setGenProgress((p) => ({ ...p, [sessionId]: 0 }));

    const ESTIMATED_MS = 5000; // 20秒から5秒に短縮
    const INTERVAL_MS = 100;
    const maxFake = 95;
    let current = 0;
    const timer = setInterval(() => {
      current += (maxFake - current) * (INTERVAL_MS / ESTIMATED_MS) * 3;
      setGenProgress((p) => ({ ...p, [sessionId]: Math.min(current, maxFake) }));
    }, INTERVAL_MS);

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      clearInterval(timer);
      if (!res.ok) throw new Error(data.error);
      setGenProgress((p) => ({ ...p, [sessionId]: 100 }));
      addToast("✨ AIノートを生成しました");
      fetchSessions(selectedSubject.id);
      setTimeout(() => {
        setGenerating(null);
        setGenProgress((p) => { const n = { ...p }; delete n[sessionId]; return n; });
      }, 600);
    } catch (err: any) {
      clearInterval(timer);
      setGenerating(null);
      setGenProgress((p) => { const n = { ...p }; delete n[sessionId]; return n; });
      addToast(err.message || "ノート生成に失敗しました", "error");
    }
  };

  // セッションのphoto枚数を取得（APIの_countまたはphotos配列長から）
  const getPhotoCount = (session: any): number => {
    return session._count?.photos ?? session.photos?.length ?? 0;
  };

  const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  if (!selectedSubject) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>📚 科目一覧</h1>
            <p className={styles.pageSubtitle}>科目をクリックして授業記録を確認しましょう</p>
          </div>
          <div className={styles.headerActions}>
            <button className="btn btn-secondary" onClick={onUploadTimetable}>📅 時間割読込</button>
            <button className="btn btn-primary" onClick={onUploadBoard}>📸 板書アップ</button>
          </div>
        </div>

        {subjects.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🌱</div>
            <h3>まだ科目がありません</h3>
            <p>時間割の写真をアップロードすると、AIが科目を自動登録します。</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={onUploadTimetable}>📅 時間割を読み込む</button>
              <button className="btn btn-primary" onClick={() => setAddingSubject(true)}>+ 手動で追加</button>
            </div>
          </div>
        ) : (
          <div className={styles.grid}>
            {subjects.map((s: any, i: number) => (
              <div
                key={s.id}
                className={`glass glass-hover ${styles.card}`}
                style={{ animationDelay: `${i * 0.05}s`, "--subject-color": s.color || "var(--accent-1)" } as any}
                onClick={() => onSelectSubject(s)}
              >
                <div className={styles.cardColor} style={{ background: s.color || "var(--accent-1)" }} />
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardName}>{s.name}</h3>
                  <button className="btn btn-icon" style={{ fontSize: 14 }} onClick={(e) => handleDeleteSubject(e, s.id)}>🗑️</button>
                </div>
                {s.professor && <div className={styles.cardMeta}>👨‍🏫 {s.professor}</div>}
                {s.room && <div className={styles.cardMeta}>🏫 {s.room}</div>}
                {s.schedules?.map((sch: any) => (
                  <div key={sch.id} className={styles.scheduleTag}>
                    📅 {DAY_LABELS[sch.dayOfWeek]}曜 {sch.period}限
                  </div>
                ))}
                <div className={styles.cardStats}>
                  <span>📝 授業 {s._count?.sessions || 0}回</span>
                  <span>📖 ノート {s._count?.notes || 0}件</span>
                </div>
              </div>
            ))}

            {addingSubject ? (
              <div className={`glass ${styles.card}`}>
                <form onSubmit={handleAddSubject} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="input" placeholder="科目名" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} autoFocus required />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" className="btn btn-primary btn-sm">追加</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingSubject(false)}>戻る</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className={`${styles.card} ${styles.addCard}`} onClick={() => setAddingSubject(true)}>
                <span style={{ fontSize: 28 }}>+</span>
                <span>科目を手動で追加</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Subject detail view (sessions list)
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onSelectSubject(null)}>← 戻る</button>
          <div>
            <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: selectedSubject.color, display: "inline-block" }} />
              {selectedSubject.name}
            </h1>
            {selectedSubject.professor && <p className={styles.pageSubtitle}>👨‍🏫 {selectedSubject.professor}</p>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={onUploadBoard}>📸 板書を追加</button>
      </div>

      {loadingSessions ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><div className="spinner" /></div>
      ) : sessions.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📷</div>
          <h3>まだ授業記録がありません</h3>
          <p>板書の写真をアップロードすると、授業ごとに自動で整理されます。</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onUploadBoard}>📸 板書をアップロード</button>
        </div>
      ) : (
        <div className={styles.sessionList}>
          {sessions.map((session: any) => (
            <div key={session.id} className={`glass glass-hover ${styles.sessionCard}`} onClick={() => onSelectSession(session)}>
              <div className={styles.sessionLeft}>
                <div className={styles.sessionDate}>
                  {new Date(session.date).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
                </div>
                <div className={styles.sessionNum}>第{session.sessionNum}回</div>
                <div className={styles.sessionPhotos}>📷 {getPhotoCount(session)}枚</div>
              </div>
              <div className={styles.sessionMiddle}>
                {session.photos.slice(0, 4).map((p: any) => (
                  <img key={p.id} src={p.url} alt="" className={styles.thumbnail} loading="lazy" decoding="async" />
                ))}
              </div>
              <div className={styles.sessionRight}>
                {session.note ? (
                  <span className={styles.noteExistsBadge}>📖 ノートあり</span>
                ) : aiMode ? (
                  <>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={generating === session.id || getPhotoCount(session) === 0}
                      onClick={(e) => { e.stopPropagation(); handleGenerateNote(e, session.id); }}
                      style={{ minWidth: 120 }}
                    >
                      {generating === session.id ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                          {Math.round(genProgress[session.id] ?? 0)}%
                        </span>
                      ) : "✨ AIノート生成"}
                    </button>
                    {generating === session.id && (
                      <div style={{ width: "100%", marginTop: 6 }}>
                        <div style={{
                          height: 4, background: "rgba(255,255,255,0.06)",
                          borderRadius: 999, overflow: "hidden"
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${genProgress[session.id] ?? 0}%`,
                            background: "linear-gradient(90deg, #818cf8, #c084fc)",
                            borderRadius: 999,
                            transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)"
                          }} />
                        </div>
                      </div>
                    )}
                    {getPhotoCount(session) > 12 && !generating && (
                      <div className={styles.noteLimitHint}>最大12枚までの写真でノート生成します</div>
                    )}
                  </>
                ) : null}

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
