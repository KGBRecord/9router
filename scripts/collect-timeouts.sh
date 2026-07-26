#!/usr/bin/env bash
# collect-timeouts.sh — Gom dữ liệu timeout/error của 9router vào output.txt
# Nguồn: (1) docker logs  (2) SQLite requestDetails + usageHistory
# Usage: ./collect-timeouts.sh [CONTAINER_NAME] [LOG_SINCE]
#   CONTAINER_NAME  tên container 9router (default: tự dò theo image 9router-app)
#   LOG_SINCE       khoảng thời gian đọc docker logs (default: 24h)
set -uo pipefail

CONTAINER="${1:-}"
SINCE="${2:-24h}"
OUT="output.txt"
DB_PATH="/app/data/db/data.sqlite"   # đường dẫn DB bên trong container

# ── 1. Tự dò container nếu không truyền vào ────────────────────────────────
if [ -z "$CONTAINER" ]; then
  CONTAINER="$(docker ps --format '{{.Names}}\t{{.Image}}' \
    | grep -iE '9router' | head -1 | cut -f1)"
fi
if [ -z "$CONTAINER" ]; then
  echo "ERROR: không tìm thấy container 9router. Truyền tên: ./collect-timeouts.sh <name>" >&2
  exit 1
fi

# node one-liner query DB trong container (better-sqlite3 có sẵn ở /app/node_modules)
db_query() {
  docker exec "$CONTAINER" node -e "$1" 2>&1
}

{
  echo "══════════════════════════════════════════════════════════════"
  echo " 9ROUTER TIMEOUT REPORT"
  echo " Generated : $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo " Container : $CONTAINER"
  echo " Log since : $SINCE"
  echo "══════════════════════════════════════════════════════════════"
  echo

  # ── 2. DOCKER LOGS: dòng timeout/error ───────────────────────────────────
  echo "################ [1] DOCKER LOGS (timeout / error lines) ################"
  echo
  docker logs --since "$SINCE" "$CONTAINER" 2>&1 \
    | grep -iE 'timed out|timeout|AbortError|✗ ERROR|ERROR 5[0-9][0-9]|ERROR 499|fetch connect|ECONNRESET|ETIMEDOUT|socket hang' \
    || echo "(không có dòng timeout/error trong khoảng $SINCE)"
  echo

  # ── 2b. Đếm timeout theo provider/model từ dòng "✗ ERROR ... · provider/model · Nms"
  echo "################ [2] AGGREGATE TỪ LOGS (provider/model → count) ################"
  echo
  docker logs --since "$SINCE" "$CONTAINER" 2>&1 \
    | grep -oE 'ERROR [0-9]+ · [^ ]+/[^ ]+' \
    | sed -E 's/ERROR ([0-9]+) · (.+)/\1 \2/' \
    | sort | uniq -c | sort -rn \
    || echo "(không parse được dòng ERROR có model)"
  echo "  (cột: <count>  <httpStatus>  <provider/model>)"
  echo

  # ── 3. SQLite requestDetails: các request status=error ───────────────────
  echo "################ [3] DB requestDetails (status=error, mới nhất 100) ################"
  echo
  db_query '
    const Database = require("better-sqlite3");
    try {
      const db = new Database("'"$DB_PATH"'", {readonly:true});
      const rows = db.prepare(
        "SELECT timestamp, provider, model, status, data FROM requestDetails WHERE status=? ORDER BY id DESC LIMIT 100"
      ).all("error");
      if (!rows.length) { console.log("(requestDetails: không có row status=error)"); process.exit(0); }
      for (const r of rows) {
        let err="", st="", tot="";
        try { const d=JSON.parse(r.data||"{}");
          err=d.response?.error||""; st=d.response?.status||"";
          tot=d.latency?.total!=null?d.latency.total+"ms":"";
        } catch {}
        console.log([r.timestamp, (r.provider||"-")+"/"+(r.model||"-"), "HTTP:"+st, tot, String(err).slice(0,160)].join(" | "));
      }
    } catch(e){ console.log("(requestDetails query lỗi: "+e.message+")"); }
  '
  echo

  # ── 3b. Aggregate requestDetails: model nào lỗi nhiều nhất ───────────────
  echo "################ [4] DB AGGREGATE (provider/model → error count, sorted) ################"
  echo
  db_query '
    const Database = require("better-sqlite3");
    try {
      const db = new Database("'"$DB_PATH"'", {readonly:true});
      const rows = db.prepare(
        "SELECT provider, model, status, data FROM requestDetails ORDER BY id DESC LIMIT 5000"
      ).all();
      const agg={};
      for (const r of rows){
        let st=""; try{ st=JSON.parse(r.data||"{}").response?.status||""; }catch{}
        const isErr = r.status==="error";
        const isTimeout = st==499||st==502||st==504||/timeout|abort/i.test(r.data||"");
        if(!isErr) continue;
        const k=(r.provider||"-")+"/"+(r.model||"-");
        agg[k]=agg[k]||{err:0,timeout:0};
        agg[k].err++; if(isTimeout) agg[k].timeout++;
      }
      const list=Object.entries(agg).sort((a,b)=>b[1].timeout-a[1].timeout||b[1].err-a[1].err);
      if(!list.length){ console.log("(không có request lỗi trong 5000 gần nhất)"); process.exit(0); }
      console.log("errCount  timeoutCount  provider/model");
      for(const [k,v] of list) console.log(String(v.err).padStart(6)+"  "+String(v.timeout).padStart(10)+"  "+k);
    } catch(e){ console.log("(aggregate lỗi: "+e.message+")"); }
  '
  echo

  # ── 5. usageHistory FAILED status ────────────────────────────────────────
  echo "################ [5] DB usageHistory (status LIKE FAILED%, mới nhất 50) ################"
  echo
  db_query '
    const Database = require("better-sqlite3");
    try {
      const db = new Database("'"$DB_PATH"'", {readonly:true});
      const rows = db.prepare(
        "SELECT timestamp, provider, model, status FROM usageHistory WHERE status LIKE ? ORDER BY id DESC LIMIT 50"
      ).all("FAILED%");
      if(!rows.length){ console.log("(usageHistory: không có row FAILED)"); process.exit(0); }
      for(const r of rows) console.log([r.timestamp,(r.provider||"-")+"/"+(r.model||"-"),r.status].join(" | "));
    } catch(e){ console.log("(usageHistory query lỗi: "+e.message+")"); }
  '
  echo
  echo "══════════════════════════ END REPORT ══════════════════════════"
} > "$OUT" 2>&1

echo "✓ Đã ghi report vào $(pwd)/$OUT"
echo "  Container: $CONTAINER | Since: $SINCE"
echo "  Gửi file $OUT cho mình để phân tích nya~"
