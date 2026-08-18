#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""楽曲・イベントボーダーを かんたんに追加する対話ツール。

これ1つで「追記」＋「本番データの再生成」まで自動で行います。
書式を覚える必要も、複数コマンドを打つ必要もありません。

  python3 tools/add-data.py

  [1] 楽曲を追加       → data/楽曲基礎点.txt に追記し
                         js/song-kiso-data.js と data/楽曲基礎点.json を再生成
  [2] イベントを追加   → js/border-rankings-data.js に順位帯ごとのボーダーを追加

まとめて大量に編集したいときは、従来どおり Excel 往復ツール
（export-/import-border-xlsx.py, export-/import-song-kiso-xlsx.py）も使えます。
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- 楽曲 ---
SONG_TXT = ROOT / "data" / "楽曲基礎点.txt"
SONG_BUILD = ROOT / "tools" / "build-song-kiso-data.py"
LIST_MARKER = "■ リスト"

# --- イベントボーダー ---
BORDER_JS = ROOT / "js" / "border-rankings-data.js"
BORDER_XLSX_EXPORT = ROOT / "tools" / "export-border-xlsx.py"
TIERS = ["10", "50", "100", "500", "1000", "5000"]
TIER_LABEL = {t: f"TOP{t}" for t in TIERS}
ROW_KEYS = ["eventName", "pointsDisplay", "eventType", "banner", "unit", "days", "bonus", "points"]
DEFAULT_SOURCE = "参考データ/【完全版】プロセカボーダーランキング のコピー"


# ============================================================
# 入力ヘルパー
# ============================================================
def ask(label, default=None, required=True):
    suffix = f"（例/初期値: {default}）" if default else ""
    while True:
        v = input(f"  {label}{suffix}: ").strip()
        if not v and default is not None:
            return default
        if not v and not required:
            return ""
        if v:
            return v
        print("    ※ 入力してください")


def ask_kiso(label="基礎点"):
    while True:
        v = input(f"  {label}（数字 1〜999）: ").strip()
        try:
            k = int(float(v))
        except ValueError:
            print("    ※ 数字で入力してください")
            continue
        if 1 <= k <= 999:
            return k
        print("    ※ 1〜999 の範囲で入力してください")


def ask_points(label):
    """空欄なら None（その順位帯はデータなし）。カンマ入りも可。"""
    v = input(f"  {label}（Pt / 無ければ空Enter）: ").strip()
    if not v:
        return None
    s = v.replace(",", "").replace("，", "")
    try:
        return int(round(float(s)))
    except ValueError:
        print("    ※ 数字として読めないのでスキップしました")
        return None


def confirm(label="この内容で追加しますか？"):
    return input(f"  {label} [Y/n]: ").strip().lower() in ("", "y", "yes")


def points_display(n: int) -> str:
    n = int(round(n))
    oku = n // 100_000_000
    man = (n % 100_000_000) // 10_000
    if oku > 0:
        return f"約{oku}億{man}万P" if man > 0 else f"約{oku}億P"
    if man > 0:
        return f"約{man}万P"
    return f"約{n}P"


def fmt_num(n):
    return f"{int(n):,}"


# ============================================================
# 楽曲の追加
# ============================================================
def song_name_of(rawline):
    t = rawline.strip()
    if not t or t.startswith("#") or t.startswith("■"):
        return None
    if "\t" in rawline:
        return rawline.split("\t")[0].strip()
    if "=" in t:
        return t.split("=", 1)[0].strip()
    return None


def load_song_body():
    lines = SONG_TXT.read_text(encoding="utf-8").splitlines()
    idx = None
    for i, l in enumerate(lines):
        if l.strip() == LIST_MARKER:
            idx = i
            break
    if idx is None:
        if lines and lines[-1].strip():
            lines.append("")
        lines.append(LIST_MARKER)
        idx = len(lines) - 1
    head = lines[: idx + 1]
    body = lines[idx + 1:]
    while body and body[-1].strip() == "":
        body.pop()
    return head, body


def add_song(name, kiso, unit):
    head, body = load_song_body()
    newline = f"{name}\t{kiso}\t{unit}" if unit else f"{name}\t{kiso}"

    for i, l in enumerate(body):
        if song_name_of(l) == name:
            body[i] = newline
            SONG_TXT.write_text("\n".join(head + body) + "\n", encoding="utf-8")
            return "updated"

    insert_at = len(body)
    for i, l in enumerate(body):
        nm = song_name_of(l)
        if nm is None:
            continue
        if name < nm:
            insert_at = i
            break
    body.insert(insert_at, newline)
    SONG_TXT.write_text("\n".join(head + body) + "\n", encoding="utf-8")
    return "added"


def rebuild_song():
    subprocess.run([sys.executable, str(SONG_BUILD)], check=True)


def flow_add_song():
    print("\n── 楽曲を追加 ──")
    name = ask("曲名")
    kiso = ask_kiso()
    unit = ask("ユニット", default="", required=False)
    print(f"\n  → 曲名: {name} / 基礎点: {kiso} / ユニット: {unit or '(なし)'}")
    if not confirm():
        print("  中止しました。")
        return
    result = add_song(name, kiso, unit)
    rebuild_song()
    verb = "更新" if result == "updated" else "追加"
    print(f"  ✅ 楽曲を{verb}しました（js/song-kiso-data.js と .json を再生成）\n")


