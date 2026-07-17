# Survey → Recommendation → Purchase Integration Guide

End-to-end guide for integrating GlowScan’s **personalized survey → ingredient protocols → recommended products → SURVEY cart → order → payment** flow with this backend.

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

**After cart creation:** reuse the shared checkout stack in [E-Commerce Integration Guide](ecommerce-flow.md) (order → shipping → VNPay → tracking).

See also: [VNPay Payment Integration](payments.md) · [User Management & RBAC](users.md)

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
│  allergies,  │   │ (label codes)   │   │              │   │ → products       │
│  Baumann)    │   └─────────────────┘   └──────────────┘   └────────┬─────────┘
└──────────────┘                                                      │
  ✅ Ready         🔶 Extend (static Qs)    ✅ Ready                   ▼
                                                            ┌──────────────────┐
                                                            │ Recommendation   │
                                                            │ snapshot         │
                                                            └────────┬─────────┘
                                                                     │ ✅ Ready
                                                                     ▼
┌──────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Routine (AI) │◀──│ Payment + ship  │◀──│ Order        │◀──│ SURVEY cart      │
│ (optional)   │   │ (VNPay)         │   │ source=SURVEY│   │ + combo discount │
└──────────────┘   └─────────────────┘   └──────────────┘   └──────────────────┘
  ✅ Ready           ✅ (ecommerce-flow)   ✅ Ready           ✅ Ready
```

**Target happy path (survey purchase):**

1. Customer already has a **base profile** (age / DOB, gender, allergies, Baumann skin type, …).
2. Start a survey session → fetch questions (with answer options / labels).
3. Submit answers as **label codes** (plus optional free text).
4. Complete the survey.
5. Fetch recommendations → rule engine matches **ingredient protocols** → maps to catalog **product variants** → persists an immutable snapshot.
6. User reviews protocols + products → adds selected variants to cart with `source: SURVEY` + `surveyRecommendationId`.
7. Create order from cart (`source: SURVEY`). If the cart contains **all** recommended variants (full combo), apply survey combo discount.
8. Attach shipping → VNPay checkout → same fulfillment path as catalog.
9. (Optional) After `PAID` survey order → generate AI routine.

> **Important split:**
>
> - **Base profile** = who the user is (stored on `Customer` / Baumann details).
> - **Survey** = concern / lifestyle / goal signals as **labels**.
> - **Rule engine** = labels + skin type → ranked **ingredient protocols**.
> - **Recommendation** = protocols → cheapest matching **product variants** (snapshot).
> - **Cart / order** = commerce with `source: SURVEY`.

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

Survey, recommendations, cart, orders, and payment checkout require an authenticated **Customer**.

---

## 3. Prerequisites — base profile

The survey flow assumes the customer has already completed onboarding / base profile. Rule engine **merges** profile-derived labels (age group, gender) with survey answer labels.

| Method | Path                   | Auth              | Status   |
| ------ | ---------------------- | ----------------- | -------- |
| GET    | `/customers/me`        | Customer          | ✅ Ready |
| PATCH  | `/customers/me`        | Customer          | ✅ Ready |
| GET    | `/customers/allergies` | Public / Customer | ✅ Ready |

Typical base fields used downstream:

| Field           | Used for                                      |
| --------------- | --------------------------------------------- |
| `dateOfBirth`   | Age group labels (`UNDER_18`, `AGE_18_25`, …) |
| `gender`        | Gender labels                                 |
| `allergies`     | Safety filtering (esp. product suggestion)    |
| `skinType`      | Baumann 16-type code (e.g. `OSPW`)            |
| `baumannScores` | Axis scores (O/D, S/R, P/N, W/T)              |

```http
GET /customers/me
```

Example (shape abbreviated):

```json
{
  "id": "...",
  "gender": "FEMALE",
  "dateOfBirth": "1998-05-12",
  "skinType": { "code": "OSPT", "name": "..." },
  "baumannScores": {
    "oilyDryScore": 72,
    "sensitiveResistantScore": 65,
    "pigmentedNonPigmentedScore": 58,
    "wrinkledTightScore": 30
  },
  "allergies": [{ "code": "FRAGRANCE", "name": "Fragrance" }],
  "surveyHistory": []
}
```

**Client gate (recommended):** before starting a survey, ensure DOB + gender + skin type exist. If missing, send the user to profile / base onboarding first.

> Baumann type lives on the **customer profile**, not on `CustomerSurvey`. Do **not** ask the user “Are you OSPT or DSPW?” — infer axes from profile / symptom questions and store the type on the profile.

---

## 4. Step-by-step integration

### 4.1 List survey questions 🔶 Extend

Today: returns all **active** questions (static seed: `PRIMARY_CONCERN`, `SKIN_GOALS`, `LIFESTYLE`).  
**Does not yet** return answer options / label lists, nor personalize by age / environment / concern.

| Method | Path                 | Auth     | Status    |
| ------ | -------------------- | -------- | --------- |
| GET    | `/surveys/questions` | Customer | 🔶 Extend |

```http
GET /surveys/questions
```

Current response shape:

```json
[
  {
    "id": "...",
    "code": "PRIMARY_CONCERN",
    "text": "What is your primary skin concern?",
    "questionType": "MULTI_SELECT",
    "displayOrder": 1
  }
]
```

**Target response (implement next)** — each question should include selectable answers:

```json
[
  {
    "id": "...",
    "code": "PRIMARY_CONCERN",
    "text": "Vấn đề da nào làm bạn khó chịu nhất hiện tại?",
    "questionType": "SINGLE_CHOICE",
    "displayOrder": 1,
    "priority": "CORE",
    "category": "SKIN_CONCERN",
    "options": [
      { "labelCode": "ACNE", "name": "Mụn", "description": "..." },
      {
        "labelCode": "HYPERPIGMENTATION",
        "name": "Thâm / nám",
        "description": "..."
      }
    ]
  }
]
```

Until options are returned by the API, the client must hardcode label codes from seed knowledge (fragile). Prefer extending this endpoint first.

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

Response = full `SurveyResponseDto` including saved `answers[].labels`.

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
      "volume": "30ml"
    }
  ],
  "createdAt": "..."
}
```

