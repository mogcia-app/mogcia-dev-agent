import AppKit
import Foundation
import Security
import SwiftUI

@main
struct MOGCIADesktopApp: App {
    @StateObject private var session = DesktopSession()

    var body: some Scene {
        MenuBarExtra("MOGCIA", image: "m-dev-agent") {
            MenuBarContent()
                .environmentObject(session)
                .task { await session.refreshDashboard() }
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
    }
}

struct MenuBarContent: View {
    @Environment(\.openWindow) private var openWindow
    @EnvironmentObject private var session: DesktopSession
    @State private var inputText = ""
    @State private var feedbackOpen = false
    @State private var feedbackCategory = "不具合"
    @State private var feedbackText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
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
                Button {
                    Task { await session.logout() }
                } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                }
                .help("ログアウト")
                Button {
                    feedbackOpen.toggle()
                } label: {
                    Image(systemName: "bubble.left.and.bubble.right")
                }
                .help("フィードバック")
            }

            Divider()

            HStack {
                Text("今日の予定")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if session.isLoading {
                    BlockLoader()
                } else {
                    Text("\(session.todayEvents.count)件")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if session.todayEvents.isEmpty {
                Text(session.isAuthenticated ? "今日の予定はありません。" : "Webのデスクトップ連携からトークンを登録してください。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            } else {
                ForEach(session.todayEvents.prefix(5)) { event in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(event.title)
                            .font(.callout.weight(.medium))
                            .lineLimit(1)
                        Text([event.companyName, event.startAtLabel].compactMap { $0 }.joined(separator: " / "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .padding(.vertical, 4)
                }
            }

            SyncStatusView(session: session)

            if let errorMessage = session.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(2)
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text("MOGCIA Agentに相談・登録")
                    .font(.subheadline.weight(.semibold))
                TextEditor(text: $inputText)
                    .font(.body)
                    .frame(height: 68)
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.black.opacity(0.08)))
                HStack {
                    Button("送信") {
                        let message = inputText
                        Task {
                            let sent = await session.submitMenubarInput(message)
                            if sent { inputText = "" }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.isLoading)
                    Button("更新") { Task { await session.refreshDashboard() } }
                    if !session.failedSyncLabels.isEmpty {
                        Button("再試行") { Task { await session.refreshDashboard() } }
                    }
                }
            }

            if let companyCard = session.companyCard {
                CompanySummaryCard(card: companyCard)
            }

            NotificationMiniList(session: session)

            if feedbackOpen {
                FeedbackPanel(category: $feedbackCategory, text: $feedbackText) {
                    let category = feedbackCategory
                    let content = feedbackText
                    Task {
                        let sent = await session.sendFeedback(category: category, content: content, images: [])
                        if sent {
                            feedbackText = ""
                            feedbackOpen = false
                        }
                    }
                }
            }

            Button("WebのHomeを開く") { session.openWeb(path: "/home") }
            Button("接続設定") { openWindow(id: "settings") }
        }
        .frame(width: 320)
        .padding(14)
        .background(Color(red: 1.0, green: 0.94, blue: 0.96))
        .task { await session.refreshDashboard() }
        .onDisappear { inputText = "" }
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
    @State private var baseUrl = UserDefaults.standard.string(forKey: "mogcia.baseUrl") ?? "http://localhost:3000"
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
        Image("m-dev-agent", bundle: .module)
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

struct SyncStatusView: View {
    @ObservedObject var session: DesktopSession

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let syncedAt = session.lastSyncedAt {
                Text("最終同期: \(syncedAt.formatted(date: .omitted, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if !session.failedSyncLabels.isEmpty {
                Text("読み込めなかった項目: \(session.failedSyncLabels.joined(separator: "、"))")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
    }
}

struct CompanySummaryCard: View {
    let card: DesktopCompanyCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("今の状況")
                .font(.subheadline.weight(.bold))
            Divider()
            LabelValue(label: "先方担当者", value: card.primaryContactName.isEmpty ? "未設定" : card.primaryContactName)
            LabelValue(label: "電話番号", value: card.phone.isEmpty ? "未設定" : card.phone)
            LabelValue(label: "メールアドレス", value: card.email.isEmpty ? "未設定" : card.email)
            LabelValue(label: "利用中サービス", value: card.productNames.isEmpty ? "未設定" : card.productNames.joined(separator: "、"))
            LabelValue(label: "次にやること", value: card.nextActionTitle.isEmpty ? "次回アクション未設定" : card.nextActionTitle)
            Text("AI提案")
                .font(.caption.weight(.bold))
            Text("「\(card.aiSuggestion)」")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct LabelValue: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption)
                .lineLimit(2)
        }
    }
}

struct NotificationMiniList: View {
    @ObservedObject var session: DesktopSession

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("通知")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("未読 \(session.unreadNotificationCount) / 完了 \(session.completedNotificationCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("すべて既読") { Task { await session.markAllNotificationsRead() } }
                Button("一括削除") { Task { await session.deleteAllNotifications() } }
            }
            ForEach(session.notifications.prefix(3)) { notification in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(notification.title)
                            .font(.caption.weight(.bold))
                        Text(notification.message)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Spacer()
                    Button("完了") { Task { await session.completeNotification(notification.id) } }
                        .font(.caption2)
                }
            }
        }
    }
}

