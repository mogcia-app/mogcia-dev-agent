import { FieldValue, Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";
import { executeAgentRequest } from "@/lib/server/agent/executor";
import { getAgentRunForExecution } from "@/lib/server/agent/repository";
import { getUserDisplayNameById } from "@/lib/user-display";

const ADMIN_UID = "TjDadmBAdVYaPEvG3ppfBLS4HGN2";
const openStatuses = new Set(["todo", "open", "pending", "in_progress", "waiting"]);

export async function POST(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request);
    const body = await request.json() as { message?: unknown; allowDuplicate?: unknown; history?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const allowDuplicate = body.allowDuplicate === true;
    if (!message) return success({ handled: false, kind: "none", message: "", items: [] });
    const db = getAdminDb();

    const template = inputTemplate(message);
    if (template) return success({ handled: true, kind: "template", message: `${template.title}を入力してください。`, items: [], template });
    if (isDailySummary(message)) return success(await dailySummary(user.uid, message.includes("夕") || message.includes("終業")));
    const searchQuery = extractGlobalSearch(message);
    if (searchQuery) return success(await globalSearch(searchQuery, user.uid));
    if (isProductList(message)) return success(await productList());
    const productQuery = extractProductQuery(message);
    if (productQuery) return success(await productStatus(productQuery));
    const productName = extractProductRegistration(message);
    if (productName) return success(await createProduct(productName, user.uid, user.name || user.email || null, allowDuplicate, message));
    const analysisQuery = extractSalesAnalysisQuery(message);
    if (analysisQuery) return success(await salesAnalysisDetail(analysisQuery, user.uid));
    if (isSalesAnalysisList(message)) return success(await salesAnalysisList(user.uid));
    if (isTeleapoStatus(message)) return success(await teleapoStatus(user.uid));
    const leadCreateName = extractLeadRegistration(message);
    if (leadCreateName) return success(await createLeadFromCommand(leadCreateName, message, user.uid, user.name || user.email || null, allowDuplicate));
    if (isLeadUpdate(message)) return success(await updateLeadFromCommand(message, user.uid));
    if (isEventDelete(message)) return success(await deleteEventFromCommand(message, user.uid));
    if (isEventUpdate(message)) return success(await updateEventFromCommand(message, user.uid));
    if (isProductUpdate(message)) return success(await updateProductFromCommand(message));
    const taskTitle = extractTaskCreation(message);
    if (taskTitle) return success(await createTask(taskTitle, message, user.uid, user.name || user.email || null, allowDuplicate));
    const completedTask = extractTaskCompletion(message);
    if (completedTask) return success(await completeTask(completedTask, user.uid));
    if (isKnowledgeList(message)) return success(await knowledgeList(user.uid));
    const knowledgeTitle = extractKnowledgeRegistration(message);
    if (knowledgeTitle) return success(await createKnowledge(knowledgeTitle, message, user.uid, user.name || user.email || null));
    const newCompanyName = extractCompanyRegistration(message);
    if (newCompanyName) return success(await createCompany(newCompanyName, user.uid, user.name || user.email || null, allowDuplicate, message));
    if (isTodaySchedule(message)) return success(await ownSchedule(user.uid));
    if (isOpenTasks(message)) return success(await ownTasks(user.uid));
    if (isAppointmentTaken(message)) return success(await appointmentDraft(message, user.uid, user.name || user.email || null, allowDuplicate));
    if (isEventCreation(message)) return success(await eventDraft(message, user.uid, user.name || user.email || null, allowDuplicate));
    const companyQuery = extractCompanyQuery(message);
    if (companyQuery) return success(await companyStatus(companyQuery));
    const companyLog = await matchCompanyInMessage(message);
    if (companyLog) return success(await saveCompanyLog(companyLog.id, companyLog.name, message, user.uid, user.name || user.email || null, allowDuplicate));
    const memberQuery = extractMemberQuery(message);
    if (memberQuery) return success(await memberStatus(memberQuery, user.uid));
    const history = Array.isArray(body.history)
      ? body.history.slice(0, 6).flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const value = entry as Record<string, unknown>;
          const input = typeof value.input === "string" ? value.input.trim() : "";
          const result = typeof value.result === "string" ? value.result.trim() : "";
          return input ? [`ユーザー: ${input}${result ? `\nMOGCIA: ${result}` : ""}`] : [];
        }).reverse()
      : [];
    const contextualMessage = history.length
      ? `直近の会話:\n${history.join("\n")}\n\n今回の依頼: ${message}`
      : message;
    const created = await executeAgentRequest({
      user: { uid: user.uid, name: user.name },
      rawMessage: contextualMessage,
      source: "desktop",
    });
    const run = await getAgentRunForExecution(user.uid, created.runId);
    const cards = Array.isArray(run?.cards) ? run.cards : [];
    return success({
      handled: true,
      kind: "agent",
      message: typeof run?.answer === "string" && run.answer.trim() ? run.answer : "回答を作成できませんでした。もう一度お試しください。",
      items: cards.slice(0, 10).map((card, index) => {
        const value = card && typeof card === "object" ? card as Record<string, unknown> : {};
        return {
          id: typeof value.id === "string" ? value.id : `${created.runId}-${index}`,
          title: typeof value.title === "string" ? value.title : "MOGCIA",
          subtitle: typeof value.subtitle === "string" ? value.subtitle : undefined,
          type: typeof value.type === "string" ? value.type : "summary",
          body: typeof value.body === "string" ? value.body : undefined,
          href: typeof value.href === "string" ? value.href : undefined,
          tone: typeof value.tone === "string" ? value.tone : "default",
          meta: Array.isArray(value.meta) ? value.meta.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const meta = entry as Record<string, unknown>;
            return typeof meta.label === "string" && typeof meta.value === "string" ? [{ label: meta.label, value: meta.value }] : [];
          }).slice(0, 8) : [],
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "command_failed" } }, { status: 400 });
  }
}

async function dailySummary(uid: string, evening: boolean) {
  const db = getAdminDb(); const [events, tasks] = await Promise.all([db.collection("calendarEvents").orderBy("startAt", "asc").limit(200).get(), db.collection("tasks").where("assigneeId", "==", uid).limit(100).get()]);
  const todayEvents = events.docs.filter((entry) => belongsToUser(entry.data(), uid) && isToday(entry.data().startAt)); const openTasks = tasks.docs.filter((entry) => openStatuses.has(String(entry.data().status ?? "")));
  const items = [...todayEvents.slice(0, 5).map((entry) => ({ id: entry.id, title: String(entry.data().title || "予定"), subtitle: formatTime(entry.data().startAt), type: "calendar" })), ...openTasks.slice(0, 5).map((entry) => ({ id: entry.id, title: String(entry.data().title || "タスク"), subtitle: entry.data().dueDate ? `期限 ${formatDate(entry.data().dueDate)}` : "期限なし", type: "task" }))];
  return { handled: true, kind: "list", message: evening ? `今日の予定${todayEvents.length}件、未完了タスク${openTasks.length}件です。明日へ持ち越す内容を確認してください。` : `今日の予定${todayEvents.length}件、優先タスク${openTasks.length}件です。`, items };
}

