import AppKit
import Foundation
import Security
import SwiftUI

private let mogciaProductionBaseURL = "https://mogcia-dev-agent.vercel.app"

private extension Bundle {
    static let mogciaResources: Bundle = {
        let resourceBundleURL = Bundle.main.resourceURL?
            .appendingPathComponent("MOGCIADesktop_MOGCIADesktop.bundle")
        return resourceBundleURL.flatMap(Bundle.init(url:)) ?? .main
    }()

    static let mogciaRobotImage: NSImage = {
        if let url = mogciaResources.url(forResource: "m-dev-agent", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            image.size = NSSize(width: 22, height: 22)
            image.isTemplate = false
            return image
        }
        return NSImage(systemSymbolName: "cpu", accessibilityDescription: "MOGCIA") ?? NSImage()
    }()
}
import UniformTypeIdentifiers

@main
struct MOGCIADesktopApp: App {
    @StateObject private var session = DesktopSession()

    var body: some Scene {
        MenuBarExtra(isInserted: .constant(true)) {
            MenuBarContent()
                .environmentObject(session)
                .task { await session.refreshIfStale() }
        } label: {
            Image(nsImage: Bundle.mogciaRobotImage)
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
                .frame(width: 18, height: 18)
                .clipShape(Circle())
        }
        .menuBarExtraStyle(.window)

        Window("MOGCIA Memo", id: "memo") {
            MemoWindow()
                .environmentObject(session)
        }
        .defaultSize(width: 440, height: 520)

        Window("MOGCIA Settings", id: "settings") {
            SettingsWindow()
                .environmentObject(session)
        }
        .defaultSize(width: 480, height: 420)

        Window("MOGCIA Notifications", id: "notifications") {
            NotificationsWindow().environmentObject(session)
        }
        .defaultSize(width: 560, height: 620)

        Window("MOGCIA Feedback", id: "feedback") {
            FeedbackWindow().environmentObject(session)
        }
        .defaultSize(width: 560, height: 600)
    }
}

struct MenuBarContent: View {
    @Environment(\.openWindow) private var openWindow
    @EnvironmentObject private var session: DesktopSession
    @State private var input = ""
    @State private var showingInputGuide = false
    @State private var showingSalesAudioImporter = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                RobotMark(size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("MOGCIA Dev Agent")
                        .font(.headline)
                    Text(session.isAuthenticated ? "デスクトップ連携中" : "未ログイン")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button { showingInputGuide.toggle() } label: {
                    Image(systemName: "exclamationmark.circle")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 30, height: 30)
                        .foregroundStyle(showingInputGuide ? Color.pink : Color.primary)
                }
                .buttonStyle(.plain)
                .help("入力例を見る")
                Button { openWindow(id: "notifications") } label: {
                    ZStack(alignment: .topTrailing) { Image(systemName: "bell").font(.system(size: 15, weight: .semibold)).frame(width: 30, height: 30); if session.unreadNotificationCount > 0 { Text("\(min(session.unreadNotificationCount, 99))").font(.system(size: 8, weight: .bold)).foregroundStyle(.white).padding(3).background(Color.pink).clipShape(Circle()) } }
                }.buttonStyle(.plain).help("通知")
                Button { session.logout() } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .help("ログアウト")
                Button { openWindow(id: "feedback") } label: {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .help("フィードバックを送る")
            }

            Group {
                if showingInputGuide {
                    InputGuideCard()
                } else if session.commandResult != nil || session.isCommandLoading {
                    CommandResultCard(result: session.commandResult, session: session)
                } else {
                    TodayCard(events: session.todayEvents, recentCompanies: session.recentCompanies, suggestions: session.suggestions, loading: session.isLoading, onCompany: { company in Task { await session.sendCommand("\(company.name)どうなってる？") } }, onSuggestion: { suggestion, action in Task { await session.handleSuggestion(suggestion, action: action) } })
                }
            }.frame(maxWidth: .infinity, minHeight: 220, alignment: .topLeading)

            if let errorMessage = session.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(2)
            }

            Divider()
            HStack(spacing: 8) {
                Image(nsImage: Bundle.mogciaRobotImage).resizable().renderingMode(.original).scaledToFit().frame(width: 26, height: 26).clipShape(RoundedRectangle(cornerRadius: 7))
                TextField("予定・テレアポ・会社の状況を入力", text: $input)
                    .textFieldStyle(.plain).onSubmit { submit() }
                Button { NSApp.sendAction(Selector(("startDictation:")), to: nil, from: nil) } label: { Image(systemName: "mic").font(.system(size: 13, weight: .semibold)).frame(width: 25, height: 25) }
                    .buttonStyle(.plain).help("音声で入力")
                Button { showingSalesAudioImporter = true } label: { Image(systemName: "paperclip").font(.system(size: 13, weight: .semibold)).frame(width: 25, height: 25) }
                    .buttonStyle(.plain).help("商談音声（m4a/mp4）を追加")
                Button { submit() } label: { Image(systemName: "arrow.up").font(.system(size: 12, weight: .bold)).frame(width: 27, height: 27).background(Color.pink).foregroundStyle(.white).clipShape(Circle()) }
                    .buttonStyle(.plain).disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.isCommandLoading)
            }.padding(9).background(Color.white.opacity(0.8)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.pink.opacity(0.25))).clipShape(RoundedRectangle(cornerRadius: 12))
            HStack(spacing: 5) {
                Image(systemName: session.syncState.icon).font(.caption2)
                Text(session.syncState.label).font(.caption2)
            }.foregroundStyle(session.syncState.color)
        }
        .frame(width: 390)
        .padding(14)
        .background(Color(red: 1.0, green: 0.965, blue: 0.975))
        .onDisappear { input = ""; showingInputGuide = false }
        .fileImporter(isPresented: $showingSalesAudioImporter, allowedContentTypes: [.mpeg4Audio, .mpeg4Movie], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first { showingInputGuide = false; Task { await session.uploadSalesAudio(url) } }
        }
    }

    private func submit() {
        let message = input.trimmingCharacters(in: .whitespacesAndNewlines); guard !message.isEmpty else { return }
        input = ""; showingInputGuide = false
        Task { await session.sendCommand(message) }
    }
}

