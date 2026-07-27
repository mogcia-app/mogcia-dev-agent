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
                .task { await session.refreshTodayTasks() }
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
            }

            Divider()

            HStack {
                Text("今日のタスク")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if session.isLoading {
                    BlockLoader()
                } else {
                    Text("\(session.todayTasks.count)件")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if session.todayTasks.isEmpty {
                Text(session.isAuthenticated ? "今日・期限切れのタスクはありません。" : "設定からURLとトークンを登録してください。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            } else {
                ForEach(session.todayTasks.prefix(5)) { task in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(task.title)
                            .font(.callout.weight(.medium))
                            .lineLimit(1)
                        Text([task.companyName, task.dueDateLabel].compactMap { $0 }.joined(separator: " / "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .padding(.vertical, 4)
                }
            }

            if let errorMessage = session.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(2)
            }

            Divider()

            Button("メモを開く") { openWindow(id: "memo") }
            Button("WebのHomeを開く") { session.openWeb(path: "/home") }
            Button("更新") { Task { await session.refreshTodayTasks() } }
            Button("設定") { openWindow(id: "settings") }
            Button("終了") { NSApp.terminate(nil) }
        }
        .frame(width: 320)
        .padding(14)
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

@MainActor
final class DesktopSession: ObservableObject {
    @Published var todayTasks: [DesktopTask] = []
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

    func configure(baseUrl: String, token: String) async {
        do {
            let trimmedUrl = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            UserDefaults.standard.set(trimmedUrl, forKey: "mogcia.baseUrl")
            try keychain.saveToken(token)
            try await verify()
            await refreshTodayTasks()
        } catch {
            errorMessage = error.localizedDescription
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
            errorMessage = error.localizedDescription
        }
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
}

enum DesktopError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message): message
        }
    }
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

struct CompanySearchResponse: Decodable {
    let companies: [DesktopCompany]
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
