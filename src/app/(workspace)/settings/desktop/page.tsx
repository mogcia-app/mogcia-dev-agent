"use client";

import { Monitor, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingSpinner } from "@/components/ui/loading";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { DesktopDevicePublic } from "@/types/desktop";

type DeviceResponse = { success: true; data: { devices: DesktopDevicePublic[] } } | { success: false; error: { message: string } };
type CreateResponse = { success: true; data: { device: DesktopDevicePublic; token: string } } | { success: false; error: { message: string } };

export default function DesktopSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<DesktopDevicePublic[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async (currentUser: User) => {
    setLoading(true);
    setError(null);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/desktop/devices", { headers: { Authorization: `Bearer ${token}` } });
      const result = (await response.json()) as DeviceResponse;
      if (!result.success) throw new Error(result.error.message);
      setDevices(result.data.devices);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "端末一覧を読み込めませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) setTimeout(() => void loadDevices(nextUser), 0);
      else setLoading(false);
    });
  }, [loadDevices]);

  const createDevice = async () => {
    if (!user || !deviceName.trim()) return;
    setSaving(true);
    setError(null);
    setIssuedToken(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/desktop/devices", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName })
      });
      const result = (await response.json()) as CreateResponse;
      if (!result.success) throw new Error(result.error.message);
      setDevices((current) => [result.data.device, ...current]);
      setIssuedToken(result.data.token);
      setDeviceName("");
      setToast("デスクトップ端末を追加しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "端末を追加できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const revokeDevice = async (deviceId: string) => {
    if (!user || !window.confirm("この端末を無効化しますか？")) return;
    const token = await user.getIdToken();
    const response = await fetch(`/api/desktop/devices/${deviceId}/revoke`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const result = (await response.json()) as { success: boolean; error?: { message: string } };
    if (!result.success) {
      setError(result.error?.message ?? "端末を無効化できませんでした");
      return;
    }
    setDevices((current) => current.map((device) => (device.id === deviceId ? { ...device, status: "revoked", revokedAt: new Date().toISOString() } : device)));
    setToast("端末を無効化しました");
  };

  return (
    <section className="">
      <PageHeader title="デスクトップ連携" description="CLIや常設デスクトップウィジェットからMOGCIAへ安全に接続します。" />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-5"><StatusBanner message={error} type="error" /></div>

      {issuedToken ? (
        <div className="mt-5 rounded-2xl border border-[#F7CAD2] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[#EC6F8B]">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="font-bold">デスクトップアクセストークン</h2>
          </div>
          <p className="mt-2 text-sm font-semibold text-[#777]">このトークンは今だけ表示されます。CLIまたはデスクトップウィジェットの設定へ登録してください。</p>
          <code className="mt-4 block break-all rounded-none bg-[#FCF9F9] p-4 text-sm font-bold text-[#222]">{issuedToken}</code>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-[#F0E7E9] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-[#222]">新しい端末を追加</h2>
          <label className="mt-5 grid gap-2 text-sm font-bold text-[#655D62]">
            端末名
            <input className="task-input" placeholder="MacBook Neo" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>
          <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-none bg-[#EC6F8B] text-sm font-bold text-white disabled:opacity-50" disabled={saving || !deviceName.trim()} onClick={() => void createDevice()} type="button">
            {saving ? <LoadingSpinner label="登録中" /> : <Plus className="h-4 w-4" />}
            新しい端末を追加
          </button>
        </section>

        <section className="rounded-2xl border border-[#F0E7E9] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#222]">登録済み端末</h2>
            <button className="text-sm font-bold text-[#EC6F8B]" onClick={() => user && void loadDevices(user)} type="button">再読み込み</button>
          </div>
          {loading ? <div className="mt-5"><LoadingSpinner label="端末一覧を読み込み中" /></div> : null}
          {!loading && devices.length === 0 ? <div className="mt-5"><EmptyState icon={Monitor} title="登録済み端末はありません" description="最初のMacまたはCLI端末を追加してください。" /></div> : null}
          <div className="mt-5 grid gap-3">
            {devices.map((device) => (
              <div className="grid gap-3 rounded-2xl border border-[#F0E7E9] bg-[#FFFBFC] p-4 lg:grid-cols-[1fr_120px_180px_100px]" key={device.id}>
                <div>
                  <p className="font-bold text-[#222]">{device.deviceName}</p>
                  <p className="mt-1 text-xs font-semibold text-[#888]">作成日: {formatDateOnly(device.createdAt)}</p>
                  <p className="mt-1 text-xs font-semibold text-[#888]">Agent: {device.agentEnabled ? "有効" : "未接続"} / 通知: {device.notificationEnabled ? "有効" : "未設定"}</p>
                </div>
                <span className={`h-fit rounded-none px-3 py-1 text-center text-xs font-bold ${device.status === "active" ? "bg-[#F3FAF0] text-[#5E9B61]" : "bg-[#F5ECEE] text-[#888]"}`}>{device.status === "active" ? "有効" : "無効"}</span>
                <p className="text-xs font-semibold text-[#888]">最終利用: {device.lastSeenAt ? formatDateOnly(device.lastSeenAt) : device.lastUsedAt ? formatDateOnly(device.lastUsedAt) : "未利用"}</p>
                <button className="inline-flex h-9 items-center justify-center gap-2 rounded-none border border-[#F7CAD2] text-sm font-bold text-[#D94F6E] disabled:opacity-40" disabled={device.status === "revoked"} onClick={() => void revokeDevice(device.id)} type="button">
                  <Trash2 className="h-4 w-4" />
                  無効化
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function formatDateOnly(value: string): string {
  return new Date(value).toLocaleDateString("ja-JP");
}