**Client UX suggestion:**

1. First screen: show `protocols[]` (ingredient protocol list — what the engine prescribed).
2. User taps Continue → show `products[]` (one primary variant per protocol today: cheapest active variant linked via `product_protocols`).
3. Keep `id` (`surveyRecommendationId`) for the cart step.

**Errors you should handle:**

| Condition                                      | Typical result                                        |
| ---------------------------------------------- | ----------------------------------------------------- |
| No completed survey                            | `400 Complete a skincare survey before...`            |
| No protocols match labels/skin type            | `400 No matching ingredient protocols...`             |
| Protocols match but no catalog products mapped | `400 No catalog products mapped to matched protocols` |

Re-calling `GET /recommendations/latest` for the same completed survey returns the **existing snapshot** (does not re-pick products).

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
  "productVariantId": "<variant-uuid-from-recommendation.products>",
  "quantity": 1,
  "source": "SURVEY",
  "surveyRecommendationId": "<recommendation-uuid>"
}
```

**Rules:**

- First item sets cart `source`. Later items must keep `source: SURVEY`.
- `surveyRecommendationId` required for SURVEY carts.
- Every `productVariantId` must belong to that recommendation snapshot.
- Mixing `CATALOG` and `SURVEY` in one cart is rejected.
- Cart is Redis-backed (TTL ~7 days).

To buy the **full combo** (and unlock discount at order time), add **every** `products[].productVariantId` from the recommendation.

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

| Cart source | Behavior                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `SURVEY`    | Validates variants ⊆ recommendation; if cart has **all** recommended variants → applies `SURVEY_COMBO_DISCOUNT_PCT` (`discountType: COMBO`) |
| `CATALOG`   | Normal e-commerce (no survey discount)                                                                                                      |

Money formula (unchanged):

```
totalVnd = max(0, subtotalVnd - discountVnd + shippingFeeVnd)
```

Admin combo % (not customer-facing):

| Method | Path                                             | Auth      | Status   |
| ------ | ------------------------------------------------ | --------- | -------- |
| GET    | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |
| PATCH  | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |

---

### 4.9 (Optional) Generate AI routine after payment ✅ Ready

Only **PAID** orders with `source: SURVEY` are eligible.

| Method | Path                 | Auth     | Status   |
| ------ | -------------------- | -------- | -------- |
| POST   | `/routines/generate` | Customer | ✅ Ready |
| GET    | `/routines/me`       | Customer | ✅ Ready |

```http
POST /routines/generate
Content-Type: application/json

