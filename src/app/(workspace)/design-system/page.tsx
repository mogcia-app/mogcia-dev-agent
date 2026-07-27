import { AlertTriangle, Bell, CheckCircle2, Database, Inbox, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AIProcessingCard, LoadingCard, LoadingDots, LoadingLogo, LoadingProgress, LoadingSpinner, SkeletonCard, SkeletonCompany, SkeletonList, SkeletonTable, SkeletonTask, SkeletonTimeline } from "@/components/ui/loading";
import { EmptyState, ErrorState, StatusBanner, StatusToast } from "@/components/ui/status";

export default function DesignSystemPage() {
  return (
    <section className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <PageHeader title="Design System" description="MOGCIAの認証・ローディング・状態表示をここで確認できます。" />

      <div className="mt-5 space-y-6">
        <Preview title="認証・初回読み込み">
          <div className="grid gap-4 lg:grid-cols-3">
            <LoadingCard compact variant="auth" />
            <LoadingCard compact variant="initial" />
            <LoadingCard compact variant="saving" progress={55} />
          </div>
        </Preview>

        <Preview title="AI処理">
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <AIProcessingCard compact />
            <div className="rounded-2xl border border-[#F0E7E9] bg-white p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold text-[#222]"><Sparkles className="h-5 w-5 text-[#F45F7A]" />AI処理ステップ</h3>
              <div className="mt-4 space-y-3 text-sm font-bold text-[#666]">
                {["会社を検索しています...", "活動ログを整理しています...", "タスクを考えています...", "ナレッジを抽出しています...", "完了しました"].map((step, index) => (
                  <div className="flex items-center gap-3" key={step}>
                    <span className={`grid h-7 w-7 place-items-center rounded-md ${index < 2 ? "bg-[#F45F7A] text-white" : "bg-[#F7F7F7] text-[#999]"}`}>{index + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Preview>

        <Preview title="ブロック型ローディング">
          <div className="grid gap-4 lg:grid-cols-4">
            <Token title="Logo"><LoadingLogo /></Token>
            <Token title="Dots"><LoadingDots /></Token>
            <Token title="Button"><LoadingSpinner /></Token>
            <Token title="Progress"><LoadingProgress progress={42} /></Token>
          </div>
          <div className="mt-5 h-8 overflow-hidden rounded-2xl border border-[#F0E7E9] bg-white">
            <div className="h-[3px] overflow-hidden bg-[#F7D6DE]">
              <span className="mogcia-page-progress block h-full w-1/3 bg-[#F45F7A]" />
            </div>
          </div>
        </Preview>

        <Preview title="Skeleton">
          <div className="grid gap-4 xl:grid-cols-2">
            <SkeletonList count={3} />
            <SkeletonTable rows={4} />
            <SkeletonTimeline count={4} />
            <SkeletonTask count={3} />
          </div>
          <div className="mt-4">
            <SkeletonCompany />
          </div>
        </Preview>

        <Preview title="状態表示">
          <div className="grid gap-4 lg:grid-cols-2">
            <StatusBanner message="更新しました" type="success" />
            <StatusBanner message="読み込みに失敗しました" type="error" />
            <StatusBanner message="処理を開始しました" type="info" />
            <SkeletonCard media />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <EmptyState actionLabel="新規作成" description="まだ表示するデータがありません。" icon={Inbox} title="まだデータがありません" />
            <ErrorState description="通信状況を確認して、もう一度お試しください。" />
          </div>
          <div className="relative mt-5 min-h-20 rounded-2xl border border-[#F0E7E9] bg-white p-4">
            <StatusToast message="AIタスクを作成しました" />
          </div>
        </Preview>

        <Preview title="基本部品">
          <div className="grid gap-4 md:grid-cols-3">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#F45F7A] px-5 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4" />保存</button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#F0E7E9] bg-white px-5 text-sm font-bold text-[#666]"><Bell className="h-4 w-4" />通知</button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#F7CAD2] bg-[#FFF0F3] px-5 text-sm font-bold text-[#D94F6E]"><AlertTriangle className="h-4 w-4" />削除</button>
            <input className="task-input" placeholder="入力フォーム" />
            <span className="inline-flex h-9 items-center justify-center rounded-full bg-[#FFF0F3] px-4 text-sm font-bold text-[#F45F7A]">公開中</span>
            <span className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#F1F7FF] px-4 text-sm font-bold text-[#4F78B4]"><Database className="h-4 w-4" />Firestore</span>
          </div>
        </Preview>
      </div>
    </section>
  );
}

function Preview({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#F0E7E9] bg-white/80 p-5 shadow-[0_14px_44px_rgba(31,31,34,0.04)]">
      <h2 className="mb-4 text-xl font-bold text-[#222]">{title}</h2>
      {children}
    </section>
  );
}

function Token({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-2xl border border-[#F0E7E9] bg-white p-5 text-center">
      <div>{children}</div>
      <p className="mt-3 text-sm font-bold text-[#888]">{title}</p>
    </div>
  );
}