struct FeedbackPanel: View {
    @Binding var category: String
    @Binding var text: String
    let onSubmit: () -> Void
    private let categories = ["不具合", "改善要望", "質問", "その他"]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("カテゴリ", selection: $category) {
                ForEach(categories, id: \.self) { item in
                    Text(item)
                }
            }
            TextEditor(text: $text)
                .frame(height: 64)
                .scrollContentBackground(.hidden)
                .padding(6)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            Button("フィードバック送信", action: onSubmit)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(10)
        .background(Color.white.opacity(0.82))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onDisappear { text = "" }
    }
}

@MainActor
final class DesktopSession: ObservableObject {
    @Published var todayTasks: [DesktopTask] = []
    @Published var todayEvents: [DesktopCalendarEvent] = []
    @Published var notifications: [DesktopNotification] = []
    @Published var companyCard: DesktopCompanyCard?
    @Published var lastSyncedAt: Date?
    @Published var failedSyncLabels: [String] = []
    @Published var errorMessage: String?
    @Published var isLoading = false
    @Published var deviceName: String?

    private let keychain = TokenKeychain()
    private var client: DesktopAPIClient {
        DesktopAPIClient(
            baseUrl: UserDefaults.standard.string(forKey: "mogcia.baseUrl") ?? "http://localhost:3000",
            tokenProvider: { try? self.keychain.readToken() }
        )
    }

    var isAuthenticated: Bool {
        deviceName != nil || (try? keychain.readToken()) != nil
    }

    var unreadNotificationCount: Int {
        notifications.filter { !$0.read }.count
    }

    var completedNotificationCount: Int {
        notifications.filter { $0.completed == true }.count
    }

    func configure(baseUrl: String, token: String) async {
        do {
            let trimmedUrl = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            UserDefaults.standard.set(trimmedUrl, forKey: "mogcia.baseUrl")
            try keychain.saveToken(token)
            try await verify()
            await refreshDashboard()
        } catch {
            errorMessage = userFacingError(error)
        }
    }

    func verify() async throws {
        let response: VerifyResponse = try await client.get("/api/desktop/auth/verify")
        deviceName = response.device.deviceName
        errorMessage = nil
    }

