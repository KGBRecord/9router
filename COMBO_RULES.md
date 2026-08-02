# Model Combo Construction and Update Rules

This document is the single source of truth for creating, modifying, and validating combos on the 9Router instance at `https://omni.tdigroup.vn`.

## 1. Goals

Combos must:

- use models actually advertised by the runtime;
- prioritize current generations and keep outdated models out of primary fallback paths;
- classify models by **purpose** and **context tier**;
- retain every eligible current model;
- retain explicitly approved older models;
- update both the **web/API** and `omni-combos.mapping.json`;
- avoid unnecessary combo proliferation through quality suffixes.

## 2. Required Data Sources

### 2.1. Runtime identity and availability

The authoritative source is the authenticated endpoint used by Hermes:

```http
GET https://omni.tdigroup.vn/v1/models
Authorization: Bearer <API_KEY>
```

Do not infer runtime availability from the source registry, dashboard catalog, or provider names.

Keep these metrics distinct:

- **runtime model count**: number of IDs returned by authenticated `/v1/models`;
- **dashboard catalog count**: number of models known to provider catalogs or registries;
- **combo coverage**: number of eligible exact runtime IDs present in at least one combo.

### 2.2. Context window

Context tiers must use an explicitly selected authority recorded in the mapping:

1. Prefer official vendor documentation, official model cards/configurations, or a published service cap.
2. A hosted-service cap overrides a larger native model limit when the service guarantees less.
3. Do not infer context from the name of a private alias without an exact public mapping.
4. When using runtime `capabilities.contextWindow` for a private alias, identify it as **runtime/service metadata**, not vendor evidence.
5. Never silently mix vendor documentation with runtime metadata.

A combo's `contextLength` must equal the smallest context window among its members.

## 3. Combo Structure

### 3.1. Purpose axis

Primary categories:

- `coding`: implementation, debugging, coding agents, and tool use;
- `review`: code review, change analysis, and defect detection;
- `reasoning`: reasoning, planning, and complex problem-solving;
- `multimodal`: image, audio, or video input;
- `general`: general chat and broad tasks.

Dedicated technical combos:

- `audio-*`: ASR or audio-only models;
- `internal-*`: search replicas, execution agents, pickers, secondary/tertiary replicas, and compaction models;
- `router-unknown`: dynamic routers such as `kr/auto` with no fixed context window.

### 3.2. Context tiers

Primary combo names follow:

```text
<category>-<context-tier>
```

Tiers:

| Tier | Condition |
|---|---:|
| `1m` | `>= 1,000,000` tokens |
| `400k` | `>= 400,000` and `< 1,000,000` |
| `256k` | `>= 256,000` and `< 400,000` |
| `200k` | `>= 196,608` and `< 256,000` |
| `128k` | `>= 128,000` and `< 196,608` |
| `16k` | below `128,000`, when a suitable current model remains |
| `unknown` | no defensible context evidence |

Do not create empty combos.

### 3.3. No quality suffixes

Do not create combos named:

- `*-fast`
- `*-balanced`
- `*-high`
- `*-premium`

Merge models into their corresponding `category-context` combo.

This decision favors a compact combo set over separate quality tiers. A combo may therefore contain models with different quality levels when they share a category and context tier.

## 4. Model and Mode-Suffix Policy

The following suffixes represent modes or metadata, not new model families:

- `-thinking`
- `-agentic`
- `-thinking-agentic`
- `-review`

Rules:

1. Do not infer category or quality from a suffix.
2. Do not count multiple modes of one base model as provider diversity.
3. For curated base-model coverage, prefer the base model.
4. If an exact runtime mode ID remains in the current mapping, place that exact ID in an appropriate combo; never canonicalize it away and then falsely claim 100% coverage.
5. Do not create extra fallback targets merely because multiple mode suffixes exist.

## 5. Current and Outdated Model Policy

### 5.1. Primary combos contain current models only

Remove superseded models from every primary combo. Do not create `legacy-*` combos.

After removal:

- the model may remain available through `/v1/models`;
- the model does not need to belong to any combo;
- report every excluded exact ID;
- do not claim 100% coverage of the entire runtime inventory; report coverage of the **eligible/current set**.

### 5.2. Families and models excluded by default

Exclude the following when a newer generation exists:

- Claude Sonnet 4/4.5 and older Claude 4.6 models;
- Gemini 3/3.1 and Gemini 3.5 variants, except the explicit exceptions in Section 5.3;
- GPT-3.5, GPT-4, GPT-4o, and GPT-4.1;
- older Codex/GPT 5.4 and 5.5 models, except mini/current models retained by the mapping;
- DeepSeek 3.2;
- GLM 4.7/5/5.1, except the explicit exception;
- MiniMax M2.1/M2.5;
- Kimi K2.5/K2.6, except the explicit exceptions.

