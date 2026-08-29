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

Existing Desktop-specific endpoints remain available for compatibility.

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

Web Dev Agent now accepts only development-like requests at `/api/agent/execute`. Normal business registration must use the business screens and shared business APIs.

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

Local verification should include:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Deployment verification requires Vercel to deploy the latest commit and have `FIREBASE_SERVICE_ACCOUNT_BASE64` set for Production.

## Deployment Result

Pending. The latest code must be deployed by Vercel and verified with:

- `/api/diagnostics/firebase-admin`
- `/api/business/companies`
- `/api/business/tasks`
- `/api/business/calendar`

## Incomplete Items

- Full browser E2E for all Web business forms has not been completed in production.
- Vercel production currently needs confirmation that the latest commit is deployed.
- macOS Desktop app implementation, signing, packaging, and `mogcia open` are intentionally out of scope for this instruction.
