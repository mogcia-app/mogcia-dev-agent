import { Suspense } from "react";
import DesktopConnectClient from "./DesktopConnectClient";

export default function DesktopConnectPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center text-neutral-500">連携情報を確認しています…</main>}><DesktopConnectClient /></Suspense>;
}