struct InputGuideCard: View {
    private let examples = [
        ("予定を確認", "今日の予定を教えて", "calendar"),
        ("予定を追加", "明日14時にいい麺亭へ電話する予定を追加", "calendar.badge.plus"),
        ("予定を変更", "いい麺亭へ電話する予定を明日15時に変更", "calendar.badge.clock"),
        ("予定を削除", "いい麺亭へ電話する予定を削除", "calendar.badge.minus"),
        ("会社の状況", "いい麺亭どうなってる？", "building.2"),
        ("テレアポを記録", "いい麺亭へ電話。不在、来週再架電", "phone"),
        ("営業ログを保存", "いい麺亭の藤野さんへ資料送付済み", "square.and.pencil")
        ,("商品を登録", "commo.を商品登録して", "shippingbox")
        ,("商品を見る", "登録商品一覧を見せて", "list.bullet.rectangle")
        ,("商品を編集", "commo.の商材を更新、説明：SNS運用支援、月額：30000", "shippingbox.and.arrow.backward")
        ,("商談分析を見る", "商談分析の状況を見せて", "chart.xyaxis.line")
        ,("会社を登録", "株式会社MOGCIAを会社登録して", "building.2.crop.circle.badge.plus")
        ,("営業先を登録", "いい麺亭を営業リストに登録、担当者：藤野さん、電話：090-0000-0000、商材：commo.", "person.crop.rectangle.badge.plus")
        ,("営業先を編集", "いい麺亭の営業リストを更新、ステータス：接触中、次回アクション：来週再架電", "person.crop.rectangle.stack")
        ,("タスクを登録", "提案資料を作るをタスク登録して", "checklist")
        ,("タスクを完了", "提案資料のタスクを完了にして", "checkmark.circle")
        ,("ナレッジを見る", "ナレッジ一覧を見せて", "books.vertical")
        ,("ナレッジを保存", "料金の切り返し例をナレッジ登録して", "square.and.arrow.down")
        ,("まとめて検索", "藤野を検索して", "magnifyingglass")
        ,("操作履歴", "最近の操作履歴を見せて", "clock.arrow.circlepath")
        ,("初回設定（ターミナル）", "mogcia setup", "terminal")
        ,("接続確認（ターミナル）", "mogcia status", "terminal")
        ,("MOGCIAを開く（ターミナル）", "mogcia open", "terminal")
        ,("ログアウト（ターミナル）", "mogcia logout", "terminal")
        ,("コマンド一覧（ターミナル）", "mogcia help", "terminal")
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 7) {
                Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.pink)
                Text("こんなふうに入力できます").font(.headline)
            }
            Text("下の入力欄へ、普段の言葉で入力してください。").font(.caption).foregroundStyle(.secondary)
            ScrollView {
                LazyVStack(spacing: 7) {
                    ForEach(Array(examples.enumerated()), id: \.offset) { _, example in
                        HStack(alignment: .top, spacing: 9) {
                            Image(systemName: example.2).foregroundStyle(.pink).frame(width: 20)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(example.0).font(.caption.weight(.semibold))
                                Text("「\(example.1)」").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(9).background(Color.white.opacity(0.76)).clipShape(RoundedRectangle(cornerRadius: 9))
                    }
                }
            }
        }
    }
}

struct TodayCard: View {
    let events: [DesktopCalendarEvent]; let recentCompanies: [DesktopRecentCompany]; let suggestions: [DesktopSuggestion]; let loading: Bool; let onCompany: (DesktopRecentCompany) -> Void; let onSuggestion: (DesktopSuggestion, String) -> Void
    var body: some View { VStack(alignment: .leading, spacing: 9) {
        HStack { Text("今日の予定").font(.headline); Spacer(); if loading { BlockLoader() } else { Text("\(events.count)件").font(.caption).foregroundStyle(.secondary) } }
        if events.isEmpty { Text("今日の予定はありません").font(.caption).foregroundStyle(.secondary).padding(.top, 24) }
        ForEach(events.prefix(5)) { event in VStack(alignment: .leading, spacing: 2) { Text(event.title).font(.callout.weight(.medium)).lineLimit(1); Text([event.timeLabel, event.companyName].compactMap { $0 }.joined(separator: " / ")).font(.caption).foregroundStyle(.secondary) }.padding(8).frame(maxWidth: .infinity, alignment: .leading).background(Color.white.opacity(0.72)).clipShape(RoundedRectangle(cornerRadius: 9)) }
        if !recentCompanies.isEmpty { Divider(); Text("最近使った会社").font(.caption.weight(.semibold)).foregroundStyle(.secondary); ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 6) { ForEach(recentCompanies) { company in Button(company.name) { onCompany(company) }.font(.caption).buttonStyle(.bordered).tint(.pink) } } } }
        if let suggestion = suggestions.first { Divider(); HStack { Label("AI提案", systemImage: "sparkles").font(.caption.weight(.semibold)).foregroundStyle(.pink); Spacer(); Text(suggestion.priorityLabel).font(.caption2).foregroundStyle(suggestion.priority == "high" ? Color.red : Color.orange) }; VStack(alignment: .leading, spacing: 3) { Text(suggestion.title).font(.callout.weight(.semibold)); Text(suggestion.reason).font(.caption).foregroundStyle(.secondary); HStack { Button("タスク化") { onSuggestion(suggestion, "create_task") }.buttonStyle(.borderedProminent).tint(.pink); Button("対応済み") { onSuggestion(suggestion, "done") }.buttonStyle(.bordered); Button("不要") { onSuggestion(suggestion, "dismiss") }.buttonStyle(.plain).foregroundStyle(.secondary) }.font(.caption) }.padding(9).background(Color.pink.opacity(0.07)).clipShape(RoundedRectangle(cornerRadius: 9)) }
    } }
}

struct InlineNotifications: View {
    let notifications: [DesktopNotification]
    var body: some View { VStack(alignment: .leading, spacing: 8) { Text("通知").font(.headline); if notifications.filter(\.isUnread).isEmpty { Text("未読通知はありません").font(.caption).foregroundStyle(.secondary).padding(.top, 24) }; ForEach(notifications.filter(\.isUnread).prefix(4)) { item in VStack(alignment: .leading, spacing: 2) { HStack { Text(item.title).font(.callout.weight(.medium)); Spacer(); Text(item.priorityLabel).font(.caption2).foregroundStyle(item.priority == "high" ? Color.red : Color.secondary) }; Text(item.message).font(.caption).foregroundStyle(.secondary).lineLimit(2) }.padding(8).frame(maxWidth: .infinity, alignment: .leading).background(Color.white.opacity(0.72)).clipShape(RoundedRectangle(cornerRadius: 9)) } } }
}

struct SuggestionCard: View {
    let result: DesktopCommandResponse?
    var body: some View { VStack(alignment: .leading, spacing: 10) { Label("AI提案", systemImage: "sparkles").font(.headline).foregroundStyle(.pink); Text(result?.company?.aiSuggestion ?? "会社の状況を照会すると、次にやることを提案します。").font(.callout); Spacer() }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).background(Color.white.opacity(0.74)).clipShape(RoundedRectangle(cornerRadius: 12)) }
}


