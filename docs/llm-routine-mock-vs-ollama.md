# Mock LLM vs Ollama — Routine Generation

How GlowScan builds a skincare routine after a paid SURVEY order, and what you get with **`LLM_PROVIDER=mock`** vs **`LLM_PROVIDER=ollama`** vs **`LLM_PROVIDER=gemini`**.

Both providers implement the same contract (`LlmRoutineProvider` → `RoutineGenerationOutput`). Persistence and APIs are identical; only step text / ordering / personalization differ.

**Also uses `LLM_PROVIDER`:** survey face-scan (`POST /surveys/:id/face-scan`) shares the same switch. With `ollama`, face-scan uses **`OLLAMA_VISION_MODEL`** (default `llava`) — not `OLLAMA_MODEL`. With `gemini`, both routine and face-scan use **`GEMINI_MODEL`** (default `gemini-2.5-flash-lite`). See [Survey flow](survey-flow.md) §4.3b.

---

## Shared pipeline

```
Paid SURVEY order items
  → RoutineGeneratorService.buildProductInputs()
       (categoryCode + prefer step-role protocol: cleanser_*, sunscreen_*, …)
  → LlmRoutineProvider.generateRoutine(input)
  → filter to purchased productVariantIds
  → save Routine + Steps + dosage/wait/details
```

Product input now includes: `categoryCode`, `protocolCode/name`, `timeOfUse`, seeded `instructions`.

---

## What seed + mock give you (no real LLM)

After `npm run seed` (and `LLM_PROVIDER=mock`, the default for local/tests):

| Capability          | Behavior                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Period split        | From protocol `timeOfUse` (`AM` / `PM` / `AM_PM`)                                              |
| Step order          | Category rank: CLEANSER → TONER → SERUM → TREATMENT → MOISTURIZER → SUNSCREEN                  |
| Instructions        | **Seeded** `IngredientProtocol.instructions` when present; else category fallback copy         |
| Dosage / wait       | Deterministic by category/protocol role (e.g. sunscreen → two finger-lengths; cleanser wait 0) |
| Title / description | Template + skin type + first matching concern label                                            |
| Product set         | Only purchased variants (same as Ollama)                                                       |

**Step-role protocols in seed** (mapped onto catalog SKUs):

- `cleanser_gentle_foam`, `toner_exfoliating`, `serum_niacinamide`
- `moisturizer_barrier`, `sunscreen_daily_spf`, `treatment_acne_spot`

Plus existing ingredient protocols (`ceramide_barrier`, `glycolic_exfoliation`, …) with HDSD text for recommendation depth.

So without Ollama you still get a **specific, demo-ready routine** (morning cleanser→serum→SPF, evening cleanser→toner→…, real apply instructions).

---

## What Ollama does better

| Area                       | Mock                                        | Ollama                                                                                                        |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Personalization            | Thin (skin code + one label in description) | Can weave age, gender, Baumann type, and **many** survey labels into title, description, and per-step tips    |
| Instruction quality        | Fixed seeded / template sentences           | Can rephrase HDSD for _this_ customer (e.g. beginner acid caution, pregnancy-safe wording if labels imply it) |
| Conflict / stacking advice | None                                        | Can warn “don’t stack AHA + retinol same night” using labels + product set                                    |
| Dosage nuance              | Category defaults only                      | Can vary by product form and concern (e.g. less acid for sensitive labels)                                    |
| Step naming / coaching     | Product catalog name only                   | Can add coaching tone (“Start slow…”, “Massage 60s…”) per step                                                |
| Edge carts                 | Rigid rules                                 | Better when mix of odd products / missing categories (still constrained to provided IDs)                      |
| Consistency                | 100% deterministic                          | Higher quality but non-deterministic; needs parse/retry                                                       |

Ollama still **must not invent** `productVariantId`s; the system prompt and parser enforce the same JSON shape as mock.

---

## When to use which

| Environment                    | Recommendation                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Unit / e2e / CI                | `mock` — stable, no GPU/network                                                              |
| Local demo without Ollama      | `mock` + reseed — specific HDSD from seed                                                    |
| Staging / prod personalization | `ollama` (or later a cloud LLM) with seed still providing strong `instructions` as grounding |

---

## Quick verify (mock)

1. `npm run seed`
2. Complete survey → buy combo → pay → `POST /routines/generate`
3. Expect morning order ending with sunscreen instructions mentioning finger-lengths; cleanser instructions mentioning lather/massage — even with `LLM_PROVIDER=mock`.

See also: [Survey → Purchase → Routine](survey-flow.md) · [Routine Tracking](routine-tracking-flow.md)
