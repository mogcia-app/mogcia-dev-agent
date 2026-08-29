# MOGCIA Dev Agent / Business API Report

Updated: 2026-08-30

## Scope

Desktop app implementation is out of scope. This report covers Web, shared API, Firestore, and DevelopmentJob behavior.

## API Specification

All shared business APIs accept `Authorization: Bearer <token>`.

- Web clients use Firebase ID tokens.
- Desktop clients use registered desktop device tokens.
- Responses use `{ success: true, data }` or `{ success: false, error: { code, message, details } }`.
- Create endpoints may return `{ requiresConfirmation: true, duplicates }` when duplicate candidates are found.
- Update endpoints accept `updatedAt`. If it is stale, the API returns `409 CONFLICT` with the current server record.

Shared endpoints:

- `GET/POST/PATCH /api/business/calendar`
- `GET/POST/PATCH /api/business/tasks`
- `GET/POST/PATCH /api/business/companies`
- `GET/POST/PATCH /api/business/leads`
- `GET/POST/PATCH /api/business/activities`
- `GET/POST/PATCH /api/business/products`
- `GET/POST/PATCH/DELETE /api/business/notifications`

Desktop 0.7.18 compatibility endpoints:

- `POST /api/desktop/command`
  - Routes normal business intent directly to Firestore business data.
  - Does not create `developmentJobs`, `agentRuns`, or `agentRequests`.
  - Response shape: `{ success: true, data: { handled, kind, message, items, draft } }`.
  - Calendar intent returns a `draft` for Desktop to submit without an extra confirmation screen.
- `PUT /api/desktop/command`
  - Commits a calendar draft to `calendarEvents`.
  - Success response: `{ success: true, data: { eventId, message, targetURL: "/calendar" } }`.
  - Duplicate calendar candidates return `409 DUPLICATE`.
- `GET /api/desktop/search?q=...`
- `GET /api/desktop/companies/:id`
- `POST /api/desktop/companies/:id`
- `GET /api/desktop/members`
- `GET /api/agent/overview`
- `GET/PATCH /api/agent/notifications`
- `GET/PATCH /api/agent/recommendations`
- `POST /api/desktop/feedback`

## Firestore Data Structure

Business data is stored in shared Firestore collections:

- `calendarEvents`
- `tasks`
- `companies`
- `leads`
- `activities`
- `products`
- `agentNotifications`

Development-only data is stored separately:

- `developmentJobs`
- `developmentWorkers`
- `developmentProjects`
- `agentRuns`
- `agentRequests`

Worker logs are stored under `developmentJobs/{jobId}/logs`.

## Intent Routing

| Intent | Destination |
| --- | --- |
| `development_request` | Dev Agent Run and `developmentJobs` |
| Company/search/summary intents | Business data read only; not DevelopmentJob |
| Calendar/task/activity/product/lead business CRUD | `/api/business/*`; not DevelopmentJob |
| General chat/business conversation | Not accepted by Web Dev Agent |
| Desktop `calendar` | `/api/desktop/command` draft, then `PUT /api/desktop/command` to `calendarEvents` |
| Desktop `task` | `/api/desktop/command` to `tasks` |
| Desktop `company` | `/api/desktop/command` to `companies` |
| Desktop `lead` | `/api/desktop/command` to `leads` |
| Desktop `activity` | `/api/desktop/command` to `activities` |
| Desktop `product` | `/api/desktop/command` to `products` |
| Desktop `notification` | `/api/desktop/command` or notification APIs; not DevelopmentJob |
| Desktop `business_query` | Firestore business collections search; not DevelopmentJob |

Web Dev Agent now accepts only development-like requests at `/api/agent/execute`. Normal business registration must use the business screens and shared business APIs.

Desktop business chat now uses business command/search handling. It no longer calls the Dev Agent executor for ordinary Desktop chat requests.

## Web Changes

- Agent page title changed to `Dev Agent`.
- Dev Agent example prompts now only describe development work.
- Dev Agent rejects normal business requests before creating an Agent Run.
- Web company create/update now uses `/api/business/companies`.
- Web company activity logging now creates the shared `activities` record through `/api/business/activities`.
- Web lead create/update and manual activity creation now use `/api/business/leads` and `/api/business/activities`.
- Web product create/update now uses `/api/business/products`.
- Web calendar create/update now uses `/api/business/calendar`.
- Web task create/update now uses `/api/business/tasks`.

## E2E Notification Audit

Production E2E notification cleanup was completed before this change set.

- Deleted notification documents: 11
- Remaining E2E notification candidates after deletion: 0
- Related `developmentJobs`, `agentRuns`, and `agentRequests` were not deleted.
- The notification API stores `source` and `environment`.
- Production rejects `environment=test` notification creation.
- Normal notification reads exclude test notifications unless explicitly requested.
- E2E test data cleanup is available through `scripts/audit-e2e-notifications.mjs`. Production notification creation with `environment=test` is rejected by the API.

Deleted IDs:

- `YG5OXN5fw4ovQFKVH98o`
- `HG83jYchi7uVvhh4Zcn9`
- `OdkNsAkXXJRGED6KacJT`
- `9gyrKi2QiwNQfl3IWdgQ`
- `YduboxAGG9uU18iiSc7K`
- `LgZBI6RfuLCwbdrcJsV5`
- `yElQkG7vgVYq8MF68aSo`
- `aXGLJsLvb53iXFJvPopX`
- `kw7iYTp2cTgNGveSmo6w`
- `OsjRAiKiPal1YYusvf0V`
- `OYIp5akzdfKitg33G0Ny`

## Test Results

Local verification completed:

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed

Previous production diagnostics confirmed `FIREBASE_SERVICE_ACCOUNT_BASE64` is set and Firebase Admin imports correctly on Vercel.

## Deployment Result

Pending for this Desktop 0.7.18 compatibility change. The latest code must be deployed by Vercel and verified with:

- `/api/diagnostics/firebase-admin`
- `POST /api/desktop/command`
- `PUT /api/desktop/command`
- `GET /api/desktop/search`
- `GET /api/desktop/companies/:id`
- `GET/PATCH /api/agent/notifications`
- `GET/PATCH /api/agent/recommendations`

## Incomplete Items

- Desktop 0.7.18 production integration has not been run yet after this dev-agent change.
- Production verification still needs a real Desktop token to confirm create/read reflection between Desktop and Web.
- Full browser E2E for all Web business forms has not been completed in production in this pass.
- macOS Desktop app implementation, signing, packaging, and `mogcia open` are intentionally out of scope for this instruction.
