# Sắp xếp model upstream mới vào live combos — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Đưa các exact model IDs mới từ upstream vào đúng combo `<category>-<rank>-<context-tier>` mà không làm sai context, category, rank hoặc đưa model chưa live vào web.

**Architecture:** Lấy 67 combos hiện tại làm baseline. Giao của source-new IDs với authenticated runtime `/v1/models` quyết định membership; OpenRouter quyết định context khi canonical match rõ ràng; runtime/repository metadata chỉ fallback; GPT-5.5/GPT-5.6 dùng transport override hiện có. Cập nhật generator trước, sinh JSON, sau đó upsert web và read-back exact.

**Tech Stack:** JavaScript ESM, 9Router provider registry/capabilities, authenticated OpenAI-compatible API, dashboard `/api/combos`, Vitest, Next.js build.

---

## Baseline đã xác minh

- Source range: `b905c5af..3bbdfd7b`.
- Exact provider/model IDs được thêm: **47**; gồm **44 LLM**, **3 image**.
- Live dashboard hiện có: **67 combos**, **172 unique members**.
- Không ID nào trong 47 ID mới đang nằm trong live combos.
- `GET /api/combos`: HTTP 200 sau dashboard login.
- `/v1/models` qua dashboard session: HTTP 401; implementation bắt buộc dùng authenticated inference key, không suy model availability từ source.
- Snapshot rollback/read-only: `/Users/hanhvs/.hermes/cache/browser-use/workspace/20260906_232337_f20878/live-combos.json`.

## Quy tắc không được thay đổi

1. Exact membership lấy từ authenticated `/v1/models`; source registry không chứng minh model đang live.
2. Context mặc định lấy từ OpenRouter canonical match rõ ràng.
3. Chỉ GPT-5.5/GPT-5.6 Codex/Cursor dùng transport overrides hiện hành.
4. Khi OpenRouter không có match: dùng runtime context; tiếp theo documented repository context; không có bằng chứng thì exclude và báo rõ.
5. Combo `contextLength` bằng minimum context thực tế của members; suffix tier phải khớp.
6. `cx/*-review` chỉ thuộc `review-*`.
7. Ba `cx/gpt-5.6-*-image` là `kind:image`; không đưa vào 67 LLM combos.
8. `cc/claude-fable-5` vẫn prohibited. `cc/claude-fable-5-1` phải được quyết định riêng theo policy, không tự đồng nhất hai ID.
9. Không xóa combo cũ trước khi toàn bộ desired combos đã upsert và được read-back.

## Ma trận phân loại dự kiến

Đây là candidate plan, chưa phải quyền đưa vào web. Mỗi ID chỉ được dùng nếu xuất hiện exact trong authenticated runtime inventory và context được chứng minh.

### Nhóm A — phân loại rõ, ưu tiên tích hợp

| Exact IDs | Rank dự kiến | Tier dự kiến | Categories dự kiến |
|---|---|---|---|
| `ag/gemini-3.7-flash-high` | high | 1m | coding, review, reasoning, multimodal, general |
| `ag/gemini-3.7-flash-medium` | mid | 1m | coding, review, reasoning, multimodal, general |
| `ag/gemini-3.7-flash-low` | low | 1m | reasoning, multimodal, general |
| `ag/gemini-3.8-flash-high` | high | 1m | coding, review, reasoning, multimodal, general |
| `ag/gemini-3.8-flash-medium`, `ag/gemini-3.8-flash` | mid | 1m | coding, review, reasoning, multimodal, general |
| `ag/gemini-3.8-flash-low` | low | 1m | reasoning, multimodal, general |
| `alitp-intl/deepseek-v4-pro` | high | 1m | coding, review, reasoning, general |
| `alitp-intl/glm-5.2` | high | 1m | coding, review, reasoning, general |
| `alitp-intl/qwen3.7-max`, `alitp-intl/qwen3.7-plus`, `alitp-intl/qwen3.8-max-preview` | high | 1m | coding, review, reasoning, general; multimodal only if capability proves vision |
| `alitp-intl/qwen3.6-flash` | mid | 1m | coding, reasoning, general; review/multimodal only if capability proves fit |
| `cbcn/glm-5.3` | high | 1m | coding, review, reasoning, general |
| `cbcn/glm-5.3-flash` | mid | 1m | coding, reasoning, multimodal, general |
| `cbcn/kimi-k3-1` | high | 1m | coding, review, reasoning, multimodal, general |
| `cx/gpt-6-astra` | high | 256k candidate | coding, review, reasoning, multimodal, general |
| `deepseek/deepseek-v4-flash-vision-exp`, `opencode-go/deepseek-v4-flash-vision-exp` | mid | 1m | coding, reasoning, multimodal, general |
| `gemini/gemini-3.7-flash`, `gemini/gemini-3.8-flash` | mid | 1m | coding, review, reasoning, multimodal, general |
| `glm/glm-5.3`, `glm-cn/glm-5.3` | high | 1m | coding, review, reasoning, general |
| `glm/glm-5.3-flash`, `glm-cn/glm-5.3-flash`, `opencode-go/glm-5.3-flash` | mid | 1m | coding, reasoning, multimodal, general |
| `glm/glm-5-turbo`, `glm-cn/glm-5-turbo` | low | 200k | reasoning, general; coding only after capability/quality check |
| `glm-cn/glm-4.6v` | low | 128k | reasoning, multimodal, general |
| `oc/muse-spark-1.2-contributor-free`, `oc/muse-spark-1.3-contributor-free`, `opencode-go/muse-spark-1.2-contributor`, `opencode-go/muse-spark-1.3-contributor` | mid | 1m | coding, reasoning, multimodal, general; review only after quality check |
| `tokenrouter/z-ai/glm-5.3-free` | high | 1m | coding, review, reasoning, general |
| `xai/grok-4.5`, `xai/grok-4.6` | high | 400k | coding, review, reasoning, multimodal, general |