{
  "orderId": "<paid-survey-order-uuid>"
}
```

Catalog purchases cannot generate routines.

---

## 5. Endpoint checklist

### Survey purchase path

| Step                                | Method      | Path                                       | Status    |
| ----------------------------------- | ----------- | ------------------------------------------ | --------- |
| Get / update base profile           | GET / PATCH | `/customers/me`                            | ✅ Ready  |
| Allergy options                     | GET         | `/customers/allergies`                     | ✅ Ready  |
| List questions (+ options — target) | GET         | `/surveys/questions`                       | 🔶 Extend |
| Start survey                        | POST        | `/surveys`                                 | ✅ Ready  |
| Submit answers                      | POST        | `/surveys/:id/answers`                     | ✅ Ready  |
| Get survey                          | GET         | `/surveys/:id`                             | ✅ Ready  |
| Complete survey                     | POST        | `/surveys/:id/complete`                    | ✅ Ready  |
| Protocols + products snapshot       | GET         | `/recommendations/latest`                  | ✅ Ready  |
| Add to SURVEY cart                  | POST        | `/cart/items`                              | ✅ Ready  |
| Create order                        | POST        | `/orders`                                  | ✅ Ready  |
| Shipping + payment                  | —           | See [ecommerce-flow.md](ecommerce-flow.md) | ✅ Ready  |
| Generate routine                    | POST        | `/routines/generate`                       | ✅ Ready  |

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
skinType → Baumann filter
allergies → safety (suggest)
        \                     /
         \                   /
          ▼                 ▼
        Rule engine (labels + skin type)
                  │
                  ▼
        IngredientProtocol[]  (scored)
                  │
                  ▼  product_protocols
        ProductVariant[]      (cheapest per protocol)
                  │
                  ▼
        SurveyRecommendation (immutable snapshot)
                  │
                  ▼
        Cart source=SURVEY → Order source=SURVEY
```

### 6.2 Core entities

| Entity                     | Role                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `Question`                 | Survey prompt (`code`, `text`, `questionType`, `displayOrder`)    |
| `Label` / `LabelCategory`  | Answer tags consumed by rule engine (`ACNE`, `ACNE_TREATMENT`, …) |
| `CustomerSurvey`           | One session; `isCompleted` / `completedAt`                        |
| `Answer` + `AnswerLabel`   | User response linking question → labels                           |
| `IngredientProtocol`       | Prescribed active / usage pattern                                 |
| `ProtocolLabel`            | `REQUIRED` / `OPTIONAL` / `EXCLUDED` label match                  |
| `ProtocolSkinType`         | `RECOMMENDED` / `AVOID` for Baumann types                         |
| `ProductProtocol`          | Links catalog product → protocol                                  |
| `SurveyRecommendation`     | Snapshot header (1:1 with completed survey)                       |
| `SurveyRecommendationItem` | Protocol + chosen `productVariantId` + `matchScore`               |
| `Order`                    | `source: SURVEY \| CATALOG`, optional combo discount              |

### 6.3 Seeded survey questions (MVP today)

| Code              | Type         | Intent                          |
| ----------------- | ------------ | ------------------------------- |
| `PRIMARY_CONCERN` | MULTI_SELECT | Main skin concerns              |
| `SKIN_GOALS`      | MULTI_SELECT | Treatment / care goals          |
| `LIFESTYLE`       | MULTI_SELECT | Lifestyle / environment factors |