async function globalSearch(query: string, uid: string) {
  const db = getAdminDb(); const normalized = query.toLocaleLowerCase("ja-JP");
  const [companies, products, tasks, leads] = await Promise.all([
    db.collection("companies").limit(200).get(), db.collection("products").limit(100).get(), db.collection("tasks").where("assigneeId", "==", uid).limit(100).get(), db.collection("leads").limit(150).get()
  ]);
  const includes = (...values: unknown[]) => values.some((value) => String(value ?? "").toLocaleLowerCase("ja-JP").includes(normalized));
  const items = [
    ...companies.docs.filter((entry) => includes(entry.data().name, entry.data().primaryContactName, entry.data().phone, entry.data().email)).map((entry) => ({ id: entry.id, title: String(entry.data().name || "会社"), subtitle: [entry.data().primaryContactName, entry.data().industry].filter(Boolean).join(" / "), type: "company" })),
    ...products.docs.filter((entry) => includes(entry.data().name, entry.data().displayName, entry.data().tagline)).map((entry) => ({ id: entry.id, title: String(entry.data().displayName || entry.data().name || "商品"), subtitle: String(entry.data().tagline || "商品"), type: "product" })),
    ...tasks.docs.filter((entry) => includes(entry.data().title, entry.data().description, entry.data().companyName)).map((entry) => ({ id: entry.id, title: String(entry.data().title || "タスク"), subtitle: String(entry.data().status || ""), type: "task" })),
    ...leads.docs.filter((entry) => includes(entry.data().companyName, entry.data().contactName, entry.data().phone, entry.data().email)).map((entry) => ({ id: entry.id, title: String(entry.data().companyName || "見込み客"), subtitle: [entry.data().contactName, leadStatusLabel(String(entry.data().status || "new"))].filter(Boolean).join(" / "), type: "lead" }))
  ].slice(0, 15);
  return { handled: true, kind: "list", message: items.length ? `「${query}」の検索結果です。` : `「${query}」は見つかりませんでした。`, items };
}

async function productStatus(query: string) {
  const snapshot = await getAdminDb().collection("products").limit(100).get();
  const match = snapshot.docs.find((entry) => String(entry.data().displayName || entry.data().name || "").toLocaleLowerCase("ja-JP").includes(query.toLocaleLowerCase("ja-JP")));
  if (!match) return { handled: true, kind: "message", message: `${query}の商品情報が見つかりませんでした。`, items: [] };
  const data = match.data(); const target = data.target ?? {}; const pricing = data.pricing ?? {};
  const details = [String(data.tagline || data.summary || "概要未設定"), Array.isArray(target.industries) && target.industries.length ? `対象: ${target.industries.join("、")}` : "対象業界未設定", typeof pricing.monthlyFee === "number" ? `月額 ${pricing.monthlyFee.toLocaleString("ja-JP")}円` : "料金未設定"];
  return { handled: true, kind: "list", message: `${String(data.displayName || data.name)}の商品情報です。`, items: [{ id: match.id, title: String(data.displayName || data.name), subtitle: details.join(" / "), type: "product" }] };
}

async function productList() {
  const snapshot = await getAdminDb().collection("products").orderBy("updatedAt", "desc").limit(30).get();
  const items = snapshot.docs.filter((entry) => entry.data().status !== "archived").map((entry) => {
    const data = entry.data();
    return { id: entry.id, title: String(data.displayName || data.name || "商材"), subtitle: [data.tagline, data.status === "draft" ? "下書き" : "公開中"].filter(Boolean).join(" / "), type: "product", meta: [{ label: "概要", value: String(data.summary || "未設定") }, { label: "カテゴリ", value: Array.isArray(data.categoryNames) ? data.categoryNames.join("、") || "未設定" : "未設定" }, { label: "初期費用", value: typeof data.pricing?.initialFee === "number" ? `${data.pricing.initialFee.toLocaleString("ja-JP")}円` : "未設定" }, { label: "月額", value: typeof data.pricing?.monthlyFee === "number" ? `${data.pricing.monthlyFee.toLocaleString("ja-JP")}円` : "未設定" }] };
  });
  return { handled: true, kind: "list", message: items.length ? `登録商品は${items.length}件です。` : "登録商品はありません。", items };
}

async function createProduct(name: string, uid: string, userLabel: string | null, allowDuplicate: boolean, original: string) {
  const db = getAdminDb();
  const products = await db.collection("products").limit(200).get(); const duplicates = products.docs.filter((entry) => similarText(name, String(entry.data().displayName || entry.data().name || "")));
  if (!allowDuplicate && duplicates.length) return duplicateWarning("似ている商品が登録されています。", duplicates.map((entry) => ({ id: entry.id, title: String(entry.data().displayName || entry.data().name), subtitle: "登録済み商品", type: "product" })), original);
  const userName = getUserDisplayNameById(uid, userLabel);
  const ref = await db.collection("products").add({
    name, displayName: name, slug: name.toLocaleLowerCase("ja-JP").replace(/\s+/g, "-"), iconUrl: null, iconStoragePath: null,
    categoryIds: [], categoryNames: [], productType: "other", tagline: "", summary: "", values: [], problems: [],
    target: { industries: [], regions: [], companySizes: [], facilitySizes: [], roles: [], decisionMakerRoles: [], suitableConditions: [], unsuitableConditions: [], requiredConditions: [], disqualificationConditions: [], idealCustomerConditions: [], lowPotentialConditions: [], winningPatterns: [], losingPatterns: [], effectivePhrases: [], avoidPhrases: [], industryProposalAngles: [] },
    pricing: { displayType: "estimate", initialFee: null, monthlyFee: null, minimumFee: null, maximumFee: null, plans: [], options: [], minimumContractMonths: null, paymentTerms: "", renewalTerms: "", cancellationTerms: "", cost: null, grossMarginRate: null, notes: "" },
    features: [], implementation: { estimatedDays: null, flowSteps: [], initialSetup: [], clientRequirements: [], mogciaResponsibilities: [], supportDetails: [], deliverables: [], operationFlow: [], notes: [] }, objectionHandbook: [],
    salesSettings: { targetMonthlyDeals: null, defaultPlanId: null, expectedMeetingMinutes: null, expectedSalesCycleDays: null, salesStages: ["初回接触", "ヒアリング", "提案", "見積", "クロージング"], objectionCategories: ["料金", "効果", "必要性", "既存サービス", "時期"], lossReasonCategories: ["料金", "時期", "決裁者不在", "競合導入済み", "連絡不通"], leadTemperatureOptions: ["high", "middle", "low"], disqualificationConditions: [], requiredHearingItems: [], notes: [] },
    resources: [], ownerId: uid, ownerName: userName, status: "draft", sortOrder: Date.now(), favoriteUserIds: [], createdBy: uid, createdByName: userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), archivedAt: null
  });
  const undoId = await registerUndo(uid, "products", ref.id, "delete");
  return { handled: true, kind: "saved", message: `${name}を商品として登録しました。`, items: [{ id: ref.id, title: name, subtitle: "下書きとして登録", type: "product" }], undoId };
}

async function salesAnalysisList(uid: string) {
  const snapshot = await getAdminDb().collection("teleapoRecords").orderBy("updatedAt", "desc").limit(50).get();
  const records = snapshot.docs.filter((entry) => entry.data().userId === uid).slice(0, 10).map((entry) => {
    const data = entry.data();
    const status = data.aiAdviceStatus === "completed" || data.transcriptionStatus === "completed" ? "分析完了" : data.transcriptionStatus === "error" ? "エラー" : "分析中";
    return { id: entry.id, title: String(data.customerName || data.companyName || "商談"), subtitle: [data.productName, status].filter(Boolean).join(" / "), type: "analysis", body: String(data.summary || data.transcriptText || "").slice(0, 400), tone: status === "エラー" ? "error" : status === "分析完了" ? "success" : "warning", meta: [{ label: "記録日", value: formatDate(data.recordedAt) }, { label: "結果", value: String(data.callResult || "未設定") }, { label: "次アクション", value: textArray(data.nextActions).join("、") || String(data.followupTiming || "未設定") }] };
  });
  return { handled: true, kind: "list", message: records.length ? "最近の商談分析です。" : "商談分析はまだありません。音声ファイルを添付して追加できます。", items: records };
}

