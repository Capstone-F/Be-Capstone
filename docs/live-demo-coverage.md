# GlowScan — Live Demo Coverage Checklist

## 0. Pre-flight

- [ ] `docker compose up -d`
- [ ] `npm run migration:run` (incl. `1786000000000-ClinicEscrowLedger`, `1786300000000-BookingAutoCancel`)
- [ ] `npm run seed` **before** first login of clinic-bound accounts
- [ ] `npm run start:dev`
- [ ] `.env`: `PAYMENT_PROVIDER=mock`, `LLM_PROVIDER=mock`, `DELIVERY_SIMULATION_ENABLED=true`, `ORDER_CANCELLATION_CRON_ENABLED=false`, `ZEGO_APP_ID`+`ZEGO_SERVER_SECRET`
  - ⚠️ If your local `.env` still has `LLM_PROVIDER=ollama`, either start Ollama or switch to `mock` (see `docs/llm-routine-mock-vs-ollama.md`).
  - ⚠️ If `ORDER_CANCELLATION_CRON_ENABLED=true`, the cron auto-advances cancellations — set `false` to step them manually in §VII.
  - ⚠️ `BOOKING_EXPIRY_CRON_ENABLED` (default `true`) auto-cancels + refunds a `PENDING` booking once its `scheduledAt` passes, and a `CONFIRMED` one 15 min after `scheduledAt` if the expert never starts. Either book a slot comfortably in the future, or set it `false` and drive it by hand with `POST /admin/bookings/expiry/tick`.
- [ ] Resolve seeded UUIDs: `GET /clinics`, `GET /experts`

## Seeded accounts (all password `P@ssw0rd`)

| Purpose                                                   | Login                                     | Role           | Clinic                                  |
| --------------------------------------------------------- | ----------------------------------------- | -------------- | --------------------------------------- |
| Admin (QA, wallet, sim, **payouts**, settings, dashboard) | `glowscan-admin` / `admin@glowscan.local` | app_admin      | —                                       |
| Staff (stock, handover, cancels, support)                 | `glowscan-staff` / `staff@glowscan.local` | staff          | —                                       |
| Clinic Manager D1 (finance + oversight)                   | `manager.d1@glowscan.example.com`         | clinic_manager | District 1                              |
| Clinic Manager D3                                         | `manager.d3@glowscan.example.com`         | clinic_manager | District 3                              |
| **Expert (bookable, has login)**                          | `derma.d1@glowscan.example.com`           | expert         | D1 — DERMATOLOGY, **400k**, 1h          |
| **Expert (bookable, has login)**                          | `cosmetic.d3@glowscan.example.com`        | expert         | D3 — COSMETIC_DERMATOLOGY, **550k**, 2h |
| Customer                                                  | **self-register**                         | customer       | —                                       |

> ⚠️ Only `derma.d1` / `cosmetic.d3` experts have logins. `demo.customer@…` has no KC password → register a fresh customer. Seeded expert availability Mon–Fri 09–12 & 13–18 GMT+7 (window 09:00–20:00).

## Fund the demo customer

- [ ] Admin `GET /admin/users?q=<email>` → `userId` → `POST /admin/wallets/:userId/top-up { amountVnd: 3000000 }`

## 🆕 One-shot demo customer (routine history + low-stock warning)

- [ ] Admin `POST /admin/demo/customers { }` → response carries `credentials` (login + password), `routine`, `history`, `lowStock`
  - Creates the customer login, a PAID SURVEY order, an **ACTIVE** routine backdated 14 days (`historyDays` 7–60), completed step history, one check-in per completed day, and one product already at `warning: "LOW"`
  - Log in as that customer → `GET /routines/me/today` (LOW badge with `remainingMl` / `daysLeft`), `GET /routines/:id/check-ins?from&to`, `GET /routines/:id/history?from&to` (streak)
  - **Today is left empty on purpose** → still demo complete / skip / check-in live (§IV), then buy-again to clear the warning (§III)
  - Skips §I onboarding; use the survey path when the demo needs recommendations. Top up the wallet with the returned `userId` before buy-again.

---

## I. Onboarding → Survey → Routine _(customer)_

- [ ] Profile DOB+gender(+allergies) → survey start → CORE → progressive `?surveyId=` → complete → **Baumann auto-derived**
- [ ] `GET /recommendations/latest` → protocols + ranked products + conflicts
- [ ] SURVEY cart (subtotal **> 300,000** for combo) → order → VNPay(mock) → `PAID` → `POST /routines/generate` → `GET /routines/me`
- [ ] _(optional)_ Face scan → AI labels → ranking boost
- [ ] _(edge)_ anti-aging **+ PREGNANCY** → retinol excluded, niacinamide kept
- [ ] _(shortcut)_ Admin cheat `PATCH /admin/customers/:id/survey` + `/profile` → rebuild recs (5 personas in `survey-demo-cases.ts`)