Label taxonomy is much richer (concerns, goals, allergies, contraindications, age, gender, lifestyle, experience, product preference). Expanding the **question bank** mainly means adding questions that map cleanly onto these labels — not inventing a parallel tagging system.

### 6.4 Baumann in this flow

GlowScan uses Baumann as a **classification layer**, not as a quiz that asks for OSPT/DSPW directly.

| Axis | Meaning                   |
| ---- | ------------------------- |
| O/D  | Oily / Dry                |
| S/R  | Sensitive / Resistant     |
| P/N  | Pigmented / Non-pigmented |
| W/T  | Wrinkled / Tight          |

**In recommendations:** protocols with `ProtocolSkinType = AVOID` for the customer’s type are dropped; `RECOMMENDED` can boost score.

**In survey UX (target):** ask symptom / experience questions that _infer_ axes; keep the stored type on the customer profile.

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

| Field               | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `category`          | Acne, Skin Type, Lifestyle, Safety, Preference, …         |
| `code` / `text`     | Stable id + UI copy                                       |
| `intent`            | What signal this measures                                 |
| `questionType`      | `SINGLE_CHOICE`, `MULTI_SELECT`, `SCALE`, `TEXT`, …       |
| `askWhen`           | Rules: always / concern=acne / age≥35 / env=hot_humid / … |
| `priority`          | `CORE` / `CONDITIONAL` / `OPTIONAL`                       |
| `options[]`         | `{ labelCode, name, description? }`                       |
| `personalitySignal` | Optional tag for preference layer                         |
| `sourceInspiration` | AAD / NHS / PROVEN / … (docs / admin only)                |
| `riskNote`          | Medical / privacy / bias caveats                          |

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

| Capability                            | Proposed                                                                | Status     |
| ------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| Questions + options for current user  | `GET /surveys/questions?surveyId=` or `GET /surveys/:id/next-questions` | ❌ Missing |
| Server-side branching after answers   | Recompute next set from profile + answers so far                        | ❌ Missing |
| Question ↔ option label mapping table | e.g. `question_options`                                                 | ❌ Missing |
| Admin CRUD for question bank          | Later                                                                   | ❌ Missing |

**Compatibility:** answers still submit `labelCodes[]`. Rule engine and recommendation snapshot stay unchanged when the bank grows.

---

## 8. Rule engine notes

Entry points:

| Method / usage             | Input                                                                   | Output                              |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| Survey recommendations     | Latest completed survey labels + profile age/gender + Baumann skin type | Scored protocols → product snapshot |
| `GET /products/suggestion` | Profile + allergies only                                                | Ranked products (no snapshot)       |

**Matching logic (summary):**

1. Collect label ids (survey answers ∪ profile-derived age/gender).
2. Load active protocols with `ProtocolLabel` + `ProtocolSkinType`.
3. Drop protocol if any `EXCLUDED` label matches.
4. Require all `REQUIRED` labels.
5. Drop if skin type is `AVOID`.
6. Score = matched required + optional (+1 if skin type `RECOMMENDED`).
7. Sort by score; recommendation service maps each protocol to cheapest active linked variant.

**Client implication:** improving personalization is mostly:

1. Better / conditional questions → better labels.
2. Richer `protocol_labels` / `protocol_skin_types` seed data.
3. More `product_protocols` links in catalog.

Not a separate “ML recommender” for MVP.

---

## 9. Cart, combo discount & checkout

Full rules: [ecommerce-flow.md](ecommerce-flow.md) §§3.3–3.6 and §6.

Survey-specific reminders:

```
Empty cart
  └─ POST /cart/items  source=SURVEY + surveyRecommendationId
       └─ more SURVEY items (variants ⊆ recommendation)
            └─ POST /orders
                 ├─ partial selection → no combo discount
                 └─ all recommended variants → discountType=COMBO
                      └─ POST /orders/:id/delivery
                           └─ POST /payments/checkout
                                └─ IPN → Order PAID
                                     └─ POST /routines/generate (optional)
```

