"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("メールアドレスまたはパスワードが間違っています");
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.bg} />
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🌾</span>
          <span className={styles.logoText}>ochibohiroi</span>
        </div>
        <h1 className={styles.title}>ログイン</h1>
        <p className={styles.subtitle}>大学生のためのAI学習サポート</p>

        {error && (
          <div className={styles.errorBanner}>
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">メールアドレス</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@university.ac.jp"
              required
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className="label">パスワード</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.smallSpinner} />
                ログイン中...
              </>
            ) : (
              "ログイン"
            )}
          </button>
        </form>

        <p className={styles.switchLink}>
          アカウントをお持ちでない方は{" "}
          <Link href="/register" className={styles.link}>
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