struct CommandResultCard: View {
    let result: DesktopCommandResponse?; @ObservedObject var session: DesktopSession
    var body: some View { VStack(alignment: .leading, spacing: 10) {
        if session.isCommandLoading { HStack { BlockLoader(); Text("確認しています…").font(.caption).foregroundStyle(.secondary) }.padding(.top, 40) }
        else if let company = result?.company { CompanyStatusCard(company: company, session: session) }
        else if let template = result?.template { CommandTemplateCard(template: template, session: session) }
        else if let result { if result.kind == "duplicateWarning" { Label(result.message, systemImage: "exclamationmark.triangle.fill").font(.callout.weight(.semibold)).foregroundStyle(.orange) } else { Text(result.message).font(.callout.weight(.medium)) }; ScrollView { VStack(spacing: 8) { ForEach(result.items.prefix(8)) { item in BusinessResultCard(item: item) { if let command = item.command { Task { await session.sendCommand(command) } } } } } }; if let retryCommand = result.retryCommand { HStack { Text("別の内容として登録する場合のみ続行してください。").font(.caption).foregroundStyle(.secondary); Spacer(); Button("それでも登録") { Task { await session.sendCommand(retryCommand, allowDuplicate: true) } }.buttonStyle(.borderedProminent).tint(.orange) } }; if let draft = result.draft { Button("この予定を保存") { Task { await session.saveEvent(draft) } }.buttonStyle(.borderedProminent).tint(.pink) }; if let undoId = result.undoId { Button("元に戻す", systemImage: "arrow.uturn.backward") { Task { await session.undo(undoId) } }.font(.caption).buttonStyle(.bordered) } }
        else { Text("ここに入力結果や会社の状況が表示されます").font(.caption).foregroundStyle(.secondary).padding(.top, 40) }
    }.frame(maxWidth: .infinity, alignment: .topLeading) }
}

struct BusinessResultCard: View {
    let item: DesktopCommandItem
    let action: () -> Void
    private var icon: String { switch item.type { case "lead": "person.crop.rectangle.stack"; case "company": "building.2"; case "calendar": "calendar"; case "task": "checkmark.circle"; case "analysis": "chart.bar.xaxis"; case "product": "shippingbox"; case "activity", "log": "text.bubble"; default: "sparkles" } }
    private var accent: Color { item.tone == "error" ? .red : item.tone == "warning" ? .orange : item.tone == "success" ? .green : .pink }
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) { Image(systemName: icon).foregroundStyle(accent).frame(width: 20); VStack(alignment: .leading, spacing: 2) { Text(item.title).font(.callout.weight(.semibold)); if let subtitle = item.subtitle, !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(.secondary) } }; Spacer(); if item.command != nil { Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary) } }
                if let body = item.body, !body.isEmpty { Text(body).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
                if let metaItems = item.meta, !metaItems.isEmpty { Divider(); ForEach(Array(metaItems.enumerated()), id: \.offset) { _, meta in HStack(alignment: .top) { Text(meta.label).font(.caption2).foregroundStyle(.secondary).frame(width: 92, alignment: .leading); Text(meta.value).font(.caption).frame(maxWidth: .infinity, alignment: .leading) } } }
            }
            .padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Color.white.opacity(0.82)).overlay(RoundedRectangle(cornerRadius: 11).stroke(accent.opacity(0.18))).clipShape(RoundedRectangle(cornerRadius: 11))
        }.buttonStyle(.plain).allowsHitTesting(item.command != nil)
    }
}

struct CommandTemplateCard: View {
    let template: DesktopCommandTemplate; @ObservedObject var session: DesktopSession
    @State private var first = ""; @State private var second = ""; @State private var third = ""
    var body: some View { VStack(alignment: .leading, spacing: 9) { Label(template.title, systemImage: template.type == "call" ? "phone" : "building.2").font(.headline); ForEach(Array(template.fields.enumerated()), id: \.offset) { index, field in TextField(field.label, text: binding(index)).textFieldStyle(.roundedBorder) }; Button("内容を確認") { let command = template.type == "call" ? "\(first)へ電話。\(second)。次回対応：\(third)" : "\(first)を会社登録して"; Task { await session.sendCommand(command) } }.buttonStyle(.borderedProminent).tint(.pink).disabled(first.trimmingCharacters(in: .whitespaces).isEmpty) }.padding(12).background(Color.white.opacity(0.76)).clipShape(RoundedRectangle(cornerRadius: 12)) }
    private func binding(_ index: Int) -> Binding<String> { index == 0 ? $first : index == 1 ? $second : $third }
}

struct CompanyStatusCard: View {
    let company: DesktopCommandCompany
    @ObservedObject var session: DesktopSession
    @State private var editing = false; @State private var contactName = ""; @State private var phone = ""; @State private var email = ""; @State private var products = ""; @State private var nextAction = ""
    var body: some View { VStack(alignment: .leading, spacing: 9) { HStack { Text(company.name).font(.headline); Spacer(); Button(editing ? "閉じる" : "編集") { if !editing { contactName = company.contactName; phone = company.phone; email = company.email; products = company.products.joined(separator: "、"); nextAction = company.nextAction == "次回アクション未設定" ? "" : company.nextAction }; editing.toggle() }.font(.caption).buttonStyle(.plain).foregroundStyle(.pink) }; Text("今の状況").font(.caption.weight(.semibold)).foregroundStyle(.secondary); Divider(); if editing { Group { TextField("先方担当者", text: $contactName); TextField("電話番号", text: $phone); TextField("メール", text: $email); TextField("利用サービス（、区切り）", text: $products); TextField("次にやること", text: $nextAction) }.textFieldStyle(.roundedBorder); if session.companyConflictId == company.id { VStack(alignment: .leading, spacing: 7) { Label("他のユーザーが先に更新しました", systemImage: "exclamationmark.triangle.fill").font(.caption.weight(.semibold)).foregroundStyle(.orange); HStack { Button("最新情報を再読み込み") { session.companyConflictId = nil; Task { await session.sendCommand("\(company.name)どうなってる？") } }; Button("自分の内容で上書き") { Task { if await session.updateCompany(company.id, expectedUpdatedAt: company.updatedAt, contactName: contactName, phone: phone, email: email, products: products, nextAction: nextAction, force: true) { editing = false } } }.foregroundStyle(.red) }.font(.caption) }.padding(8).background(Color.orange.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8)) } else { Button("変更を保存") { Task { if await session.updateCompany(company.id, expectedUpdatedAt: company.updatedAt, contactName: contactName, phone: phone, email: email, products: products, nextAction: nextAction) { editing = false } } }.buttonStyle(.borderedProminent).tint(.pink) } } else { InfoBlock(title: "先方担当者", lines: [company.contactName, company.phone, company.email].filter { !$0.isEmpty }); InfoBlock(title: "利用中サービス", lines: company.products.isEmpty ? ["未設定"] : company.products); InfoBlock(title: "次にやること", lines: [company.nextAction]); VStack(alignment: .leading, spacing: 3) { Label("AI提案", systemImage: "sparkles").font(.caption.weight(.semibold)).foregroundStyle(.pink); Text("「\(company.aiSuggestion)」").font(.callout) }.padding(9).frame(maxWidth: .infinity, alignment: .leading).background(Color.pink.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 9)) } }.padding(11).background(Color.white.opacity(0.78)).clipShape(RoundedRectangle(cornerRadius: 12)) }
}

struct InfoBlock: View { let title: String; let lines: [String]; var body: some View { VStack(alignment: .leading, spacing: 2) { Text(title).font(.caption2).foregroundStyle(.secondary); ForEach(lines, id: \.self) { Text($0).font(.callout) } } } }

struct AgentChatButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 11) {
                Image(nsImage: Bundle.mogciaRobotImage)
                    .resizable().scaledToFit().frame(width: 28, height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 7))
                Text("Agentと話す").font(.system(size: 13, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(.tertiary)
            }
            .foregroundStyle(.primary)
            .padding(.horizontal, 11)
            .frame(height: 46)
            .background(Color(red: 1.0, green: 0.95, blue: 0.97))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(red: 0.94, green: 0.72, blue: 0.79).opacity(0.55)))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .help("MOGCIA Agentを開く")
    }
}