| Rule                  | Detail                                                              |
| --------------------- | ------------------------------------------------------------------- |
| Variant id            | Always `productVariantId` from `recommendation.products[]`          |
| Ownership             | Recommendation and order must belong to the same customer           |
| Snapshot immutability | Cart validates against the stored recommendation, not a live re-run |
| Combo                 | Discount only when **every** recommended variant is in the cart     |

---

## 10. Remaining gaps & implementation roadmap

### 10.1 Gaps that block ideal client UX

| #   | Gap                                            | Impact                                                 | Suggested fix                                                           |
| --- | ---------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | `GET /surveys/questions` has no `options[]`    | Client cannot render choices without hardcoding labels | Add `question_options` (or category-scoped label sets) and return them  |
| 2   | Static 3-question seed                         | Weak personalization vs GlowScan question-bank vision  | Seed L1 core + a few L2 modules; keep label codes stable                |
| 3   | No conditional question API                    | Cannot ask acne-only / age-only follow-ups             | `GET /surveys/:id/next-questions` after each answer batch               |
| 4   | No environment profile on customer             | Hard to branch on hot-humid / AC / pollution           | Add location or environment multi-select on profile or L1 survey        |
| 5   | Recommendation = 1 cheapest variant / protocol | User cannot choose among products for a protocol       | Later: return ranked variants per protocol; still snapshot selected set |

### 10.2 Suggested build order

| Phase                                  | Scope                                                                             | Outcome                                               |
| -------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **A — Wire client on current APIs**    | Profile → survey → answers → complete → recommendations → SURVEY cart → order/pay | End-to-end purchase works with seeded 3 questions     |
| **B — Questions with options**         | Extend `GET /surveys/questions` (+ DB mapping)                                    | No hardcoded label codes on FE                        |
| **C — Expand seed bank (L1 + key L2)** | Acne, sensitivity, actives, sunscreen, environment                                | Better protocol matching without branching engine yet |
| **D — Conditional next-questions**     | Branching service using `askWhen` metadata                                        | Personalized short flows                              |
| **E — Personality + preference layer** | Budget, steps, risk tolerance labels                                              | Better routine/product fit                            |
| **F — Follow-up / progress surveys**   | Post-purchase adherence                                                           | Feed future re-recommendation                         |

### 10.3 Happy-path sequence (implement against this)

```
PATCH /customers/me                    ← ensure base profile + Baumann
GET   /surveys/questions               ← 🔶 add options ASAP
POST  /surveys
POST  /surveys/:id/answers             ← one or more batches
POST  /surveys/:id/complete
GET   /recommendations/latest          ← protocols + products snapshot
POST  /cart/items                      ← source=SURVEY (repeat per product)
POST  /orders
GET   /delivery/options
POST  /orders/:id/delivery
POST  /payments/checkout
GET   /payments/:id                    ← poll until PAID
POST  /routines/generate               ← optional
```

### 10.4 Out of scope for this guide

- AI photo analysis pipeline (survey can later collect photo-context labels only).
- Staff delivery `PATCH` — see ecommerce gaps.
- Replacing VNPay / catalog browse flows.

---

## Quick reference — what to build vs reuse

| Layer                                 | Status  | Action                                   |
| ------------------------------------- | ------- | ---------------------------------------- |
| Auth                                  | ✅      | Reuse auth docs                          |
| Base profile + Baumann                | ✅      | Gate survey start                        |
| Survey session CRUD                   | ✅      | Use as-is                                |
| Question bank + options + branching   | 🔶 / ❌ | Primary backend work for personalization |
| Rule engine + recommendation snapshot | ✅      | Use as-is; enrich seeds                  |
| SURVEY cart + combo order             | ✅      | Use as-is                                |
| Shipping + VNPay                      | ✅      | [ecommerce-flow.md](ecommerce-flow.md)   |
| AI routine after paid survey order    | ✅      | Optional post-purchase                   |

```
Ready today:     Profile → Survey (static) → Complete → Recommendations → SURVEY cart → Order → Pay → Routine
Build next:      Question options in API → Expanded / conditional question bank
Keep stable:     Label codes → Rule engine → Snapshot → Combo discount contract
```
