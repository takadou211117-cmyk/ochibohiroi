"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [supportsBiometric, setSupportsBiometric] = useState(false);
  const [supportsCredentialManager, setSupportsCredentialManager] = useState(false);

  useEffect(() => {
    const storedEmail = localStorage.getItem("savedEmail");
    const storedRemember = localStorage.getItem("rememberPassword") === "true";
    setRememberMe(storedRemember);
    if (storedEmail) setEmail(storedEmail);

    const biometricAvailable = typeof window !== "undefined" &&
      !!(navigator.credentials && (navigator.credentials as any).get);
    setSupportsBiometric(biometricAvailable);

    const credentialManagerAvailable = typeof window !== "undefined" &&
      !!navigator.credentials &&
      typeof (window as any).PasswordCredential === "function" &&
      typeof (navigator.credentials as any).store === "function";
    setSupportsCredentialManager(credentialManagerAvailable);

    if (storedRemember && biometricAvailable) {
      restoreSavedCredential();
    }
  }, []);

  const restoreSavedCredential = async () => {
    if (!navigator.credentials?.get) return;
    try {
      const credential = await (navigator.credentials as any).get({
        password: true,
        mediation: "optional",
      });
      if (credential?.password) {
        setEmail(credential.id || "");
        setPassword(credential.password);
      }
    } catch {
      // ignore silent restore failures
    }
  };

  const saveCredentials = async (emailValue: string, passwordValue: string) => {
    try {
      if (navigator.credentials?.store) {
        const passwordCredential = new (window as any).PasswordCredential({
          id: emailValue,
          password: passwordValue,
          name: emailValue,
        });
        await navigator.credentials.store(passwordCredential);
      }
    } catch {
      // Browser may not support storing credentials; ignore
    }
  };

  const registerBiometric = async () => {
    if (!supportsCredentialManager) {
      addToast("この端末はFace ID登録に対応していません", "error");
      return;
    }
    if (!email || !password) {
      addToast("Face ID登録にはメールアドレスとパスワードの入力が必要です", "error");
      return;
    }

    try {
      const passwordCredential = new (window as any).PasswordCredential({
        id: email,
        password,
        name: email,
      });
      await navigator.credentials.store(passwordCredential);
      addToast("Face IDに対応したパスワード管理を登録しました。次回からFace IDでログインできます。", "success");
    } catch (err: any) {
      addToast(`Face ID登録に失敗しました: ${err?.message || "対応ブラウザをお試しください"}`, "error");
    }
  };

  const login = async (emailValue: string, passwordValue: string) => {
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email: emailValue,
      password: passwordValue,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("メールアドレスまたはパスワードが間違っています");
      return false;
    }

    if (rememberMe) {
      localStorage.setItem("savedEmail", emailValue);
      localStorage.setItem("rememberPassword", "true");
      await saveCredentials(emailValue, passwordValue);
    } else {
      localStorage.removeItem("savedEmail");
      localStorage.setItem("rememberPassword", "false");
    }

    router.push("/");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  const handleFaceIdLogin = async () => {
    if (!navigator.credentials?.get) {
      setError("お使いのブラウザはFace IDログインに対応していません");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const credential = await (navigator.credentials as any).get({
        password: true,
        mediation: "required",
      });
      if (!credential?.password) {
        throw new Error("no credential");
      }
      await login(credential.id, credential.password);
    } catch {
      setError("Face IDでのログインに失敗しました。もう一度お試しください。");
      setLoading(false);
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
              name="email"
              autoComplete="email"
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
              name="current-password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <label className={styles.rememberRow}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            次回からパスワードを保存する
          </label>

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
          {supportsBiometric && (
            <button
              type="button"
              className={`btn btn-secondary ${styles.biometricBtn}`}
              onClick={handleFaceIdLogin}
              disabled={loading}
            >
              {loading ? "認証中..." : "Face IDでログイン"}
            </button>
          )}
          {supportsCredentialManager && (
            <button
              type="button"
              className={`btn btn-secondary ${styles.biometricBtn}`}
              onClick={registerBiometric}
              disabled={loading || !email || !password}
            >
              {loading ? "処理中..." : "Face ID登録"}
            </button>
          )}
        </form>

        <p className={styles.switchLink}>
          アカウントをお持ちでない方は{" "}
          <Link href="/register" className={styles.link}>
            新規登録
          </Link>
        </p>

        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <Link href="/terms" style={{ fontSize: "12px", color: "var(--text-secondary)", textDecoration: "underline" }}>
            利用規約
          </Link>
        </div>
      </div>
    </div>
  );
}
