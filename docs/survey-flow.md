# Survey → Recommendation → Purchase → Routine Integration Guide

End-to-end guide for integrating GlowScan’s **personalized survey → ingredient protocols → recommended products → SURVEY cart → order → payment → AI skincare routine** flow with this backend.

The **final deliverable of this flow is a personalized routine** (`POST /routines/generate` → `GET /routines/me`). Purchasing recommended products is the required middle step: the routine is built from the paid survey order’s products.

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

**After cart creation:** reuse the shared checkout stack in [E-Commerce Integration Guide](ecommerce-flow.md) (order → shipping → VNPay → tracking), then return here for routine generation.

See also: [Guest Survey → Recommendations](guest-survey-flow.md) · [VNPay Payment Integration](payments.md) · [User Management & RBAC](users.md) · [Routine Tracking](routine-tracking-flow.md) (Today / check-in / history after generate) · [Mock vs Ollama routines](llm-routine-mock-vs-ollama.md)

---

## Status legend

| Marker     | Meaning                                                       |
| ---------- | ------------------------------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today                      |
| ❌ Missing | Not implemented yet (needed for dynamic / full question bank) |
| 🔶 Extend  | Endpoint exists but must change for the target UX             |

---

## Table of Contents

1. [Flow overview](#1-flow-overview)
2. [Base URL & auth](#2-base-url--auth)
3. [Prerequisites — base profile](#3-prerequisites--base-profile)
4. [Step-by-step integration](#4-step-by-step-integration)
5. [Endpoint checklist](#5-endpoint-checklist)
6. [Domain model](#6-domain-model)
7. [Question bank design (target)](#7-question-bank-design-target)
8. [Rule engine notes](#8-rule-engine-notes)
9. [Cart, combo discount & checkout](#9-cart-combo-discount--checkout)
10. [Remaining gaps & implementation roadmap](#10-remaining-gaps--implementation-roadmap)

---

## 1. Flow overview

```
┌──────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Base profile │──▶│ Survey session  │──▶│ Complete     │──▶│ Rule engine      │
│ (age, gender,│   │ + answers       │   │ survey       │   │ → protocols      │
│  allergies)  │   │ (label codes)   │   │ (+ skin type)│   │ → products       │
└──────────────┘   └─────────────────┘   └──────────────┘   └────────┬─────────┘
  ✅ Ready         ✅ Ready (L1/L2)         ✅ Ready                   ▼
                                                            ┌──────────────────┐
                                                            │ Recommendation   │
                                                            │ snapshot         │
                                                            └────────┬─────────┘
                                                                     │ ✅ Ready
                                                                     ▼
┌──────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Routine (AI) │◀──│ Payment + ship  │◀──│ Order        │◀──│ SURVEY cart      │
│ FINAL STEP   │   │ (VNPay)         │   │ source=SURVEY│   │ + combo discount │
└──────────────┘   └─────────────────┘   └──────────────┘   └──────────────────┘
  ✅ Ready           ✅ (ecommerce-flow)   ✅ Ready           ✅ Ready
```

**Happy path (ends with a routine):**

1. Customer already has a **base profile** (age / DOB, gender, allergies). Baumann skin type may be missing and is **derived on survey complete**.
2. Start a survey session → fetch questions (with answer options / labels).
3. Submit answers as **label codes** (plus optional free text).
4. Complete the survey → backend derives and saves Baumann skin type from answer labels.
5. Fetch recommendations → rule engine matches **ingredient protocols** → maps to ranked **product variants** (stock + allergy filtered) → persists an immutable snapshot.
6. User reviews protocols + products → adds selected variants to cart with `source: SURVEY` + `surveyRecommendationId`.
7. Create order from cart (`source: SURVEY`). If **subtotal > admin min threshold** (default 300,000 VND), apply survey combo discount.
8. Attach shipping → VNPay checkout → wait until order is `PAID`.
9. **Generate the AI routine** with `POST /routines/generate` (`orderId` of the paid survey order), then show it via `GET /routines/me` (or the generate response). This is the **end state** of the survey flow.

> **Important split:**
>
> - **Base profile** = who the user is (stored on `Customer` / Baumann details).
> - **Survey** = concern / lifestyle / goal signals as **labels**.
> - **Rule engine** = labels + skin type → ranked **ingredient protocols**.
> - **Recommendation** = protocols → **ranked product variants** per protocol (snapshot; stock + allergy filtered).
> - **Cart / order** = commerce with `source: SURVEY` (funds the products used in the routine).
> - **Routine** = morning/evening steps tied to purchased variants — the **product outcome** of this flow.

There is also a lighter path: `GET /products/suggestion` ranks products from **profile only** (no completed survey required). That is **not** the survey purchase flow and does **not** create a `SurveyRecommendation` snapshot.

---

## 2. Base URL & auth

| Environment | Path prefix | Example                         |
| ----------- | ----------- | ------------------------------- |
| Development | none        | `http://localhost:3000/surveys` |
| Production  | `/api`      | `https://host/api/surveys`      |

**Calling protected routes:**

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

Survey and recommendations accept either an authenticated **Customer** **or** a guest token (`X-Guest-Token`). Cart, orders, payment checkout, routines, and **face-scan** require an authenticated Customer.

## **Guest / not-logged-in survey:** full client integration (token header, start → recommend → claim on login, what guests cannot do) lives in **[Guest Survey → Recommendations](guest-survey-flow.md)**.

## 3. Prerequisites — base profile

The survey flow assumes the customer has already completed onboarding / base profile. Rule engine **merges** profile-derived labels (age group, gender) with survey answer labels.

| Method | Path                   | Auth              | Status   |
| ------ | ---------------------- | ----------------- | -------- |
| GET    | `/customers/me`        | Customer          | ✅ Ready |
| PATCH  | `/customers/me`        | Customer          | ✅ Ready |
| GET    | `/customers/allergies` | Public / Customer | ✅ Ready |

Typical base fields used downstream:

| Field           | Used for                                                             |
| --------------- | -------------------------------------------------------------------- |
| `dateOfBirth`   | Age group labels (`UNDER_18`, `AGE_18_25`, …)                        |
| `gender`        | Gender labels                                                        |
| `allergies`     | Safety filtering (product suggestion **and** survey recommendations) |
| `skinType`      | Baumann 16-type code (e.g. `OSPW`); includes optional `description`  |
| `baumannScores` | Axis scores (O/D, S/R, P/N, W/T)                                     |

```http
GET /customers/me
```

Example (shape abbreviated):

```json
{
  "customer": {
    "id": "...",
    "gender": "FEMALE",
    "dateOfBirth": "1998-05-12",
    "skinType": {
      "code": "OSPT",
      "name": "...",
      "description": null
    },
    "baumannScores": {
      "oilyDryScore": 72,
      "sensitiveResistantScore": 65,
      "pigmentedNonPigmentedScore": 58,
      "wrinkledTightScore": 30,
      "assessedAt": "..."
    }
  },
  "allergies": [{ "id": "...", "code": "FRAGRANCE", "name": "Fragrance" }],
  "surveyHistory": []
}
```

**Client gate (recommended):** before starting a survey, ensure **DOB + gender** exist. Skin type is **optional** at start — it is derived and written on `POST /surveys/:id/complete`. After complete, call `GET /customers/me` if the UI needs the updated Baumann type / scores.

> Baumann type lives on the **customer profile**, not on `CustomerSurvey`. Do **not** ask the user “Are you OSPT or DSPW?” — infer axes from survey labels on complete and store the type on the profile.

---

## 4. Step-by-step integration

### 4.1 List survey questions ✅ Ready

Returns active L1 **CORE** questions with selectable label options (no `surveyId`).
After starting a survey and submitting answers, re-fetch with `surveyId` for the
progressive cumulative batch (skip-friendly).

| Method | Path                                 | Auth                   | Status   |
| ------ | ------------------------------------ | ---------------------- | -------- |
| GET    | `/surveys/questions`                 | Public                 | ✅ Ready |
| GET    | `/surveys/questions?surveyId=<uuid>` | Customer / guest token | ✅ Ready |

```http
GET /surveys/questions
```

```http
GET /surveys/questions?surveyId=<current-survey-uuid>
```

Response shape (`SurveyQuestionDto[]`):

```json
[
  {
    "id": "...",
    "code": "ENVIRONMENT_EXPOSURE",
    "text": "Môi trường bạn tiếp xúc nhiều nhất là gì?",
    "questionType": "MULTI_SELECT",
    "displayOrder": 1,
    "priority": "CORE",
    "category": "LIFESTYLE",
    "options": [
      {
        "labelCode": "HOT_HUMID",
        "name": "Hot Humid Climate",
        "description": "Lives or spends time in hot, humid conditions",
        "vietnameseNormalized": "Sống/tiếp xúc khí hậu nóng ẩm"
      },
      {
        "labelCode": "AIR_CONDITIONED_ENVIRONMENT",
        "name": "Air-conditioned Environment",
        "description": "...",
        "vietnameseNormalized": "Ngồi điều hòa/máy lạnh liên tục"
      }
    ]
  }
]
```

**Progressive contract (`?surveyId=`):**

- Each response is **cumulative**: answered questions first (`displayOrder` ASC), then up to **10** unanswered questions **appended at the end** (combined list is not re-sorted)
- Next batch priority: unlocked unanswered `CONDITIONAL` (from current labels / DOB) first, then fill remaining slots with unanswered `CORE`; if no unlocked `CONDITIONAL`, use `OPTIONAL` then fill with unanswered `CORE`
- **Skip-and-continue:** omit answers for some questions (including CORE); re-fetch still unlocks `CONDITIONAL` from whatever labels exist so far
- `OPTIONAL` is not blocked by unanswered CORE; it is withheld only while unlocked unanswered `CONDITIONAL` remain
- Select options by `questionId` on the survey answers API (not by shared label codes alone)

**Locale contract:** `name` / `description` are English; `vietnameseNormalized` is the Vietnamese display name (nullable). Prefer `vietnameseNormalized` for VI UI when present, otherwise fall back to `name`.

Without `surveyId`, only `CORE` questions are returned. Submitted labels are validated against the question's active options.

---

### 4.2 Start a survey session ✅ Ready

Creates an in-progress `CustomerSurvey` for the authenticated customer.

| Method | Path       | Auth     | Status   |
| ------ | ---------- | -------- | -------- |
| POST   | `/surveys` | Customer | ✅ Ready |

```http
POST /surveys
```

Response:

```json
{
  "id": "<survey-uuid>",
  "isCompleted": false,
  "completedAt": null,
  "answers": [],
  "createdAt": "..."
}
```

Store `id` for answer submission and completion.

---

### 4.3 Submit answers ✅ Ready

Upserts answers for an in-progress survey. Each answer attaches one or more **label codes** (the signals the rule engine consumes).

| Method | Path                   | Auth     | Status   |
| ------ | ---------------------- | -------- | -------- |
| POST   | `/surveys/:id/answers` | Customer | ✅ Ready |

```http
POST /surveys/<surveyId>/answers
Content-Type: application/json

{
  "answers": [
    {
      "questionId": "<question-uuid>",
      "value": "Optional free-text note",
      "labelCodes": ["ACNE", "BLACKHEADS"]
    },
    {
      "questionId": "<question-uuid>",
      "labelCodes": ["ACNE_TREATMENT", "OIL_CONTROL"]
    },
    {
      "questionId": "<question-uuid>",
      "labelCodes": ["HIGH_STRESS", "AIR_CONDITIONED_ENVIRONMENT"]
    }
  ]
}
```

**Rules:**

- Survey must be owned by the caller and **not** completed.
- `questionId` must reference an active question.
- Every `labelCodes[]` entry must be an active `labels.code`.
- Re-submitting the same `questionId` replaces previous labels for that answer.
- You may call this endpoint multiple times (progressive answering).

Response = full `SurveyResponseDto` including saved `answers[].labels` (`code`, `name`, optional `vietnameseNormalized`).

---

### 4.3b Face scan (optional) ✅ Ready

Upload a facial image for the in-progress survey. The backend stores the image in R2 on the survey, runs the skin-vision provider (`LLM_PROVIDER=mock` by default, `ollama` with `OLLAMA_VISION_MODEL`, or `gemini` with `GEMINI_MODEL`), and attaches **face labels** used later as a lower-weight OPTIONAL boost in the rule engine.

| Method    | Path | Auth                     | Status               |
| --------- | ---- | ------------------------ | -------------------- | -------- |
| Face scan | POST | `/surveys/:id/face-scan` | Customer (not guest) | ✅ Ready |

```http
POST /surveys/<surveyId>/face-scan
Content-Type: multipart/form-data

file=<facial-image.jpeg>
```

| Constraint | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| MIME       | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif` |
| Max size   | 5 MB                                                                             |

**Rules:**

- Survey must be owned by the caller and **not** completed.
- Image is **always persisted** on the survey (`faceImageUrl`, `faceScannedAt`) even if AI returns no labels.
- Re-scanning replaces the stored image and face labels.
- Unknown AI label codes are dropped (logged); only active taxonomy codes are saved.
- Each face label includes a short AI **`explanation`** of visual evidence (Vietnamese, ≤200 chars).
- Face labels do **not** affect Baumann derivation on complete (answers only).

**Providers:**

| `LLM_PROVIDER`   | Behavior                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| `mock` (default) | Deterministic labels + explanations from image URL hash                          |
| `ollama`         | Multimodal model (`OLLAMA_VISION_MODEL`, default `llava`) via Ollama `/api/chat` |
| `gemini`         | Gemini multimodal (`GEMINI_MODEL`, default `gemini-2.5-flash-lite`)              |
| `openai`         | Not implemented (503)                                                            |

Example response fields:

```json
{
  "id": "<survey-uuid>",
  "faceImageUrl": "https://cdn.example.com/images/....jpg",
  "faceScannedAt": "2026-08-03T12:00:00.000Z",
  "faceLabels": [
    {
      "code": "ACNE",
      "name": "Acne",
      "vietnameseNormalized": "Mụn",
      "explanation": "Có nhiều nốt viêm đỏ dọc vùng chữ T, phù hợp với tình trạng mụn."
    }
  ],
  "answers": [],
  "isCompleted": false
}
```

---

### 4.4 Read survey session ✅ Ready

| Method | Path           | Auth     | Status   |
| ------ | -------------- | -------- | -------- |
| GET    | `/surveys/:id` | Customer | ✅ Ready |

```http
GET /surveys/<surveyId>
```

---

### 4.5 Complete survey ✅ Ready

Marks the session completed. Requires **at least one** answer.

| Method | Path                    | Auth     | Status   |
| ------ | ----------------------- | -------- | -------- |
| POST   | `/surveys/:id/complete` | Customer | ✅ Ready |

```http
POST /surveys/<surveyId>/complete
```

```json
{
  "id": "...",
  "isCompleted": true,
  "completedAt": "2026-07-17T12:00:00.000Z",
  "answers": [ ... ],
  "createdAt": "..."
}
```

Completion alone does **not** create product recommendations. Call the recommendations endpoint next.

**Side effect on complete:** the backend derives Baumann skin type from the survey’s answer labels (O/D, S/R, P/N, W/T axes), persists `CustomerSkinTypeDetails` (including axis scores + `assessedAt`), and falls back to `ORNT` if the computed code is missing from seed. Re-fetch `GET /customers/me` to show the updated type in the client.

---

### 4.6 Get recommendations (protocols + products) ✅ Ready

Runs the rule engine against the **latest completed survey** + customer profile, maps matched protocols to catalog products, and persists an **immutable** `SurveyRecommendation` snapshot (one per survey).

| Method | Path                      | Auth     | Status   |
| ------ | ------------------------- | -------- | -------- |
| GET    | `/recommendations/latest` | Customer | ✅ Ready |

```http
GET /recommendations/latest
```

Response (abbreviated):

```json
{
  "id": "<recommendation-uuid>",
  "customerSurveyId": "<survey-uuid>",
  "customerProfile": {
    "age": 28,
    "gender": "FEMALE",
    "skinTypeCode": "OSPT",
    "skinTypeName": "..."
  },
  "labels": [
    { "id": "...", "code": "ACNE", "name": "Acne", "categoryId": "..." }
  ],
  "protocols": [
    {
      "id": "...",
      "code": "BHA_2PCT_PM",
      "name": "BHA 2% Evening Protocol",
      "ingredientName": "Salicylic Acid",
      "concentrationPct": 2,
      "timePerWeek": 3.5,
      "timeOfUse": "PM",
      "durationWeeks": 8,
      "instructions": "...",
      "matchScore": 3,
      "matchedLabelCodes": ["ACNE", "OILY_SKIN"]
    }
  ],
  "conflicts": [
    {
      "protocolCode": "BHA_2PCT_PM",
      "conflictingProtocolCode": "RETINOL_PM",
      "severity": "HIGH",
      "reason": "Do not combine in the same routine without guidance"
    }
  ],
  "products": [
    {
      "recommendationItemId": "...",
      "protocolId": "...",
      "protocolCode": "BHA_2PCT_PM",
      "protocolName": "BHA 2% Evening Protocol",
      "matchScore": 3,
      "productId": "...",
      "productName": "...",
      "productVariantId": "<variant-uuid>",
      "sku": "...",
      "priceVnd": 289000,
      "volume": "30ml",
      "variants": [
        {
          "productVariantId": "<variant-uuid>",
          "productId": "...",
          "productName": "...",
          "sku": "...",
          "priceVnd": 289000,
          "volume": "30ml",
          "rank": 1
        }
      ]
    }
  ],
  "createdAt": "..."
}
```

**Product mapping rules (when the snapshot is first created):**

- Rank linked variants by price then SKU (up to 10 per protocol).
- Drop variants with **remaining stock ≤ 0**.
- Drop variants that conflict with the customer’s **active allergy** labels (ingredient-name heuristics).
- Flat `productVariantId` on each product row is the default (rank-1) choice after filters.
- Optional `conflicts[]` lists ingredient-protocol pairs that collide within the recommended set (informational for FE).

**Client UX suggestion:**

1. First screen: show `protocols[]` (ingredient protocol list — what the engine prescribed). Optionally surface `conflicts[]` as warnings.
2. User taps Continue → show each `products[].variants[]` ranked by price then SKU. Flat product fields are the default (cheapest in-stock, non-allergenic) display hint only.
3. Keep `id` (`surveyRecommendationId`) for the cart step.
4. Add any ranked `productVariantId` directly to the SURVEY cart (no selection PATCH). Multiple variants of the same protocol are allowed. Customers may also add other active catalog variants (browse via `GET /products`) into the same SURVEY cart.

**Errors you should handle:**

| Condition                                      | Typical result                                        |
| ---------------------------------------------- | ----------------------------------------------------- |
| No completed survey                            | `400 Complete a skincare survey before...`            |
| No protocols match labels/skin type            | `400 No matching ingredient protocols...`             |
| Protocols match but no catalog products mapped | `400 No catalog products mapped to matched protocols` |

Re-calling `GET /recommendations/latest` for the same completed survey returns
the **existing ranked snapshot** (does not re-rank live catalog products).

---

### 4.7 Add recommended products to cart ✅ Ready

Reuse cart APIs from [ecommerce-flow.md](ecommerce-flow.md). For survey purchases, **first item** must set source + recommendation id.

| Method | Path          | Auth     | Status   |
| ------ | ------------- | -------- | -------- |
| POST   | `/cart/items` | Customer | ✅ Ready |
| GET    | `/cart`       | Customer | ✅ Ready |

```http
POST /cart/items
Content-Type: application/json

{
  "productVariantId": "<variant-uuid-from-products.variants>",
  "quantity": 1,
  "source": "SURVEY",
  "surveyRecommendationId": "<recommendation-uuid>"
}
```

**Rules:**

- First item sets cart `source`. Later items must keep `source: SURVEY`.
- `surveyRecommendationId` required for SURVEY carts.
- Recommended variants come from `products[].variants[]`. Customers may also add **any other active catalog** `productVariantId` (e.g. from `GET /products`) into the same SURVEY cart.
- Re-posting the same `productVariantId` updates quantity.
- Mixing `CATALOG` and `SURVEY` in one cart is rejected.
- Cart is Redis-backed (TTL ~7 days).

To unlock the **combo discount** at order time, the cart **subtotal** (before shipping) must be **greater than** `SURVEY_COMBO_MIN_SUBTOTAL_VND` (default 300,000 VND).

---

### 4.8 Create order → shipping → payment ✅ Ready

Identical to catalog after the cart exists. See [ecommerce-flow.md](ecommerce-flow.md) §§3.4–3.6.

```
POST /orders
GET  /delivery/options
POST /orders/:id/delivery
POST /payments/checkout
GET  /payments/:id          ← poll until PAID
```

**Survey-specific order behavior:**

| Cart source | Behavior                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SURVEY`    | Allows recommended + other catalog variants; if **subtotalVnd > SURVEY_COMBO_MIN_SUBTOTAL_VND** → applies `SURVEY_COMBO_DISCOUNT_PCT` (`discountType: COMBO`) |
| `CATALOG`   | Normal e-commerce (no survey discount)                                                                                                                        |

Money formula (unchanged):

```
totalVnd = max(0, subtotalVnd - discountVnd + shippingFeeVnd)
```

Admin combo settings (not customer-facing):

| Method | Path                                             | Auth      | Status   |
| ------ | ------------------------------------------------ | --------- | -------- |
| GET    | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |
| PATCH  | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |

Response / body fields: `percent` (0–100) and `minSubtotalVnd` (≥ 0). PATCH accepts either or both.

---

### 4.9 Generate AI routine after payment (flow outcome) ✅ Ready

After the survey order is **PAID**, generate the personalized skincare routine. This is the **final step** of the survey integration path — the client should land on a routine screen, not stop at “order paid.”

Only orders with `source: SURVEY` and status `PAID` are eligible. Catalog purchases cannot generate routines.

| Method | Path                 | Auth     | Status   | Purpose                                      |
| ------ | -------------------- | -------- | -------- | -------------------------------------------- |
| POST   | `/routines/generate` | Customer | ✅ Ready | Create routine from a paid survey order      |
| GET    | `/routines/me`       | Customer | ✅ Ready | List all routines for the authenticated user |

#### 4.9.1 Create routine

```http
POST /routines/generate
Content-Type: application/json

{
  "orderId": "<paid-survey-order-uuid>"
}
```

Response (`RoutineResponseDto`, abbreviated):

```json
{
  "id": "<routine-uuid>",
  "type": "AI_RECOMMENDED",
  "status": "ACTIVE",
  "title": "Personalized routine for OSPW skin",
  "description": "...",
  "sourceOrderId": "<paid-survey-order-uuid>",
  "customerSurveyId": "<survey-uuid>",
  "surveyRecommendationId": "<recommendation-uuid>",
  "steps": [
    {
      "id": "...",
      "name": "Acne Serum",
      "period": "MORNING",
      "stepOrder": 1,
      "instructions": "Apply gently after cleansing.",
      "productVariantId": "<variant-uuid-from-order>",
      "protocolId": "<protocol-uuid>"
    },
    {
      "id": "...",
      "name": "Acne Serum",
      "period": "EVENING",
      "stepOrder": 1,
      "instructions": "Apply gently after cleansing.",
      "productVariantId": "<variant-uuid-from-order>",
      "protocolId": "<protocol-uuid>"
    }
  ],
  "createdAt": "..."
}
```

**Rules:**

- Steps only reference `productVariantId`s that were on the paid order (hallucinated products are dropped).
- Periods are `MORNING` / `EVENING`.
- **Multiple routines per order** are allowed (`sourceOrderId` is not unique). Calling generate again creates another routine.
- LLM backend: `LLM_PROVIDER=mock` (default) or `ollama` — see env table below / README.

#### 4.9.2 List routines

```http
GET /routines/me
```

Returns `RoutineResponseDto[]` (newest first). Use this after generate, on app home, or when the user reopens the app to show their routine(s).

**Client UX suggestion:**

1. After payment success (IPN / poll `GET /payments/:id` → order `PAID`), call `POST /routines/generate`.
2. Navigate to the routine detail UI using the generate response (or refresh with `GET /routines/me`).
3. Allow “Regenerate” by calling generate again with the same `orderId` if product copy / LLM output should be refreshed.

**LLM provider env** (see README / `.env.example`):

| Variable            | Default                             | Notes                                                   |
| ------------------- | ----------------------------------- | ------------------------------------------------------- |
| `LLM_PROVIDER`      | `mock`                              | `mock`, `ollama`, or `gemini` (live). `openai` reserved |
| `OLLAMA_BASE_URL`   | `http://host.docker.internal:11434` | Use when API runs in Docker and Ollama on the host      |
| `OLLAMA_MODEL`      | `gpt-oss:120b-cloud`                | Model tag passed to Ollama                              |
| `OLLAMA_TIMEOUT_MS` | `120000`                            | Shared Ollama / Gemini chat request timeout             |
| `GEMINI_API_KEY`    | —                                   | Required when `LLM_PROVIDER=gemini`                     |
| `GEMINI_MODEL`      | `gemini-2.5-flash-lite`             | Gemini model for routines and face-scan                 |

Use `OLLAMA_BASE_URL=http://localhost:11434` only when the Nest API also runs on the host (not in Docker).

---

## 5. Endpoint checklist

### Survey purchase path

| Step                                 | Method      | Path                                       | Status   |
| ------------------------------------ | ----------- | ------------------------------------------ | -------- |
| Get / update base profile            | GET / PATCH | `/customers/me`                            | ✅ Ready |
| Allergy options                      | GET         | `/customers/allergies`                     | ✅ Ready |
| List questions (+ options)           | GET         | `/surveys/questions`                       | ✅ Ready |
| Start survey (auth or guest)         | POST        | `/surveys`                                 | ✅ Ready |
| Claim guest survey                   | POST        | `/surveys/claim`                           | ✅ Ready |
| Submit answers                       | POST        | `/surveys/:id/answers`                     | ✅ Ready |
| Face scan (logged-in only)           | POST        | `/surveys/:id/face-scan`                   | ✅ Ready |
| Get survey                           | GET         | `/surveys/:id`                             | ✅ Ready |
| Complete survey (+ derive skin type) | POST        | `/surveys/:id/complete`                    | ✅ Ready |
| Protocols + products snapshot        | GET         | `/recommendations/latest`                  | ✅ Ready |
| Add to SURVEY cart                   | POST        | `/cart/items`                              | ✅ Ready |
| Create order                         | POST        | `/orders`                                  | ✅ Ready |
| Shipping + payment                   | —           | See [ecommerce-flow.md](ecommerce-flow.md) | ✅ Ready |
| **Generate routine (flow outcome)**  | POST        | `/routines/generate`                       | ✅ Ready |
| **List my routines**                 | GET         | `/routines/me`                             | ✅ Ready |

### Admin (App Admin) — QA / cheat

| Step                           | Method | Path                           | Status   |
| ------------------------------ | ------ | ------------------------------ | -------- |
| Cheat update survey answers    | PATCH  | `/admin/customers/:id/survey`  | ✅ Ready |
| Cheat update profile/allergies | PATCH  | `/admin/customers/:id/profile` | ✅ Ready |
| Question bank CRUD             | —      | `/admin/survey-questions`      | ✅ Ready |

See [users.md](users.md) for admin customer cheat request bodies.

### Related (not survey-purchase)

| Method | Path                         | Status   | Notes                                            |
| ------ | ---------------------------- | -------- | ------------------------------------------------ |
| GET    | `/products/suggestion`       | ✅ Ready | Profile-only ranking; no survey snapshot / combo |
| GET    | `/products`, `/products/:id` | ✅ Ready | Catalog browse (optional from recommendation UI) |

---

## 6. Domain model

### 6.1 How signals flow

```
Customer profile                Survey answers
─────────────────               ──────────────
age → AGE_GROUP label           question → labelCodes[]
gender → GENDER label
skinType → Baumann filter       (may be derived on complete)
allergies → safety (suggest + recommendations)
        \                     /
         \                   /
          ▼                 ▼
        Rule engine (labels + skin type)
                  │
                  ▼
        IngredientProtocol[]  (scored)
                  │
                  ▼  product_protocols + stock/allergy filters
        Ranked ProductVariant[] per protocol
                  │
                  ▼
        SurveyRecommendation (immutable snapshot + conflicts)
                  │
                  ▼
        Cart source=SURVEY → Order source=SURVEY
                  │
                  ▼
        Routine(s) AI_RECOMMENDED (many per sourceOrderId)
```

### 6.2 Core entities

| Entity                     | Role                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| `Question`                 | Survey prompt (`code`, `text`, `questionType`, `displayOrder`)              |
| `Label` / `LabelCategory`  | Answer tags; EN `name`/`description` + optional `vietnameseNormalized`      |
| `CustomerSurvey`           | One session; `isCompleted` / `completedAt`; optional face image + AI labels |
| `Answer` + `AnswerLabel`   | User response linking question → labels                                     |
| `IngredientProtocol`       | Prescribed active / usage pattern                                           |
| `ProtocolLabel`            | `REQUIRED` / `OPTIONAL` / `EXCLUDED` label match                            |
| `ProtocolSkinType`         | `RECOMMENDED` / `AVOID` for Baumann types                                   |
| `ProductProtocol`          | Links catalog product → protocol                                            |
| `SurveyRecommendation`     | Snapshot header (1:1 with completed survey)                                 |
| `SurveyRecommendationItem` | Protocol + primary `productVariantId` + `rankedVariants` + score            |
| `Routine`                  | AI / expert routine; `sourceOrderId` is many-to-one (nullable)              |
| `Order`                    | `source: SURVEY \| CATALOG`, optional combo discount                        |

### 6.3 Seeded survey questions (question bank)

Seed source: `src/database/seeds/seed.ts` (`SURVEY_QUESTIONS`). Age/gender stay on the base profile (`/customers/me`); the bank focuses on concern, Baumann signals, environment, routine, actives, safety, and personality.

| Layer              | Codes (examples)                                                                                                                                                                                                                                               | Priority                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **L1 Core**        | `ENVIRONMENT_EXPOSURE`, `LIFESTYLE`, `PRIMARY_CONCERN`, `SKIN_GOALS`, `POST_CLEANSE_FEEL`, `TZONE_OIL`, `PRODUCT_CHANGE_REACTION`, `SENSITIVITY_TRIGGERS`, `HAS_ROUTINE`, `SUNSCREEN_HABIT`, `CURRENT_ACTIVES`, `COSMETIC_REACTION`, `ROUTINE_COMPLEXITY_PREF` | `CORE`                                          |
| **L2 Conditional** | Concern/env modules + **age-gated** `AGE_U18_*`, `AGE_1825_*`, `AGE_2635_*`, `AGE_3645_*`, `AGE_4660_*`, `AGE_60_*`                                                                                                                                            | `CONDITIONAL` via enriched `askWhen`            |
| **L3 Optional**    | `PERSONALITY_TYPES` (all 12 types) + preference probes (`RISK_TOLERANCE`, `LOW_MAINTENANCE_PREF`, `EVIDENCE_PREF`, texture/budget/…)                                                                                                                           | `OPTIONAL` (shown once a survey session exists) |

`askWhen` supports `always`, `anyLabelCodes`, `allLabelCodes`, `noneLabelCodes`, `anyAgeGroupCodes`, `minAge`/`maxAge`, and `match: 'any' \| 'all'`. Age gates use the customer profile `dateOfBirth` (same bands as rule-engine: `UNDER_18` … `ABOVE_60`).

Label taxonomy includes concerns, goals, allergies, contraindications, age, gender, lifestyle, experience, product preference, plus bank extensions: `SKIN_TYPE_SIGNAL`, `ROUTINE`, `ACTIVE_USAGE`, `PERSONALITY` (12 `PERSONALITY_*` types), `SAFETY_CONTEXT`.

### 6.4 Baumann in this flow

GlowScan uses Baumann as a **classification layer**, not as a quiz that asks for OSPT/DSPW directly.

| Axis | Meaning                   |
| ---- | ------------------------- |
| O/D  | Oily / Dry                |
| S/R  | Sensitive / Resistant     |
| P/N  | Pigmented / Non-pigmented |
| W/T  | Wrinkled / Tight          |

**In recommendations:** protocols with `ProtocolSkinType = AVOID` for the customer’s type are dropped; `RECOMMENDED` can boost score.

**In survey UX (shipped):** on `POST /surveys/:id/complete`, the backend scores O/D, S/R, P/N, W/T from answer labels (including `*_TENDENCY` skin-type signals), maps to a Baumann code, and stores it on `CustomerSkinTypeDetails`.

---

## 7. Question bank design (target)

This section is the **product / backend design direction** for replacing the static 3-question seed. Implement incrementally; the purchase pipeline (labels → rule engine → snapshot → SURVEY cart) should stay the same.

### 7.1 Why not a fixed form

A single static flow asks too much of some users and too little of others (age, climate, sensitivity, actives, budget, consistency). GlowScan should use a **dynamic question bank**: large library, small personalized subset per user.

### 7.2 Three question layers

| Layer                           | When asked       | Purpose                                                                                                         |
| ------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **L1 Core**                     | Almost everyone  | Identity context already on profile → survey focuses on concern, safety gates, minimal routine, personality fit |
| **L2 Conditional**              | Only if relevant | Acne module, pigmentation, retinoid tolerance, hot/humid, AC dryness, photo context, age 35+ aging, …           |
| **L3 Personality / preference** | Optional / late  | Minimalist vs advanced, risk tolerance, budget, texture, consistency                                            |

**Formula for selecting questions:**

```
Age segment + Environment segment + Baumann type + Primary concern
+ Safety risk + Current routine signals + Personality preference
= Personalized question set
```

### 7.3 Question metadata (recommended schema)

Each question bank row should carry more than display text:

| Field               | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `category`          | Acne, Skin Type, Lifestyle, Safety, Preference, …          |
| `code` / `text`     | Stable id + UI copy                                        |
| `intent`            | What signal this measures                                  |
| `questionType`      | `SINGLE_CHOICE`, `MULTI_SELECT`, `SCALE`, `TEXT`, …        |
| `askWhen`           | Rules: always / concern=acne / age≥35 / env=hot_humid / …  |
| `priority`          | `CORE` / `CONDITIONAL` / `OPTIONAL`                        |
| `options[]`         | `{ labelCode, name, description?, vietnameseNormalized? }` |
| `personalitySignal` | Optional tag for preference layer                          |
| `sourceInspiration` | AAD / NHS / PROVEN / … (docs / admin only)                 |
| `riskNote`          | Medical / privacy / bias caveats                           |

### 7.4 Asking principles

- Ask **symptoms, sensations, habits, experiences** — never force self-diagnosis (“Do you have rosacea?”).
- Prefer: “Da bạn có thường đỏ, nóng rát hoặc châm chích khi đổi sản phẩm không?”
- Keep L1 short; open L2 only after primary concern / safety answers.
- Goal is **right question, right person, right time** — not a long hospital form.

### 7.5 Suggested modules for the bank

| Module                                         | Feeds labels / logic                       |
| ---------------------------------------------- | ------------------------------------------ |
| Basic profile (mostly done on `/customers/me`) | Age, environment, UV, AC, pollution        |
| Skin type / Baumann axes                       | O/D, S/R, P/N, W/T inference               |
| Skin concern                                   | Primary + secondary goals                  |
| Acne                                           | Type, location, severity, PIH, triggers    |
| Pigmentation                                   | PIH vs melasma vs uneven tone              |
| Redness / sensitivity                          | Barrier, triggers, risk tolerance          |
| Current routine                                | AM/PM steps, sunscreen habit               |
| Active ingredients                             | Exposure, frequency, irritation, conflicts |
| Health & safety                                | Allergies, Rx, pregnancy, open wounds      |
| Lifestyle & environment                        | Stress, sleep, mask, sweat, makeup         |
| Product preference                             | Texture, fragrance, budget, steps          |
| AI photo context                               | Lighting, makeup/filter, focus area        |
| Follow-up / progress                           | Adherence after onboarding (later)         |
| Personality layer                              | Minimalist, safety-first, explorer, …      |

### 7.6 Conditional branching examples

| Condition                   | Open questions about…                   |
| --------------------------- | --------------------------------------- |
| Concern = acne              | Lesion type, location, PIH, triggers    |
| Sensitive / easy irritation | Redness, stinging, fragrance avoidance  |
| Age 35+                     | Pigmentation, firmness, gentle anti-age |
| Hot / humid (e.g. HCMC)     | Oil, sweat, sunscreen congestion        |
| Heavy AC                    | Tightness, dehydrated oily skin         |
| Using retinoid / AHA / BHA  | Frequency, peel, stacking conflicts     |
| Photo uploaded              | Light, makeup/filter, ROI               |

### 7.7 API shape for dynamic fetch (proposed)

Keep session APIs (`POST /surveys`, answers, complete) stable. Extend question delivery:

| Capability                            | Proposed                                                                                           | Status   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Questions + options for current user  | `GET /surveys/questions` (+ `?surveyId=` progressive)                                              | ✅ Ready |
| Lightweight branching after answers   | CORE + CONDITIONAL (`askWhen`) + OPTIONAL in-session                                               | ✅ Ready |
| Age / label askWhen operators         | `anyLabelCodes`, `allLabelCodes`, `noneLabelCodes`, `anyAgeGroupCodes`, `minAge`/`maxAge`, `match` | ✅ Ready |
| Question ↔ option label mapping table | `question_options`                                                                                 | ✅ Ready |
| Admin CRUD for question bank          | `/admin/survey-questions` (AppAdmin)                                                               | ✅ Ready |

**Compatibility:** answers still submit `labelCodes[]`. Rule engine and recommendation snapshot stay unchanged when the bank grows.

---

## 8. Rule engine notes

Entry points:

| Method / usage             | Input                                                                   | Output                              |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| Survey recommendations     | Latest completed survey labels + profile age/gender + Baumann skin type | Scored protocols → product snapshot |
| `GET /products/suggestion` | Profile + allergies only                                                | Ranked products (no snapshot)       |

**Matching logic (summary):**

1. Collect authoritative label ids (survey answers ∪ profile-derived age/gender).
2. Collect AI face label ids from the same completed survey (optional; weight `0.5`).
3. Load active protocols with `ProtocolLabel` + `ProtocolSkinType`.
4. Drop protocol if any `EXCLUDED` label matches **authoritative** labels only (AI never excludes).
5. Require all `REQUIRED` labels from **authoritative** labels only (AI never unlocks REQUIRED).
6. Drop if skin type is `AVOID`.
7. Score = weighted matched required + optional (+1 if skin type `RECOMMENDED`):
   - Survey / profile match → `+1.0`
   - AI face match on an **OPTIONAL** protocol label only → `+0.5`
   - Same label from survey + AI → `+1.0` (max weight, no double-count)
8. Sort by score; recommendation service maps each protocol to **ranked** linked variants (price → SKU), after **stock > 0** and **allergy** filters; attaches optional protocol `conflicts[]`.

**Client implication:** improving personalization is mostly:

1. Better / conditional questions → better labels.
2. Optional face scan → soft ranking boost (never hard gates).
3. Richer `protocol_labels` / `protocol_skin_types` seed data.
4. More `product_protocols` links in catalog.

Not a separate “ML recommender” for MVP.

---

## 9. Cart, combo discount & checkout

Full rules: [ecommerce-flow.md](ecommerce-flow.md) §§3.3–3.6 and §6.

Survey-specific reminders:

```
Empty cart
  └─ POST /cart/items  source=SURVEY + surveyRecommendationId
       └─ more SURVEY items (recommended and/or other catalog variants)
            └─ POST /orders
                 ├─ subtotalVnd ≤ min threshold → no combo discount
                 └─ subtotalVnd > min threshold → discountType=COMBO
                      └─ POST /orders/:id/delivery
                           └─ POST /payments/checkout
                                └─ IPN / poll → Order PAID
                                     └─ POST /routines/generate   ← flow outcome
                                          └─ GET /routines/me     ← show / refresh
```

| Rule             | Detail                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Variant id       | Recommended ids from `recommendation.products[].variants[]`, or any active catalog variant |
| Ownership        | Recommendation and order must belong to the same customer                                  |
| Snapshot linkage | Variants in the snapshot get `surveyRecommendationItemId`; extras are stored with `null`   |
| Combo            | Discount when **subtotalVnd > SURVEY_COMBO_MIN_SUBTOTAL_VND** (default 300,000)            |
| Quantity         | Same variant may be increased; contributes to subtotal for combo eligibility               |

---

## 10. Remaining gaps & implementation roadmap

### 10.1 Gaps that block ideal client UX

| #   | Gap                                | Impact                                         | Suggested fix                                          |
| --- | ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| 1   | Progressive questions ✅           | Cumulative `?surveyId=` + skip-friendly unlock | Batch size 10; CONDITIONAL from current labels         |
| 2   | No environment profile on customer | Limited hot-humid / location-aware branching   | Add environment profile or dedicated L1 inputs         |
| 3   | L2 bank covers only key modules    | Personalization is not yet comprehensive       | Add safety, sunscreen, routine and environment modules |

### 10.2 Suggested build order

| Phase                                  | Scope                                                                                           | Outcome                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **A — Wire client on current APIs**    | Profile → survey → answers → complete → recommendations → SURVEY cart → order/pay → **routine** | End-to-end flow ends on a personalized routine                       |
| **B — Questions with options** ✅      | Extend `GET /surveys/questions` (+ DB mapping)                                                  | No hardcoded label codes on FE                                       |
| **C — L1 + key L2 seed** ✅            | Concern, sensitivity, acne, pigmentation, active tolerance                                      | Better protocol matching with lightweight branching                  |
| **D — Conditional next-questions** ✅  | Progressive `GET /surveys/questions?surveyId=` (skip-friendly)                                  | Personalized short flows                                             |
| **E — Personality + preference layer** | Budget, steps, risk tolerance labels                                                            | Better routine/product fit                                           |
| **F — Follow-up / progress surveys**   | Post-purchase adherence                                                                         | Daily tracking: [routine-tracking-flow.md](routine-tracking-flow.md) |

### 10.3 Happy-path sequence (implement against this)

```
PATCH /customers/me                    ← ensure DOB + gender (+ allergies)
GET   /surveys/questions               ← CORE questions + options
POST  /surveys
POST  /surveys/:id/answers             ← answer current batch (may skip some)
GET   /surveys/questions?surveyId=:id  ← cumulative list + next batch at end (repeat until no new unanswered)
POST  /surveys/:id/face-scan           ← optional facial image → AI labels
POST  /surveys/:id/complete            ← derives Baumann skin type
GET   /customers/me                    ← optional: read derived skinType
GET   /recommendations/latest          ← protocols + products + conflicts
POST  /cart/items                      ← source=SURVEY (repeat per product)
POST  /orders
GET   /delivery/options
POST  /orders/:id/delivery
POST  /payments/checkout
GET   /payments/:id                    ← poll until PAID
POST  /routines/generate               ← create AI routine (flow outcome)
GET   /routines/me                     ← list / refresh routines
```

### 10.4 Out of scope for this guide

- OpenAI vision for face scan (`LLM_PROVIDER=mock` / `ollama` / `gemini` ship; `openai` reserved).
- Staff delivery `PATCH` — see ecommerce gaps.
- Replacing VNPay / catalog browse flows.

### 10.5 Seeded demo cases (profile → survey → products → routine)

Canonical source: `src/database/seeds/survey-demo-cases.ts` (also asserted by `survey-cases.coverage.spec.ts`, rule-engine unit tests, and `test/rule-engine.e2e-spec.ts`). Catalog wiring lives in `seed.ts` (products, `product_protocols`, stock batches + `product_instances`). After `npm run seed`, each case should yield non-empty `GET /recommendations/latest` products and support `POST /routines/generate` after a paid SURVEY order.

| #   | Persona              | Base profile                                    | Survey labels (CORE + L2 + signals)                                                                                                                                                                                                           | Expected protocol themes                                                                                                    | Key SKUs                                                                                                          |
| --- | -------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Acne / oily          | DOB ~2001, `FEMALE`, no allergies → `AGE_18_25` | Concern `ACNE`; goals `ACNE_TREATMENT`,`OIL_CONTROL`; env `HOT_HUMID`; lifestyle `HEAVY_MAKEUP`; signals `OILY_TENDENCY`; L2 `BLACKHEADS`,`ENLARGED_PORES`; `INTERMEDIATE`; `PERSONALITY_QUICK_RESULT`                                        | `salicylic_acne`, `benzoyl_acne`, `treatment_acne_spot`, `niacinamide_general`, `toner_exfoliating`, `cleanser_gentle_foam` | `LRP-EFFAC-DUO-40ML`, `SOMEBYMI-MIRACLE-TONER-150ML`, `TO-NIACINAMIDE-10-ZINC-30ML`, `CERAVE-FOAM-CLEANSER-236ML` |
| 2   | Pigment + sun        | DOB ~1993, `FEMALE` → `AGE_26_35`               | Concern `HYPERPIGMENTATION`; goals `REDUCE_PIGMENTATION`,`EVEN_SKIN_TONE`; lifestyle `HIGH_SUN_EXPOSURE`; L2 `MELASMA`,`POST_INFLAMMATORY_HYPERPIGMENTATION`; `PIGMENTED_TENDENCY`; `BEGINNER`; `SUNSCREEN_DAILY`; `PERSONALITY_SAFETY_FIRST` | `azelaic_pigmentation`, `niacinamide_general`, `serum_niacinamide`, `sunscreen_daily_spf`                                   | `LRP-EFFAC-DUO-40ML`, `TO-NIACINAMIDE-10-ZINC-30ML`, `LRP-ANTHELIOS-UVMUNE-50ML`                                  |
| 3   | Dehydrated / barrier | DOB ~1998, `MALE` → `AGE_26_35`                 | Concern `DEHYDRATED_SKIN`; goals `HYDRATION`,`BARRIER_REPAIR`; env `AIR_CONDITIONED_ENVIRONMENT`; signals `DRY_TENDENCY`,`SENSITIVE_TENDENCY`,`BARRIER_DAMAGE`; `PERSONALITY_SENSITIVE_CARE`                                                  | `ha_hydration`, `ceramide_barrier`, `moisturizer_barrier`, `cleanser_gentle_foam`, `sunscreen_daily_spf`                    | `CERAVE-MOIST-CREAM-454G`, `CERAVE-FOAM-CLEANSER-236ML`, `LRP-ANTHELIOS-UVMUNE-50ML`                              |
| 4   | Anti-aging           | DOB ~1984, `FEMALE` → `AGE_36_45`               | Concern `WRINKLES`; goals `ANTI_AGING`,`REDUCE_WRINKLES`; lifestyle `HIGH_STRESS`; signals `WRINKLED_TENDENCY`,`FINE_LINES`; `ADVANCED`; `USING_RETINOID`; `PERSONALITY_TREATMENT_FOCUSED`                                                    | `retinol_0.3_anti_aging`, `niacinamide_general`                                                                             | `TO-RETINOL-0.3-30ML`, `TO-NIACINAMIDE-10-ZINC-30ML`, `CERAVE-FOAM-CLEANSER-236ML`                                |
| 5   | Redness / sensitive  | DOB ~1996, `FEMALE` → `AGE_26_35`               | Concern `REDNESS`; goals `REDUCE_REDNESS`; lifestyle `HIGH_STRESS`; symptoms `BARRIER_DAMAGE`,`SENSITIVE_TENDENCY` (no self-diagnosis `ROSACEA` ask); `PERSONALITY_SENSITIVE_CARE`; `FRAGRANCE_FREE`                                          | `ceramide_barrier`, `moisturizer_barrier`, `azelaic_pigmentation`                                                           | `LRP-TOLERIANE-SENSITIVE-40ML`, `CERAVE-MOIST-CREAM-454G`, `CERAVE-FOAM-CLEANSER-236ML`, `LRP-EFFAC-DUO-40ML`     |

**Safety check:** anti-aging + `PREGNANCY` must **exclude** `retinol_0.3_anti_aging` while still matching `niacinamide_general`.

**Why seed stock matters:** recommendation mapping drops variants with `remainingQuantity ≤ 0`. Seed creates `SEED-<SKU>` batches with 20 `ON_RACK` instances per catalog SKU.

---

## Quick reference — what to build vs reuse

| Layer                                     | Status | Action                                         |
| ----------------------------------------- | ------ | ---------------------------------------------- |
| Auth                                      | ✅     | Reuse auth docs                                |
| Base profile (DOB/gender/allergies)       | ✅     | Gate survey start; Baumann derived on complete |
| Survey session CRUD                       | ✅     | Use as-is                                      |
| Question bank + options + light branching | ✅     | Progressive `GET /surveys/questions?surveyId=` |
| Rule engine + recommendation snapshot     | ✅     | Ranked variants; stock/allergy; conflicts      |
| SURVEY cart + combo order                 | ✅     | Subtotal-threshold combo                       |
| Shipping + VNPay                          | ✅     | [ecommerce-flow.md](ecommerce-flow.md)         |
| AI routine (`/routines/generate`, `/me`)  | ✅     | **Flow outcome**; multi-routine + Ollama/mock  |
| Admin customer cheat                      | ✅     | [users.md](users.md)                           |

```
Ready today:     Profile → Survey → Recommendations → SURVEY cart → Order → Pay → Routine
Ready today:     Age/label askWhen operators + expanded L2/L3 question bank
Keep stable:     Label codes → Rule engine → Snapshot → Combo discount → Routine contract
Demo cases:      src/database/seeds/survey-demo-cases.ts (= docs §10.5)
```