Any change to the superseded-model list must use a fresh inventory and an explicit decision, not only a model-name regex.

### 5.3. Required exceptions

Retain these exact IDs even though they belong to older generations:

```text
ollama/glm-5.1
nvidia/moonshotai/kimi-k2.6
ollama/kimi-k2.6
ag/gemini-3.5-flash-high
ag/gemini-3.5-flash-low
ag/gemini-3.5-flash-extra-low
```

Current placement:

| Model | Combos |
|---|---|
| `ollama/glm-5.1` | `coding-200k`, `general-200k`, `reasoning-200k`, `review-200k` |
| `nvidia/moonshotai/kimi-k2.6` | `coding-256k`, `general-256k`, `multimodal-256k`, `reasoning-256k`, `review-256k` |
| `ollama/kimi-k2.6` | `coding-256k`, `general-256k`, `multimodal-256k`, `reasoning-256k`, `review-256k` |
| `ag/gemini-3.5-flash-high` | `general-1m`, `multimodal-1m`, `reasoning-1m` |
| `ag/gemini-3.5-flash-low` | `general-1m`, `multimodal-1m`, `reasoning-1m` |
| `ag/gemini-3.5-flash-extra-low` | `general-1m`, `multimodal-1m`, `reasoning-1m` |

Do not expand an exception to an entire family. Retain only the exact IDs listed above.

## 6. Notable Required Model

`cc/claude-sonnet-5` must appear in:

```text
coding-1m
general-1m
multimodal-1m
reasoning-1m
review-1m
```

Do not exclude Sonnet 5 merely because Opus 5 has higher quality.

## 7. Coverage Rules

Final coverage applies to the **eligible/current set**, not the complete runtime inventory.

```text
eligible = exact runtime IDs
           - superseded IDs
           - explicitly excluded IDs
           + exact required-exception IDs
```

Required assertions:

```text
eligible - union(combo.models) == empty
union(combo.models) - runtime == empty
```

Additionally:

- every current model must appear in at least one combo;
- internal, ASR, and dynamic-router models must use dedicated technical combos if combos still manage them;
- excluded outdated models must not be placed in `legacy-*` combos;
- report `excludedSuperseded` separately rather than hiding exclusions in coverage totals.

## 8. Required Update Procedure

1. Fetch the latest authenticated `/v1/models` inventory.
2. Fetch the current `/api/combos` state.
3. Save a rollback snapshot before mutation.
4. Identify every exact runtime ID.
5. Classify IDs as current, superseded, technical, or explicit exceptions.
6. Assign categories.
7. Assign context tiers using the selected context authority.
8. Build `category-context` combos without quality suffixes.
9. Remove superseded models from primary combos.
10. Do not create `legacy-*` combos.
11. `POST` new combos, `PUT` existing combos, and `DELETE` obsolete combos.
12. Fetch `/api/combos` again and compare exact ordered membership.
13. Synchronize `omni-combos.mapping.json` from the API read-back state.
14. Run every assertion in Section 9.

A generated JSON file that has not been applied is not complete. An updated web/API state with stale JSON is also not complete.

## 9. Required Validation Before Completion

Validate both web/API state and JSON:

- no empty combos;
- no duplicate names;
- no `-fast`, `-balanced`, `-high`, or `-premium` suffixes;
- no `legacy-*` combos;
- every combo member exists in authenticated `/v1/models`;
- every eligible/current exact ID appears at least once;
- every excluded superseded ID is absent from all combos;
- all six exact exceptions remain present;
- `cc/claude-sonnet-5` appears in all five required combos;
- each `contextLength` equals the smallest context window among its members;
- API combo names and memberships exactly match `omni-combos.mapping.json`.

Minimum report:

```text
runtime count
eligible/current count
combo count
unique covered count
missing eligible IDs
stale/unknown members
excluded superseded count and exact IDs
empty combos
API-to-JSON exact match
```

## 10. Current Baseline

At the latest update:

- combo count: **27**;
- no quality suffixes;
- no `legacy-*` combos;
- mapping file: `omni-combos.mapping.json`;
- all six Section 5.3 exceptions are retained in both web/API state and JSON.

Runtime and eligible counts may change whenever `/v1/models` changes. Always fetch a fresh inventory before the next update; never substitute the counts in this document for live discovery.
