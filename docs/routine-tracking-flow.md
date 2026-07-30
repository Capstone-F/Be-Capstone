# Routine Tracking Integration Guide

End-to-end guide for integrating GlowScan’s **Care Plan / Today Routine → step complete/skip → daily check-in → history & adherence** flow with this backend.

This guide covers **daily adherence after a routine already exists**. Creating an AI routine from a paid survey order is documented in [Survey → Purchase → Routine](survey-flow.md).

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also: [Survey flow (routine generation)](survey-flow.md) · [User Management & RBAC](users.md)

---

## Status legend

| Marker     | Meaning                                  |
| ---------- | ---------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today |
| ❌ Missing | Not implemented yet                      |

---

## Table of Contents

1. [Flow overview](#1-flow-overview)
2. [Base URL & auth](#2-base-url--auth)
3. [Prerequisites](#3-prerequisites)
4. [Domain rules (must implement on FE)](#4-domain-rules-must-implement-on-fe)
5. [Step-by-step integration](#5-step-by-step-integration)
6. [Endpoint checklist](#6-endpoint-checklist)
7. [Response shapes](#7-response-shapes)
8. [Error map](#8-error-map)
9. [Screen mapping](#9-screen-mapping)
10. [Out of scope / later](#10-out-of-scope--later)

---

## 1. Flow overview

```
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐   ┌──────────────────┐
│ Care Plan/Home  │──▶│ Step Detail      │──▶│ Complete / Skip │──▶│ Progress update  │
│ GET me/today    │   │ (product, dosage)│   │ POST complete   │   │ (2/4, IN_PROGRESS)│
└─────────────────┘   └──────────────────┘   │ POST skip       │   └────────┬─────────┘
  ✅ Ready              FE only                └─────────────────┘            │
                                                                              ▼
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐   ┌──────────────────┐
│ History         │◀──│ Day detail       │◀──│ Check-in        │◀──│ Session done or  │
│ calendar dots   │   │ steps + check-in │   │ mood / levels / │   │ partial OK       │
│ + streak        │   │                  │   │ side effects    │   │                  │
└─────────────────┘   └──────────────────┘   └─────────────────┘   └──────────────────┘
  ✅ Ready              ✅ Ready               ✅ Ready
```

**Happy path (Doc2 example):**

1. Customer opens Care Plan / Home → `GET /routines/me/today?period=MORNING`.
2. Sees 4 morning steps, progress `0/4`, `sessionState: NOT_STARTED`.
3. Completes cleanser + toner → skip serum (`OUT_OF_STOCK`) → complete sunscreen.
4. Progress becomes `completedCount: 3`, `skippedCount: 1`, `completionRate: 75`, `sessionState: COMPLETED` (all steps acted).
5. Submits check-in (skin feel + optional side effects) — allowed even when partial.
6. Opens History → calendar shows day status + streak; opens a past day for step outcomes + check-in snapshot.

**Upstream:** customer already has ≥1 `ACTIVE` routine (AI from survey purchase, or expert-prescribed later).

---

## 2. Base URL & auth

| Environment | Path prefix | Example                              |
| ----------- | ----------- | ------------------------------------ |
| Development | none        | `http://localhost:3000/routines/...` |
| Production  | `/api`      | `https://host/api/routines/...`      |

**Calling protected routes:**

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

All tracking endpoints require an authenticated **Customer**. Acting on another customer’s routine → `403`.

---

## 3. Prerequisites

| Requirement             | How to get it                                     | Status   |
| ----------------------- | ------------------------------------------------- | -------- |
| Customer profile        | Auth + `/customers/me`                            | ✅ Ready |
| ≥1 `ACTIVE` routine     | `POST /routines/generate` after paid survey order | ✅ Ready |
| Steps with period/order | Returned on generate / `GET /routines/me`         | ✅ Ready |

If the customer has **no** `ACTIVE` routine, Today returns an empty state (not a hard crash):

```json
{
  "date": "2026-07-22",
  "period": "MORNING",
  "sessionState": "EMPTY",
  "reason": "NO_ACTIVE_ROUTINE",
  "routines": []
}
```

FE should show CTA: “Làm bài test AI” / “Tạo routine” → survey flow.

Run DB migration before using tracking in non-e2e environments:

```bash
npm run migration:run
```

Migration: `1784200000000-RoutineTrackingDecoupleCompletions` (decouples step completions from check-ins; adds skip + period/mood).

---

## 4. Domain rules (must implement on FE)

### 4.1 Timezone

| Rule          | Value                                                |
| ------------- | ---------------------------------------------------- |
| Calendar TZ   | **`Asia/Ho_Chi_Minh` (UTC+7)**                       |
| “Today”       | Server VN calendar date `YYYY-MM-DD`                 |
| Completions   | Always recorded for **server today** (no backdating) |
| Check-in date | Defaults to today; **same-day only** (MVP)           |

Do not invent a local-device “today” that disagrees with the API `date` field — use the response `date` for UI labels.

### 4.2 Period

| Value     | Meaning   |
| --------- | --------- |
| `MORNING` | Buổi sáng |
| `EVENING` | Buổi tối  |

If `period` query/body is omitted:

- Local VN hour **&lt; 14** → `MORNING`
- Otherwise → `EVENING`

### 4.3 Step status

| Status      | Meaning                        |
| ----------- | ------------------------------ |
| `PENDING`   | No completion row for today    |
| `COMPLETED` | User marked Done               |
| `SKIPPED`   | User marked Skip (with reason) |

Skip reasons: `OUT_OF_STOCK` | `FORGOT` | `OTHER` (`note` **required** when `OTHER`).

**Idempotency:** repeating the same action (complete→complete or skip→skip) is OK. Flipping `COMPLETED` ↔ `SKIPPED` → **`409 Conflict`**.

### 4.4 Progress

```
completedCount  = steps with status COMPLETED
skippedCount    = steps with status SKIPPED
totalCount      = steps in this period for that routine
completionRate  = round(completedCount / totalCount * 100, 2)   // skips do NOT inflate %
actedCount      = completedCount + skippedCount
```

Example (Doc2): 3 completed + 1 skipped out of 4 → `completionRate: 75`, session still **COMPLETED** because every step was acted.

### 4.5 `sessionState` (Today)

| State         | When                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `EMPTY`       | No `ACTIVE` routines (top-level only; `reason: NO_ACTIVE_ROUTINE`)                |
| `NOT_STARTED` | `actedCount === 0` and date is today/future                                       |
| `IN_PROGRESS` | Some steps acted, not all                                                         |
| `COMPLETED`   | Every period step is `COMPLETED` **or** `SKIPPED`                                 |
| `MISSED`      | Past date with `actedCount === 0` (history / past views; not typical for “today”) |

Top-level Today aggregation when routines exist:

- All `COMPLETED` → `COMPLETED`
- All `NOT_STARTED` → `NOT_STARTED`
- Else → `IN_PROGRESS`

**Multiple ACTIVE routines:** Today returns an **array** of all of them for the period (AI + expert).

### 4.6 History day status

Derived **on read** (no cron job).

| Status        | When                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `COMPLETED`   | Every period that has steps is fully acted that day                         |
| `PARTIAL`     | Some activity, but not all periods/steps fully acted                        |
| `MISSED`      | Past day, zero actions, and date ≥ routine activation (`createdAt` VN date) |
| `NOT_STARTED` | Today (or future) with zero actions                                         |

Days **before** the routine became active are **omitted** (no false MISSED).

Streak (`summary.currentStreak`): consecutive `COMPLETED` days ending at today if today is completed, otherwise ending at yesterday.

### 4.7 Completions vs check-ins (decoupled)

| Entity                  | Role                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `RoutineStepCompletion` | Per step, per day (`routineId + sessionDate + period + step`)                                     |
| `RoutineCheckIn`        | Skin report for `routineId + date + period` (mood, levels, side effects, stored `completionRate`) |

User can tick steps **before** submitting check-in. Check-in is optional for progress; History still works from completions alone.

One check-in per `(routineId, date, period)` → duplicate → **`409`**.

---

## 5. Step-by-step integration

### 5.1 Today Routine (Home / Care Plan)

```http
GET /routines/me/today?period=MORNING
Authorization: Bearer <accessToken>
```

| Query    | Required | Notes                                       |
| -------- | -------- | ------------------------------------------- |
| `period` | No       | `MORNING` \| `EVENING`; defaults by VN hour |

**FE:**

1. Call on Care Plan tab focus / pull-to-refresh.
2. If `sessionState === EMPTY` → empty CTA.
3. Else render each `routines[]` card: title, progress bar (`completedCount/totalCount`), step list with status chips.
4. “Bắt đầu” / tap step → Step Detail (local navigation using step payload: `instructions`, `dosageText`, `waitMinutes`, `productVariant`).

### 5.2 Complete a step

```http
POST /routines/:routineId/steps/:stepId/complete
```

No body. Returns updated **`TodayRoutineDto`** for that routine’s period (immediate progress).

### 5.3 Skip a step

```http
POST /routines/:routineId/steps/:stepId/skip
Content-Type: application/json

{
  "reason": "OUT_OF_STOCK",
  "note": "optional unless OTHER"
}
```

| Field    | Required                          |
| -------- | --------------------------------- |
| `reason` | Yes                               |
| `note`   | Required when `reason` is `OTHER` |

Returns the same shape as complete.

### 5.4 Daily check-in

Allowed with **partial** progress (e.g. 3/4).

```http
POST /routines/:routineId/check-ins
Content-Type: application/json

{
  "period": "MORNING",
  "overallMood": "OK",
  "acneLevel": 2,
  "oilLevel": 1,
  "rednessLevel": 0,
  "moistureLevel": 3,
  "note": "Da bình thường",
  "sideEffects": [
    { "type": "ITCHING", "severity": 1, "note": null }
  ]
}
```

| Field                                                       | Required | Notes                                                                        |
| ----------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `date`                                                      | No       | `YYYY-MM-DD`; defaults today; must be **today** (MVP)                        |
| `period`                                                    | No       | Defaults by VN hour                                                          |
| `overallMood`                                               | No       | `GOOD` \| `OK` \| `BAD`                                                      |
| `acneLevel` / `oilLevel` / `rednessLevel` / `moistureLevel` | No       | Integer `0–5`                                                                |
| `note`                                                      | No       | Free text                                                                    |
| `sideEffects[]`                                             | No       | See enum below                                                               |
| `sideEffects[].type`                                        | Yes\*    | `PEELING` \| `REDNESS` \| `BREAKOUT` \| `BLISTERS` \| `BURNING` \| `ITCHING` |
| `sideEffects[].severity`                                    | No       | `1–5`                                                                        |
| `sideEffects[].note`                                        | No       |                                                                              |

`completionRate` is **computed server-side** from step completions for that day/period and stored on the check-in — do not send it from FE.

### 5.5 List check-ins (History support)

```http
GET /routines/:routineId/check-ins?from=2026-07-01&to=2026-07-22
```

### 5.6 History calendar

```http
GET /routines/:routineId/history?from=2026-07-01&to=2026-07-22
```

Response includes:

- `days[]`: `{ date, status, completionRate }` — enough for calendar dots
- `summary`: `{ currentStreak, averageCompletionRate }`

### 5.7 History day detail

```http
GET /routines/:routineId/history/2026-07-21?period=MORNING
```

Returns step outcomes + optional check-in snapshot for that date/period.

---

## 6. Endpoint checklist

| Method | Path                                          | Auth     | Status   | Purpose                          |
| ------ | --------------------------------------------- | -------- | -------- | -------------------------------- |
| GET    | `/routines/me/today`                          | Customer | ✅ Ready | Today sessions (all ACTIVE)      |
| POST   | `/routines/:routineId/steps/:stepId/complete` | Customer | ✅ Ready | Mark step done                   |
| POST   | `/routines/:routineId/steps/:stepId/skip`     | Customer | ✅ Ready | Skip with reason                 |
| POST   | `/routines/:routineId/check-ins`              | Customer | ✅ Ready | Submit skin check-in             |
| GET    | `/routines/:routineId/check-ins`              | Customer | ✅ Ready | List check-ins in range          |
| GET    | `/routines/:routineId/history`                | Customer | ✅ Ready | Calendar + streak summary        |
| GET    | `/routines/:routineId/history/:date`          | Customer | ✅ Ready | Day detail                       |
| POST   | `/routines/generate`                          | Customer | ✅ Ready | Create routine (see survey-flow) |
| GET    | `/routines/me`                                | Customer | ✅ Ready | List static routines             |
| GET    | `/routines/:id`                               | Customer | ✅ Ready | Get one routine                  |

---

## 7. Response shapes

### 7.1 Today

```json
{
  "date": "2026-07-22",
  "period": "MORNING",
  "sessionState": "IN_PROGRESS",
  "routines": [
    {
      "id": "uuid",
      "type": "AI_RECOMMENDED",
      "status": "ACTIVE",
      "title": "Personalized routine",
      "description": "...",
      "sessionState": "IN_PROGRESS",
      "progress": {
        "completedCount": 2,
        "skippedCount": 1,
        "totalCount": 4,
        "completionRate": 50
      },
      "steps": [
        {
          "id": "uuid",
          "name": "Cleanser",
          "period": "MORNING",
          "stepOrder": 1,
          "instructions": "Tạo bọt, massage 1 phút",
          "waitMinutes": 0,
          "dosageText": "1 pump",
          "amountMl": 1.5,
          "protocolId": "uuid-or-null",
          "productVariant": {
            "id": "uuid",
            "name": "Gentle Cleanser",
            "sku": "SKU-1",
            "imageUrl": "https://placehold.co/400"
          },
          "status": "COMPLETED",
          "completedAt": "2026-07-22T03:15:00.000Z",
          "skipReason": null,
          "skipNote": null
        }
      ]
    }
  ]
}
```

### 7.2 History

```json
{
  "routineId": "uuid",
  "days": [
    { "date": "2026-07-20", "status": "COMPLETED", "completionRate": 100 },
    { "date": "2026-07-21", "status": "MISSED", "completionRate": 0 },
    { "date": "2026-07-22", "status": "PARTIAL", "completionRate": 50 }
  ],
  "summary": {
    "currentStreak": 0,
    "averageCompletionRate": 50
  }
}
```

### 7.3 Check-in

```json
{
  "id": "uuid",
  "routineId": "uuid",
  "checkInDate": "2026-07-22",
  "period": "MORNING",
  "overallMood": "OK",
  "acneLevel": 2,
  "oilLevel": 1,
  "rednessLevel": 0,
  "moistureLevel": 3,
  "completionRate": 75,
  "note": "Da bình thường",
  "sideEffects": [
    { "id": "uuid", "type": "ITCHING", "severity": 1, "note": null }
  ],
  "createdAt": "2026-07-22T04:00:00.000Z"
}
```

---

## 8. Error map

| HTTP | When                                                                   | FE handling                                  |
| ---- | ---------------------------------------------------------------------- | -------------------------------------------- |
| 400  | Invalid date; check-in not today; inactive routine; OTHER without note | Show validation message                      |
| 401  | Not authenticated                                                      | Re-login                                     |
| 403  | No customer profile / routine owned by someone else                    | Hide action / show forbidden                 |
| 404  | Routine or step not found                                              | Refresh Today                                |
| 409  | Flip complete↔skip; duplicate check-in for date+period                 | Toast: already recorded / already checked in |

---

## 9. Screen mapping

| Screen (Doc2)        | Primary API                                 | Notes                                               |
| -------------------- | ------------------------------------------- | --------------------------------------------------- |
| Today Routine (Home) | `GET /routines/me/today`                    | Drive Empty / Not Started / In Progress / Completed |
| Routine Step Detail  | Payload from Today (+ complete/skip)        | Images may be null until catalog media exists       |
| Daily Check-in       | `POST /routines/:id/check-ins`              | Partial progress allowed                            |
| Routine History      | `GET .../history` + `GET .../history/:date` | Calendar dots = `date` + `status`                   |
| Analytics (streak)   | `history.summary`                           | `currentStreak`, `averageCompletionRate`            |

Suggested FE state machine for Today card:

```
EMPTY ──(has ACTIVE)──▶ NOT_STARTED ──(first tick)──▶ IN_PROGRESS ──(all acted)──▶ COMPLETED
                              ▲                              │
                              └────────(new VN day)──────────┘
```

`MISSED` appears on **History** for previous idle days after the routine was activated.

---

## 10. Out of scope / later

| Topic                                                     | Status                                         |
| --------------------------------------------------------- | ---------------------------------------------- |
| Cron job to materialize MISSED rows                       | ❌ On-read derivation is enough for MVP        |
| Backdating completions / check-ins                        | ❌ Rejected in MVP                             |
| Expert override / locked ingredients alerts from check-in | ❌ Treatment module later                      |
| Support habits / reorder forecasts                        | ❌ Schema exists; no tracking APIs yet         |
| Product images on steps                                   | ✅ `imageUrl` from `product_variants.imageUrl` |

---

## Quick reference — client sequence

```
GET  /routines/me/today?period=MORNING
POST /routines/:routineId/steps/:stepId/complete     ← repeat per step
POST /routines/:routineId/steps/:stepId/skip         ← when needed
POST /routines/:routineId/check-ins                  ← after session (partial OK)
GET  /routines/:routineId/history?from=&to=
GET  /routines/:routineId/history/:date?period=
GET  /routines/:routineId/check-ins?from=&to=        ← optional list
```

**Generate routine first (if empty):** see [survey-flow.md](survey-flow.md) → `POST /routines/generate` → then return here.
