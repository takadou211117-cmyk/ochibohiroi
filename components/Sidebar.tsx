"use client";
import { useState } from "react";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  user: any;
  activeView: "subjects" | "timetable";
  onViewChange: (v: "subjects" | "timetable") => void;
  onUploadTimetable: () => void;
  onUploadBoard: () => void;
  onSignOut: () => void;
  onProfileUpdate: () => void;
  addToast: (msg: string, type?: any) => void;
  aiMode: boolean;
  onAiModeToggle: () => void;
}

export default function Sidebar({ user, activeView, onViewChange, onUploadTimetable, onUploadBoard, onSignOut, onProfileUpdate, addToast, aiMode, onAiModeToggle }: SidebarProps) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const startEdit = () => {
    setForm({
      name: user?.name || "",
      age: user?.age || "",
      grade: user?.grade || "",
      school: user?.school || "",
      department: user?.department || "",
    });
    setEditingProfile(true);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        onProfileUpdate();
        setEditingProfile(false);
        addToast("プロフィールを更新しました");
      }
    } catch (e) {
      addToast("更新に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  const gradeLabel = (g: number) => {
    if (!g) return "";
    if (g <= 6) return `${g}年生`;
    if (g === 7) return "修士1年";
    if (g === 8) return "修士2年";
    return "博士";
  };

  const sidebarContent = (
    <div className={styles.inner}>
      {/* Logo */}
      <div className={styles.logo}>
        <span className={styles.logoEmoji}>🌾</span>
        <span className={styles.logoText}>ochibohiroi</span>
      </div>

      {/* Profile */}
      <div className={styles.profile}>
        {!editingProfile ? (
          <>
            <div className={styles.avatar}>{user?.name?.[0] || "?"}</div>
            <div className={styles.profileInfo}>
              <div className={styles.profileName}>{user?.name || "名前未設定"}</div>
              <div className={styles.profileMeta}>{user?.school || "大学未設定"}</div>
              {user?.department && <div className={styles.profileMeta}>{user.department}</div>}
              {(user?.grade || user?.age) && (
                <div className={styles.profileTags}>
                  {user?.grade && <span className={styles.tag}>{gradeLabel(user.grade)}</span>}
                  {user?.age && <span className={styles.tag}>{user.age}歳</span>}
                </div>
              )}
            </div>
            <button className={`btn btn-icon ${styles.editBtn}`} onClick={startEdit} title="プロフィール編集">✏️</button>
          </>
        ) : (
          <form onSubmit={saveProfile} className={styles.editForm}>
            <input className="input" placeholder="名前" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <input className="input" placeholder="大学名" value={form.school} onChange={e => setForm({...form, school: e.target.value})} />
            <input className="input" placeholder="学部・学科" value={form.department} onChange={e => setForm({...form, department: e.target.value})} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <select className="input" value={form.grade} onChange={e => setForm({...form, grade: e.target.value})}>
                <option value="">学年</option>
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}年生</option>)}
                <option value="7">修士1年</option>
                <option value="8">修士2年</option>
                <option value="9">博士</option>
              </select>
              <input className="input" type="number" placeholder="年齢" value={form.age} onChange={e => setForm({...form, age: e.target.value})} min="15" max="60" />
            </div>
            <div className={styles.editActions}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "保存中..." : "保存"}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingProfile(false)}>キャンセル</button>
            </div>
          </form>
        )}
      </div>

      <div className="divider" />

      {/* Navigation */}
      <nav className={styles.nav}>
        <button className={`${styles.navItem} ${activeView === "subjects" ? styles.active : ""}`} onClick={() => { onViewChange("subjects"); setMobileOpen(false); }}>
          <span className={styles.navIcon}>📚</span>
          <span>科目 / ノート</span>
        </button>
        <button className={`${styles.navItem} ${activeView === "timetable" ? styles.active : ""}`} onClick={() => { onViewChange("timetable"); setMobileOpen(false); }}>
          <span className={styles.navIcon}>📅</span>
          <span>時間割</span>
        </button>
      </nav>

      <div className="divider" />

      {/* AI Mode Toggle */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 4px", marginBottom: 8,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {aiMode ? "🤖 AIモード" : "⚡ アナログモード"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {aiMode ? "AI解析・ノート生成有効" : "アナログ等速模式"}
          </div>
        </div>
        <button
          onClick={onAiModeToggle}
          style={{
            position: "relative", width: 44, height: 24, borderRadius: 12,
            background: aiMode ? "var(--accent-1)" : "rgba(255,255,255,0.12)",
            border: "none", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
          }}
          title={aiMode ? "AIをオフにする" : "AIをオンにする"}
        >
          <span style={{
            position: "absolute", top: 3, left: aiMode ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          }} />
        </button>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className="btn btn-secondary" style={{width:"100%",justifyContent:"center"}} onClick={onUploadTimetable}>
          {aiMode ? "📅 時間割を読み込む" : "📅 時間割を登録"}
        </button>
        <button className="btn btn-primary" style={{width:"100%",justifyContent:"center"}} onClick={onUploadBoard}>
          📸 板書をアップロード
        </button>
      </div>

      <div style={{flex:1}} />

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statVal}>{user?.subjects?.length || 0}</span>
          <span className={styles.statLabel}>科目</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statVal}>{user?.subjects?.reduce((a: number, s: any) => a + (s._count?.sessions || 0), 0) || 0}</span>
          <span className={styles.statLabel}>授業回</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statVal}>{user?.subjects?.reduce((a: number, s: any) => a + (s._count?.notes || 0), 0) || 0}</span>
          <span className={styles.statLabel}>ノート</span>
        </div>
      </div>

      <button className={`btn btn-secondary ${styles.signOutBtn}`} onClick={onSignOut}>
        🚪 ログアウト
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button className={styles.mobileToggle} onClick={() => setMobileOpen(true)}>☰</button>
      {mobileOpen && <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} />}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ""}`}>
        {sidebarContent}
      </aside>
    </>
  );
}
