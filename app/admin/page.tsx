"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // 簡易的なパスワード保護
    if (password === "ochibohiroi-admin") {
      setAuthenticated(true);
      fetchUsers();
    } else {
      setError("パスワードが違います");
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("このユーザーとすべての関連データを削除します。本当によろしいですか？")) return;
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!authenticated) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <h2>🛡️ 管理者ダッシュボード</h2>
          <p>アクセスにはパスワードが必要です</p>
          <form onSubmit={handleLogin} className={styles.authForm}>
            <input
              type="password"
              className="input"
              placeholder="管理者パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" className="btn btn-primary">ログイン</button>
          </form>
          <Link href="/" className="btn btn-secondary" style={{ marginTop: 16 }}>← アプリに戻る</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/" className="btn btn-secondary btn-sm">← アプリに戻る</Link>
          <h1 className={styles.title}>🛡️ 管理者ダッシュボード</h1>
        </div>
        <div className={styles.stats}>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>総ユーザー数</span>
            <span className={styles.statValue}>{users.length}</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="spinner" style={{ margin: "40px auto" }} />
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ユーザー名</th>
                <th>属性</th>
                <th>メールアドレス</th>
                <th>登録日</th>
                <th>登録科目数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.name || "未設定"}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ID: {u.id}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{u.school || "-"}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {u.department || ""} {u.grade ? `${u.grade}年生` : ""} {u.age ? `${u.age}歳` : ""}
                    </div>
                  </td>
                  <td style={{ fontSize: 14 }}>{u.email}</td>
                  <td style={{ fontSize: 13 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 600, color: "var(--accent-3)" }}>{u._count.subjects} 科目</td>
                  <td>
                    <button 
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteUser(u.id)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
