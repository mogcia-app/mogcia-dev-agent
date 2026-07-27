import { PageHeader } from "@/components/page-header";

export function BlankPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg bg-[#FFF8F9]/70 p-4 shadow-[inset_0_0_0_1px_rgba(240,222,226,0.72)] sm:p-6">
      <PageHeader title={title} description={description} />
      <div className="mt-5 rounded-lg border border-[#E9DAD8] bg-white p-6 shadow-[0_14px_44px_rgba(31,31,34,0.05)]">
        <h2 className="text-2xl font-semibold text-[#1F1F22]">準備中</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">必要な機能をここから組み立てていきます。</p>
      </div>
    </section>
  );
}