async function salesAnalysisDetail(query: string, uid: string) {
  const snapshot = await getAdminDb().collection("teleapoRecords").orderBy("updatedAt", "desc").limit(100).get();
  const match = snapshot.docs.find((entry) => entry.data().userId === uid && [entry.data().customerName, entry.data().companyName, entry.data().contactName].some((value) => String(value || "").includes(query)));
  if (!match) return { handled: true, kind: "message", message: `${query}の商談分析が見つかりませんでした。`, items: [] };
  const data = match.data(); const analysis = data.analysis && typeof data.analysis === "object" ? data.analysis : {}; const advice = data.aiAdvice && typeof data.aiAdvice === "object" ? data.aiAdvice : {};
  const summary = String(data.summary || analysis.summary || advice.summary || data.transcriptText || "分析中です").slice(0, 500);
  const issues = textArray(analysis.problems || analysis.issues || advice.issues); const next = textArray(analysis.nextActions || advice.nextActions);
  const subtitle = [`要約: ${summary}`, issues.length ? `課題: ${issues.join("、")}` : "", next.length ? `次回: ${next.join("、")}` : ""].filter(Boolean).join("\n");
  return { handled: true, kind: "list", message: `${String(data.customerName || query)}の商談分析です。`, items: [{ id: match.id, title: String(data.customerName || query), subtitle, type: "analysis" }] };
}

async function teleapoStatus(uid: string) {
  const snapshot = await getAdminDb().collection("leads").orderBy("updatedAt", "desc").limit(100).get();
  const items = snapshot.docs.filter((entry) => !entry.data().assignedUserId || entry.data().assignedUserId === uid).slice(0, 12).map((entry) => {
    const data = entry.data();
    return { id: entry.id, title: String(data.companyName || "会社名未設定"), subtitle: [data.productName, leadStatusLabel(String(data.status || "new")), data.prospectRank].filter(Boolean).join(" / "), type: "lead", meta: [{ label: "先方担当者", value: String(data.contactName || "未設定") }, { label: "連絡先", value: [data.phone, data.email].filter(Boolean).join(" / ") || "未設定" }, { label: "利用・提案サービス", value: String(data.productName || "未設定") }, { label: "営業ステータス", value: leadStatusLabel(String(data.status || "new")) }, { label: "自社担当", value: String(data.assignedUserName || "未設定") }, { label: "最終活動", value: formatDate(data.lastActivityAt) }, { label: "次アクション", value: [data.nextActionTitle, formatDate(data.nextActionAt)].filter(Boolean).join(" / ") || "未設定" }] };
  });
  return { handled: true, kind: "list", message: items.length ? `テレアポ・見込み客は${items.length}件です。` : "テレアポ対象はありません。", items };
}