struct MenuAction: View {
    let title: String
    let systemImage: String
    var badge = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Label(title, systemImage: systemImage)
                Spacer()
                if badge > 0 {
                    Text("\(badge)").font(.caption2.bold()).padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Color.pink.opacity(0.14)).foregroundStyle(.pink).clipShape(Capsule())
                }
            }.contentShape(Rectangle())
        }.buttonStyle(.plain).padding(.vertical, 5)
    }
}

enum NotificationTab: String { case unread, done; var title: String { self == .unread ? "未読" : "完了" } }

struct NotificationsWindow: View {
    @EnvironmentObject private var session: DesktopSession
    @State private var tab: NotificationTab = .unread
    @State private var confirmingDelete = false
    private var visible: [DesktopNotification] { session.notifications.filter { tab == .unread ? $0.isUnread : $0.handlingStatus == "done" } }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading) {
                    Text("通知").font(.title2.bold())
                    Text("実務・開発・テスト通知を区別して管理します。").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button("すべて既読") { Task { await session.markAllNotificationsRead() } }.disabled(session.unreadNotificationCount == 0)
                Button("一括削除", role: .destructive) { confirmingDelete = true }.disabled(visible.isEmpty)
            }
            Picker("通知状態", selection: $tab) {
                Text("未読 \(session.unreadNotificationCount)").tag(NotificationTab.unread)
                Text("完了 \(session.doneNotificationCount)").tag(NotificationTab.done)
            }.pickerStyle(.segmented)
            if visible.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "bell.slash").font(.system(size: 28)).foregroundStyle(.secondary)
                    Text(tab == .unread ? "未読通知はありません" : "完了した通知はありません").font(.headline)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(visible) { notification in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Text(notification.title).font(.headline)
                            Spacer()
                            Text(notification.sourceLabel).font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 2)
                                .background(notification.source == "e2e" ? Color.orange.opacity(0.15) : Color.gray.opacity(0.12)).clipShape(Capsule())
                        }
                        Text(notification.message).font(.callout).foregroundStyle(.secondary)
                        if let createdAt = notification.createdAt { Text(createdAt).font(.caption2).foregroundStyle(.tertiary) }
                        HStack { Button("既読") { Task { await session.updateNotification(notification.id, action: "mark_read") } }; Button("完了") { Task { await session.updateNotification(notification.id, action: "mark_done") } }; Button("削除", role: .destructive) { Task { await session.deleteNotification(notification.id) } } }.font(.caption).buttonStyle(.borderless)
                    }.padding(.vertical, 5)
                }.listStyle(.inset)
            }
            if let errorMessage = session.errorMessage { Text(errorMessage).font(.caption).foregroundStyle(.red) }
        }
        .padding(20).task { await session.refreshNotifications() }
        .confirmationDialog("\(tab.title)通知をすべて削除しますか？", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) { Task { await session.deleteNotifications(scope: tab.rawValue) } }
            Button("キャンセル", role: .cancel) {}
        } message: { Text("この操作は取り消せません。") }
    }
}

struct FeedbackWindow: View {
    @EnvironmentObject private var session: DesktopSession
    @State private var category = "request"
    @State private var message = ""
    @State private var imageURL: URL?
    @State private var showingImporter = false
    @State private var dropTarget = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading) {
                Text("フィードバックを送る").font(.title2.bold())
                Text("スクリーンショットを添えて改善要望を送信できます。").font(.caption).foregroundStyle(.secondary)
            }
            Picker("カテゴリ", selection: $category) {
                Text("UI・表示").tag("ui"); Text("不具合").tag("bug"); Text("改善要望").tag("request"); Text("その他").tag("other")
            }.pickerStyle(.segmented)
            TextEditor(text: $message).frame(minHeight: 150).padding(8).background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.25)))
                .overlay(alignment: .topLeading) { if message.isEmpty { Text("変更したい内容や困っていることを入力してください").foregroundStyle(.tertiary).padding(14).allowsHitTesting(false) } }
            Button { showingImporter = true } label: {
                VStack(spacing: 10) {
                    Image(systemName: imageURL == nil ? "photo.badge.plus" : "checkmark.circle.fill").font(.system(size: 30)).foregroundStyle(imageURL == nil ? Color.secondary : Color.green)
                    Text(imageURL?.lastPathComponent ?? "PNG/JPEGを選択、またはここへドロップ").font(.callout.weight(.medium))
                    Text("5MBまで").font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, minHeight: 120).background(dropTarget ? Color.pink.opacity(0.08) : Color.gray.opacity(0.05))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(style: StrokeStyle(lineWidth: 1, dash: [6])).foregroundStyle(dropTarget ? Color.pink : Color.gray.opacity(0.4)))
            }.buttonStyle(.plain)
                .onDrop(of: [UTType.fileURL], isTargeted: $dropTarget) { providers in
                    guard let provider = providers.first else { return false }
                    provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                        let url = (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) } ?? item as? URL
                        if let url { Task { @MainActor in imageURL = url } }
                    }; return true
                }
            HStack {
                if session.feedbackSent { Label("送信しました", systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                if let errorMessage = session.errorMessage { Text(errorMessage).font(.caption).foregroundStyle(.red) }
                Spacer()
                Button("送信") { Task { if await session.submitFeedback(message: message, category: category, imageURL: imageURL) { message = ""; imageURL = nil } } }
                    .buttonStyle(.borderedProminent).disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || session.isLoading)
            }
        }.padding(20)
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.png, .jpeg], allowsMultipleSelection: false) { result in
                if case .success(let urls) = result { imageURL = urls.first }
            }
            .onAppear { session.feedbackSent = false }
            .onDisappear {
                category = "request"
                message = ""
                imageURL = nil
                dropTarget = false
                session.feedbackSent = false
                session.errorMessage = nil
            }
    }
}

struct MemoWindow: View {
    @EnvironmentObject private var session: DesktopSession
    @State private var text = ""
    @State private var selectedCompany: DesktopCompany?
    @State private var parsedMemo: ParsedMemo?
    @State private var query = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                RobotMark(size: 52)
                VStack(alignment: .leading) {
                    Text("フローティングメモ")
                        .font(.title2.weight(.bold))
                    Text("話した内容を貼って、登録候補を確認します。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            TextField("会社を検索", text: $query)
                .textFieldStyle(.roundedBorder)
                .onSubmit {
                    Task {
                        let companies = await session.searchCompanies(query)
                        selectedCompany = companies.first
                    }
                }

            if let selectedCompany {
                Text("選択中: \(selectedCompany.name)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.pink)
            }

            TextEditor(text: $text)
                .font(.body)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.black.opacity(0.08)))

            if let parsedMemo {
                ParsedPreview(parsedMemo: parsedMemo)
            }

            HStack {
                Button("AIで整理") {
                    Task {
                        parsedMemo = await session.parseMemo(text: text, companyId: selectedCompany?.id, source: "floating_window")
                    }
                }
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.isLoading)

                Button("選択内容を登録") {
                    Task {
                        await session.commitMemo(text: text, companyId: selectedCompany?.id, parsedMemo: parsedMemo, source: "floating_window")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedCompany == nil || parsedMemo == nil || session.isLoading)
            }
        }
        .padding(20)
        .background(Color(red: 0.99, green: 0.98, blue: 0.98))
        .onDisappear {
            text = ""
            query = ""
            selectedCompany = nil
            parsedMemo = nil
            session.errorMessage = nil
        }
    }
}