    func refreshTodayTasks() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: TodayTasksResponse = try await client.get("/api/desktop/tasks/today")
            todayTasks = response.tasks
            errorMessage = nil
        } catch {
            errorMessage = userFacingError(error)
        }
    }

    func refreshDashboard() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: SyncResponse = try await client.get("/api/desktop/sync")
            todayEvents = response.calendarEvents
            notifications = response.notifications
            failedSyncLabels = response.items.filter { !$0.success }.map(\.label)
            lastSyncedAt = ISO8601DateFormatter().date(from: response.syncedAt) ?? Date()
            errorMessage = failedSyncLabels.isEmpty ? nil : "一部の項目を読み込めませんでした。"
        } catch {
            errorMessage = userFacingError(error)
        }
    }

    func searchCompanies(_ query: String) async -> [DesktopCompany] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        do {
            let escaped = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
            let response: CompanySearchResponse = try await client.get("/api/desktop/companies/search?q=\(escaped)")
            return response.companies
        } catch {
            errorMessage = userFacingError(error)
            return []
        }
    }

    func parseMemo(text: String, companyId: String?, source: String) async -> ParsedMemo? {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: ParseMemoResponse = try await client.post("/api/desktop/memos/parse", body: ParseMemoRequest(text: text, companyId: companyId, createdFrom: source))
            errorMessage = nil
            return response.parsed
        } catch {
            errorMessage = userFacingError(error)
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
            await refreshDashboard()
        } catch {
            errorMessage = userFacingError(error)
        }
    }

    func submitMenubarInput(_ text: String) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        isLoading = true
        defer { isLoading = false }
        do {
            if trimmed.contains("会社") || trimmed.contains("どうなって") {
                let companies = await searchCompanies(trimmed.replacingOccurrences(of: "この会社", with: ""))
                if let first = companies.first {
                    let response: CompanyDetailResponse = try await client.get("/api/desktop/companies/\(first.id)")
                    companyCard = response.company
                    errorMessage = nil
                    return true
                }
            }
            let _: AgentChatResponse = try await client.post("/api/desktop/agent/chat", body: AgentChatRequest(rawMessage: trimmed))
            errorMessage = "送信しました。回答は通知とAgent履歴に反映されます。"
            await refreshDashboard()
            return true
        } catch {
            errorMessage = userFacingError(error)
            return false
        }
    }

    func markAllNotificationsRead() async {
        do {
            let _: CountResponse = try await client.patch("/api/desktop/notifications", body: NotificationActionRequest(action: "mark_all_read", notificationId: nil, read: nil, completed: nil))
            await refreshDashboard()
        } catch {
            errorMessage = userFacingError(error)
        }
    }

    func completeNotification(_ id: String) async {
        do {
            let _: IdResponse = try await client.patch("/api/desktop/notifications", body: NotificationActionRequest(action: nil, notificationId: id, read: true, completed: true))
            await refreshDashboard()
        } catch {
            errorMessage = userFacingError(error)
        }
    }

    func deleteAllNotifications() async {
        do {
            let _: CountResponse = try await client.delete("/api/desktop/notifications", body: EmptyRequest())
            notifications = []
            await refreshDashboard()
        } catch {
            errorMessage = userFacingError(error)
        }
    }

    func sendFeedback(category: String, content: String, images: [String]) async -> Bool {
        do {
            let _: IdResponse = try await client.post("/api/desktop/feedback", body: FeedbackRequest(category: category, content: content, images: images))
            errorMessage = "フィードバックを送信しました。"
            return true
        } catch {
            errorMessage = userFacingError(error)
            return false
        }
    }

    func logout() async {
        try? keychain.deleteToken()
        todayEvents = []
        todayTasks = []
        notifications = []
        companyCard = nil
        deviceName = nil
        errorMessage = "ログアウトしました。"
    }

    func openWeb(path: String) {
        let baseUrl = UserDefaults.standard.string(forKey: "mogcia.baseUrl") ?? "http://localhost:3000"
        if let url = URL(string: baseUrl + path) {
            NSWorkspace.shared.open(url)
        }
    }
}

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
        let data = try JSONEncoder().encode(body)
        return try await request(path: path, method: "PATCH", body: data)
    }

    func delete<Request: Encodable, Response: Decodable>(_ path: String, body: Request) async throws -> Response {
        let data = try JSONEncoder().encode(body)
        return try await request(path: path, method: "DELETE", body: data)
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
        let envelope: DesktopEnvelope<Response>
        do {
            envelope = try JSONDecoder().decode(DesktopEnvelope<Response>.self, from: data)
        } catch {
            throw DesktopError.message("サーバーからの応答を読み取れませんでした")
        }
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

    func deleteToken() throws {
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

func userFacingError(_ error: Error) -> String {
    if let desktopError = error as? DesktopError, let message = desktopError.errorDescription {
        return message
    }
    let raw = error.localizedDescription
    if raw.localizedCaseInsensitiveContains("offline") || raw.localizedCaseInsensitiveContains("network") || raw.localizedCaseInsensitiveContains("internet") {
        return "通信に失敗しました。ネットワーク接続を確認してください。"
    }
    if raw.localizedCaseInsensitiveContains("decode") || raw.localizedCaseInsensitiveContains("data") {
        return "サーバーからの応答を読み取れませんでした。"
    }
    if raw.localizedCaseInsensitiveContains("cancelled") {
        return "処理がキャンセルされました。"
    }
    return raw.isEmpty ? "処理に失敗しました。" : raw
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

struct TodayTasksResponse: Decodable {
    let tasks: [DesktopTask]
}

struct SyncResponse: Decodable {
    let syncedAt: String
    let items: [SyncItem]
    let calendarEvents: [DesktopCalendarEvent]
    let notifications: [DesktopNotification]
}

struct SyncItem: Decodable {
    let key: String
    let label: String
    let success: Bool
    let error: String?
}

struct CompanySearchResponse: Decodable {
    let companies: [DesktopCompany]
}

struct CompanyDetailResponse: Decodable {
    let company: DesktopCompanyCard
}

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

struct AgentChatRequest: Encodable {
    let rawMessage: String
}

struct AgentChatResponse: Decodable {
    let requestId: String
    let runId: String
}

struct NotificationActionRequest: Encodable {
    let action: String?
    let notificationId: String?
    let read: Bool?
    let completed: Bool?
}

struct FeedbackRequest: Encodable {
    let category: String
    let content: String
    let images: [String]
}

struct EmptyRequest: Encodable {}

struct CountResponse: Decodable {
    let count: Int?
}

struct IdResponse: Decodable {
    let id: String?
    let feedbackId: String?
}

struct DesktopDevice: Decodable {
    let id: String
    let deviceName: String
}

struct DesktopTask: Decodable, Identifiable {
    let id: String
    let title: String
    let companyName: String?
    let dueDate: String?

    var dueDateLabel: String? {
        guard let dueDate else { return nil }
        return String(dueDate.prefix(16)).replacingOccurrences(of: "T", with: " ")
    }
}

struct DesktopCalendarEvent: Decodable, Identifiable {
    let id: String
    let title: String
    let startAt: String?
    let companyName: String?

    var startAtLabel: String? {
        guard let startAt else { return nil }
        return String(startAt.prefix(16)).replacingOccurrences(of: "T", with: " ")
    }
}

struct DesktopCompany: Decodable, Identifiable {
    let id: String
    let name: String
}

struct DesktopCompanyCard: Decodable {
    let id: String
    let name: String
    let primaryContactName: String
    let phone: String
    let email: String
    let productNames: [String]
    let nextActionTitle: String
    let nextActionAt: String?
    let aiSuggestion: String
}

struct DesktopNotification: Decodable, Identifiable {
    let id: String
    let title: String
    let message: String
    let read: Bool
    let completed: Bool?
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