async function createLeadFromCommand(companyName: string, original: string, uid: string, userLabel: string | null, allowDuplicate: boolean) {
  const db = getAdminDb(); const existing = await db.collection("leads").limit(300).get();
  const duplicates = existing.docs.filter((entry) => similarText(companyName, String(entry.data().companyName || "")));
  if (!allowDuplicate && duplicates.length) return duplicateWarning("似ている営業先が登録されています。", duplicates.slice(0, 5).map((entry) => ({ id: entry.id, title: String(entry.data().companyName || "営業先"), subtitle: [entry.data().contactName, leadStatusLabel(String(entry.data().status || "new"))].filter(Boolean).join(" / "), type: "lead" })), original);
  const fields = parseLabeledFields(original); const status = parseLeadStatus(fields["ステータス"] || fields["状況"] || ""); const nextAt = parseJapaneseDateTime(fields["次回"] || fields["次回対応"] || ""); const userName = getUserDisplayNameById(uid, userLabel);
  const ref = await db.collection("leads").add({ companyName, contactName: fields["担当者"] || fields["先方担当者"] || "", contactRole: fields["役職"] || "", phone: fields["電話"] || fields["電話番号"] || "", email: fields["メール"] || "", source: fields["流入元"] || "desktop", productId: null, productName: fields["商材"] || fields["商品"] || null, status, prospectRank: fields["見込み"] || fields["見込み度"] || "", appointmentAt: status === "appointment" ? nextAt ? Timestamp.fromDate(nextAt) : null : null, nextActionAt: nextAt ? Timestamp.fromDate(nextAt) : null, nextActionTitle: fields["次回アクション"] || fields["次回対応"] || null, lastActivityAt: null, assignedUserId: uid, assignedUserName: userName, notes: fields["メモ"] || "", companyId: null, createdBy: uid, createdByName: userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection("activities").add({ leadId: ref.id, companyId: null, dealId: null, type: "status_change", title: "見込み客を登録しました", content: leadStatusLabel(status), productId: null, productName: fields["商材"] || fields["商品"] || null, occurredAt: Timestamp.now(), createdBy: uid, createdByName: userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { handled: true, kind: "saved", message: `${companyName}を営業リストへ登録しました。`, items: [{ id: ref.id, title: companyName, subtitle: [fields["担当者"], leadStatusLabel(status)].filter(Boolean).join(" / "), type: "lead" }] };
}

async function updateLeadFromCommand(message: string, uid: string) {
  const db = getAdminDb(); const snapshot = await db.collection("leads").limit(300).get(); const lead = bestNamedMatch(snapshot.docs, message, "companyName");
  if (!lead) return { handled: true, kind: "message", message: "編集する営業先が見つかりませんでした。会社名を含めて入力してください。", items: [] };
  const fields = parseLabeledFields(message); const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  assignIf(fields, patch, "担当者", "contactName"); assignIf(fields, patch, "先方担当者", "contactName"); assignIf(fields, patch, "役職", "contactRole"); assignIf(fields, patch, "電話", "phone"); assignIf(fields, patch, "電話番号", "phone"); assignIf(fields, patch, "メール", "email"); assignIf(fields, patch, "商材", "productName"); assignIf(fields, patch, "商品", "productName"); assignIf(fields, patch, "見込み", "prospectRank"); assignIf(fields, patch, "見込み度", "prospectRank"); assignIf(fields, patch, "メモ", "notes"); assignIf(fields, patch, "次回アクション", "nextActionTitle");
  const statusText = fields["ステータス"] || fields["状況"]; if (statusText) patch.status = parseLeadStatus(statusText);
  const nextText = fields["次回"] || fields["次回日時"]; if (nextText) { const next = parseJapaneseDateTime(nextText); if (next) patch.nextActionAt = Timestamp.fromDate(next); }
  if (Object.keys(patch).length === 1) return { handled: true, kind: "message", message: "変更内容を「担当者：〇〇、電話：〇〇、ステータス：接触中」のように入力してください。", items: [] };
  if (lead.data().assignedUserId && lead.data().assignedUserId !== uid) patch.updatedBy = uid;
  await lead.ref.set(patch, { merge: true }); return { handled: true, kind: "saved", message: `${String(lead.data().companyName)}の営業リストを更新しました。`, items: [{ id: lead.id, title: String(lead.data().companyName), subtitle: "営業リスト更新済み", type: "lead" }] };
}

async function deleteEventFromCommand(message: string, uid: string) {
  const db = getAdminDb(); const snapshot = await db.collection("calendarEvents").orderBy("startAt", "desc").limit(300).get(); const candidates = snapshot.docs.filter((entry) => belongsToUser(entry.data(), uid)); const event = bestEventMatch(candidates, message);
  if (!event) return { handled: true, kind: "message", message: "削除する予定が見つかりませんでした。予定名または会社名を含めてください。", items: [] };
  await event.ref.delete(); return { handled: true, kind: "saved", message: `${String(event.data().title || "予定")}を削除しました。`, items: [] };
}

async function updateEventFromCommand(message: string, uid: string) {
  const db = getAdminDb(); const snapshot = await db.collection("calendarEvents").orderBy("startAt", "desc").limit(300).get(); const candidates = snapshot.docs.filter((entry) => belongsToUser(entry.data(), uid)); const event = bestEventMatch(candidates, message);
  if (!event) return { handled: true, kind: "message", message: "変更する予定が見つかりませんでした。予定名または会社名を含めてください。", items: [] };
  const fields = parseLabeledFields(message); const nextStart = parseJapaneseDateTime(message); const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }; const oldStart = toDate(event.data().startAt); const oldEnd = toDate(event.data().endAt); const duration = oldStart && oldEnd ? Math.max(30 * 60 * 1000, oldEnd.getTime() - oldStart.getTime()) : 60 * 60 * 1000;
  if (nextStart) { patch.startAt = Timestamp.fromDate(nextStart); patch.endAt = Timestamp.fromMillis(nextStart.getTime() + duration); }
  if (fields["タイトル"]) patch.title = fields["タイトル"].slice(0, 200); if (fields["場所"]) patch.location = fields["場所"].slice(0, 300);
  if (Object.keys(patch).length === 1) return { handled: true, kind: "message", message: "新しい日時、または「タイトル：〇〇」「場所：〇〇」を入力してください。", items: [] };
  await event.ref.set(patch, { merge: true }); return { handled: true, kind: "saved", message: `${String(event.data().title || "予定")}を変更しました。`, items: [{ id: event.id, title: String(fields["タイトル"] || event.data().title || "予定"), subtitle: nextStart ? formatTime(nextStart) : "更新済み", type: "calendar" }] };
}

async function updateProductFromCommand(message: string) {
  const db = getAdminDb(); const snapshot = await db.collection("products").limit(200).get(); const product = bestNamedMatch(snapshot.docs, message, "displayName", "name");
  if (!product) return { handled: true, kind: "message", message: "編集する商材が見つかりませんでした。商材名を含めてください。", items: [] };
  const fields = parseLabeledFields(message); const data = product.data(); const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (fields["表示名"]) patch.displayName = fields["表示名"].slice(0, 160); if (fields["キャッチコピー"]) patch.tagline = fields["キャッチコピー"].slice(0, 300); if (fields["説明"] || fields["概要"]) patch.summary = String(fields["説明"] || fields["概要"]).slice(0, 5000); if (fields["カテゴリ"]) patch.categoryNames = splitValues(fields["カテゴリ"]); if (fields["ステータス"] || fields["状態"]) patch.status = parseProductStatus(fields["ステータス"] || fields["状態"]);
  const initialFee = parseMoney(fields["初期費用"]); const monthlyFee = parseMoney(fields["月額"] || fields["月額料金"]); if (initialFee !== undefined || monthlyFee !== undefined) patch.pricing = { ...(data.pricing || {}), ...(initialFee !== undefined ? { initialFee } : {}), ...(monthlyFee !== undefined ? { monthlyFee } : {}) };
  if (Object.keys(patch).length === 1) return { handled: true, kind: "message", message: "「説明：〇〇、月額：30000、ステータス：公開」のように変更内容を入力してください。", items: [] };
  await product.ref.set(patch, { merge: true }); return { handled: true, kind: "saved", message: `${String(data.displayName || data.name)}の商材情報を更新しました。`, items: [{ id: product.id, title: String(fields["表示名"] || data.displayName || data.name), subtitle: "商材情報更新済み", type: "product" }] };
}

async function createTask(title: string, original: string, uid: string, userLabel: string | null, allowDuplicate: boolean) {
  const userName = getUserDisplayNameById(uid, userLabel); const due = parseJapaneseDateTime(original);
  const existing = await getAdminDb().collection("tasks").where("assigneeId", "==", uid).limit(100).get(); const duplicates = existing.docs.filter((entry) => openStatuses.has(String(entry.data().status || "")) && similarText(title, String(entry.data().title || "")));
  if (!allowDuplicate && duplicates.length) return duplicateWarning("似ている未完了タスクがあります。", duplicates.map((entry) => ({ id: entry.id, title: String(entry.data().title), subtitle: "未完了", type: "task" })), original);
  const ref = await getAdminDb().collection("tasks").add({ title, description: original, status: "todo", priority: /至急|急ぎ|重要/.test(original) ? "high" : "medium", source: "manual", aiGenerated: false, aiReason: "", assigneeId: uid, assigneeName: userName, createdBy: uid, createdByName: userName, companyId: null, companyName: null, dueDate: due ? Timestamp.fromDate(due) : null, completedAt: null, checklist: [], comments: "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const undoId = await registerUndo(uid, "tasks", ref.id, "delete");
  return { handled: true, kind: "saved", message: "タスクを登録しました。", items: [{ id: ref.id, title, subtitle: due ? `期限 ${formatTime(due)}` : "期限なし", type: "task" }], undoId };
}

async function completeTask(query: string, uid: string) {
  const db = getAdminDb(); const snapshot = await db.collection("tasks").where("assigneeId", "==", uid).limit(100).get();
  const matches = snapshot.docs.filter((entry) => openStatuses.has(String(entry.data().status ?? "")) && String(entry.data().title ?? "").includes(query));
  if (!matches.length) return { handled: true, kind: "message", message: `${query}に一致する未完了タスクが見つかりませんでした。`, items: [] };
  if (matches.length > 1) return { handled: true, kind: "list", message: "完了にするタスクを選んでください。", items: matches.slice(0, 8).map((entry) => ({ id: entry.id, title: String(entry.data().title), subtitle: "未完了", type: "task", command: `${String(entry.data().title)}のタスクを完了にして` })) };
  const task = matches[0]; const undoId = await registerUndo(uid, "tasks", task.id, "restore", { status: task.data().status ?? "todo", completedAt: task.data().completedAt ?? null }); await task.ref.update({ status: "done", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { handled: true, kind: "saved", message: "タスクを完了にしました。", items: [{ id: task.id, title: String(task.data().title), subtitle: "完了", type: "task" }], undoId };
}

async function knowledgeList(uid: string) {
  const snapshot = await getAdminDb().collection("knowledge").orderBy("updatedAt", "desc").limit(50).get();
  const items = snapshot.docs.filter((entry) => entry.data().status !== "archived" && (entry.data().visibility !== "private" || entry.data().createdBy === uid)).slice(0, 12).map((entry) => ({ id: entry.id, title: String(entry.data().title || "ナレッジ"), subtitle: String(entry.data().summary || entry.data().content || "説明未設定").slice(0, 140), type: "knowledge" }));
  return { handled: true, kind: "list", message: items.length ? "最近のナレッジです。" : "ナレッジはまだありません。", items };
}

async function createKnowledge(title: string, original: string, uid: string, userLabel: string | null) {
  const userName = getUserDisplayNameById(uid, userLabel);
  const ref = await getAdminDb().collection("knowledge").add({ title, summary: original, content: original, type: "internal", productIds: [], productNames: [], tags: [], source: "manual", aiGenerated: false, visibility: "team", viewCount: 0, favoriteUserIds: [], searchKeywords: [title.toLocaleLowerCase("ja-JP")], createdBy: uid, createdByName: userName, updatedBy: uid, updatedByName: userName, status: "active", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), archivedAt: null });
  const undoId = await registerUndo(uid, "knowledge", ref.id, "delete");
  return { handled: true, kind: "saved", message: "ナレッジへ登録しました。", items: [{ id: ref.id, title, subtitle: "社内共有", type: "knowledge" }], undoId };
}

async function createCompany(name: string, uid: string, userLabel: string | null, allowDuplicate: boolean, original: string) {
  const db = getAdminDb(); const companies = await db.collection("companies").limit(300).get(); const duplicates = companies.docs.filter((entry) => similarText(name, String(entry.data().name || "")));
  if (!allowDuplicate && duplicates.length) return duplicateWarning("似ている会社が登録されています。", duplicates.map((entry) => ({ id: entry.id, title: String(entry.data().name), subtitle: String(entry.data().industry || "登録済み会社"), type: "company" })), original);
  const userName = getUserDisplayNameById(uid, userLabel);
  const ref = await db.collection("companies").add({ name, nameKana: "", industry: "", companyType: "", phone: "", email: "", website: "", status: "lead", tags: [], favoriteUserIds: [], productIds: [], productNames: [], contacts: [], primaryContactId: null, primaryContactName: null, internalOwnerId: uid, internalOwnerName: userName, createdBy: uid, createdByName: userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), archivedAt: null });
  const undoId = await registerUndo(uid, "companies", ref.id, "delete");
  return { handled: true, kind: "saved", message: `${name}を会社一覧へ登録しました。`, items: [{ id: ref.id, title: name, subtitle: "新規会社", type: "company" }], undoId };
}

async function companyStatus(query: string) {
  const db = getAdminDb();
  const snapshot = await db.collection("companies").orderBy("updatedAt", "desc").limit(300).get();
  const normalized = query.toLocaleLowerCase("ja-JP");
  const matches = snapshot.docs.filter((entry) => String(entry.data().name ?? "").toLocaleLowerCase("ja-JP").includes(normalized));
  if (!matches.length) return { handled: true, kind: "message", message: `${query}が見つかりませんでした。`, items: [] };
  if (matches.length > 1) return { handled: true, kind: "list", message: "会社を選んでください。", items: matches.slice(0, 8).map((entry) => ({ id: entry.id, title: String(entry.data().name ?? "会社"), subtitle: String(entry.data().industry ?? ""), type: "company", command: `${String(entry.data().name ?? "")}どうなってる？` })) };
  const company = matches[0];
  const data = company.data();
  const services = await db.collection("companyServices").where("companyId", "==", company.id).limit(20).get();
  const products = new Set<string>(Array.isArray(data.productNames) ? data.productNames.filter((value): value is string => typeof value === "string" && value.length > 0) : []);
  services.docs.forEach((entry) => { const name = entry.data().serviceName; if (name) products.add(String(name)); });
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];
  const primary = contacts.find((contact: Record<string, unknown>) => contact.id === data.primaryContactId) ?? contacts[0] ?? {};
  const contactName = String(primary.name ?? data.primaryContactName ?? "未設定");
  const phone = String(primary.phone ?? data.phone ?? "");
  const email = String(primary.email ?? data.email ?? "");
  const nextAction = String(data.nextActionTitle ?? "次回アクション未設定");
  return { handled: true, kind: "company", message: `${String(data.name ?? query)}の現在の状況です。`, items: [], company: {
    id: company.id, name: String(data.name ?? query), contactName, phone, email, products: Array.from(products), nextAction,
    aiSuggestion: data.nextActionTitle ? "次回対応の期限も確認しておくとよさそうです" : "次回対応を設定しておくとよさそうです", updatedAt: toDate(data.updatedAt)?.toISOString() ?? ""
  } };
}

async function matchCompanyInMessage(message: string) {
  const snapshot = await getAdminDb().collection("companies").limit(300).get();
  const match = snapshot.docs.filter((entry) => message.includes(String(entry.data().name ?? "__no_match__"))).sort((a, b) => String(b.data().name ?? "").length - String(a.data().name ?? "").length)[0];
  return match ? { id: match.id, name: String(match.data().name ?? "会社") } : null;
}

async function saveCompanyLog(companyId: string, companyName: string, message: string, uid: string, userLabel: string | null, allowDuplicate: boolean) {
  const db = getAdminDb();
  const existing = await db.collection("activities").where("companyId", "==", companyId).limit(100).get(); const cutoff = Date.now() - 24 * 60 * 60 * 1000; const duplicates = existing.docs.filter((entry) => dateMillis(entry.data().occurredAt) >= cutoff && similarText(message, String(entry.data().content || "")));
  if (!allowDuplicate && duplicates.length) return duplicateWarning("24時間以内に似た営業ログがあります。", duplicates.slice(0, 5).map((entry) => ({ id: entry.id, title: String(entry.data().title || "活動ログ"), subtitle: String(entry.data().content || ""), type: "log" })), message);
  const occurredAt = Timestamp.now();
  const title = /電話|テレアポ|架電|不在/.test(message) ? "電話・テレアポ記録" : /メール|資料.*送/.test(message) ? "メール・資料送付記録" : "活動ログ";
  const ref = await db.collection("activities").add({ leadId: null, companyId, dealId: null, type: /電話|テレアポ|架電|不在/.test(message) ? "phone" : /メール/.test(message) ? "email" : "memo", title, content: message, occurredAt, createdBy: uid, createdByName: getUserDisplayNameById(uid, userLabel), source: "manual", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection("companies").doc(companyId).set({ lastContactAt: occurredAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const undoId = await registerUndo(uid, "activities", ref.id, "delete");
  return { handled: true, kind: "saved", message: `${companyName}のログに保存しました。`, items: [{ id: ref.id, title, subtitle: message, type: "log" }], undoId };
}

async function registerUndo(uid: string, collection: string, targetId: string, mode: "delete" | "restore", restoreData: Record<string, unknown> | null = null) {
  const ref = getAdminDb().collection("desktopUndoOperations").doc();
  await ref.set({ userId: uid, collection, targetId, mode, restoreData, expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), createdAt: FieldValue.serverTimestamp() });
  return ref.id;
}

export async function PUT(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request);
    const body = await request.json() as { title?: unknown; startAt?: unknown; endAt?: unknown; companyId?: unknown; companyName?: unknown; productName?: unknown; contactName?: unknown; leadId?: unknown; eventType?: unknown; attendeeIds?: unknown };
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const startAt = typeof body.startAt === "string" ? new Date(body.startAt) : new Date(NaN);
    const endAt = typeof body.endAt === "string" ? new Date(body.endAt) : new Date(NaN);
    if (!title || !Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) throw new Error("予定の内容を確認してください。");
    const userName = getUserDisplayNameById(user.uid, user.name || user.email || null);
    const eventType = body.eventType === "appointment" ? "appointment" : "meeting";
    const db = getAdminDb();
    const requestedIds = Array.isArray(body.attendeeIds) ? body.attendeeIds.filter((value): value is string => typeof value === "string" && value !== user.uid).slice(0, 20) : [];
    const [authUsers, memberProfiles] = requestedIds.length ? await Promise.all([
      getAdminAuth().getUsers(requestedIds.map((uid) => ({ uid }))),
      db.getAll(...requestedIds.map((uid) => db.collection("users").doc(uid))),
    ]) : [{ users: [] }, []];
    const memberIds = new Set(memberProfiles.filter((entry) => entry.exists && entry.data()?.disabled !== true).map((entry) => entry.id));
    const companions = authUsers.users.filter((entry) => !entry.disabled && memberIds.has(entry.uid));
    const ref = await db.collection("calendarEvents").add({
      title, description: typeof body.contactName === "string" && body.contactName ? `先方担当者: ${body.contactName}` : "", eventType, startAt: Timestamp.fromDate(startAt), endAt: Timestamp.fromDate(endAt), allDay: false,
      assigneeId: user.uid, assigneeName: userName, attendeeIds: [user.uid, ...companions.map((entry) => entry.uid)], attendeeNames: [userName, ...companions.map((entry) => getUserDisplayNameById(entry.uid, entry.displayName || entry.email || null))],
      companyId: typeof body.companyId === "string" && body.companyId ? body.companyId : null,
      companyName: typeof body.companyName === "string" && body.companyName ? body.companyName : null,
      productName: typeof body.productName === "string" && body.productName ? body.productName : null,
      projectId: null, projectName: null, meetingId: null, appointmentId: eventType === "appointment" ? "desktop" : null, location: null, meetingUrl: null,
      source: "manual", externalCalendarId: null, externalEventId: null, reminderMinutes: [30], recurrence: null, visibility: "team",
      createdBy: user.uid, createdByName: userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    if (eventType === "appointment" && leadId) await db.collection("leads").doc(leadId).set({ status: "appointment", appointmentAt: Timestamp.fromDate(startAt), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return success({ eventId: ref.id, message: eventType === "appointment" ? "アポを予定へ追加しました。" : "予定を追加しました。", targetURL: "/calendar" }, 201);
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "event_create_failed" } }, { status: 400 });
  }
}

async function ownSchedule(uid: string) {
  const snapshot = await getAdminDb().collection("calendarEvents").orderBy("startAt", "asc").limit(200).get();
  const items = snapshot.docs.map<Record<string, unknown> & { id: string }>((doc) => ({ id: doc.id, ...doc.data() })).filter((event) => belongsToUser(event, uid) && isToday(event.startAt));
  return { handled: true, kind: "list", message: items.length ? "今日の予定です。" : "今日の予定はありません。", items: items.map((event) => ({ id: event.id, title: String(event.title ?? "予定"), subtitle: formatTime(event.startAt), targetURL: "/calendar", type: "calendar" })) };
}

async function ownTasks(uid: string) {
  const snapshot = await getAdminDb().collection("tasks").where("assigneeId", "==", uid).limit(100).get();
  const items = snapshot.docs.map<Record<string, unknown> & { id: string }>((doc) => ({ id: doc.id, ...doc.data() })).filter((task) => openStatuses.has(String(task.status ?? "")));
  return { handled: true, kind: "list", message: items.length ? `未完了タスクは${items.length}件です。` : "未完了タスクはありません。", items: items.slice(0, 10).map((task) => ({ id: task.id, title: String(task.title ?? "タスク"), subtitle: task.dueDate ? `期限 ${formatDate(task.dueDate)}` : "期限なし", targetURL: "/tasks", type: "task" })) };
}

async function memberStatus(query: string, requesterUid: string) {
  const authUsers = await getAdminAuth().listUsers(1000);
  const matches = authUsers.users.filter((user) => !user.disabled && getUserDisplayNameById(user.uid, user.displayName || user.email || null).toLocaleLowerCase("ja-JP").includes(query.toLocaleLowerCase("ja-JP")));
  if (!matches.length) return { handled: true, kind: "list", message: `${query}さんが見つかりませんでした。`, items: [] };
  if (matches.length > 1) return { handled: true, kind: "list", message: "同じ名前の社員がいます。対象をフルネームで入力してください。", items: matches.slice(0, 8).map((user) => ({ id: user.uid, title: getUserDisplayNameById(user.uid, user.displayName || user.email || null), subtitle: "社員", targetURL: "", type: "member" })) };
  const member = matches[0]; const memberName = getUserDisplayNameById(member.uid, member.displayName || member.email || null);
  const [profile, taskSnapshot, eventSnapshot] = await Promise.all([getAdminDb().collection("users").doc(requesterUid).get(), getAdminDb().collection("tasks").where("assigneeId", "==", member.uid).limit(100).get(), getAdminDb().collection("calendarEvents").orderBy("startAt", "asc").limit(200).get()]);
  const privileged = requesterUid === ADMIN_UID || ["admin", "owner"].includes(String(profile.data()?.role ?? ""));
  const tasks = taskSnapshot.docs.map<Record<string, unknown> & { id: string }>((doc) => ({ id: doc.id, ...doc.data() })).filter((task) => openStatuses.has(String(task.status ?? ""))).slice(0, 6);
  const events = eventSnapshot.docs.map<Record<string, unknown> & { id: string }>((doc) => ({ id: doc.id, ...doc.data() })).filter((event) => belongsToUser(event, member.uid) && isToday(event.startAt)).slice(0, 6);
  const items = [
    ...events.map((event) => ({ id: `event-${event.id}`, title: event.visibility === "private" && requesterUid !== member.uid && !privileged ? "予定あり" : String(event.title ?? "予定"), subtitle: `今日 ${formatTime(event.startAt)}`, targetURL: "/calendar", type: "calendar" })),
    ...tasks.map((task) => ({ id: `task-${task.id}`, title: String(task.title ?? "タスク"), subtitle: "進行中のタスク", targetURL: "/tasks", type: "task" }))
  ];
  return { handled: true, kind: "list", message: `${memberName}さんの共有されている予定とタスクです。`, items };
}

async function eventDraft(message: string, uid: string, userLabel: string | null, allowDuplicate = false) {
  const startAt = parseJapaneseDateTime(message);
  if (!startAt) return { handled: true, kind: "message", message: "予定の日付と時刻を入力してください。例：明日13時に御宿高砂の予定", items: [] };
  const companies = await getAdminDb().collection("companies").limit(200).get();
  const company = companies.docs.find((doc) => message.includes(String(doc.data().name ?? "__no_match__")));
  const companyName = company ? String(company.data().name ?? "") : "";
  const title = cleanEventTitle(message, companyName) || companyName || "予定";
  const events = await getAdminDb().collection("calendarEvents").orderBy("startAt", "asc").limit(300).get(); const duplicates = events.docs.filter((entry) => belongsToUser(entry.data(), uid) && Math.abs(dateMillis(entry.data().startAt) - startAt.getTime()) <= 30 * 60 * 1000 && (similarText(title, String(entry.data().title || "")) || (company?.id && entry.data().companyId === company.id)));
  if (!allowDuplicate && duplicates.length) return duplicateWarning("同じ時間帯に似た予定があります。", duplicates.slice(0, 5).map((entry) => ({ id: entry.id, title: String(entry.data().title || "予定"), subtitle: formatTime(entry.data().startAt), type: "calendar" })), message);
  const ref = await saveDirectCalendarEvent({ uid, userLabel, title, startAt, companyId: company?.id ?? null, companyName: companyName || null, eventType: "meeting" });
  const undoId = await registerUndo(uid, "calendarEvents", ref.id, "delete");
  return { handled: true, kind: "saved", message: `${formatTime(startAt)}の予定へ追加しました。`, items: [{ id: ref.id, title, subtitle: formatTime(startAt), type: "calendar" }], undoId };
}

async function appointmentDraft(message: string, uid: string, userLabel: string | null, allowDuplicate = false) {
  const db = getAdminDb();
  const [companies, products, leads] = await Promise.all([db.collection("companies").limit(200).get(), db.collection("products").limit(100).get(), db.collection("leads").limit(200).get()]);
  const company = companies.docs.find((doc) => message.includes(String(doc.data().name ?? "__no_match__")));
  const product = products.docs.find((doc) => message.includes(String(doc.data().name ?? "__no_match__")) || message.includes(String(doc.data().displayName ?? "__no_match__")));
  const lead = leads.docs.find((doc) => (company && doc.data().companyId === company.id) || message.includes(String(doc.data().companyName ?? "__no_match__")));
  const parsed = parseJapaneseDateTime(message); const startAt = parsed ?? defaultAppointmentStart();
  const companyName = company ? String(company.data().name ?? "") : String(lead?.data().companyName ?? "");
  const contactName = String(lead?.data().contactName ?? ""); const productName = product ? String(product.data().displayName || product.data().name || "") : String(lead?.data().productName ?? "");
  const events = await db.collection("calendarEvents").orderBy("startAt", "asc").limit(300).get(); const duplicates = events.docs.filter((entry) => belongsToUser(entry.data(), uid) && Math.abs(dateMillis(entry.data().startAt) - startAt.getTime()) <= 30 * 60 * 1000 && (!companyName || entry.data().companyName === companyName));
  if (!allowDuplicate && duplicates.length) return duplicateWarning("同じ時間帯に商談予定があります。", duplicates.slice(0, 5).map((entry) => ({ id: entry.id, title: String(entry.data().title || "商談"), subtitle: formatTime(entry.data().startAt), type: "calendar" })), message);
  const title = companyName ? `${companyName} 商談` : "商談";
  const ref = await saveDirectCalendarEvent({ uid, userLabel, title, startAt, companyId: company?.id ?? (String(lead?.data().companyId ?? "") || null), companyName: companyName || null, productName: productName || null, contactName: contactName || null, leadId: lead?.id ?? null, eventType: "appointment" });
  const undoId = await registerUndo(uid, "calendarEvents", ref.id, "delete");
  return { handled: true, kind: "saved", message: `${formatTime(startAt)}のアポを予定へ追加しました。`, items: [{ id: ref.id, title, subtitle: formatTime(startAt), type: "calendar" }], undoId };
}

async function saveDirectCalendarEvent(input: { uid: string; userLabel: string | null; title: string; startAt: Date; companyId?: string | null; companyName?: string | null; productName?: string | null; contactName?: string | null; leadId?: string | null; eventType: "meeting" | "appointment" }) {
  const db = getAdminDb();
  const userName = getUserDisplayNameById(input.uid, input.userLabel);
  const ref = await db.collection("calendarEvents").add({
    title: input.title, description: input.contactName ? `先方担当者: ${input.contactName}` : "", eventType: input.eventType,
    startAt: Timestamp.fromDate(input.startAt), endAt: Timestamp.fromMillis(input.startAt.getTime() + 60 * 60 * 1000), allDay: false,
    assigneeId: input.uid, assigneeName: userName, attendeeIds: [input.uid], attendeeNames: [userName],
    companyId: input.companyId ?? null, companyName: input.companyName ?? null, productName: input.productName ?? null,
    projectId: null, projectName: null, meetingId: null, appointmentId: input.eventType === "appointment" ? "desktop" : null,
    location: null, meetingUrl: null, source: "manual", externalCalendarId: null, externalEventId: null,
    reminderMinutes: [30], recurrence: null, visibility: "team", createdBy: input.uid, createdByName: userName,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
  });
  if (input.eventType === "appointment" && input.leadId) await db.collection("leads").doc(input.leadId).set({ status: "appointment", appointmentAt: Timestamp.fromDate(input.startAt), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return ref;
}

function defaultAppointmentStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const todayAtTen = new Date(`${value("year")}-${value("month")}-${value("day")}T10:00:00+09:00`);
  return new Date(todayAtTen.getTime() + 24 * 60 * 60 * 1000);
}

function parseJapaneseDateTime(message: string): Date | null {
  const time = message.match(/(?:^|[^\d])(\d{1,2})(?:時|:(\d{2}))/);
  const namedHour = message.includes("夕方") ? 17 : message.includes("午後") ? 13 : message.includes("正午") ? 12 : message.includes("午前") ? 10 : null;
  if (!time && namedHour === null) return null;
  const now = new Date(); const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  let year = Number(parts.find((p) => p.type === "year")?.value); let month = Number(parts.find((p) => p.type === "month")?.value); let day = Number(parts.find((p) => p.type === "day")?.value);
  const explicit = message.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/) ?? message.match(/(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})/); if (explicit) { year = Number(explicit[1] || year); month = Number(explicit[2]); day = Number(explicit[3]); }
  else {
    const offset = message.includes("明後日") ? 2 : message.includes("明日") ? 1 : 0;
    if (offset) {
      const shifted = new Date(new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+09:00`).getTime() + offset * 24 * 60 * 60 * 1000);
      const shiftedParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(shifted);
      year = Number(shiftedParts.find((p) => p.type === "year")?.value); month = Number(shiftedParts.find((p) => p.type === "month")?.value); day = Number(shiftedParts.find((p) => p.type === "day")?.value);
    }
  }
  let hour = time ? Number(time[1]) : namedHour ?? 10;
  if (message.includes("午後") && hour < 12) hour += 12;
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${time?.[2] || "00"}:00+09:00`);
}

function cleanEventTitle(message: string, companyName: string) { return message.replace(/(?:今日|明日|明後日|\d{1,2}月\d{1,2}日)/g, "").replace(/\d{1,2}(?:時|:\d{2})/g, "").replace(/(?:に|の)?(?:予定|カレンダー|スケジュール)(?:を)?(?:入れたい|追加して|入れて|登録して|作って)?/g, "").trim() || companyName; }
function isTodaySchedule(value: string) { return /今日.*予定|予定.*今日/.test(value); }
function isOpenTasks(value: string) { return /(?:未完了|残って|自分の|今日の).*(?:タスク|やること)|(?:タスク|やること).*(?:未完了|見せて|教えて)/.test(value); }
function isEventCreation(value: string) { return /(?:予定|カレンダー|スケジュール).*(?:追加|入れ|登録|作)|(?:追加|入れ|登録|作).*(?:予定|カレンダー|スケジュール)/.test(value); }
function isAppointmentTaken(value: string) { return /(?:アポ|商談).*(?:取れた|決まった|獲得|入った)|(?:取れた|決まった|獲得).*(?:アポ|商談)/.test(value); }
function extractMemberQuery(value: string) { const match = value.match(/^(.+?)(?:さん)?(?:は|の)(?:今日)?(?:何してる|何をしてる|予定|タスク|状況)/); return match?.[1]?.trim() || null; }
function extractCompanyQuery(value: string) { const match = value.match(/^(.+?)(?:は|の)?(?:今の)?(?:状況|どうなってる|どうなってるっけ|どうなった|教えて|見せて)[？?]?$/); return match?.[1]?.replace(/(?:会社|さん)$/, "").trim() || null; }
function isProductList(value: string) { return /(?:商品|商材).*(?:一覧|見せて|教えて|登録されて)|(?:一覧).*(?:商品|商材)/.test(value); }
function extractProductQuery(value: string) { const match = value.match(/^(.+?)(?:の)?(?:商品|商材)(?:情報|分析|詳細)(?:を)?(?:見せて|教えて|確認)?[？?]?$/); return match?.[1]?.trim() || null; }
function extractProductRegistration(value: string) { const match = value.match(/^(.+?)(?:を|という)?(?:商品|商材)(?:として)?(?:登録|追加)(?:して)?[。！!]?(?:ください)?$/); return match?.[1]?.trim() || null; }
function isSalesAnalysisList(value: string) { return /(?:商談|営業).*(?:分析|解析).*(?:一覧|状況|見せて|教えて)|(?:分析済み|解析済み).*(?:商談|営業)/.test(value); }
function extractSalesAnalysisQuery(value: string) { const match = value.match(/^(.+?)(?:の)?(?:商談|営業)(?:分析|解析)(?:詳細)?(?:を)?(?:見せて|教えて|確認)?[？?]?$/); const query = match?.[1]?.trim() || ""; return /^(最近|今日|商談|営業)$/.test(query) ? "" : query; }
function isTeleapoStatus(value: string) { return /(?:テレアポ|見込み客|リード).*(?:状況|一覧|見せて|教えて)/.test(value); }
function extractLeadRegistration(value: string) {
  if (!/(?:営業リスト|見込み客|リード).*(?:登録|追加)|(?:登録|追加).*(?:営業リスト|見込み客|リード)/.test(value)) return null;
  const match = value.match(/^(.+?)(?:を)?(?:営業リスト|見込み客|リード)(?:に|へ)?(?:登録|追加)/) ?? value.match(/(?:営業リスト|見込み客|リード)(?:に|へ)?(.+?)(?:を)?(?:登録|追加)/);
  return match?.[1]?.split(/[、,]/)[0]?.replace(/^(?:に|へ)/, "").trim() || null;
}
function isLeadUpdate(value: string) { return /(?:営業リスト|見込み客|リード).*(?:変更|更新|編集)|(?:変更|更新|編集).*(?:営業リスト|見込み客|リード)/.test(value); }
function isEventDelete(value: string) { return /(?:予定|カレンダー|スケジュール).*(?:削除|消して|取り消し|キャンセル)|(?:削除|消して|取り消し).*(?:予定|カレンダー|スケジュール)/.test(value); }
function isEventUpdate(value: string) { return /(?:予定|カレンダー|スケジュール).*(?:変更|更新|ずらして|移動)|(?:変更|更新|ずらして|移動).*(?:予定|カレンダー|スケジュール)/.test(value); }
function isProductUpdate(value: string) { return /(?:商品|商材).*(?:変更|更新|編集)|(?:変更|更新|編集).*(?:商品|商材)/.test(value); }
function extractTaskCreation(value: string) { const match = value.match(/^(.+?)(?:を)?(?:タスク|やること)(?:として)?(?:登録|追加|作成)(?:して)?[。！!]?(?:ください)?$/); return match?.[1]?.trim() || null; }
function extractTaskCompletion(value: string) { const match = value.match(/^(.+?)(?:の)?(?:タスク|やること)(?:を)?(?:完了|終わり|済み)(?:にして)?[。！!]?(?:ください)?$/); return match?.[1]?.trim() || null; }
function extractCompanyRegistration(value: string) { const match = value.match(/^(.+?)(?:を)?(?:会社|企業)(?:一覧に)?(?:登録|追加)(?:して)?[。！!]?(?:ください)?$/); return match?.[1]?.trim() || null; }
function isKnowledgeList(value: string) { return /(?:ナレッジ|社内知識|事例).*(?:一覧|見せて|教えて)/.test(value); }
function extractKnowledgeRegistration(value: string) { const match = value.match(/^(.+?)(?:を)?(?:ナレッジ|社内知識|事例)(?:として)?(?:登録|追加|保存)(?:して)?[。！!]?(?:ください)?$/); return match?.[1]?.trim() || null; }
function leadStatusLabel(value: string) { return ({ new: "未接触", contacting: "接触中", document_sent: "資料送付", appointment: "アポ", meeting: "商談", considering: "検討中", hold: "保留", won: "成約", lost: "失注" } as Record<string, string>)[value] || value; }
function textArray(value: unknown) { return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 5) : typeof value === "string" && value ? [value] : []; }
function extractGlobalSearch(value: string) { const match = value.match(/^(.+?)(?:を|で)?(?:横断)?検索(?:して|したい)?[。！!]?(?:ください)?$/); return match?.[1]?.trim() || null; }
function inputTemplate(value: string) { if (/架電結果|テレアポ結果/.test(value) && /入力|登録|フォーム/.test(value)) return { type: "call", title: "架電結果", fields: [{ key: "company", label: "会社名" }, { key: "result", label: "結果" }, { key: "next", label: "次回対応" }] }; if (/会社登録/.test(value) && /フォーム|入力/.test(value)) return { type: "company", title: "会社登録", fields: [{ key: "company", label: "会社名" }] }; return null; }
function isDailySummary(value: string) { return /(?:朝|今日|夕方|終業).*(?:まとめ|サマリー)|(?:日次|一日).*(?:まとめ|サマリー)/.test(value); }
function parseLabeledFields(value: string) {
  const labels = ["先方担当者", "担当者", "電話番号", "電話", "メール", "役職", "流入元", "商材", "商品", "ステータス", "状況", "見込み度", "見込み", "次回アクション", "次回対応", "次回日時", "次回", "メモ", "タイトル", "場所", "表示名", "キャッチコピー", "説明", "概要", "カテゴリ", "初期費用", "月額料金", "月額", "状態"];
  const result: Record<string, string> = {}; const escaped = labels.sort((a, b) => b.length - a.length).join("|"); const expression = new RegExp(`(${escaped})\\s*[:：]\\s*(.+?)(?=\\s*(?:、|,|\\n)\\s*(?:${escaped})\\s*[:：]|$)`, "g");
  for (const match of value.matchAll(expression)) result[match[1]] = match[2].trim().replace(/[、,]$/, "");
  return result;
}
function assignIf(fields: Record<string, string>, patch: Record<string, unknown>, label: string, key: string) { if (fields[label]) patch[key] = fields[label]; }
function bestNamedMatch(docs: QueryDocumentSnapshot[], message: string, ...keys: string[]) { return docs.filter((entry) => keys.some((key) => { const name = String(entry.data()[key] || ""); return name && message.includes(name); })).sort((a, b) => Math.max(...keys.map((key) => String(b.data()[key] || "").length)) - Math.max(...keys.map((key) => String(a.data()[key] || "").length)))[0] ?? null; }
function bestEventMatch(docs: QueryDocumentSnapshot[], message: string) { return docs.filter((entry) => [entry.data().title, entry.data().companyName].some((value) => { const name = String(value || ""); return name && message.includes(name); })).sort((a, b) => String(b.data().title || b.data().companyName || "").length - String(a.data().title || a.data().companyName || "").length)[0] ?? null; }
function parseLeadStatus(value: string) { if (/成約|受注/.test(value)) return "won"; if (/失注/.test(value)) return "lost"; if (/保留/.test(value)) return "hold"; if (/検討/.test(value)) return "considering"; if (/商談/.test(value)) return "meeting"; if (/アポ/.test(value)) return "appointment"; if (/資料/.test(value)) return "document_sent"; if (/接触|連絡/.test(value)) return "contacting"; return "new"; }
function parseProductStatus(value: string) { if (/公開|利用中|有効/.test(value)) return "active"; if (/停止|一時停止/.test(value)) return "paused"; if (/アーカイブ|終了/.test(value)) return "archived"; return "draft"; }
function parseMoney(value: string | undefined): number | null | undefined { if (!value) return undefined; if (/未設定|なし|無料/.test(value)) return value.includes("無料") ? 0 : null; const number = Number(value.replace(/[,，円¥￥\s]/g, "")); return Number.isFinite(number) && number >= 0 ? number : undefined; }
function splitValues(value: string) { return value.split(/[、,\/／]/).map((entry) => entry.trim()).filter(Boolean).slice(0, 30); }
function isToday(value: unknown) { const date = toDate(value); if (!date) return false; return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(date) === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()); }
function formatTime(value: unknown) { const date = toDate(value); return date ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(date) : "時刻未設定"; }
function formatDate(value: unknown) { const date = toDate(value); return date ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(date) : "未設定"; }
function toDate(value: unknown): Date | null { if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate(); if (typeof value === "string") return new Date(value); return null; }
function dateMillis(value: unknown) { return toDate(value)?.getTime() ?? 0; }
function belongsToUser(event: Record<string, unknown>, uid: string) { return event.createdBy === uid || event.assigneeId === uid || (Array.isArray(event.attendeeIds) && event.attendeeIds.includes(uid)); }
function success(data: unknown, status = 200) { return NextResponse.json({ success: true, data }, { status }); }
function duplicateWarning(message: string, items: unknown[], retryCommand: string) { return { handled: true, kind: "duplicateWarning", message, items, retryCommand }; }
function normalizedText(value: string) { return value.toLocaleLowerCase("ja-JP").replace(/株式会社|有限会社|合同会社|（株）|\(株\)|[\s　・.,。、ー_-]/g, ""); }
function similarText(a: string, b: string) { const x = normalizedText(a); const y = normalizedText(b); if (!x || !y) return false; if (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))) return true; const xs = new Set(Array.from(x)); const ys = new Set(Array.from(y)); const common = [...xs].filter((char) => ys.has(char)).length; return common / Math.max(xs.size, ys.size) >= 0.8; }