## II. Appointment & Treatment _(customer ↔ expert)_

- [ ] **S1**: book (`derma.d1`) → wallet pay 400k → confirm → start (video+chat) → plan create/submit → customer pays plan → activate phase → Today routine → check-in → progress photo
- [ ] **S2**: pay → confirm → **expert cancels** → refund
- [ ] **S3**: pay → **expert cancels before confirm** → refund
- [ ] **S4**: through plan pay + active phase → **cancel plan** → full refund (all PENDING)
- [ ] **S5 partial**: activate + complete Phase 1 → **cancel plan** → refund PENDING phases only
- [ ] 🆕 **Conflict warning while composing the routine** _(expert, paid plan)_:
  1. `POST /treatments/phases/:phaseId/ingredients` — chọn **Retinol** + **Glycolic Acid** (UUIDs từ `GET /ingredients`)
  2. `GET /treatments/phases/:phaseId/products` → candidates (Tinh chất The Ordinary Retinol 0.3%, Toner Some By Mi AHA-BHA-PHA…) — chưa chọn gì nên `conflictWarnings: []`
  3. `POST /treatments/phases/:phaseId/products` với **retinol** (`TO-RETINOL-0.3-30ML`) trước
  4. Gọi lại `GET .../products` → candidate **Some By Mi Toner** giờ mang `conflictWarnings` (`retinol_0.3_anti_aging × glycolic_exfoliation`, severity **HIGH**, "Retinol kết hợp AHA có thể gây kích ứng mạnh")
  5. Vẫn chọn cả hai → response `POST .../products` trả `conflicts[]` ở phase — banner cảnh báo cho expert (không chặn, expert tự quyết)
  - Cặp khác để demo nhanh: retinol × **Effaclar Duo+** (`benzoyl_acne`, HIGH — "Benzoyl peroxide có thể làm giảm hiệu quả của retinol"), retinol × BHA (MEDIUM)
- [ ] Feedback (1–5) → expert rating recalculated
- [ ] Free **follow-up (tái khám)** while plan ACTIVE + in window → fee waived → on chart
- [ ] Treatment **chart/hồ sơ**: phases, photos, products used, follow-ups, source consult

## III. E-Commerce (catalog & fulfillment)

- [ ] Catalog → CATALOG cart (cart response shows **conflicts** among added products) → GHN address → `POST /orders` (fee locked) → VNPay → `PAID` → stock deduct + GHN order
- [ ] 🆕 **Reorder**: `POST /orders/:id/reorder` rebuilds cart from a past order → checkout again (order response includes product details)
- [ ] Staff **handover** (`awaitingHandover=true` → confirm) → SHIPPED
- [ ] Admin/staff **delivery simulation** → delivered
- [ ] ✏️ Customer cancel — allowed on **PENDING / PAID / PROCESSING** (PAID = full refund; PROCESSING/SHIPPED = subtotal−discount, shipping withheld) → wallet refund → restock
- [ ] **RETURNED** (`force-status: returned`) → **SYSTEM cancellation** auto-opens → refund → restock (good/damaged)
- [ ] Buy-again: Today **LOW/EMPTY** warning → cart → pay → clears

## IV. Routine Tracking _(customer)_

- [ ] Today MORNING → complete + skip(`OUT_OF_STOCK`) → 3/4 = 75% → **check-in** (partial ok)
- [ ] History calendar + **streak** + day detail
- [ ] Cancel AI routine → COMPLETED, off Today
- [ ] _(shortcut)_ Admin `POST /admin/demo/customers` seeds history + streak + `LOW` warning in one call — see the section above

## V. Support & Real-time

- [ ] Customer opens session → Staff **claim** → 1-1 chat (poll `afterSeq`) → read → close
- [ ] Second staff claim → `409`; consult token outsider → `403`

## VI. Clinic Manager — Finance & Oversight _(`manager.d1`)_

- [ ] `PUT /clinic/bank-account` → run a II happy-path → **escrow releases** on booking-complete / phase-activate
- [ ] `GET /clinic/wallet` + `GET /clinic/transactions` (PAYMENT / ESCROW_RELEASE / COMMISSION @10%)
- [ ] 🆕 `GET /clinic/transactions/export` → **CSV** download (same filters, up to 10k rows)
- [ ] `POST /clinic/withdrawals` (debits wallet immediately) → _(paid by Admin, see VIII)_
- [ ] 🆕 **Oversight**: `GET /clinic/experts?isActive=` (roster incl. deactivated), `GET /clinic/bookings` + `:id`, `GET /clinic/treatments` + `:id`
- [ ] Cross-clinic read/write → `403`