struct ParsedPreview: View {
    let parsedMemo: ParsedMemo

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let activity = parsedMemo.activityLog {
                Text("活動ログ: \(activity.title)")
                    .font(.caption.weight(.semibold))
            }
            ForEach(parsedMemo.suggestedTasks.prefix(3)) { task in
                Text("タスク: \(task.title)")
                    .font(.caption)
            }
            ForEach(parsedMemo.companyNotes.prefix(2)) { note in
                Text("メモ: \(note.content)")
                    .font(.caption)
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.8))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

struct SettingsWindow: View {
    @EnvironmentObject private var session: DesktopSession
    @State private var baseUrl = DesktopSession.savedBaseURL()
    @State private var token = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("デスクトップ連携")
                .font(.title2.weight(.bold))
            TextField("MOGCIA Agent URL", text: $baseUrl)
                .textFieldStyle(.roundedBorder)
            SecureField("アクセストークン", text: $token)
                .textFieldStyle(.roundedBorder)
            Button("保存して認証") {
                Task {
                    await session.configure(baseUrl: baseUrl, token: token)
                }
            }
            .buttonStyle(.borderedProminent)
            if let deviceName = session.deviceName {
                Text("認証済み: \(deviceName)")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
            if let errorMessage = session.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            Spacer()
        }
        .padding(20)
        .background(Color(red: 0.99, green: 0.98, blue: 0.98))
    }
}

struct RobotMark: View {
    let size: CGFloat

    var body: some View {
        Image(nsImage: Bundle.mogciaRobotImage)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
    }
}

struct BlockLoader: View {
    @State private var activeIndex = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<5, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2)
                    .fill(index == activeIndex ? Color.pink : Color.gray.opacity(0.22))
                    .frame(width: 6, height: 6)
            }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 180_000_000)
                activeIndex = (activeIndex + 1) % 5
            }
        }
    }
}

@MainActor
final class DesktopSession: ObservableObject {
    @Published var todayEvents: [DesktopCalendarEvent] = []
    @Published var notifications: [DesktopNotification] = []
    @Published var errorMessage: String?
    @Published var isLoading = false
    @Published var deviceName: String?
    @Published var feedbackSent = false
    @Published var commandResult: DesktopCommandResponse?
    @Published var isCommandLoading = false
    @Published var syncState: DesktopSyncState = .ready
    @Published var recentCompanies: [DesktopRecentCompany] = []
    @Published var suggestions: [DesktopSuggestion] = []
    @Published var commandHistory: [DesktopHistoryEntry] = []
    @Published var offlineCommands: [DesktopOfflineCommand] = []
    @Published var companyConflictId: String?
    private var lastMenuRefreshAt: Date?

    init() {
        _ = Self.savedBaseURL()
        if let data = UserDefaults.standard.data(forKey: "mogcia.commandHistory"), let values = try? JSONDecoder().decode([DesktopHistoryEntry].self, from: data) { commandHistory = values }
        if let data = UserDefaults.standard.data(forKey: "mogcia.offlineCommands"), let values = try? JSONDecoder().decode([DesktopOfflineCommand].self, from: data) { offlineCommands = values }
    }

    var unreadNotificationCount: Int { notifications.filter(\.isUnread).count }
    var doneNotificationCount: Int { notifications.filter { $0.handlingStatus == "done" }.count }

    private let keychain = TokenKeychain()
    private var client: DesktopAPIClient {
        DesktopAPIClient(
            baseUrl: Self.savedBaseURL(),
            tokenProvider: { try? self.keychain.readToken() }
        )
    }

