import argparse
import datetime as dt
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_number(value):
    if value is None:
        return "NULL"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "NULL"
    if number != number or number in (float("inf"), float("-inf")):
        return "NULL"
    return repr(number)


def build_sql(code, name, rows, updated_at):
    statements = []
    for offset in range(0, len(rows), 80):
        values = []
        for row in rows[offset:offset + 80]:
            raw_date = str(row.get("date", ""))
            trade_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
            values.append("(" + ",".join([
                sql_text(trade_date), sql_text(code), sql_text(name), sql_text("free-stockdb"),
                sql_number(row.get("open")), sql_number(row.get("high")), sql_number(row.get("low")),
                sql_number(row.get("close")), sql_number(row.get("pct_chg")),
                sql_number(row.get("volume")), sql_number(row.get("amount")),
                str(int(row.get("stock_count") or 0)), sql_text(updated_at),
            ]) + ")")
        statements.append("""
INSERT INTO sw_industry_daily (
  trade_date, industry_code, industry_name, provider, open_price, high_price,
  low_price, close_price, change_pct, volume, amount, member_count, source_updated_at
) VALUES
%s
ON CONFLICT(trade_date, industry_code) DO UPDATE SET
  industry_name=excluded.industry_name, provider=excluded.provider,
  open_price=excluded.open_price, high_price=excluded.high_price,
  low_price=excluded.low_price, close_price=excluded.close_price,
  change_pct=excluded.change_pct, volume=excluded.volume, amount=excluded.amount,
  member_count=excluded.member_count, source_updated_at=excluded.source_updated_at,
  updated_at=CURRENT_TIMESTAMP;
""" % ",\n".join(values))
    return "\n".join(statements)


def main():
    parser = argparse.ArgumentParser(description="Materialize complete Shenwan level-1 industry indices to D1")
    parser.add_argument("--source", default=str(Path(__file__).resolve().parents[3] / "free-stockdb" / "pybao"))
    parser.add_argument("--start", default="20240101")
    parser.add_argument("--end", default="N")
    parser.add_argument("--mode", choices=["local", "remote"], default="remote")
    parser.add_argument("--endpoint")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    if not source.exists():
        raise SystemExit(f"free-stockdb pybao directory not found: {source}")
    sys.path.insert(0, str(source))
    from zhibiao import bk, zb

    catalog = bk.get(category=1, fields="name,code")
    if not isinstance(catalog, list) or len(catalog) < 20:
        raise SystemExit(f"invalid Shenwan catalog: {json.dumps(catalog, ensure_ascii=False)}")

    worker_dir = Path(__file__).resolve().parents[1]
    updated_at = dt.datetime.now(dt.timezone.utc).isoformat()
    total_rows = 0
    completed = []

    for name, code in catalog:
        detail = bk.get(code, "symbols")
        symbols = detail.get("symbols", []) if isinstance(detail, dict) else []
        if not symbols:
            print(f"skip {code} {name}: no constituents", flush=True)
            continue
        rows = zb.get("zhishu", symbols, start=args.start, end=args.end, frequency="1d", method=1)
        if not rows:
            print(f"skip {code} {name}: no index rows", flush=True)
            continue

        normalized_rows = []
        for row in rows:
            raw_date = str(row.get("date", ""))
            normalized_rows.append({
                "trade_date": f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}",
                "industry_code": code, "industry_name": name, "provider": "free-stockdb",
                "open_price": row.get("open"), "high_price": row.get("high"),
                "low_price": row.get("low"), "close_price": row.get("close"),
                "change_pct": row.get("pct_chg"), "volume": row.get("volume"),
                "amount": row.get("amount"), "member_count": row.get("stock_count"),
                "source_updated_at": updated_at,
            })

        if args.endpoint:
            for offset in range(0, len(normalized_rows), 100):
                body = json.dumps({"rows": normalized_rows[offset:offset + 100]}).encode("utf-8")
                request = urllib.request.Request(args.endpoint, data=body, headers={
                    "Content-Type": "application/json",
                    "User-Agent": "DailyRisk-Industry-Materializer/1.0",
                }, method="POST")
                with urllib.request.urlopen(request, timeout=60) as response:
                    if response.status != 200:
                        raise RuntimeError(f"upload failed: {response.status} {response.read().decode()}")
            total_rows += len(rows)
            completed.append(code)
            print(f"imported {code} {name}: {len(rows)} rows, {len(symbols)} constituents", flush=True)
            continue

        sql = build_sql(code, name, rows, updated_at)
        with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8", delete=False) as handle:
            handle.write(sql)
            sql_path = Path(handle.name)
        try:
            command = ["npx.cmd", "wrangler", "d1", "execute", "daily-risk", f"--{args.mode}", "--file", str(sql_path)]
            last_error = None
            for attempt in range(1, 5):
                try:
                    subprocess.run(command, cwd=worker_dir, check=True)
                    last_error = None
                    break
                except subprocess.CalledProcessError as error:
                    last_error = error
                    if attempt < 4:
                        delay = attempt * 3
                        print(f"upload retry {attempt}/3 for {code} in {delay}s", flush=True)
                        time.sleep(delay)
            if last_error is not None:
                raise last_error
        finally:
            sql_path.unlink(missing_ok=True)

        total_rows += len(rows)
        completed.append(code)
        print(f"imported {code} {name}: {len(rows)} rows, {len(symbols)} constituents", flush=True)

    print(json.dumps({"industries": len(completed), "rows": total_rows, "codes": completed}, ensure_ascii=False))


if __name__ == "__main__":
    main()
