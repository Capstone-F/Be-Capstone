# Treatment Plan Flow

Expert-led multi-phase treatment packages after consultation. Money moves via **Wallet** (expert service fee only). Products remain optional ecommerce purchases.

See also: [Consultation Flow](consultation-flow.md) · [Payments](payments.md) · [Routine Tracking](routine-tracking-flow.md)

## Happy path

```
Consultation (paid fee) → Expert creates DRAFT treatment + phases + prices
→ Expert submit → Customer wallet-pays whole package → Treatment ACTIVE
→ Expert configures phase (ingredients → products → protocol routine)
→ Activate phase (one ACTIVE) → Customer tracks routine / optional buy products
→ Free tái khám bookings while today ∈ [startDate, endDate]
```

## Wallet

| Method | Path             | Notes                                                         |
| ------ | ---------------- | ------------------------------------------------------------- |
| GET    | `/wallet/me`     | Balance                                                       |
| POST   | `/wallet/top-up` | Gateway checkout (`PAYMENT_PROVIDER`); purpose `WALLET_TOPUP` |

Consultation fee and treatment plan debit the wallet after top-up.

## Treatments API

| Actor    | Method       | Path                                             | Notes                                     |
| -------- | ------------ | ------------------------------------------------ | ----------------------------------------- |
| Expert   | POST         | `/treatments`                                    | Create DRAFT                              |
| Expert   | POST         | `/treatments/:id/phases`                         | Add phase with `priceVnd`                 |
| Expert   | PATCH/DELETE | `/treatments/phases/:phaseId`                    | Edit/delete while unpaid DRAFT            |
| Expert   | POST         | `/treatments/:id/submit`                         | Recompute `totalPriceVnd`                 |
| Customer | POST         | `/treatments/:id/pay`                            | Wallet debit → `ACTIVE`                   |
| Both     | GET          | `/treatments/me`, `/treatments/:id`              | List/detail                               |
| Expert   | POST         | `/treatments/phases/:phaseId/ingredients`        | Set ingredients                           |
| Expert   | GET          | `/treatments/phases/:phaseId/product-candidates` | Ranked by ingredient overlap              |
| Expert   | POST         | `/treatments/phases/:phaseId/products`           | Select variants                           |
| Expert   | POST         | `/treatments/phases/:phaseId/routines/generate`  | Protocol-based DRAFT routine              |
| Expert   | POST         | `/treatments/routines/:routineId/save`           | DRAFT → saved ACTIVE entity               |
| Expert   | PATCH        | `/treatments/routines/:routineId`                | Manual edit (MVP: allowed after activate) |
| Expert   | POST         | `/treatments/phases/:phaseId/activate`           | One ACTIVE phase; auto-complete previous  |

### Phase activation rules

- Only one phase `ACTIVE` at a time (previous ACTIVE → COMPLETED).
- Phase may have **no routine** if it has dates and/or notes.
- If routines exist, none may remain `DRAFT` (must save first).

### Follow-up bookings

When customer books the same expert and has an `ACTIVE` paid treatment with `startDate ≤ today ≤ endDate`, booking is created with `isFollowUp=true` and fee waived. Expert confirm does not require wallet debit.

## Out of scope

Realtime video/chat during consultation.
