import argparse
import datetime as dt
import hashlib
import json
import ssl
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


CURRENT_URL = "https://www.swsresearch.com/institute-sw/api/index_publish/current/"
TREND_URL = "https://www.swsresearch.com/institute-sw/api/index_publish/trend/"
EXPECTED_COUNT = 31


def fetch_json(url, params=None, verify_tls=True):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    context = None if verify_tls else ssl._create_unverified_context()
    last_error = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "DailyRisk-SW-Sync/1.0"})
            with urllib.request.urlopen(request, timeout=60, context=context) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            last_error = error
            if attempt < 3:
                time.sleep(2 ** attempt)
    raise last_error


def post_action(endpoint, token, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error = None
    for attempt in range(4):
        request = urllib.request.Request(endpoint, data=body, method="POST", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "DailyRisk-SW-Sync/1.0",
        })
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            last_error = error
            if attempt < 3:
                time.sleep(2 ** attempt)
    raise last_error


def current_row(item, trade_date, updated_at):
    previous_close = float(item["l3"])
    close = float(item["l8"])
    return {
        "trade_date": trade_date,
        "industry_code": f"{item['swindexcode']}.SL",
        "industry_name": item["swindexname"],
        "provider": "swsresearch",
        "open_price": float(item["l4"]),
        "high_price": float(item["l6"]),
        "low_price": float(item["l7"]),
        "close_price": close,
        "change_pct": (close / previous_close - 1) * 100,
        "volume": float(item["l11"]) * 1_000_000,
        "amount": float(item["l5"]) * 1_000_000,
        "member_count": None,
        "source_updated_at": updated_at,
    }


def trend_row(item, name, updated_at):
    return {
        "trade_date": item["bargaindate"],
        "industry_code": f"{item['swindexcode']}.SL",
        "industry_name": name,
        "provider": "swsresearch",
        "open_price": item.get("openindex"),
        "high_price": item.get("maxindex"),
        "low_price": item.get("minindex"),
        "close_price": item.get("closeindex"),
        "change_pct": item.get("markup"),
        "volume": item.get("bargainamount") * 100_000_000 if item.get("bargainamount") is not None else None,
        "amount": item.get("bargainsum") * 100_000_000 if item.get("bargainsum") is not None else None,
        "member_count": None,
        "source_updated_at": updated_at,
    }


def validate_rows(rows, catalog, trade_date):
    expected_codes = {f"{item['swindexcode']}.SL" for item in catalog}
    latest = [row for row in rows if row["trade_date"] == trade_date]
    latest_codes = {row["industry_code"] for row in latest}
    if len(latest) != EXPECTED_COUNT or latest_codes != expected_codes:
        raise RuntimeError(f"latest snapshot is incomplete: {len(latest)}/{EXPECTED_COUNT}")
    keys = {(row["trade_date"], row["industry_code"]) for row in rows}
    if len(keys) != len(rows):
        raise RuntimeError("snapshot contains duplicate date/code rows")
    for row in rows:
        close = row["close_price"]
        open_price = row["open_price"]
        if close is None or close <= 0 or open_price is None or open_price <= 0:
            raise RuntimeError(f"invalid price: {row['trade_date']} {row['industry_code']}")
        if row["high_price"] < max(open_price, close) or row["low_price"] > min(open_price, close):
            raise RuntimeError(f"invalid OHLC: {row['trade_date']} {row['industry_code']}")
        if (row["volume"] or 0) < 0 or (row["amount"] or 0) < 0:
            raise RuntimeError(f"invalid turnover: {row['trade_date']} {row['industry_code']}")


def main():
    parser = argparse.ArgumentParser(description="Sync official Shenwan level-1 industry data")
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--history-days", type=int, default=0)
    parser.add_argument("--snapshot", default="sw-industry-snapshot.json")
    args = parser.parse_args()

    current = fetch_json(CURRENT_URL, {
        "page": 1, "page_size": 50, "indextype": "一级行业",
    }, verify_tls=False)
    catalog = current.get("data", {}).get("results", [])
    codes = {item.get("swindexcode") for item in catalog}
    if len(catalog) != EXPECTED_COUNT or len(codes) != EXPECTED_COUNT:
        raise RuntimeError(f"expected {EXPECTED_COUNT} industries, received {len(catalog)}")

    reference = fetch_json(TREND_URL, {
        "swindexcode": catalog[0]["swindexcode"], "period": "DAY",
    }, verify_tls=False).get("data", [])
    if not reference:
        raise RuntimeError("reference trend is empty")
    trade_date = reference[-1]["bargaindate"]
    updated_at = dt.datetime.now(dt.timezone.utc).isoformat()

    if args.history_days > 0:
        cutoff = (dt.date.fromisoformat(trade_date) - dt.timedelta(days=args.history_days)).isoformat()
        rows = []
        for index, item in enumerate(catalog):
            history = reference if index == 0 else fetch_json(TREND_URL, {
                "swindexcode": item["swindexcode"], "period": "DAY",
            }, verify_tls=False).get("data", [])
            rows.extend(trend_row(row, item["swindexname"], updated_at)
                        for row in history if row.get("bargaindate", "") >= cutoff)
    else:
        rows = [current_row(item, trade_date, updated_at) for item in catalog]

    validate_rows(rows, catalog, trade_date)
    rows.sort(key=lambda row: (row["trade_date"], row["industry_code"]))
    canonical = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    checksum = hashlib.sha256(canonical).hexdigest()
    run_id = str(uuid.uuid4())
    mode = "backfill" if args.history_days > 0 else "daily"
    snapshot = {
        "run_id": run_id,
        "trade_date": trade_date,
        "mode": mode,
        "industry_count": EXPECTED_COUNT,
        "row_count": len(rows),
        "checksum": checksum,
        "source": "swsresearch",
        "generated_at": updated_at,
        "rows": rows,
    }
    snapshot_path = Path(args.snapshot)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")

    begun = False
    try:
        post_action(args.endpoint, args.token, {
            "action": "begin", "run_id": run_id, "trade_date": trade_date,
            "mode": mode, "expected_industries": EXPECTED_COUNT,
            "expected_rows": len(rows), "checksum": checksum,
        })
        begun = True
        for offset in range(0, len(rows), 100):
            post_action(args.endpoint, args.token, {
                "action": "append", "run_id": run_id, "rows": rows[offset:offset + 100],
            })
        result = post_action(args.endpoint, args.token, {"action": "commit", "run_id": run_id})
        if result.get("status") != "completed":
            raise RuntimeError(f"commit failed: {result}")
    except Exception as error:
        if begun:
            try:
                post_action(args.endpoint, args.token, {
                    "action": "abort", "run_id": run_id, "error": str(error),
                })
            except Exception:
                pass
        raise

    print(json.dumps({
        "run_id": run_id, "trade_date": trade_date, "industries": len(catalog),
        "rows": len(rows), "checksum": checksum,
    }))


if __name__ == "__main__":
    main()
