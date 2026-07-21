import argparse
import datetime as dt
import json
import ssl
import time
import urllib.parse
import urllib.request


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


def post_rows(endpoint, token, rows):
    for offset in range(0, len(rows), 100):
        body = json.dumps({"rows": rows[offset:offset + 100]}, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(endpoint, data=body, method="POST", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "DailyRisk-SW-Sync/1.0",
        })
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
            if response.status != 200 or result.get("status") != "ok":
                raise RuntimeError(f"upload failed: {response.status} {result}")


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


def main():
    parser = argparse.ArgumentParser(description="Sync official Shenwan level-1 industry data")
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--history-days", type=int, default=0)
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

    post_rows(args.endpoint, args.token, rows)
    print(json.dumps({"trade_date": trade_date, "industries": len(catalog), "rows": len(rows)}))


if __name__ == "__main__":
    main()
