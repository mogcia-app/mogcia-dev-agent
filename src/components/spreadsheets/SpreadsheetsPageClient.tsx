"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { Download, FileSpreadsheet, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, StatusBanner, StatusToast } from "@/components/ui/status";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { deleteSpreadsheet, subscribeSpreadsheets, uploadSpreadsheet } from "@/lib/spreadsheets";
import { getUserDisplayName } from "@/lib/user-display";
import type { WorkspaceSpreadsheet } from "@/types/spreadsheet";

type SheetCell = string | number | boolean | Date | null;
type SheetPreview = { name: string; rows: SheetCell[][] };

export function SpreadsheetsPageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<WorkspaceSpreadsheet[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [preview, setPreview] = useState<SheetPreview[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeSpreadsheets(setItems, (nextError) => setError(nextError.message));
  }, [user]);

  const months = useMemo(() => Array.from(new Set(items.map((item) => item.month))).sort().reverse(), [items]);
  const activeMonth = months.includes(selectedMonth) ? selectedMonth : months[0] ?? "";
  const monthItems = useMemo(() => items.filter((item) => item.month === activeMonth), [activeMonth, items]);
  const activeItem = monthItems.find((item) => item.id === selectedId) ?? monthItems[0] ?? null;

  useEffect(() => {
    if (!activeItem) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return [];
      setLoadingPreview(true);
      setError(null);
      return loadWorkbook(activeItem.url);
    })
      .then((sheets) => {
        if (cancelled) return;
        setPreview(sheets);
        setSelectedSheet((current) => sheets.some((sheet) => sheet.name === current) ? current : sheets[0]?.name ?? "");
      })
      .catch((nextError) => !cancelled && setError(nextError instanceof Error ? nextError.message : "Excelを読み込めませんでした。"))
      .finally(() => !cancelled && setLoadingPreview(false));
    return () => { cancelled = true; };
  }, [activeItem]);

  const sheet = preview.find((item) => item.name === selectedSheet) ?? preview[0] ?? null;
  const remove = async (item: WorkspaceSpreadsheet) => {
    if (!window.confirm(`「${item.name}」を削除しますか？`)) return;
    try {
      await deleteSpreadsheet(item);
      setToast("表を削除しました");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "表を削除できませんでした。");
    }
  };

  return (
    <section className="pt-4 sm:pt-6">
      <PageHeader title="月別の表" description="Excelファイルを月ごとに保管し、選んだ表だけを表示します。" actions={<button className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#D47A95] px-5 text-sm font-bold text-white" onClick={() => setUploadOpen(true)} type="button"><Plus className="h-4 w-4" />Excelを追加</button>} />
      <StatusToast message={toast} onClose={() => setToast(null)} />
      <div className="mt-4"><StatusBanner message={error} type="error" /></div>

      {items.length === 0 ? <div className="mt-5 rounded-xl border border-[#E2E8F0] bg-white p-8"><EmptyState icon={FileSpreadsheet} title="Excelはまだありません" description="毎月のExcelファイルを追加すると、月タブで切り替えて確認できます。" /></div> : (
        <div className="mt-5 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex gap-1 overflow-x-auto border-b border-[#E2E8F0] px-4 pt-3">
            {months.map((month) => <button className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${activeMonth === month ? "border-[#D47A95] text-[#9B4862]" : "border-transparent text-[#64748B]"}`} key={month} onClick={() => { setSelectedMonth(month); setSelectedId(""); }} type="button">{formatMonth(month)} <span className="ml-1 text-xs text-[#94A3B8]">{items.filter((item) => item.month === month).length}</span></button>)}
          </div>

          <div className="flex flex-col gap-3 border-b border-[#E2E8F0] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-2 overflow-x-auto">
              {monthItems.map((item) => <button className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${activeItem?.id === item.id ? "border-[#F1C2D0] bg-[#FDF0F4] text-[#9B4862]" : "border-[#E2E8F0] text-[#475569]"}`} key={item.id} onClick={() => setSelectedId(item.id)} type="button">{item.name}</button>)}
            </div>
            {activeItem ? <div className="flex shrink-0 gap-2"><a className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-[#475569]" href={activeItem.url} rel="noreferrer" target="_blank"><Download className="h-4 w-4" />元ファイル</a><button aria-label="表を削除" className="grid h-9 w-9 place-items-center rounded-lg border border-[#E2E8F0] text-[#9B4862] hover:bg-red-50" onClick={() => void remove(activeItem)} type="button"><Trash2 className="h-4 w-4" /></button></div> : null}
          </div>

          {preview.length > 1 ? <div className="flex gap-2 overflow-x-auto border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">{preview.map((item) => <button className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${sheet?.name === item.name ? "bg-white text-[#9B4862] shadow-sm ring-1 ring-[#E2E8F0]" : "text-[#64748B]"}`} key={item.name} onClick={() => setSelectedSheet(item.name)} type="button">{item.name}</button>)}</div> : null}

          <div className="min-h-80 overflow-auto">
            {loadingPreview ? <div className="grid min-h-80 place-items-center text-sm text-[#64748B]">Excelを読み込んでいます…</div> : null}
            {!loadingPreview && sheet ? <SpreadsheetTable sheet={sheet} /> : null}
          </div>
        </div>
      )}
      {uploadOpen && user ? <UploadModal user={user} onClose={() => setUploadOpen(false)} onError={setError} onUploaded={(month) => { setSelectedMonth(month); setUploadOpen(false); setToast("Excelを追加しました"); }} /> : null}
    </section>
  );
}

function SpreadsheetTable({ sheet }: { sheet: SheetPreview }) {
  if (!sheet.rows.length) return <div className="grid min-h-80 place-items-center text-sm text-[#64748B]">このシートには表示できるデータがありません。</div>;
  return <table className="min-w-full border-collapse text-sm"><tbody>{sheet.rows.map((row, rowIndex) => <tr className={rowIndex === 0 ? "sticky top-0 z-10 bg-[#F8FAFC] font-semibold text-[#334155]" : "bg-white text-[#475569]"} key={rowIndex}>{row.map((cell, columnIndex) => <td className="max-w-[360px] whitespace-pre-wrap border-b border-r border-[#E2E8F0] px-3 py-2 align-top" key={columnIndex}>{formatCell(cell)}</td>)}</tr>)}</tbody></table>;
}

function UploadModal({ user, onClose, onError, onUploaded }: { user: User; onClose: () => void; onError: (message: string | null) => void; onUploaded: (month: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [name, setName] = useState("");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!file || !month) return;
    setSaving(true);
    onError(null);
    try {
      await uploadSpreadsheet({ file, month, name, user: { id: user.uid, name: getUserDisplayName(user) }, onProgress: setProgress });
      onUploaded(month);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Excelを追加できませんでした。");
      setSaving(false);
    }
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"><section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-[#111827]">Excelを追加</h2><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F8FAFC]" onClick={onClose} type="button"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-[#475569]">対象月<input className="h-11 rounded-xl border border-[#E2E8F0] px-3" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><label className="grid gap-2 text-sm font-semibold text-[#475569]">表示名（省略可）<input className="h-11 rounded-xl border border-[#E2E8F0] px-3" placeholder="例: 9月 売上管理表" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="grid min-h-32 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-5 text-center"><UploadCloud className="h-7 w-7 text-[#D47A95]" /><span className="mt-2 text-sm font-semibold text-[#475569]">{file?.name ?? ".xlsx を選択"}</span><input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>{saving ? <div><div className="h-2 overflow-hidden rounded-full bg-[#F1F5F9]"><div className="h-full bg-[#D47A95] transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-[#64748B]">アップロード中 {progress}%</p></div> : null}</div><div className="mt-6 flex justify-end gap-3"><button className="h-11 rounded-xl border border-[#E2E8F0] px-5 text-sm font-semibold text-[#475569]" onClick={onClose} type="button">キャンセル</button><button className="h-11 rounded-xl bg-[#D47A95] px-6 text-sm font-bold text-white disabled:opacity-50" disabled={!file || !month || saving} onClick={() => void save()} type="button">{saving ? "追加中…" : "追加"}</button></div></section></div>;
}

async function loadWorkbook(url: string): Promise<SheetPreview[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Excelファイルを取得できませんでした。");
  const blob = await response.blob();
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(blob);
  return sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data as SheetCell[][] }));
}

function formatCell(cell: SheetCell): string {
  if (cell instanceof Date) return cell.toLocaleDateString("ja-JP");
  return String(cell ?? "");
}

function formatMonth(month: string): string {
  const [year, value] = month.split("-");
  return `${year}年${Number(value)}月`;
}
