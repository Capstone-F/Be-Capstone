# Guest Survey → Recommendations Integration Guide

End-to-end guide for integrating GlowScan’s **unauthenticated skincare survey → product recommendations → claim on login** flow.

Guests can take the survey and see suggested products **without an account**. After they register or log in, the client **claims** the guest session so surveys, skin type, allergies, and recommendation snapshots move onto their Customer profile.

**This flow does not include purchase.** Cart, checkout, payment, routines, and face-scan require a logged-in Customer — continue with [Survey → Purchase → Routine](survey-flow.md) after claim (or if the user was already logged in).

**Auth (register / login) for claim:**

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`)
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens

See also: [Survey flow](survey-flow.md) · [User Management & RBAC](users.md)

---

## Status legend

| Marker   | Meaning                                  |
| -------- | ---------------------------------------- |
| ✅ Ready | Controller + service exist; usable today |

---

## Table of Contents

1. [Flow overview](#1-flow-overview)
2. [Base URL & guest auth](#2-base-url--guest-auth)
3. [What guests can and cannot do](#3-what-guests-can-and-cannot-do)
4. [Step-by-step integration](#4-step-by-step-integration)
5. [Claim on login](#5-claim-on-login)
6. [Endpoint checklist](#6-endpoint-checklist)
7. [Request / response shapes](#7-request--response-shapes)
8. [Client storage & errors](#8-client-storage--errors)
9. [Domain notes](#9-domain-notes)

---

## 1. Flow overview

```
┌──────────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Start as guest   │──▶│ Questions +     │──▶│ Complete     │──▶│ Recommendations  │
│ (optional DOB /  │   │ answers         │   │ survey       │   │ (product snapshot│
│  gender / allergy│   │ (X-Guest-Token) │   │ (+ skin type)│   │  via guest token)│
└──────────────────┘   └─────────────────┘   └──────────────┘   └────────┬─────────┘
  ✅ Ready               ✅ Ready               ✅ Ready                   │
                                                                          ▼
                                                            ┌──────────────────┐
                                                            │ Login / register │
                                                            │ POST /surveys/   │
                                                            │ claim            │
                                                            └────────┬─────────┘
                                                                     │ ✅ Ready
                                                                     ▼
                                                            Logged-in Customer
                                                            (then survey-flow
                                                             cart → routine)
```

**Happy path:**

1. Start survey with no auth → store returned `guestToken`.
2. Optionally send DOB / gender / allergies on start (guests have no `/customers/me`).
3. List questions, submit answers, complete — always send `X-Guest-Token`.
4. Fetch `GET /recommendations/latest` with the same header.
5. Prompt login / register → call `POST /surveys/claim` with the stored token.
6. From here, use the authenticated survey / cart / routine path in [survey-flow.md](survey-flow.md).

---

## 2. Base URL & guest auth

| Environment | Path prefix | Example                                   |
| ----------- | ----------- | ----------------------------------------- |
| Development | none        | `http://localhost:3000/surveys`           |
| Production  | `/api`      | `https://host/api/recommendations/latest` |

### Guest token

| Item        | Detail                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| Header name | `X-Guest-Token`                                                        |
| Issued by   | `POST /surveys` when the request has **no** session cookie / Bearer    |
| Lifetime    | **30 days** from issue                                                 |
| Storage     | Client only (localStorage / secure storage). Backend stores a **hash** |
| Prefer auth | If session/Bearer is present, that identity wins over the guest header |

```http
X-Guest-Token: <guestToken from POST /surveys>
```

Web SPA and mobile use the same header. No CORS cookie is required for guest-only calls.

---

## 3. What guests can and cannot do

| Capability                         | Guest                         | Logged-in Customer |
| ---------------------------------- | ----------------------------- | ------------------ |
| Start survey                       | ✅                            | ✅                 |
| List / answer / complete questions | ✅                            | ✅                 |
| Get recommendation snapshot        | ✅                            | ✅                 |
| Face-scan (`POST .../face-scan`)   | ❌                            | ✅                 |
| Claim guest survey                 | ❌ (caller must be logged in) | ✅                 |
| Cart / order / payment / routine   | ❌                            | ✅                 |
| `GET /products/suggestion`         | ❌                            | ✅                 |

Face-scan with only `X-Guest-Token` (no session/Bearer) returns **401**.

---

## 4. Step-by-step integration

### 4.1 Start survey as guest ✅

```http
POST /surveys
Content-Type: application/json

{
  "dateOfBirth": "1995-06-15",
  "gender": "FEMALE",
  "allergyCodes": ["FRAGRANCE"]
}
```

All body fields are optional. Empty body `{}` is valid.

**Response (201)** — note `guestToken` (only on guest create; do not expect it on authenticated starts):

```json
{
  "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "isCompleted": false,
  "completedAt": null,
  "faceImageUrl": null,
  "faceScannedAt": null,
  "faceLabels": [],
  "answers": [],
  "createdAt": "2026-08-04T12:00:00.000Z",
  "guestToken": "a1b2c3d4e5f6..."
}
```

**Client:** persist `guestToken` and `id` (survey id) for the rest of the flow.

### 4.2 List questions ✅

First load (CORE questions only — no token required):

```http
GET /surveys/questions
```

After starting and submitting answers, fetch the progressive cumulative batch:

```http
GET /surveys/questions?surveyId=<surveyId>
X-Guest-Token: <guestToken>
```

Response is cumulative: answered questions first, then up to 10 unlocked unanswered questions appended at the end. Unlocked `CONDITIONAL` questions come from current labels (skip-friendly — CORE need not all be answered). Without token/auth, `surveyId` returns **401**.

### 4.3 Submit answers ✅

```http
POST /surveys/<surveyId>/answers
X-Guest-Token: <guestToken>
Content-Type: application/json

{
  "answers": [
    {
      "questionId": "<uuid>",
      "labelCodes": ["ACNE"],
      "value": null
    }
  ]
}
```

Same payload shape as the authenticated survey flow ([survey-flow.md](survey-flow.md) §4).

### 4.4 Complete survey ✅

```http
POST /surveys/<surveyId>/complete
X-Guest-Token: <guestToken>
```

Requires ≥1 answer. Derives Baumann skin type onto the **guest** Customer row.

### 4.5 Get recommendations ✅

```http
GET /recommendations/latest
X-Guest-Token: <guestToken>
```

Same response as the logged-in path: protocols, ranked product variants, conflicts. Snapshot is persisted against the guest Customer.

If the survey is not completed → **400**  
`Complete a skincare survey before requesting recommendations`

### 4.6 (Optional) Re-read survey ✅

```http
GET /surveys/<surveyId>
X-Guest-Token: <guestToken>
```

---

## 5. Claim on login

After OAuth / password login (or mobile token exchange), call claim **once** with the stored guest token.

```http
POST /surveys/claim
Content-Type: application/json
Cookie: sid=...                    # web
Authorization: Bearer <accessToken> # mobile

{
  "guestToken": "a1b2c3d4e5f6..."
}
```

**Requires** Customer role + valid session/Bearer. Guest header alone is not enough.

### What claim merges

| Data                     | Behavior                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| Surveys                  | Reassigned to the authenticated Customer                                  |
| Recommendation snapshots | Reassigned                                                                |
| Skin type details        | Moved if auth Customer has none; otherwise guest’s copy is dropped        |
| Allergies                | Union by label (auth keeps existing; guest adds missing)                  |
| DOB / gender             | Copied onto auth Customer only when auth DOB is empty / gender is default |

Guest Customer row is deleted after merge. Token cannot be reused.

**Suggested client sequence:**

1. User finishes guest recommendations UI → CTA “Save results / Buy” → login.
2. On auth success, if `guestToken` is still in storage → `POST /surveys/claim`.
3. Clear `guestToken` from storage.
4. Optionally `GET /recommendations/latest` (now with session) to refresh UI.
5. Continue to SURVEY cart only when logged in ([survey-flow.md](survey-flow.md)).

Claim is **not** automatic inside `/auth/callback` — the client must call it.

---

## 6. Endpoint checklist

| Step               | Method | Path                      | Auth                        | Status   |
| ------------------ | ------ | ------------------------- | --------------------------- | -------- |
| Start guest survey | POST   | `/surveys`                | None (returns `guestToken`) | ✅ Ready |
| List questions     | GET    | `/surveys/questions`      | None / token if `surveyId`  | ✅ Ready |
| Get survey         | GET    | `/surveys/:id`            | `X-Guest-Token` or Customer | ✅ Ready |
| Submit answers     | POST   | `/surveys/:id/answers`    | `X-Guest-Token` or Customer | ✅ Ready |
| Complete survey    | POST   | `/surveys/:id/complete`   | `X-Guest-Token` or Customer | ✅ Ready |
| Recommendations    | GET    | `/recommendations/latest` | `X-Guest-Token` or Customer | ✅ Ready |
| Claim after login  | POST   | `/surveys/claim`          | Customer session/Bearer     | ✅ Ready |
| Face-scan          | POST   | `/surveys/:id/face-scan`  | Customer **only**           | ✅ Ready |

---

## 7. Request / response shapes

### Start body (`StartSurveyDto`)

| Field          | Type       | Required | Notes                                     |
| -------------- | ---------- | -------- | ----------------------------------------- |
| `dateOfBirth`  | `string`   | no       | ISO date `YYYY-MM-DD`; not in the future  |
| `gender`       | enum       | no       | `MALE` \| `FEMALE` \| `NOT_PREFER_TO_SAY` |
| `allergyCodes` | `string[]` | no       | Active `ALLERGY` category label codes     |

### Claim body (`ClaimGuestSurveyDto`)

| Field        | Type     | Required |
| ------------ | -------- | -------- |
| `guestToken` | `string` | yes      |

### Survey response

Same as authenticated surveys, plus optional:

| Field        | When present                                       |
| ------------ | -------------------------------------------------- |
| `guestToken` | Only on `POST /surveys` for unauthenticated starts |

`faceImageUrl` / `faceLabels` stay empty for guests (no face-scan).

---

## 8. Client storage & errors

### Storage recommendations

| Key          | Where                      | Clear when                          |
| ------------ | -------------------------- | ----------------------------------- |
| `guestToken` | localStorage / SecureStore | After successful claim or expiry UX |
| `surveyId`   | Same                       | After claim or new guest start      |

Do not put the guest token in query strings or shareable URLs.

### Common errors

| Status | When                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| 401    | Missing token/auth on owned routes; invalid/expired guest token; face-scan without login |
| 400    | Complete with no answers; claim with empty token; invalid allergies/DOB                  |
| 403    | Authenticated user without Customer role                                                 |
| 404    | Survey id not owned by this guest/user                                                   |

Expired token message: `Guest token expired` — start a new guest survey.

---

## 9. Domain notes

- Guest identity is a **Customer** row with `userId = null` and a hashed `guestTokenHash` (TTL 30 days). No Keycloak / `User` row is created until login.
- Rule engine and recommendation snapshot code paths are the same as for logged-in customers; only ownership resolution differs.
- If the user is **already logged in**, `POST /surveys` does **not** return `guestToken` — use the normal authenticated flow.
- Prefer sending profile fields on guest start so age/gender/allergy filtering matches logged-in quality.
- After claim, purchase and routine generation follow [survey-flow.md](survey-flow.md) (SURVEY cart → order → payment → `POST /routines/generate`).