### Nhóm B — cần resolve alias/upstream metadata trước

| Exact IDs | Việc phải xác minh |
|---|---|
| `qd/gmodel` | Registry name là GLM-5.3; map upstream identity, context, capabilities. Dự kiến high/1m. |
| `qd/gfmodel` | Registry name là GLM-5.3-Flash; map upstream identity. Dự kiến mid/1m + multimodal. |
| `qd/qmodel_38max` | Registry name là Qwen3.8-Max; map upstream identity. Dự kiến high/1m. |
| `qd/qfmodel` | Registry name là Qwen3.8-Flash; map upstream identity. Rank/context chưa được đoán. |
| `qd/lite` | Loại vĩnh viễn khỏi fixed combos; đây là Qoder routing profile, không phải model canonical có rank/context ổn định. |
| `cbcn/hy3`, `cbcn/hy4-preview` | Xác minh family grade và canonical context; current generic capability output không đủ tin cậy cho placement cuối. |
| `cc/claude-fable-5-1` | Xác minh user policy: cho phép Fable 5.1 hay cấm toàn family Fable. Nếu cho phép: high/1m, reasoning/multimodal/general; coding/review cần đánh giá riêng. |

### Nhóm C — không thuộc LLM combos

- `cx/gpt-5.6-sol-image`
- `cx/gpt-5.6-terra-image`
- `cx/gpt-5.6-luna-image`

Chỉ xem xét media-provider/image combos riêng; không trộn vào `kind:llm`.

---

### Task 1: Chụp exact runtime inventory và tính eligible delta

**Objective:** Chứng minh model mới nào thực sự được instance đang chạy quảng cáo.

**Files:**
- Create temporary: `/tmp/omni-live-models-after-upstream.json`
- Read: `/tmp/9router-model-diff.json`
- Read: `/Users/hanhvs/.hermes/cache/browser-use/workspace/20260906_232337_f20878/live-combos.json`

**Steps:**
1. Gọi authenticated `GET https://omni.tdigroup.vn/v1/models` bằng inference API key đang cấu hình; không dùng dashboard cookie.
2. Lưu nguyên `data[]`, không in credential.
3. Lọc synthetic combo IDs; giữ exact provider-prefixed IDs.
4. Tính giao `47 source-added IDs ∩ live runtime IDs`.
5. Báo ba danh sách: live-new, source-new-but-not-live, live IDs mới ngoài source diff.
6. Assert mọi candidate về sau nằm trong live-new.

**Expected:** Có exact count và danh sách; không dùng con số 47 làm số model có thể publish nếu runtime không quảng cáo đủ 47.

### Task 2: Refresh context provenance

**Objective:** Gán context có bằng chứng cho từng live-new LLM.

**Files:**
- Refresh/read: `openrouter_all_models.txt`
- Modify later only if needed: `scripts/generate-category-rank-context-combos.mjs`
- Test: `tests/unit/generate-combo-context.test.js`

**Steps:**
1. Refresh OpenRouter catalogue thay vì dùng snapshot cũ thiếu GPT-6, GLM-5.3, Gemini 3.8, Grok 4.6.
2. Canonical-match mỗi live-new ID; reject ambiguous matches.
3. Giữ GPT-5.5/GPT-5.6 transport overrides trước OpenRouter lookup.
4. Với model không có OpenRouter: dùng runtime `capabilities.contextWindow`; tiếp theo exact repository capability.
5. Resolve Qoder aliases qua `upstreamModelId`/server mapping trước khi dùng family capability.
6. Xuất bảng `exact ID | context | source | canonical ID | tier`.
7. Exclude model không có fixed context đáng tin.

### Task 3: Chốt rank/category policy bằng regression fixtures

**Objective:** Ngăn generic substring rules hạ sai generation mới.

**Files:**
- Modify: `scripts/generate-category-rank-context-combos.mjs:106-214`
- Modify: `tests/unit/generate-combo-context.test.js`

