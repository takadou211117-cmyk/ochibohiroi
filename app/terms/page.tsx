import Link from "next/link";
import styles from "../login/page.module.css"; // Reuse the glassmorphism styles

export const metadata = {
  title: "利用規約 | ochibohiroi",
};

export default function TermsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.bg} />
      <div className={styles.card} style={{ maxWidth: 800, padding: "40px", textAlign: "left" }}>
        <h1 className={styles.title} style={{ marginBottom: "20px" }}>利用規約</h1>
        
        <div style={{ color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "14px", overflowY: "auto", maxHeight: "60vh", paddingRight: "10px" }}>
          <p>この利用規約（以下、「本規約」といいます。）は、ochibohiroi（以下、「本サービス」といいます。）が提供するサービスの利用条件を定めるものです。ユーザーの皆さま（以下、「ユーザー」といいます。）には、本規約に従って、本サービスをご利用いただきます。</p>
          
          <h2 style={{ color: "var(--text)", marginTop: "20px", marginBottom: "10px", fontSize: "16px" }}>第1条（適用）</h2>
          <p>本規約は、ユーザーと本サービスとの間の本サービスの利用に関わる一切の関係に適用されるものとします。</p>

          <h2 style={{ color: "var(--text)", marginTop: "20px", marginBottom: "10px", fontSize: "16px" }}>第2条（情報の取得と利用目的）</h2>
          <p>本サービスは、ユーザーがアップロードした以下の情報を取得・保存します。</p>
          <ul style={{ paddingLeft: "20px", margin: "10px 0" }}>
            <li>アカウント情報（メールアドレス、氏名、学校情報など）</li>
            <li>学習データ（時間割の画像、板書の写真データ、手書きノートの画像など）</li>
            <li>AI（Gemini API等）を用いて解析・生成されたテキスト情報（スケジュール、ノート内容など）</li>
          </ul>
          <p>これらの情報は、本サービスの提供（AIによる文字起こし、要約、科目振り分け、スケジュール管理など）および品質向上の目的でのみ使用され、ユーザーの同意なく第三者に提供されることはありません（ただし、機能提供のために外部AI APIへ送信される場合を除きます）。</p>

          <h2 style={{ color: "var(--text)", marginTop: "20px", marginBottom: "10px", fontSize: "16px" }}>第3条（外部APIの利用）</h2>
          <p>本サービスは、画像解析やノート生成のためにGoogle提供のGemini API等の外部サービスを利用します。ユーザーがアップロードしたデータは、これらの外部サービスの利用規約に従って処理されることに同意するものとします。</p>

          <h2 style={{ color: "var(--text)", marginTop: "20px", marginBottom: "10px", fontSize: "16px" }}>第4条（禁止事項）</h2>
          <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ul style={{ paddingLeft: "20px", margin: "10px 0" }}>
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>本サービスのサーバーまたはネットワークの機能を破壊したり、妨害したりする行為</li>
            <li>他人の著作権、肖像権、プライバシーなどを侵害するデータ（自身に関係のない他人の写真など）をアップロードする行為</li>
          </ul>

          <h2 style={{ color: "var(--text)", marginTop: "20px", marginBottom: "10px", fontSize: "16px" }}>第5条（免責事項）</h2>
          <p>本サービスは、AI（人工知能）を用いた解析や文章生成を提供しますが、その正確性、完全性、有用性を保証するものではありません。AIによって生成されたノートや時間割の誤りによって生じたいかなる損害についても、本サービスは責任を負いません。</p>

        </div>

        <div style={{ marginTop: "30px", textAlign: "center" }}>
          <Link href="/register" className={`btn btn-primary ${styles.submitBtn}`} style={{ display: "inline-block", textDecoration: "none" }}>
            戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