    static func savedBaseURL() -> String {
        let saved = UserDefaults.standard.string(forKey: "mogcia.baseUrl")?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let saved, !saved.isEmpty, !saved.contains("localhost"), !saved.contains("127.0.0.1") {
            return saved.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        UserDefaults.standard.set(mogciaProductionBaseURL, forKey: "mogcia.baseUrl")
        return mogciaProductionBaseURL
    }

    var isAuthenticated: Bool {
        deviceName != nil || (try? keychain.readToken()) != nil
    }

    func configure(baseUrl: String, token: String) async {
        do {
            let trimmedUrl = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            UserDefaults.standard.set(trimmedUrl, forKey: "mogcia.baseUrl")
            try keychain.saveToken(token)
            try await verify()
            await refreshTodayEvents()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout() {
        keychain.deleteToken()
        deviceName = nil
        todayEvents = []
        notifications = []
        errorMessage = nil
        feedbackSent = false
        commandResult = nil
        recentCompanies = []
        suggestions = []
        lastMenuRefreshAt = nil
    }

    func sendCommand(_ message: String, allowDuplicate: Bool = false) async {
        if message.contains("履歴") && (message.contains("見せて") || message.contains("教えて") || message.contains("確認")) {
            commandResult = DesktopCommandResponse(handled: true, kind: "list", message: "最近の操作です。", items: commandHistory.prefix(10).map { DesktopCommandItem(id: $0.id, title: $0.input, subtitle: $0.result, type: "history") }, company: nil, draft: nil, undoId: nil)
            return
        }
        isCommandLoading = true; errorMessage = nil; syncState = .saving
        defer { isCommandLoading = false }
        do {
            commandResult = try await client.post("/api/desktop/command", body: DesktopCommandRequest(message: message, allowDuplicate: allowDuplicate, history: Array(commandHistory.prefix(6))))
            if commandResult?.kind == "saved" { await refreshAll() }
            commandHistory.insert(DesktopHistoryEntry(id: UUID().uuidString, input: message, result: commandResult?.message ?? "完了", createdAt: Date()), at: 0)
            if commandHistory.count > 20 { commandHistory.removeLast(commandHistory.count - 20) }
            persistLocalState()
            markSaved()
        } catch {
            if error is URLError { offlineCommands.append(DesktopOfflineCommand(id: UUID().uuidString, message: message, allowDuplicate: allowDuplicate, createdAt: Date())); persistLocalState(); syncState = .queued; errorMessage = "オフラインのため、再送待ちに保存しました。" }
            else { errorMessage = error.localizedDescription; syncState = .failed }
        }
    }

    func uploadSalesAudio(_ url: URL) async {
        isCommandLoading = true; errorMessage = nil; commandResult = nil; syncState = .saving
        defer { isCommandLoading = false }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            guard data.count <= 150 * 1024 * 1024 else { throw DesktopError.message("音声ファイルは150MB以下にしてください") }
            let ext = url.pathExtension.lowercased()
            guard ["m4a", "mp4"].contains(ext) else { throw DesktopError.message("m4aまたはmp4を選択してください") }
            let contentType = ext == "m4a" ? "audio/x-m4a" : "video/mp4"
            let start: SalesAudioStartResponse = try await client.post("/api/desktop/sales-audio", body: SalesAudioStartRequest(fileName: url.lastPathComponent, contentType: contentType, size: data.count))
            guard let uploadURL = URL(string: start.uploadURL) else { throw DesktopError.message("アップロード先が正しくありません") }
            var request = URLRequest(url: uploadURL); request.httpMethod = "PUT"; request.setValue(contentType, forHTTPHeaderField: "Content-Type")
            let (_, response) = try await URLSession.shared.upload(for: request, from: data)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw DesktopError.message("音声のアップロードに失敗しました") }
            let finish: SalesAudioFinishResponse = try await client.patch("/api/desktop/sales-audio", body: SalesAudioFinishRequest(recordId: start.recordId, durationSec: nil))
            commandResult = DesktopCommandResponse(handled: true, kind: "saved", message: finish.message, items: [DesktopCommandItem(id: start.recordId, title: url.deletingPathExtension().lastPathComponent, subtitle: "文字起こし・商談分析を開始しました", type: "analysis")], company: nil, draft: nil, undoId: nil)
            markSaved()
        } catch { errorMessage = error.localizedDescription; syncState = .failed }
    }

    func saveEvent(_ draft: DesktopCommandDraft) async {
        isCommandLoading = true; errorMessage = nil; syncState = .saving
        defer { isCommandLoading = false }
        do {
            let response: DesktopCommandMutation = try await client.put("/api/desktop/command", body: draft)
            commandResult = DesktopCommandResponse(handled: true, kind: "saved", message: response.message, items: [], company: nil, draft: nil, undoId: nil)
            await refreshAll()
            markSaved()
        } catch { errorMessage = error.localizedDescription; syncState = .failed }
    }

    private func markSaved() {
        syncState = .saved
        Task { try? await Task.sleep(nanoseconds: 2_000_000_000); if syncState == .saved { syncState = .ready } }
    }

    func undo(_ undoId: String) async {
        isCommandLoading = true; syncState = .saving; errorMessage = nil
        defer { isCommandLoading = false }
        do {
            let response: UndoCommandResponse = try await client.post("/api/desktop/command/undo", body: UndoCommandRequest(undoId: undoId))
            commandResult = DesktopCommandResponse(handled: true, kind: "message", message: response.message, items: [], company: nil, draft: nil, undoId: nil)
            await refreshAll(); markSaved()
        } catch { errorMessage = error.localizedDescription; syncState = .failed }
    }

    func verify() async throws {
        let response: VerifyResponse = try await client.get("/api/desktop/auth/verify")
        deviceName = response.device.deviceName
        errorMessage = nil
    }

    func refreshTodayEvents() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: TodayEventsResponse = try await client.get("/api/desktop/calendar/today")
            todayEvents = response.events
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshIfStale() async {
        if let lastMenuRefreshAt, Date().timeIntervalSince(lastMenuRefreshAt) < 60 { return }
        await refreshAll()
    }

    func refreshAll() async {
        lastMenuRefreshAt = Date()
        syncState = .saving
        errorMessage = nil
        await refreshTodayEvents()
        await refreshNotifications()
        await refreshRecentCompanies()
        await refreshSuggestions()
        await retryOfflineCommands()
        syncState = errorMessage == nil ? .ready : .failed
    }

    func retryOfflineCommands() async {
        guard !offlineCommands.isEmpty else { return }
        var remaining: [DesktopOfflineCommand] = []
        for queued in offlineCommands {
            do {
                let response: DesktopCommandResponse = try await client.post("/api/desktop/command", body: DesktopCommandRequest(message: queued.message, allowDuplicate: queued.allowDuplicate ?? false, history: Array(commandHistory.prefix(6))))
                commandHistory.insert(DesktopHistoryEntry(id: UUID().uuidString, input: queued.message, result: response.message, createdAt: Date()), at: 0)
            } catch { remaining.append(queued) }
        }
        offlineCommands = remaining; if commandHistory.count > 20 { commandHistory = Array(commandHistory.prefix(20)) }; persistLocalState()
    }

    private func persistLocalState() {
        if let data = try? JSONEncoder().encode(commandHistory) { UserDefaults.standard.set(data, forKey: "mogcia.commandHistory") }
        if let data = try? JSONEncoder().encode(offlineCommands) { UserDefaults.standard.set(data, forKey: "mogcia.offlineCommands") }
    }

    func refreshRecentCompanies() async {
        guard isAuthenticated else { return }
        do { let response: DesktopRecentCompaniesResponse = try await client.get("/api/desktop/companies/recent"); recentCompanies = response.companies }
        catch { errorMessage = error.localizedDescription }
    }

    func refreshSuggestions() async {
        guard isAuthenticated else { return }
        do { let response: DesktopSuggestionsResponse = try await client.get("/api/desktop/suggestions"); suggestions = response.suggestions }
        catch { errorMessage = error.localizedDescription }
    }

    func handleSuggestion(_ suggestion: DesktopSuggestion, action: String) async {
        syncState = .saving
        do {
            let response: SuggestionMutationResponse = try await client.post("/api/desktop/suggestions", body: SuggestionActionRequest(suggestionId: suggestion.id, action: action, companyId: suggestion.companyId, companyName: suggestion.companyName, title: suggestion.title, reason: suggestion.reason, suggestedAction: suggestion.suggestedAction, priority: suggestion.priority))
            commandResult = DesktopCommandResponse(handled: true, kind: "saved", message: response.message, items: [], company: nil, draft: nil, undoId: nil)
            await refreshAll(); markSaved()
        } catch { errorMessage = error.localizedDescription; syncState = .failed }
    }

    func refreshNotifications() async {
        guard isAuthenticated else { return }
        do {
            let response: NotificationsResponse = try await client.get("/api/desktop/notifications")
            notifications = response.notifications
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
    }

    func markAllNotificationsRead() async {
        do {
            let _: NotificationMutationResponse = try await client.patch("/api/desktop/notifications", body: NotificationActionRequest(action: "mark_all_read"))
            await refreshNotifications()
        } catch { errorMessage = error.localizedDescription }
    }

    func updateNotification(_ id: String, action: String) async {
        do { let _: NotificationMutationResponse = try await client.patch("/api/desktop/notifications", body: NotificationItemActionRequest(action: action, notificationId: id)); await refreshNotifications() }
        catch { errorMessage = error.localizedDescription }
    }

    func deleteNotification(_ id: String) async {
        do { let _: NotificationMutationResponse = try await client.delete("/api/desktop/notifications", body: NotificationItemDeleteRequest(scope: "single", notificationId: id)); await refreshNotifications() }
        catch { errorMessage = error.localizedDescription }
    }

    func deleteNotifications(scope: String) async {
        do {
            let _: NotificationMutationResponse = try await client.delete("/api/desktop/notifications", body: NotificationDeleteRequest(scope: scope))
            await refreshNotifications()
        } catch { errorMessage = error.localizedDescription }
    }

    func submitFeedback(message: String, category: String, imageURL: URL?) async -> Bool {
        isLoading = true; feedbackSent = false
        defer { isLoading = false }
        do {
            var imageBase64: String?
            var imageContentType: String?
            if let imageURL {
                let accessed = imageURL.startAccessingSecurityScopedResource()
                defer { if accessed { imageURL.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: imageURL)
                guard data.count <= 5 * 1024 * 1024 else { throw DesktopError.message("画像は5MB以下にしてください") }
                let ext = imageURL.pathExtension.lowercased()
                guard ["png", "jpg", "jpeg"].contains(ext) else { throw DesktopError.message("PNGまたはJPEGを選択してください") }
                imageBase64 = data.base64EncodedString()
                imageContentType = ext == "png" ? "image/png" : "image/jpeg"
            }
            let _: FeedbackResponse = try await client.post("/api/desktop/feedback", body: FeedbackRequest(message: message, category: category, imageBase64: imageBase64, imageContentType: imageContentType, appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String, systemVersion: ProcessInfo.processInfo.operatingSystemVersionString))
            feedbackSent = true; errorMessage = nil; return true
        } catch { errorMessage = error.localizedDescription; return false }
    }

    func searchCompanies(_ query: String) async -> [DesktopCompany] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        do {
            let escaped = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
            let response: CompanySearchResponse = try await client.get("/api/desktop/companies/search?q=\(escaped)")
            return response.companies
        } catch {
            errorMessage = error.localizedDescription
            return []
        }
    }

    func updateCompany(_ id: String, expectedUpdatedAt: String, contactName: String, phone: String, email: String, products: String, nextAction: String, force: Bool = false) async -> Bool {
        syncState = .saving
        do { let response: CompanyUpdateResponse = try await client.patch("/api/desktop/companies/\(id)", body: CompanyUpdateRequest(contactName: contactName, phone: phone, email: email, products: products.split(separator: "、").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }, nextAction: nextAction, expectedUpdatedAt: expectedUpdatedAt, force: force)); companyConflictId = nil; commandResult = DesktopCommandResponse(handled: true, kind: "saved", message: response.message, items: [], company: nil, draft: nil, undoId: nil); markSaved(); return true }
        catch { if error.localizedDescription.contains("他のユーザー") { companyConflictId = id; errorMessage = nil } else { errorMessage = error.localizedDescription }; syncState = .failed; return false }
    }

    func parseMemo(text: String, companyId: String?, source: String) async -> ParsedMemo? {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: ParseMemoResponse = try await client.post("/api/desktop/memos/parse", body: ParseMemoRequest(text: text, companyId: companyId, createdFrom: source))
            errorMessage = nil
            return response.parsed
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func commitMemo(text: String, companyId: String?, parsedMemo: ParsedMemo?, source: String) async {
        guard let companyId, let parsedMemo else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let _: CommitMemoResponse = try await client.post(
                "/api/desktop/memos/commit",
                body: CommitMemoRequest(
                    memoId: nil,
                    companyId: companyId,
                    originalText: text,
                    activityLog: parsedMemo.activityLog,
                    tasks: parsedMemo.suggestedTasks,
                    companyNotes: parsedMemo.companyNotes,
                    createdFrom: source
                )
            )
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func openWeb(path: String) {
        let baseUrl = Self.savedBaseURL()
        if let url = URL(string: baseUrl + path) {
            NSWorkspace.shared.open(url)
        }
    }
}

@MainActor
struct DesktopAPIClient {
    let baseUrl: String
    let tokenProvider: () -> String?

    func get<Response: Decodable>(_ path: String) async throws -> Response {
        try await request(path: path, method: "GET", body: Optional<Data>.none)
    }

    func post<Request: Encodable, Response: Decodable>(_ path: String, body: Request) async throws -> Response {
        let data = try JSONEncoder().encode(body)
        return try await request(path: path, method: "POST", body: data)
    }

    func patch<Request: Encodable, Response: Decodable>(_ path: String, body: Request) async throws -> Response {
        try await request(path: path, method: "PATCH", body: JSONEncoder().encode(body))
    }

    func put<Request: Encodable, Response: Decodable>(_ path: String, body: Request) async throws -> Response {
        try await request(path: path, method: "PUT", body: JSONEncoder().encode(body))
    }

    func delete<Request: Encodable, Response: Decodable>(_ path: String, body: Request) async throws -> Response {
        try await request(path: path, method: "DELETE", body: JSONEncoder().encode(body))
    }

    private func request<Response: Decodable>(path: String, method: String, body: Data?) async throws -> Response {
        guard let token = tokenProvider() else { throw DesktopError.message("アクセストークンが未設定です") }
        guard let url = URL(string: baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else {
            throw DesktopError.message("URLが正しくありません")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw DesktopError.message("通信に失敗しました") }
        let envelope = try JSONDecoder().decode(DesktopEnvelope<Response>.self, from: data)
        if http.statusCode >= 400 || !envelope.success {
            throw DesktopError.message(envelope.error?.message ?? "APIエラーです")
        }
        guard let payload = envelope.data else { throw DesktopError.message("APIレスポンスが空です") }
        return payload
    }
}

final class TokenKeychain {
    private let service = "mogcia-desktop-token"
    private let account = "default"

    func saveToken(_ token: String) throws {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data
        ]
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw DesktopError.message("Keychainへの保存に失敗しました") }
    }

    func readToken() throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
            throw DesktopError.message("アクセストークンが未設定です")
        }
        return token
    }