# ============================================================
# イベントボーダーの追加
# ============================================================
def load_border():
    text = BORDER_JS.read_text(encoding="utf-8")
    m = re.search(r"const EMBEDDED_BORDER_DATA\s*=\s*(\{.*\});?\s*$", text, re.S)
    if not m:
        raise SystemExit("border-rankings-data.js を解析できませんでした")
    return json.loads(m.group(1))


def ordered_unique(values, prior):
    seen = set()
    out = []
    for v in prior or []:
        if v in values and v not in seen:
            out.append(v)
            seen.add(v)
    for v in sorted(values):
        if v not in seen:
            out.append(v)
            seen.add(v)
    return out


def write_border(data):
    ranks = data["ranks"]
    banner_vals = {r["banner"] for t in TIERS for r in ranks.get(t, []) if r.get("banner")}
    unit_vals = {r["unit"] for t in TIERS for r in ranks.get(t, []) if r.get("unit")}
    banners = ordered_unique(banner_vals, data.get("banners"))
    units = ordered_unique(unit_vals, data.get("units"))
    out = {
        "source": data.get("source") or DEFAULT_SOURCE,
        "ranks": {t: [{k: row[k] for k in ROW_KEYS} for row in ranks.get(t, [])] for t in TIERS},
        "banners": banners,
        "units": units,
    }
    payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    BORDER_JS.write_text(
        "/** 自動生成: python3 tools/import-border-xlsx.py（元: data/イベントボーダー一覧.xlsx）"
        " / 追加: tools/add-data.py */\n"
        f"const EMBEDDED_BORDER_DATA = {payload};\n",
        encoding="utf-8",
    )


def refresh_border_xlsx():
    """確認用 Excel を最新の JS から作り直す（openpyxl があれば）。"""
    env = os.environ.copy()
    env.setdefault("PYTHONPATH", str(ROOT / ".pylibs"))
    try:
        subprocess.run(
            [sys.executable, str(BORDER_XLSX_EXPORT)],
            cwd=str(ROOT), env=env, check=True,
            stdout=subprocess.DEVNULL,
        )
        print("  （data/イベントボーダー一覧.xlsx も最新化しました）")
    except Exception as e:  # noqa: BLE001
        print(f"  ※ Excel の再生成はスキップ（{e}）。必要なら export-border-xlsx.py を実行してください。")


def flow_add_event():
    print("\n── イベント（ボーダー）を追加 ──")
    data = load_border()

    event_name = ask("イベント名")
    banner = ask("バナー（キャラ名。例: 絵名）")
    unit = ask("ユニット（例: ニーゴ / ビビバス / 混合）")
    event_type = ask("種別", default="マラソン")
    days = ask("開催日数", default="9日")
    bonus = ask("イベントボーナス", default="435%")

    print("\n  順位帯ごとのボーダーPtを入力（分かる帯だけでOK。無い帯は空Enter）")
    tier_points = {}
    for t in TIERS:
        pts = ask_points(f"  {TIER_LABEL[t]}")
        if pts is not None:
            tier_points[t] = pts

    if not tier_points:
        print("  ボーダーPtが1つも入力されなかったため中止しました。")
        return

    print(f"\n  → {event_name}")
    print(f"     バナー: {banner} / ユニット: {unit} / 種別: {event_type} / 日数: {days} / ボーナス: {bonus}")
    for t in TIERS:
        if t in tier_points:
            print(f"     {TIER_LABEL[t]}: {fmt_num(tier_points[t])} Pt（{points_display(tier_points[t])}）")
    if not confirm():
        print("  中止しました。")
        return

    added, updated = 0, 0
    for t, pts in tier_points.items():
        rows = data["ranks"].setdefault(t, [])
        existing = next((r for r in rows if r.get("eventName") == event_name), None)
        row = {
            "eventName": event_name,
            "pointsDisplay": points_display(pts),
            "eventType": event_type,
            "banner": banner,
            "unit": unit,
            "days": days,
            "bonus": bonus,
            "points": pts,
        }
        if existing:
            rows[rows.index(existing)] = row
            updated += 1
        else:
            rows.append(row)
            added += 1
        rows.sort(key=lambda x: -x["points"])

    write_border(data)
    msg = f"  ✅ イベントを反映しました（{added}帯を追加"
    msg += f" / {updated}帯を更新" if updated else ""
    msg += "、js/border-rankings-data.js を再生成）"
    print(msg)
    refresh_border_xlsx()
    print()


# ============================================================
# メニュー
# ============================================================
def main():
    print("=" * 48)
    print(" 未来喫茶 データ追加ツール")
    print("=" * 48)
    while True:
        print("何を追加しますか？")
        print("  [1] 楽曲（基礎点）")
        print("  [2] イベント（ボーダー）")
        print("  [q] 終了")
        choice = input("番号を選択: ").strip().lower()
        if choice in ("q", "quit", "exit"):
            print("終了します。ブラウザは Cmd+Shift+R で再読み込みしてください。")
            break
        if choice == "1":
            try:
                flow_add_song()
            except Exception as e:  # noqa: BLE001
                print(f"  ⚠️ エラー: {e}\n")
        elif choice == "2":
            try:
                flow_add_event()
            except Exception as e:  # noqa: BLE001
                print(f"  ⚠️ エラー: {e}\n")
        else:
            print("  ※ 1 / 2 / q を入力してください\n")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\n中断しました。")
