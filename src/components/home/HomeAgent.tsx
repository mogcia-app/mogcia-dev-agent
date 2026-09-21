"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function HomeAgent() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const openAgent = () => router.push(message.trim() ? `/agent?query=${encodeURIComponent(message.trim())}` : "/agent");
  return <section className="rounded-xl border border-[#E8E3E1] bg-white p-5 shadow-[0_8px_24px_rgba(31,31,34,0.03)]">
    <h2 className="flex items-center gap-2 text-base font-semibold text-[#25242A]"><Sparkles className="h-5 w-5 text-[#EC6F8B]" />Agent</h2>
    <div className="mt-4 flex items-center gap-3"><Image alt="MOGCIA Agent" className="h-16 w-16 object-contain" height={80} src="/m-dev-o.png" width={80} /><div><p className="text-sm font-medium text-[#2B2B2B]">何かお手伝いできることはありますか？</p><p className="mt-1 text-xs leading-5 text-[#8A8186]">開発ドキュメントやシステム構成を確認できます。</p></div></div>
    <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-white p-2"><textarea className="min-h-20 w-full resize-none p-2 text-sm outline-none" onChange={(event) => setMessage(event.target.value)} placeholder="質問や検索内容を入力してください..." value={message} /><div className="flex justify-end"><button aria-label="Agentを開く" className="grid h-9 w-9 place-items-center rounded-lg bg-[#EC6F8B] text-white" onClick={openAgent} type="button"><ArrowRight className="h-4 w-4" /></button></div></div>
  </section>;
}