## VII. Staff Operations _(`glowscan-staff`)_

- [ ] 🆕 **Low-stock / restock warning** _(staff + admin)_:
  1. `GET /stock/inventory` — seed để mỗi variant 20 cái, ngưỡng mặc định **10** → chưa có cảnh báo
  2. Cách A (không tốn stock): Admin `PATCH /stock/low-stock-threshold { "threshold": 25 }` → staff refresh `GET /stock/inventory` → mọi item hiện `stockWarning: "LOW"` + `warningMessage: "Sắp hết hàng — chỉ còn 20 sản phẩm (ngưỡng cảnh báo 25)"`
  3. Cách B: `POST /stock/batches/:id/adjust { quantity: 3 }` → item đó `LOW`; adjust về 0 → `OUT_OF_STOCK` ("Hết hàng — cần nhập kho ngay")
  4. Staff nhập kho (import form hoặc `POST /stock/batches`) → refresh → cảnh báo biến mất
  - `GET /stock/low-stock-threshold` xem ngưỡng hiện tại; chỉ **app_admin** được PATCH (ngưỡng lưu trong `commerce_settings`, key `LOW_STOCK_THRESHOLD`)
- [ ] Stock **import form**: draft → submit → confirm (batch + ON_RACK) → sellable
- [ ] Direct `POST /stock/batches` + adjust
- [ ] **Catalog onboard**: `POST /products` (+ auto ingredients) → variant image → stock
- [ ] Order-cancellation desk: create → advance (REFUNDING → REFUNDED → AWAITING_RETURN) → confirm-return (**RESTOCKED**) → COMPLETED
- [ ] Carrier **handover** queue → confirm → SHIPPED
- [ ] ✏️ _(note)_ Staff **no longer** processes clinic withdrawals — that moved to Admin

## VIII. App Admin _(`glowscan-admin`)_

- [ ] Onboard clinic → onboard expert (account → profile → fee → availability)
- [ ] Wallet inspect + top-up (QA funding)
- [ ] Users & roles: create / re-role / enable-disable
- [ ] Survey **question bank CRUD** → verify `GET /surveys/questions`
- [ ] Commerce settings: survey combo discount %, platform commission %, 🆕 **low-stock threshold** (`PATCH /stock/low-stock-threshold`)
- [ ] Customer QA cheats (profile + survey) → re-derive skin type → rebuild recs
- [ ] 🆕 **Seed a demo customer** (`POST /admin/demo/customers`) → login + routine history + `LOW` stock warning in one call
- [ ] Delivery simulation + GHN create retry (`missingProviderCode=true`)
- [ ] ✏️ 🆕 **Clinic withdrawal payout** (app_admin only): `GET /admin/clinic-withdrawals?status=REQUESTED` → manual transfer → `POST /admin/clinic-withdrawals/:id/mark-paid { transferRef }` → **reject** re-credits wallet (WITHDRAWAL_REVERSAL)

## IX. 🆕 Dashboards / Operational Analytics

_(all accept `range=7d|30d|90d`, default 30d; TZ Asia/Ho_Chi_Minh)_

- [ ] Admin: `GET /admin/dashboard?range=30d` — platform KPIs, net product/consult money (excl. top-ups, minus refunds), attention counts, trends, recent activity
- [ ] Expert: `GET /experts/me/dashboard?range=30d` — today's appointments, pending confirms, completed/follow-up counts, net fees, ratings, trends
- [ ] Staff: `GET /staff/dashboard?range=30d` — support/stock/return queues, workflow failures, `myActiveSupport`, trends

---

**Money cheat-sheet:** D1 consult 400,000; combo discount fires when SURVEY subtotal > 300,000 (10%); platform commission 10% on release; top-up min 1,000 VND.

**Conflict cheat-sheet (seeded rules):**

| Cặp protocol                                  | Severity | Sản phẩm demo                                            |
| --------------------------------------------- | -------- | -------------------------------------------------------- |
| retinol_0.3_anti_aging × glycolic_exfoliation | HIGH     | The Ordinary Retinol 0.3% × Some By Mi AHA-BHA-PHA Toner |
| retinol_0.3_anti_aging × benzoyl_acne         | HIGH     | The Ordinary Retinol 0.3% × La Roche-Posay Effaclar Duo+ |
| retinol_0.3_anti_aging × salicylic_acne       | MEDIUM   | The Ordinary Retinol 0.3% × Some By Mi Toner (BHA side)  |

> Note: there is no dedicated `clinic_manager` dashboard endpoint — the §VI oversight lists are the closest equivalent.
