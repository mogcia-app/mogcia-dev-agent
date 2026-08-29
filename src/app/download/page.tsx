import Image from "next/image";
import { DownloadButton } from "./DownloadButton";

export const metadata = {
  title: "MOGCIA Desktop ダウンロード",
  description: "MOGCIA Desktop for macOS の社内配布ページ"
};

export default function DownloadPage() {
  return (
    <main className="min-h-screen px-5 py-12 sm:py-20">
      <section className="mx-auto max-w-3xl rounded-[36px] border border-white/80 bg-white/90 p-7 shadow-[0_28px_90px_rgba(31,31,34,0.12)] sm:p-12">
        <div className="flex flex-col items-center text-center">
          <Image alt="MOGCIA" className="h-28 w-28 rounded-[28px] object-cover shadow-lg" height={160} priority src="/m-dev-agent.png" width={160} />
          <p className="mt-7 text-sm font-semibold tracking-[0.18em] text-[#C06E80]">MOGCIA FOR MAC</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#1F1F22] sm:text-4xl">MOGCIA Desktop</h1>
          <p className="mt-4 max-w-xl leading-7 text-neutral-600">通知、予定、AI提案、会社検索、MOGCIAとの会話をMacのメニューバーから利用できます。</p>
          <DownloadButton />
          <p className="mt-3 text-sm text-neutral-500">最新版 0.7.17 ・ macOS 14以降</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Step number="1" title="ダウンロード" text="上のボタンからインストーラーを保存します。" />
          <Step number="2" title="インストール" text="MOGCIA-latest.pkgを開き、画面の案内に従います。既存版は上書きされます。" />
          <Step number="3" title="初回設定" text="ターミナルで mogcia setup を実行し、社員アカウントでログインして連携します。" />
        </div>

        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <p className="font-semibold">現在は社内テスト版です</p>
          <p className="mt-1">Apple Developer IDによる署名・公証の準備中です。macOSにより開けない場合は、システム設定の「プライバシーとセキュリティ」からMOGCIAを許可してください。ログイン情報と設定は上書き更新後も保持されます。</p>
        </div>
      </section>
    </main>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="rounded-2xl bg-[#FFF7F9] p-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#F7CAD2] text-sm font-semibold text-[#A94D65]">{number}</span><h2 className="mt-4 font-semibold text-[#302D30]">{title}</h2><p className="mt-2 text-sm leading-6 text-neutral-600">{text}</p></div>;
}
