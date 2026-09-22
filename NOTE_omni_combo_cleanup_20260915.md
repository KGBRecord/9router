# Note: Omni Combo Cleanup (2026-09-15)

## Nguyên nhân lỗi context window
Khi gộp các combo cũ (coding-mid-1m, reasoning-mid-1m, ...), một số model member có context thực tế dưới 256k bị lẫn vào:
- `cu/claude-sonnet-5-medium` (200k)
- `ag/claude-opus-4-6-thinking` (200k)
- `kr/claude-sonnet-4` các biến thể (200k)
- `nvidia/nemotron-3-ultra-550b-a55b` (128k)

Dù combo khai báo contextLength=256000, khi fallback rơi vào các model này với input >200k token, upstream trả lỗi:
`[Error] Your input exceeds the context window of this model.`

## Đã khắc phục
- Lọc bỏ toàn bộ model member < 256k ra khỏi 15 combo mới (category-rank, contextLength=256000).
- Cập nhật 15 combo mới lên https://omni.tdigroup.vn.
- Đồng bộ lại file `omni-combos.mapping.json`.
- Test request payload lớn qua `reasoning-mid` trên server live -> thành công.

## Quét provider live trên Omni
Live `/api/providers` trả về 18 connections.

### Active (testStatus=active)
- ollama-cloud
- kiro
- codex
- ollama
- claude
- cloudflare-ai
- antigravity

### Unavailable / Error (dead providers)
- github
- bazaarlink
- byteplus
- nvidia
- kimchi (error)

## Đã loại bỏ disabled providers khỏi toàn bộ combo
Bỏ hẳn các prefix: `cu` (cursor), `gh` (github), `nvidia`, `bpm` (byteplus).
- 73/82 combo trên live được cập nhật.
- 0 member còn dính prefix cu/gh/nvidia/bpm trong bất kỳ combo nào.
- Giữ lại `ag/*` (antigravity) vì provider active.

## 15 combo mới (category-rank, contextLength=256000) sau khi lọc
- coding-high: 7 models
- coding-mid: 15 models
- coding-low: 5 models
- reasoning-high: 13 models
- reasoning-mid: 20 models
- reasoning-low: 15 models
- review-high: 8 models
- review-mid: 11 models
- review-low: 8 models
- multimodal-high: 12 models
- multimodal-mid: 12 models
- multimodal-low: 14 models
- general-high: 14 models
- general-mid: 20 models
- general-low: 15 models

## 3 combo hợp nhất toàn diện mới (high, mid, low - contextLength=256000)
Gộp deduplicate từ các category combos tương ứng (chỉ giữ model có context >= 256k và loại bỏ provider đã tắt):
- `high` (15 models):
  ['ag/gemini-3.6-flash-high', 'cc/claude-opus-5', 'ollama/deepseek-v4-pro', 'ollama/glm-5.3', 'ag/gemini-3.7-flash-high', 'ag/gemini-3.8-flash-high', 'cx/gpt-5.6-sol', 'ag/gemini-pro-agent', 'ollama/glm-5.2', 'ollama/kimi-k3', 'ollama/minimax-m3', 'ollama/qwen3.5', 'ollama/qwen3.5:397b', 'cx/gpt-5.6-sol-review', 'ollama/mistral-large-3:675b']
- `mid` (22 models):
  ['ag/gemini-3.6-flash-medium', 'cc/claude-sonnet-5', 'cf/@cf/qwen/qwen2.5-coder-32b-instruct', 'ollama/deepseek-v4-flash:0731', 'ollama/deepseek-v4-flash:preview', 'ollama/glm-5.3-flash', 'ag/gemini-3.7-flash-medium', 'ag/gemini-3.8-flash', 'ag/gemini-3.8-flash-medium', 'cx/gpt-5.6-terra', 'kr/qwen3-coder-next', 'kr/qwen3-coder-next-agentic', 'kr/qwen3-coder-next-thinking', 'kr/qwen3-coder-next-thinking-agentic', 'ollama/kimi-k2.7-code', 'ag/claude-sonnet-4-6', 'ag/gemini-3.1-pro-low', 'ag/gemini-3.5-flash-high', 'cx/gpt-5.5', 'cf/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', 'cx/gpt-5.5-review', 'cx/gpt-5.6-terra-review']
- `low` (19 models):
  ['ag/gemini-3.6-flash-low', 'ag/gemini-3.7-flash-low', 'ag/gemini-3.8-flash-low', 'cx/gpt-5.3-codex-spark', 'cx/gpt-5.6-luna', 'ag/gemini-3-flash', 'ag/gemini-3.8-flash-agent', 'ag/gemini-3.5-flash-extra-low', 'ag/gemini-3.5-flash-low', 'cx/gpt-5.4', 'cx/gpt-5.4-mini', 'cf/@cf/moonshotai/kimi-k2.5', 'cf/@cf/moonshotai/kimi-k2.6', 'ollama/kimi-k2.5', 'ollama/kimi-k2.6', 'cx/gpt-5.4-review', 'cx/gpt-5.3-codex-spark-review', 'cx/gpt-5.4-mini-review', 'cx/gpt-5.6-luna-review']

## DeepSeek v4.1 flash / DeepSeek v4 flash
Trên Omni không có id `deepseek-v4.1-flash`. Chỉ có:
- `ollama/deepseek-v4-flash:0731`
- `ollama/deepseek-v4-flash:preview`
- `ollama/deepseek-v4-pro`

Các biến thể flash nằm trong 8 combo:
- coding-mid, reasoning-mid, review-mid, general-mid (15 new combos)
- coding-mid-1m, reasoning-mid-1m, review-mid-1m, general-mid-1m (old combos)

## Config files updated
- `omni-combos.mapping.json` (repo local)
- `~/.config/opencode/opencode.json` -> default model: `9router/coding-mid`
- `~/.hermes/config.yaml`:
  - `model.default: reasoning-mid`
  - `custom_providers` provider `Omni.tdigroup.vn` chứa 15 combo mới dạng `{}`

## Backups
- `~/.hermes/config.yaml.bak.1789449441`
- `~/.hermes/config.yaml.bak.before-combo-style-fix.20260915_122216`
- `omni-combos.mapping.json.bak.before-disabled-provider-strip.1789477677`