    func deleteToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum DesktopError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message): message
        }
    }
}

enum DesktopSyncState: Equatable {
    case ready, saving, saved, queued, failed
    var label: String { switch self { case .ready: "入力できます"; case .saving: "保存中…"; case .saved: "保存しました"; case .queued: "オフライン・再送待ち"; case .failed: "同期に失敗しました" } }
    var icon: String { switch self { case .ready: "checkmark.circle"; case .saving: "arrow.triangle.2.circlepath"; case .saved: "checkmark.circle.fill"; case .queued: "icloud.slash"; case .failed: "exclamationmark.triangle.fill" } }
    var color: Color { switch self { case .ready: .secondary; case .saving, .queued: .orange; case .saved: .green; case .failed: .red } }
}

struct DesktopEnvelope<DataType: Decodable>: Decodable {
    let success: Bool
    let data: DataType?
    let error: DesktopAPIError?
}

struct DesktopAPIError: Decodable {
    let code: String
    let message: String
}

struct VerifyResponse: Decodable {
    let device: DesktopDevice
}

struct TodayEventsResponse: Decodable { let events: [DesktopCalendarEvent] }

struct CompanySearchResponse: Decodable {
    let companies: [DesktopCompany]
}
struct CompanyUpdateRequest: Encodable { let contactName: String; let phone: String; let email: String; let products: [String]; let nextAction: String; let expectedUpdatedAt: String; let force: Bool }
struct CompanyUpdateResponse: Decodable { let message: String }

struct ParseMemoRequest: Encodable {
    let text: String
    let companyId: String?
    let createdFrom: String
}

struct ParseMemoResponse: Decodable {
    let parsed: ParsedMemo
}

