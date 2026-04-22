"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import styles from "../login/page.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    age: "",
    grade: "",
    school: "",
    department: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }
    if (form.password.length < 6) {
      setError("パスワードは6文字以上必要です");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name,
          age: form.age,
          grade: form.grade,
          school: form.school,
          department: form.department,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登録に失敗しました");
        setLoading(false);
        return;
      }

      // 登録後、自動ログイン
      const loginResult = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (loginResult?.error) {
        router.push("/login");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError("ネットワークエラーが発生しました");
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.bg} />
      <div className={styles.card} style={{ maxWidth: 520 }}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🌾</span>
          <span className={styles.logoText}>ochibohiroi</span>
        </div>
        <h1 className={styles.title}>新規登録</h1>
        <p className={styles.subtitle}>アカウントを作成して学習を始めよう</p>

        {error && (
          <div className={styles.errorBanner}>
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className="label">メールアドレス *</label>
            <input type="email" name="email" className="input" value={form.email} onChange={handleChange} placeholder="student@univ.ac.jp" required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className={styles.field}>
              <label className="label">パスワード *</label>
              <input type="password" name="password" className="input" value={form.password} onChange={handleChange} placeholder="6文字以上" required />
            </div>
            <div className={styles.field}>
              <label className="label">パスワード確認 *</label>
              <input type="password" name="confirmPassword" className="input" value={form.confirmPassword} onChange={handleChange} placeholder="再入力" required />
            </div>
          </div>
          <div className={styles.field}>
            <label className="label">お名前</label>
            <input type="text" name="name" className="input" value={form.name} onChange={handleChange} placeholder="山田 太郎" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className={styles.field}>
              <label className="label">年齢</label>
              <input type="number" name="age" className="input" value={form.age} onChange={handleChange} placeholder="20" min="15" max="60" />
            </div>
            <div className={styles.field}>
              <label className="label">学年</label>
              <select name="grade" className="input" value={form.grade} onChange={handleChange}>
                <option value="">選択</option>
                <option value="1">1年生</option>
                <option value="2">2年生</option>
                <option value="3">3年生</option>
                <option value="4">4年生</option>
                <option value="5">5年生</option>
                <option value="6">6年生</option>
                <option value="7">修士1年</option>
                <option value="8">修士2年</option>
                <option value="9">博士</option>
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label className="label">大学・学校名</label>
            <input type="text" name="school" className="input" value={form.school} onChange={handleChange} placeholder="東京大学" />
          </div>
          <div className={styles.field}>
            <label className="label">学部・学科</label>
            <input type="text" name="department" className="input" value={form.department} onChange={handleChange} placeholder="理学部情報科学科" />
          </div>

          <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.smallSpinner} />
                登録中...
              </>
            ) : (
              "アカウントを作成する"
            )}
          </button>
        </form>

        <p className={styles.switchLink}>
          すでにアカウントをお持ちの方は{" "}
          <Link href="/login" className={styles.link}>
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
