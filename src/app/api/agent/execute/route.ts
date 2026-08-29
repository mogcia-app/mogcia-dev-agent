import { NextResponse } from "next/server";
import { executeAgentRequest } from "@/lib/server/agent/executor";
import { requireUserFromRequest } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const rawMessage = String(body.rawMessage ?? "");
    if (!isDevelopmentRequest(rawMessage)) {
      return NextResponse.json({
        success: false,
        error: {
          message: "Dev Agentでは開発依頼だけを受け付けます。会社、見込み客、予定、タスク、営業ログ、商品の登録・更新は各業務画面を使用してください。"
        }
      }, { status: 422 });
    }
    const result = await executeAgentRequest({
      user: { uid: user.uid, name: user.name },
      rawMessage,
      projectId: typeof body.projectId === "string" ? body.projectId : null
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "Agentを実行できませんでした。" } }, { status: 400 });
  }
}

function isDevelopmentRequest(rawMessage: string) {
  return /(開発|実装|修正|改修|不具合|バグ|コード|API|Firestore|Vercel|GitHub|リポジトリ|ビルド|テスト|デプロイ|DevelopmentJob|Worker|ログ|画面.*直|保存.*反応|500|エラー原因)/i.test(rawMessage);
}
