# Real-time Communication Flow (Video & Chat)

Guide for **Web** and **Mobile** clients to integrate GlowScan consultation **video calls** and **1:1 in-app chat** with this backend.

The BE does **not** proxy media or messages. It authenticates the caller, checks booking membership, and returns **ZegoCloud Token04** credentials. Clients join Zego Express (video) and ZIM (chat) directly.

Booking lifecycle context: [Consultation Flow](consultation-flow.md).

**Auth:**

- [Web Authentication Guide](auth-web.md) — session cookie `sid`
- [Mobile Authentication Guide](auth-mobile.md) — `Authorization: Bearer <accessToken>`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Base URL & auth](#3-base-url--auth)
4. [When to fetch tokens](#4-when-to-fetch-tokens)
5. [Video token](#5-video-token)
6. [Chat token](#6-chat-token)
7. [Client integration steps](#7-client-integration-steps)
8. [User ID & naming rules](#8-user-id--naming-rules)
9. [Errors](#9-errors)
10. [Security notes](#10-security-notes)
11. [Quick checklist](#11-quick-checklist)

---

## 1. Overview

```
Customer / Expert app
        │
        │  GET /consultations/:bookingId/video-token
        │  GET /consultations/:bookingId/chat-token
        │       (cookie sid  or  Bearer accessToken)
        ▼
   GlowScan API
        │  mint Token04 (ZEGO_APP_ID + ZEGO_SERVER_SECRET)
        │  resolve peer for chat
        ▼
   Response → client initializes Zego SDK(s)
        │
        ├── Video: join roomID = consult_{bookingId}
        └── Chat:  ZIM login → message peerUserID only
```

| Channel | Zego product      | Token endpoint                              | Access control on BE                                    |
| ------- | ----------------- | ------------------------------------------- | ------------------------------------------------------- |
| Video   | Express / RTC     | `GET /consultations/:bookingId/video-token` | Membership + token payload scoped to `roomID`           |
| Chat    | ZIM (In-app Chat) | `GET /consultations/:bookingId/chat-token`  | Membership + only reveal correct `peerUserID` (no room) |

Both channels reuse the **same** ZegoCloud App ID / Server Secret. Tokens TTL = **7200 seconds** (2 hours). Refresh by calling the endpoint again before expiry.

**MVP:** message history is retained by **ZegoCloud ZIM**. There is no GlowScan “list messages” API for launch.

---

## 2. Prerequisites

| Requirement                           | Notes                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Authenticated customer or expert      | Same auth as bookings ([auth-web.md](auth-web.md) / [auth-mobile.md](auth-mobile.md))               |
| Booking id (`ConsultationRequest.id`) | From `POST /bookings` or `GET /bookings/me`                                                         |
| Caller is on that booking             | Customer owner **or** assigned expert — otherwise `403`                                             |
| Server env                            | `ZEGO_APP_ID`, `ZEGO_SERVER_SECRET` (32-byte string). Missing → `503`                               |
| Zego Console                          | Same project: Video **and** In-app Chat (ZIM) enabled under Service Management                      |
| Client SDKs                           | Zego Express (video) + ZIM SDK for your platform (Web / iOS / Android / Flutter / RN as applicable) |

Clients **never** receive or store `ZEGO_SERVER_SECRET`.

---

## 3. Base URL & auth

| Environment | Path prefix | Example                                                      |
| ----------- | ----------- | ------------------------------------------------------------ |
| Development | none        | `http://localhost:3001/consultations/<bookingId>/chat-token` |
| Production  | `/api`      | `https://host/api/consultations/<bookingId>/chat-token`      |

| Client  | How to call                                  |
| ------- | -------------------------------------------- |
| Web SPA | `credentials: 'include'` (cookie `sid`)      |
| Mobile  | Header `Authorization: Bearer <accessToken>` |

`bookingId` must be a UUID (`ParseUUIDPipe`). Use the booking’s `id` field from the bookings API — there is no separate “consultation id”.

---

## 4. When to fetch tokens

Suggested product timing (BE does **not** currently enforce booking status on token routes):

| Stage                            | Suggested UX                                              |
| -------------------------------- | --------------------------------------------------------- |
| `PENDING` (unpaid / unconfirmed) | Hide call / chat, or show disabled                        |
| `CONFIRMED`                      | Allow pre-session chat; optionally allow early video join |
| `IN_PROGRESS`                    | Primary window for video + chat                           |
| `COMPLETED` / `CANCELLED`        | End Zego session; stop minting for new joins in UX        |

Always fetch a **fresh** token when opening the screen (or when TTL is near expiry). Do not persist tokens long-term on disk.

---

## 5. Video token

### Request

```http
GET /consultations/<bookingId>/video-token
```

Web: session cookie. Mobile: Bearer token.

### Response `200` (`VideoTokenResponseDto`)

```json
{
  "appID": 123456,
  "token": "04AAAA...",
  "roomID": "consult_9f21a000-0000-4000-8000-000000000001",
  "userID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "userName": "Nguyen Van A"
}
```

| Field      | Use                                                         |
| ---------- | ----------------------------------------------------------- |
| `appID`    | Zego Express `createEngine` / login                         |
| `token`    | Token04 for this `userID`                                   |
| `roomID`   | **Must** join this room — pattern `consult_{bookingId}`     |
| `userID`   | App `User.id` UUID — pass unchanged to Zego                 |
| `userName` | Display name (falls back to `userID` if profile name empty) |

Token payload (server-side) includes room privilege for login + publish on that `roomID`. Clients should still join only the returned `roomID`.

### Client sketch (conceptual)

1. `GET .../video-token`
2. Init Express engine with `appID`
3. Login room with `userID`, `userName`, `token`, `roomID`
4. Publish local preview / stream; play remote streams in the same room
5. On leave / complete: logout room and destroy engine as per SDK docs

---

## 6. Chat token

### Request

```http
GET /consultations/<bookingId>/chat-token
```

### Response `200` (`ChatTokenResponseDto`)

```json
{
  "appID": 123456,
  "token": "04AAAA...",
  "userID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "userName": "Nguyen Van A",
  "peerUserID": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "peerUserName": "Dr. Tran B"
}
```

| Field                         | Use                                                  |
| ----------------------------- | ---------------------------------------------------- |
| `appID`                       | ZIM create / login                                   |
| `token`                       | Token04 with **empty** payload (no room restriction) |
| `userID` / `userName`         | Local ZIM user                                       |
| `peerUserID` / `peerUserName` | The **other** party on this booking only             |

**Peer resolution:**

| Caller   | `peerUserID`         |
| -------- | -------------------- |
| Customer | Expert’s `User.id`   |
| Expert   | Customer’s `User.id` |

If the peer cannot be resolved (e.g. no expert assigned), the API returns **`409`** — never a body with `peerUserID: null`.

### Client sketch (conceptual)

1. `GET .../chat-token`
2. Create ZIM instance with `appID`
3. Login with `userID`, `userName`, `token`
4. Open / send to a **peer-to-peer** conversation with `peerUserID` only
5. Do **not** invent other peer IDs; do not broadcast to arbitrary users
6. History: use ZIM local/cloud history APIs as needed — GlowScan does not store messages for MVP

---

## 7. Client integration steps

### Web SPA

```ts
// Example: fetch chat token (cookie session)
const res = await fetch(`${API_BASE}/consultations/${bookingId}/chat-token`, {
  credentials: 'include',
});
if (!res.ok) throw new Error(await res.text());
const { appID, token, userID, userName, peerUserID, peerUserName } =
  await res.json();

// Then: ZIM.create({ appID }) → login({ userID, userName }, token)
// → send to peerUserID
```

Video is the same pattern against `/video-token`; use `roomID` when joining Express.

### Mobile (Expo / RN)

```ts
const res = await fetch(`${API_BASE}/consultations/${bookingId}/video-token`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const { appID, token, roomID, userID, userName } = await res.json();
// Pass into native / RN Zego Express bindings
```

### Parallel fetch

Video and chat tokens are independent. You may request both when entering the consultation screen:

```http
GET /consultations/<bookingId>/video-token
GET /consultations/<bookingId>/chat-token
```

Use the same `userID` for both SDKs (always the authenticated app user).

---

## 8. User ID & naming rules

| Rule          | Detail                                                         |
| ------------- | -------------------------------------------------------------- |
| Zego `userID` | Exactly the GlowScan `User.id` UUID from auth / token response |
| No prefixes   | Do not prepend `u_`, email, or Keycloak `sub`                  |
| Display names | Prefer `userName` / `peerUserName` from token response         |
| Room          | Only `roomID` from video-token (`consult_{bookingId}`)         |
| Chat peers    | Only `peerUserID` from chat-token for that `bookingId`         |

Booking list fields like `customerId` / `expertId` are **profile** IDs (`Customer.id` / `Expert.id`), **not** Zego user IDs. Always use token `userID` / `peerUserID`.

---

## 9. Errors

| Situation                                               | HTTP | Typical message                                                  |
| ------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| Not logged in                                           | 401  | `Not authenticated`                                              |
| `bookingId` not a UUID                                  | 400  | Validation pipe                                                  |
| Booking missing                                         | 404  | `Booking … not found`                                            |
| Caller not customer or expert on booking                | 403  | Only assigned customer/expert may join call / open chat          |
| Chat peer missing (e.g. no expert)                      | 409  | `No expert assigned to this booking yet`                         |
| `ZEGO_APP_ID` / `ZEGO_SERVER_SECRET` missing or invalid | 503  | `ZegoCloud is not configured …` / secret length / invalid app id |

**FE handling tips:**

- `403` → hide chat/call UI; user opened someone else’s booking.
- `409` on chat → show “Waiting for expert assignment” (should be rare once bookings always have an expert).
- `503` → show “Realtime unavailable”; check server env / Zego Console.

---

## 10. Security notes

1. **Never** embed `ZEGO_SERVER_SECRET` in Web, Mobile, or CI client builds.
2. Tokens are bearer credentials for Zego — treat like short-lived secrets; prefer memory over long-lived storage.
3. Access control for chat is **peer revelation**: if a client ignores `peerUserID` and messages another UUID, that is a client bug; BE only guarantees the correct peer is returned to authorized callers.
4. Video room privilege is bound in Token04 to `consult_{bookingId}` — always join the returned `roomID`.
5. Rotate / re-fetch tokens on `401` from Zego or near the 2h TTL.

---

## 11. Quick checklist

- [ ] Auth works (cookie or Bearer) against bookings APIs
- [ ] Know `bookingId` for the active consultation
- [ ] Zego Console: Video + In-app Chat enabled on the **same** App ID as the API
- [ ] `GET .../video-token` → join Express with `roomID`
- [ ] `GET .../chat-token` → ZIM login → message `peerUserID` only
- [ ] Handle `403` / `409` / `503`
- [ ] Refresh tokens before 2h expiry
- [ ] On session end (`complete` / leave UI): logout Zego room / ZIM

Related: [consultation-flow.md](consultation-flow.md) §7 Real-time communication.
