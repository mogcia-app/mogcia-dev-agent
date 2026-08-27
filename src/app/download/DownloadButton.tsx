"use client";

import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

export function DownloadButton() {
  const [ready, setReady] = useState(!isFirebaseConfigured());
  const [signedIn, setSignedIn] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => { setSignedIn(Boolean(user)); setReady(true); });
  }, []);

  const download = async () => {
    const user = getFirebaseAuth()?.currentUser;
    if (!user) { window.location.href = "/"; return; }
    setDownloading(true); setMessage(null);
    try {
      const response = await fetch("/api/desktop/download", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!response.ok) throw new Error("ダウンロードできませんでした。");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "MOGCIA-latest.pkg"; anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "ダウンロードできませんでした。"); }
    finally { setDownloading(false); }
  };

  if (!ready) return <button className="mt-8 min-h-14 rounded-2xl bg-neutral-300 px-8 text-white" disabled>確認中…</button>;
  if (!signedIn) return <Link className="mt-8 inline-flex min-h-14 items-center justify-center rounded-2xl bg-[#EC6F8B] px-8 font-semibold text-white" href="/">社員ログインしてダウンロード</Link>;
  return <><button className="mt-8 min-h-14 rounded-2xl bg-[#EC6F8B] px-8 font-semibold text-white shadow-[0_12px_28px_rgba(236,111,139,0.28)] disabled:opacity-60" disabled={downloading} onClick={() => void download()}>{downloading ? "ダウンロード中…" : "Mac版をダウンロード"}</button>{message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}</>;
}
