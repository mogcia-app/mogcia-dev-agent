# Desktop API Contract

This document is the server-side API contract for the official macOS Desktop app.

Official Desktop source:

```text
/Users/mogcia-client/Documents/ChatGPT/mogcia-desktop
```

Do not implement Swift UI changes in `apps/macos/MOGCIA Desktop` as the release source. Server-side Desktop APIs and Business Services are owned by this repository.

## Envelope

All Desktop API responses must be JSON. Desktop UI must not display HTML error pages or raw localized descriptions.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "質問を入力してください",
    "retryable": false,
    "field": "message",
    "details": {}
  }
}
```

Current implementation guarantees `code` and `message`. `retryable`, `field`, and `details` are the formal contract and should be added server-side before the Xcode app depends on them.

## Authentication

Desktop business APIs use Desktop device token authentication:

```http
Authorization: Bearer mogcia_dt_...
```

The token is stored only as a SHA-256 hash in `desktopDevices.tokenHash`. On each authenticated request, the server updates `lastUsedAt` and `lastSeenAt`, checks `status === "active"`, checks required permission, and applies per-device rate limiting.

Desktop device token APIs:

- `/api/desktop/agent/chat`
- `/api/desktop/sync`
- `/api/desktop/command`
- `/api/desktop/calendar`
- `/api/desktop/tasks`
- `/api/desktop/tasks/today`
- `/api/desktop/companies`
- `/api/desktop/companies/search`
- `/api/desktop/companies/[companyId]`
- `/api/desktop/products`
- `/api/desktop/leads`
- `/api/desktop/templates`
- `/api/desktop/analyses`
- `/api/desktop/sales-audio`
- `/api/desktop/activity-logs`
- `/api/desktop/memos/parse`
- `/api/desktop/memos/commit`
- `/api/desktop/notifications`
- `/api/desktop/feedback`
- `/api/desktop/auth/verify`

Firebase ID token APIs:

- Web `/api/business/*`
- Web `/api/users/*`
- `/api/desktop/pairing/approve`

Unauthenticated pairing APIs:

- `/api/desktop/pairing/start`
- `/api/desktop/pairing/claim`

Web-only or Dev Agent APIs must not be used by the official Desktop business UI:

- `/api/agent/*`
- `/api/development/*`
- Web page-specific APIs unless explicitly documented

## Business Logic Boundary

Desktop API routes should only handle:

- device token authentication
- request parsing
- Desktop response shaping
- audit logging

Business logic must call Business Services:

- Calendar: `calendar-service`
- Tasks: `task-service`
- Companies: `company-service`
- Leads: `lead-service`
- Products: `product-service`
- Activities: `activity-service`

Desktop AI command and conversation code must interpret intent only. It must not own Firestore CRUD, validation, normalization, or cascade behavior.

## POST /api/desktop/agent/chat

Purpose: one entry point for normal AI conversation and AI-assisted business operations.

Headers:

```http
Authorization: Bearer mogcia_dt_...
Content-Type: application/json
```

### Request

Formal request schema:

```ts
type DesktopChatRequest = {
  message: string;
  conversationId?: string | null;
  selectedCandidateId?: string | null;
  selectedCandidateIndex?: number | null;
  confirmation?: "confirm" | "cancel" | "reject" | null;
  clientContext?: {
    locale?: "ja-JP" | string;
    timeZone?: "Asia/Tokyo" | string;
    appVersion?: string;
    platform?: "macOS" | string;
    activeView?: string;
  };
  device?: {
    appVersion?: string;
    osVersion?: string;
    machineName?: string;
  };
};
```

Required:

- `message`: user input, 1-2000 chars.

Optional:

- `conversationId`: continue a specific short-lived conversation. Current implementation can resume latest active conversation even if omitted.
- `selectedCandidateId`: selected candidate entity id.
- `selectedCandidateIndex`: 1-based index shown in UI.
- `confirmation`: explicit confirmation signal. The server remains authoritative.
- `clientContext`: UI context for better parsing and future analytics.
- `device`: non-secret device metadata.

Compatibility:

- Current server reads `message` first and falls back to `rawMessage`.
- Official clients may continue sending both `message` and `rawMessage`; when both are present, `message` is authoritative.

### Response

Formal response schema:

```ts
type DesktopChatResponse = {
  answer: string;
  handled: boolean;
  kind: "calendar" | "task" | "company" | "lead" | "product" | "activity" | "notification" | "business_query";
  conversationId: string | null;
  conversationStatus: ConversationStatus;
  missingFields: string[];
  candidateEntities: DesktopCandidateEntity[];
  confirmationRequired: boolean;
  confirmationPayload: Record<string, unknown> | null;
  draft: Record<string, unknown> | null;
  items: DesktopResultItem[];
  executedAction: string | null;
  refreshRequired: boolean;
  error: DesktopInlineError | null;
};
```

Field definitions:

| Field | Type | Nullable | Purpose |
| --- | --- | --- | --- |
| `answer` | `string` | No | Text to show in chat. Includes normal AI answers, questions, confirmations, and completion messages. |
| `handled` | `boolean` | No | Whether server recognized and handled the message. |
| `kind` | enum | No | Domain of response. |
| `conversationId` | `string` | Yes | Short-lived operation state id. |
| `conversationStatus` | enum | No | Current conversation state. |
| `missingFields` | `string[]` | No | Fields the server needs from the user. |
| `candidateEntities` | `DesktopCandidateEntity[]` | No | Candidate choices for ambiguous targets. |
| `confirmationRequired` | `boolean` | No | If true, Xcode shows confirmation UI. Do not infer this client-side. |
| `confirmationPayload` | object | Yes | Server-provided summary of the operation awaiting confirmation. |
| `draft` | object | Yes | In-progress business operation draft. |
| `items` | `DesktopResultItem[]` | No | Search results or affected records. |
| `executedAction` | `string` | Yes | Stable action name committed to Firestore, for example `calendar.create` or `lead.status_change`. |
| `refreshRequired` | `boolean` | No | If true, call `/api/desktop/sync`. |
| `error` | object | Yes | Inline recoverable operation error. Transport errors still use failure envelope. |

Compatibility:

- Current server returns the formal chat fields above.
- Current server also returns legacy `requestId` and `runId` as empty strings. Official Xcode app should ignore them.

### Conversation Status

Formal statuses:

| Status | Meaning |
| --- | --- |
| `idle` | No active operation. |
| `pending_input` | Server needs missing fields. |
| `pending_candidate` | Server needs the user to choose one candidate. |
| `pending_confirmation` | Server needs confirmation before execution. |
| `completed` | Operation or answer completed. |
| `failed` | Operation failed but may be retryable. |
| `expired` | Short-lived conversation expired and cannot be resumed. |
| `cancelled` | User cancelled the operation. |

Compatibility:

- Current server returns formal status names.
- Existing stored `pending` and `confirming` conversations are still accepted and normalized to `pending_input` / `pending_confirmation` in responses.

### Candidate Entities

Formal schema:

```ts
type DesktopCandidateEntity = {
  id: string;
  type: "company" | "lead" | "product" | "task" | "calendar" | "activity";
  label: string;
  subtitle?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};
```

Display rules:

- Xcode may show candidates as numbered rows using array order.
- The server remains authoritative for candidate resolution.
- Xcode may send `selectedCandidateId` or `selectedCandidateIndex`; it should not execute a business operation locally.

Compatibility:

- Current server may return candidate objects in older item shapes, for example `{ type, id, name, companyName, title, status }`.
- Xcode should derive `label` from `label ?? title ?? name ?? companyName ?? id` until the server normalizes all candidates.

### Confirmation

The server decides when confirmation is required. Xcode should show confirmation UI when:

```ts
confirmationRequired === true || conversationStatus === "pending_confirmation"
```

Operations requiring confirmation:

- delete
- bulk or destructive changes
- ambiguous updates
- important status changes
- server-detected duplicate calendar entries

On confirm, Xcode sends the same `conversationId` with:

```json
{
  "message": "はい",
  "rawMessage": "はい",
  "conversationId": "desktopConversations/doc-id",
  "confirmation": "confirm"
}
```

On cancel:

```json
{
  "message": "キャンセル",
  "rawMessage": "キャンセル",
  "conversationId": "desktopConversations/doc-id",
  "confirmation": "cancel"
}
```

## desktopConversations

Collection:

```text
desktopConversations
```

Purpose: short-lived state for completing business operations. It is not long-term chat history.

Stored fields:

- `conversationId`
- `userId`
- `desktopDeviceId`
- `intent`
- `action`
- `entityType`
- `targetEntityId`
- `collectedFields`
- `missingFields`
- `candidateEntities`
- `selectedEntity`
- `confirmationRequired`
- `confirmationPayload`
- `lastUserMessage`
- `lastAssistantMessage`
- `status`
- `expiresAt`
- `createdAt`
- `updatedAt`

Expiration:

- Current TTL is 30 minutes.
- Expired conversations must not execute old pending operations.
- Expired state should return a fresh prompt or failure explaining that the operation expired.

Error behavior:

- If execution fails before a destructive action commits, keep the pending conversation retryable.
- After a destructive action commits, do not retry automatically.

## GET /api/desktop/sync

Purpose: one Desktop sync endpoint for the official app. Xcode should be able to render the main menu bar state without calling old individual APIs.

Headers:

```http
Authorization: Bearer mogcia_dt_...
```

Formal response schema:

```ts
type DesktopSyncResponse = {
  syncedAt: string;
  items: DesktopSyncItem[];
  calendarEvents: DesktopCalendarEvent[];
  tasks: DesktopTask[];
  notifications: DesktopNotification[];
  companies: DesktopCompany[];
  aiSuggestions: DesktopTask[];
};
```

Compatibility:

- Current server returns `syncedAt`, `items`, `calendarEvents`, `tasks`, `companies`, `notifications`, `aiSuggestions`, and `partialErrors` at top level.
- Existing clients that read `items[].data` can continue using it.

Partial errors:

```ts
type DesktopSyncItem = {
  key: "calendar" | "tasks" | "notifications" | "companies" | "ai";
  label: string;
  success: boolean;
  data?: unknown;
  error?: string;
};
```

If one domain fails, `/api/desktop/sync` should still return `success: true` when the sync request itself succeeded, with `items[].success === false` for the failed domain.

Required sync content:

- today's calendar events
- tasks
- notifications
- companies
- AI suggestions
- sync timestamp
- partial errors

## Error Codes

Desktop error codes:

| Code | HTTP | Retryable | Meaning |
| --- | --- | --- | --- |
| `UNAUTHORIZED` | 401 | false | Missing, invalid, or revoked Desktop token. |
| `FORBIDDEN` | 403 | false | Token exists but lacks required permission. |
| `VALIDATION_ERROR` | 400 | false | Request shape or field value invalid. |
| `NOT_FOUND` | 404 | false | Target entity not found. |
| `DUPLICATE` | 409 or 200 with confirmation | true | Duplicate calendar/task risk; user confirmation may continue. |
| `RATE_LIMITED` | 429 | true | Too many requests for this device. |
| `AI_ERROR` | 502/503 | true | AI provider/config failure. |
| `SERVER_ERROR` | 500 | true | Unexpected server error. |

Formal error schema:

```ts
type DesktopError = {
  code: string;
  message: string;
  retryable: boolean;
  field?: string | null;
  details?: Record<string, unknown> | null;
};
```

## E2E Examples

### 1. Normal AI Question

Request:

```json
{
  "message": "今日やることある？",
  "rawMessage": "今日やることある？",
  "clientContext": { "locale": "ja-JP", "timeZone": "Asia/Tokyo" }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "今日の予定は2件、未完了タスクは3件あります。",
    "handled": true,
    "kind": "business_query",
    "conversationId": null,
    "conversationStatus": "completed",
    "missingFields": [],
    "candidateEntities": [],
    "confirmationRequired": false,
    "confirmationPayload": null,
    "draft": null,
    "items": [],
    "executedAction": null,
    "refreshRequired": false,
    "error": null
  }
}
```

### 2. Calendar Create

Request:

```json
{
  "message": "明日14時にアルファ社との打ち合わせを登録して",
  "rawMessage": "明日14時にアルファ社との打ち合わせを登録して"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "9月1日 14:00から60分、オンラインで登録しますか？",
    "handled": true,
    "kind": "calendar",
    "conversationId": "conv_123",
    "conversationStatus": "pending_confirmation",
    "missingFields": [],
    "candidateEntities": [],
    "confirmationRequired": true,
    "confirmationPayload": {
      "action": "create_calendar",
      "draft": {
        "title": "アルファ社",
        "companyName": "アルファ社",
        "eventType": "sales",
        "meetingMethod": "online",
        "startAt": "2026-09-01T14:00:00+09:00",
        "durationMinutes": 60
      }
    },
    "draft": {
      "title": "アルファ社",
      "companyName": "アルファ社",
      "eventType": "sales",
      "meetingMethod": "online",
      "startAt": "2026-09-01T14:00:00+09:00"
    },
    "items": [],
    "executedAction": null,
    "refreshRequired": false,
    "error": null
  }
}
```

### 3. Missing Time

Request:

```json
{
  "message": "明日アルファ社との打ち合わせ入れて",
  "rawMessage": "明日アルファ社との打ち合わせ入れて"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "何時にしますか？",
    "handled": true,
    "kind": "calendar",
    "conversationId": "conv_124",
    "conversationStatus": "pending_input",
    "missingFields": ["startAtTime"],
    "candidateEntities": [],
    "confirmationRequired": false,
    "confirmationPayload": null,
    "draft": { "action": "create_calendar", "companyName": "アルファ社", "startAt": "2026-09-01T00:00:00+09:00" },
    "items": [],
    "executedAction": null,
    "refreshRequired": false,
    "error": null
  }
}
```

### 4. Multiple Candidates

Request:

```json
{
  "message": "アルファのステータス変えて",
  "rawMessage": "アルファのステータス変えて"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "どの会社ですか？番号で選んでください。",
    "handled": true,
    "kind": "company",
    "conversationId": "conv_125",
    "conversationStatus": "pending_candidate",
    "missingFields": [],
    "candidateEntities": [
      { "id": "company_1", "type": "company", "label": "アルファコミュニケーションズ株式会社", "subtitle": "提案中", "metadata": { "status": "prospect" } },
      { "id": "company_2", "type": "company", "label": "株式会社アルファ企画", "subtitle": "営業前", "metadata": { "status": "lead" } }
    ],
    "confirmationRequired": false,
    "confirmationPayload": null,
    "draft": { "action": "change_company_status" },
    "items": [],
    "executedAction": null,
    "refreshRequired": false,
    "error": null
  }
}
```

### 5. Candidate Selection

Request:

```json
{
  "message": "1",
  "rawMessage": "1",
  "conversationId": "conv_125",
  "selectedCandidateIndex": 1
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "変更後のステータスを教えてください。",
    "handled": true,
    "kind": "company",
    "conversationId": "conv_125",
    "conversationStatus": "pending_input",
    "missingFields": ["status"],
    "candidateEntities": [],
    "confirmationRequired": false,
    "confirmationPayload": null,
    "draft": { "action": "change_company_status", "companyId": "company_1" },
    "items": [],
    "executedAction": null,
    "refreshRequired": false,
    "error": null
  }
}
```

### 6. Delete Confirmation

Request:

```json
{
  "message": "アルファ社を削除して",
  "rawMessage": "アルファ社を削除して"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "削除前の確認が必要です。関連タスク2件、予定1件、活動3件、営業リスト1件があります。削除してよいか確認してください。",
    "handled": true,
    "kind": "company",
    "conversationId": "conv_126",
    "conversationStatus": "pending_confirmation",
    "missingFields": [],
    "candidateEntities": [],
    "confirmationRequired": true,
    "confirmationPayload": { "action": "delete_company", "companyId": "company_1", "impact": { "tasksCount": 2, "calendarEventsCount": 1, "activitiesCount": 3, "leadsCount": 1 } },
    "draft": { "action": "delete_company", "companyId": "company_1" },
    "items": [{ "id": "company_1", "type": "company", "label": "アルファ社" }],
    "executedAction": null,
    "refreshRequired": false,
    "error": null
  }
}
```

### 7. Execute After Confirmation

Request:

```json
{
  "message": "はい",
  "rawMessage": "はい",
  "conversationId": "conv_126",
  "confirmation": "confirm"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "会社を削除しました。",
    "handled": true,
    "kind": "company",
    "conversationId": "conv_126",
    "conversationStatus": "completed",
    "missingFields": [],
    "candidateEntities": [],
    "confirmationRequired": false,
    "confirmationPayload": null,
    "draft": null,
    "items": [{ "id": "company_1", "type": "company", "label": "アルファ社" }],
    "executedAction": "company.delete",
    "refreshRequired": true,
    "error": null
  }
}
```

### 8. Conversation Expired

Request:

```json
{
  "message": "はい",
  "rawMessage": "はい",
  "conversationId": "conv_old",
  "confirmation": "confirm"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "answer": "前回の操作は期限切れです。もう一度最初から指示してください。",
    "handled": true,
    "kind": "business_query",
    "conversationId": null,
    "conversationStatus": "expired",
    "missingFields": [],
    "candidateEntities": [],
    "confirmationRequired": false,
    "confirmationPayload": null,
    "draft": null,
    "items": [],
    "executedAction": null,
    "refreshRequired": false,
    "error": null
  }
}
```

### 9. Auth Error

Response:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "認証に失敗しました",
    "retryable": false,
    "field": null,
    "details": null
  }
}
```

### 10. Service Error

Response:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "会社が見つかりません。",
    "retryable": false,
    "field": "companyId",
    "details": { "entityType": "company" }
  }
}
```

## Xcode Client Requirements

The official Xcode app should:

- use Desktop device token for `/api/desktop/*`
- show `answer` as the assistant message
- show candidate rows from `candidateEntities`
- show confirmation UI only from `confirmationRequired` / `conversationStatus`
- send `conversationId` on follow-up turns
- call `/api/desktop/sync` when `refreshRequired === true`
- ignore `requestId` and `runId`
- never call Dev Agent routes for ordinary business chat
- never execute business mutations locally