struct CommitMemoRequest: Encodable {
    let memoId: String?
    let companyId: String
    let originalText: String
    let activityLog: ActivityCandidate?
    let tasks: [TaskCandidate]
    let companyNotes: [CompanyNoteCandidate]
    let createdFrom: String
}

struct CommitMemoResponse: Decodable {
    let activityLogId: String?
    let taskIds: [String]
    let companyNoteIds: [String]
}

struct NotificationsResponse: Decodable { let notifications: [DesktopNotification] }
struct NotificationMutationResponse: Decodable { let updated: Int?; let deleted: Int? }
struct NotificationActionRequest: Encodable { let action: String }
struct NotificationDeleteRequest: Encodable { let scope: String }
struct NotificationItemActionRequest: Encodable { let action: String; let notificationId: String }
struct NotificationItemDeleteRequest: Encodable { let scope: String; let notificationId: String }

struct DesktopNotification: Decodable, Identifiable {
    let id: String
    let title: String
    let message: String
    let type: String
    let source: String
    let handlingStatus: String
    let read: Bool
    let targetUrl: String?
    let createdAt: String?
    let priority: String
    var isUnread: Bool { !read && handlingStatus == "unread" }
    var sourceLabel: String {
        switch source { case "e2e": "E2E"; case "development": "開発"; case "business": "実務"; default: "システム" }
    }
    var priorityLabel: String { priority == "high" ? "重要" : priority == "medium" ? "今日中" : "参考" }
}

struct FeedbackRequest: Encodable {
    let message: String
    let category: String
    let imageBase64: String?
    let imageContentType: String?
    let appVersion: String?
    let systemVersion: String?
}
struct FeedbackResponse: Decodable { let feedbackId: String }

struct DesktopCommandRequest: Encodable {
    let message: String
    let allowDuplicate: Bool
    let history: [DesktopHistoryEntry]
    init(message: String, allowDuplicate: Bool = false, history: [DesktopHistoryEntry] = []) {
        self.message = message
        self.allowDuplicate = allowDuplicate
        self.history = history
    }
}
struct DesktopCommandResponse: Decodable {
    let handled: Bool
    let kind: String
    let message: String
    let items: [DesktopCommandItem]
    let company: DesktopCommandCompany?
    let draft: DesktopCommandDraft?
    let undoId: String?
    let template: DesktopCommandTemplate?
    let retryCommand: String?
    init(handled: Bool, kind: String, message: String, items: [DesktopCommandItem], company: DesktopCommandCompany?, draft: DesktopCommandDraft?, undoId: String?, template: DesktopCommandTemplate? = nil, retryCommand: String? = nil) { self.handled = handled; self.kind = kind; self.message = message; self.items = items; self.company = company; self.draft = draft; self.undoId = undoId; self.template = template; self.retryCommand = retryCommand }
}
struct DesktopCommandMeta: Decodable { let label: String; let value: String }
struct DesktopCommandItem: Decodable, Identifiable {
    let id: String; let title: String; let subtitle: String?; let type: String; let command: String?
    let body: String?; let href: String?; let tone: String?; let meta: [DesktopCommandMeta]?
    init(id: String, title: String, subtitle: String?, type: String, command: String? = nil, body: String? = nil, href: String? = nil, tone: String? = "default", meta: [DesktopCommandMeta]? = []) { self.id = id; self.title = title; self.subtitle = subtitle; self.type = type; self.command = command; self.body = body; self.href = href; self.tone = tone; self.meta = meta }
}
struct DesktopCommandCompany: Decodable { let id: String; let name: String; let contactName: String; let phone: String; let email: String; let products: [String]; let nextAction: String; let aiSuggestion: String; let updatedAt: String }
struct DesktopCommandTemplate: Decodable { let type: String; let title: String; let fields: [DesktopTemplateField] }
struct DesktopTemplateField: Decodable { let key: String; let label: String }
struct DesktopCommandDraft: Codable {
    let title: String
    let startAt: String
    let endAt: String
    let companyId: String
    let companyName: String
    let attendeeIds: [String]
    let attendeeNames: [String]
    let productName: String
    let contactName: String
    let leadId: String
    let eventType: String
}
struct DesktopCommandMutation: Decodable { let eventId: String; let message: String; let targetURL: String }
struct SalesAudioStartRequest: Encodable { let fileName: String; let contentType: String; let size: Int }
struct SalesAudioStartResponse: Decodable { let recordId: String; let uploadURL: String; let storagePath: String }
struct SalesAudioFinishRequest: Encodable { let recordId: String; let durationSec: Double? }
struct SalesAudioFinishResponse: Decodable { let recordId: String; let targetURL: String; let message: String }
struct UndoCommandRequest: Encodable { let undoId: String }
struct UndoCommandResponse: Decodable { let message: String }
struct DesktopRecentCompaniesResponse: Decodable { let companies: [DesktopRecentCompany] }
struct DesktopRecentCompany: Decodable, Identifiable { let id: String; let name: String; let contactName: String; let nextAction: String }
struct DesktopSuggestionsResponse: Decodable { let suggestions: [DesktopSuggestion] }
struct DesktopSuggestion: Decodable, Identifiable { let id: String; let companyId: String; let companyName: String; let priority: String; let title: String; let reason: String; let suggestedAction: String; var priorityLabel: String { priority == "high" ? "重要" : "確認" } }
struct SuggestionActionRequest: Encodable { let suggestionId: String; let action: String; let companyId: String; let companyName: String; let title: String; let reason: String; let suggestedAction: String; let priority: String }
struct SuggestionMutationResponse: Decodable { let message: String }
struct DesktopHistoryEntry: Codable, Identifiable { let id: String; let input: String; let result: String; let createdAt: Date }
struct DesktopOfflineCommand: Codable, Identifiable { let id: String; let message: String; let allowDuplicate: Bool?; let createdAt: Date }

struct DesktopDevice: Decodable {
    let id: String
    let deviceName: String
}

struct DesktopCalendarEvent: Decodable, Identifiable {
    let id: String
    let title: String
    let startAt: String?
    let endAt: String?
    let allDay: Bool
    let companyName: String?
    let location: String?
    let eventType: String

    var timeLabel: String? {
        if allDay { return "終日" }
        guard let startAt, let date = ISO8601DateFormatter().date(from: startAt) else { return nil }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "ja_JP"); formatter.dateFormat = "H:mm"
        return formatter.string(from: date)
    }
}

struct DesktopCompany: Decodable, Identifiable {
    let id: String
    let name: String
}

struct ParsedMemo: Decodable {
    let activityLog: ActivityCandidate?
    let suggestedTasks: [TaskCandidate]
    let companyNotes: [CompanyNoteCandidate]
}

struct ActivityCandidate: Codable {
    var selected: Bool
    let type: String
    let title: String
    let content: String
    let occurredAt: String?
}

struct TaskCandidate: Codable, Identifiable {
    var id: String { tempId }
    let tempId: String
    var selected: Bool
    let title: String
    let description: String?
    let dueDate: String?
    let priority: String
    let reason: String
}

struct CompanyNoteCandidate: Codable, Identifiable {
    var id: String { tempId }
    let tempId: String
    var selected: Bool
    let content: String
}