**Steps:**
1. Viết test fail cho Gemini 3.7/3.8 effort ranks.
2. Viết test fail cho GLM-5.3 high và GLM-5.3-Flash mid; bảo đảm generic `glm-5` low không bắt chúng trước.
3. Viết test fail cho GPT-6 Astra high và đúng tier theo provenance Task 2.
4. Viết test fail cho Grok 4.5/4.6 high/400k.
5. Viết test fail cho DeepSeek V4 Pro high, V4 Flash Vision mid.
6. Viết test fail cho dedicated image IDs không xuất hiện trong LLM mapping.
7. Viết test fail cho opaque Qoder aliases: chỉ classify sau exact alias resolution; `qd/lite` excluded nếu vẫn unknown.
8. Cấm toàn bộ Fable family (`cc/*fable*` và mọi provider alias tương ứng); thêm fixture bảo đảm không Fable model nào lọt vào combo.
9. Implement tối thiểu để tests pass.

**Run:**
```bash
cd tests
npx vitest run unit/generate-combo-context.test.js unit/capabilities.test.js
```

**Expected:** PASS; exact new model placements được assert theo category/rank/tier.

### Task 4: Loại bỏ frozen prefix blind spot

**Objective:** Generator không bỏ im lặng provider mới.

**Files:**
- Modify: `scripts/generate-category-rank-context-combos.mjs:6,42-43`
- Test: `tests/unit/generate-combo-context.test.js`

**Steps:**
1. Thay frozen prefix allowlist bằng discovery từ exact runtime IDs.
2. Chỉ loại combo/synthetic/media/dynamic IDs bằng rule explicit.
3. Thêm test cho `alitp-intl`, `cbcn`, `deepseek`, `gemini`, `glm`, `glm-cn`, `oc`, `opencode-go`, `qd`, `tokenrouter`, `xai`.
4. Assert generator không silently omit một live provider prefix mới.

### Task 5: Generate desired JSON và audit delta

**Objective:** Tạo mapping hoàn chỉnh nhưng chưa ghi web.

**Files:**
- Modify: `omni-combos.mapping.json`

**Steps:**
1. Chạy generator bằng fresh runtime inventory và refreshed OpenRouter file.
2. Tính diff từng combo so với snapshot 67 combos hiện tại.
3. In báo cáo `combo | added models | removed models | context before/after`.
4. Assert:
   - zero dead members;
   - zero ambiguous canonical matches;
   - zero context mismatches;
   - zero empty/duplicate combo names;
   - exact suffix tier equals minimum member context;
   - zero image models trong LLM combos;
   - every live-new LLM either placed hoặc có explicit exclusion reason.
5. Không đổi thứ tự model cũ ngoài phần cần thiết; append/sort theo convention đã chọn để giảm diff.

### Task 6: Safe publish và exact read-back

**Objective:** Đồng bộ web không phá state đang chạy.

**Files:**
- Read/write external: `https://omni.tdigroup.vn/api/combos`
- Create rollback snapshot: `.hermes/artifacts/combos-before-upstream-model-placement.json`

**Steps:**
1. Fetch lại `/api/combos` ngay trước publish; lưu rollback snapshot.
2. Upsert desired combos: PUT existing, POST new.
3. Read-back; chỉ tiếp tục nếu mọi desired name tồn tại.
4. Xóa obsolete combos nếu có.
5. Read-back lần cuối.
6. So exact ordered `models`, `kind`, `contextLength`; yêu cầu missing=0, extra=0, mismatch=0.
7. Báo create/update/delete counts và exact số new model IDs được publish.

### Task 7: Verification cuối

**Objective:** Chứng minh source và artifact không regression.

**Run:**
```bash
cd /Users/hanhvs/Projects/9router/tests
npx vitest run unit/generate-combo-context.test.js unit/capabilities.test.js
cd /Users/hanhvs/Projects/9router
npm run build
git diff --check
```

**Expected:** Focused tests pass; build exit 0; diff check exit 0; web parity errors = 0.

## Files có khả năng thay đổi

- `scripts/generate-category-rank-context-combos.mjs`
- `tests/unit/generate-combo-context.test.js`
- `openrouter_all_models.txt` nếu snapshot được quản lý trong repo
- `omni-combos.mapping.json`
- `CHANGELOG.md` chỉ khi implementation thực sự thay đổi generator/mapping policy

## Rủi ro và điểm cần chốt

1. **Runtime deployment lag:** source có 47 ID mới nhưng instance có thể chưa advertise chúng; không publish ID absent.
2. **OpenRouter snapshot cũ:** local file hiện thiếu nhiều family mới; phải refresh trước khi tiering.
3. **Opaque Qoder IDs:** generic capability đang trả 200k cho aliases; không dùng số này nếu upstream model mapping chứng minh khác.
4. **Fable policy:** cấm exact `cc/claude-fable-5` chưa tự động nghĩa là cấm `cc/claude-fable-5-1`; cần quyết định explicit.
5. **Media separation:** ba GPT-5.6 image IDs không thuộc LLM combos.
6. **Quality rank mới:** GLM-5.3, Gemini 3.8, GPT-6, Qwen 3.8 phải có explicit generation rules trước generic fallbacks.
7. **Uncommitted/local state:** implementation phải re-run `git status`; không đụng thay đổi ngoài scope, không commit nếu chưa được yêu cầu.
