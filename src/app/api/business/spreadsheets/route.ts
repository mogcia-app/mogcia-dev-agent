import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserFromRequest } from "@/lib/server/auth";

const collectionName = "spreadsheets";

export async function GET(request: Request) {
  try {
    await requireUserFromRequest(request);
    const snapshot = await getAdminDb().collection(collectionName).orderBy("month", "desc").get();
    return NextResponse.json({ success: true, data: { items: snapshot.docs.map((entry) => serialize(entry.id, entry.data())) } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const ref = await getAdminDb().collection(collectionName).add({
      name: requiredString(body.name, "表示名", 200), month: validMonth(body.month), originalFileName: requiredString(body.originalFileName, "ファイル名", 255),
      url: requiredString(body.url, "ファイルURL", 2000), storagePath: requiredString(body.storagePath, "保存先", 1000), size: validSize(body.size),
      createdBy: user.uid, createdByName: typeof body.createdByName === "string" ? body.createdByName.slice(0, 200) : "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    return NextResponse.json({ success: true, data: { id: ref.id } }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const id = requiredString(body.id, "Excel ID", 160);
    const ref = getAdminDb().collection(collectionName).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error("Excelが見つかりません。");
    if (snapshot.data()?.createdBy !== user.uid) throw new Error("このExcelを削除する権限がありません。");
    await ref.delete();
    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) { return failure(error); }
}

function serialize(id: string, data: FirebaseFirestore.DocumentData) { return { ...data, id, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) }; }
function toIso(value: unknown) { return value instanceof Timestamp ? value.toDate().toISOString() : new Date(0).toISOString(); }
function requiredString(value: unknown, label: string, max: number) { if (typeof value !== "string" || !value.trim()) throw new Error(`${label}が必要です。`); return value.trim().slice(0, max); }
function validMonth(value: unknown) { const month = requiredString(value, "対象月", 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("対象月が不正です。"); return month; }
function validSize(value: unknown) { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 25 * 1024 * 1024) throw new Error("ファイルサイズが不正です。"); return value; }
function failure(error: unknown) { return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Excelを処理できませんでした。" } }, { status: 400 }); }
