#!/usr/bin/env python3
"""data/楽曲基礎点.txt から実行時データを再生成する。

出力:
  js/song-kiso-data.js  … サイト本番（fetch 不要の内蔵 JS）
  data/楽曲基礎点.json   … JSON 形式（アプリ同期用・確認用）

編集フロー:
  1. data/楽曲基礎点.txt の「■ リスト」以下に「曲名<TAB>基礎点<TAB>ユニット」を追記/修正
       （unit 省略や「曲名=基礎点」形式も可。# 始まりと空行は無視）
  2. python3 tools/build-song-kiso-data.py
  3. ブラウザを強制再読み込み（Cmd+Shift+R）→ git commit / push

出力順は txt の記載順をそのまま反映する（並べ替えは txt 側で行う）。

使い方:
  python3 tools/build-song-kiso-data.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "楽曲基礎点.txt"
OUT_JS = ROOT / "js" / "song-kiso-data.js"
OUT_JSON = ROOT / "data" / "楽曲基礎点.json"

LIST_MARKER = "■ リスト"
DEFAULT_SOURCE = "基礎点表.html"
DEFAULT_VERSION = 1


def parse_txt():
    songs = []
    in_list = False
    seen = set()
    for raw in SRC.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not in_list:
            if line == LIST_MARKER:
                in_list = True
            continue
        if not line or line.startswith("#") or line.startswith("■"):
            continue

        if "\t" in raw:
            parts = [p.strip() for p in raw.split("\t")]
            name = parts[0]
            kiso_raw = parts[1] if len(parts) > 1 else ""
            unit = parts[2] if len(parts) > 2 else ""
        elif "=" in line:
            name, kiso_raw = (p.strip() for p in line.split("=", 1))
            unit = ""
        else:
            print(f"  [警告] 解析できない行をスキップ: {raw!r}")
            continue

        if not name or not kiso_raw:
            print(f"  [警告] 曲名/基礎点が空の行をスキップ: {raw!r}")
            continue
        try:
            kiso = int(float(kiso_raw))
        except ValueError:
            print(f"  [警告] 基礎点が数値でない行をスキップ: {raw!r}")
            continue

        if name in seen:
            print(f"  [警告] 曲名が重複しています（後勝ち）: {name}")
        seen.add(name)
        songs.append({"name": name, "kiso": kiso, "unit": unit})
    return songs


def read_meta():
    """既存 JSON の version/source を引き継ぐ。"""
    version, source = DEFAULT_VERSION, DEFAULT_SOURCE
    if OUT_JSON.exists():
        try:
            j = json.loads(OUT_JSON.read_text(encoding="utf-8"))
            version = j.get("version", version)
            source = j.get("source", source)
        except (json.JSONDecodeError, OSError):
            pass
    return version, source


def js_string(s: str) -> str:
    # JS のダブルクオート文字列としてエスケープ
    return json.dumps(s, ensure_ascii=False)


def write_js(songs):
    lines = [
        "/**",
        " * 楽曲・基礎点マスタ（data/楽曲基礎点.txt と同期）",
        " * 生成: python3 tools/build-song-kiso-data.py",
        " */",
        "const SONG_KISO_DATA = [",
    ]
    for s in songs:
        lines.append(
            f"  {{ name: {js_string(s['name'])}, kiso: {s['kiso']}, unit: {js_string(s['unit'])} }},"
        )
    lines += [
        "];",
        "",
        "if (typeof window !== 'undefined') {",
        "  window.SONG_KISO_DATA = SONG_KISO_DATA;",
        "}",
        "",
    ]
    OUT_JS.write_text("\n".join(lines), encoding="utf-8")


def write_json(songs, version, source):
    data = {"version": version, "source": source, "songs": songs}
    OUT_JSON.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main():
    songs = parse_txt()
    if not songs:
        raise SystemExit(f"{SRC} から曲を読み取れませんでした（「{LIST_MARKER}」以降を確認）")
    version, source = read_meta()
    write_js(songs)
    write_json(songs, version, source)
    print(f"再生成完了: {len(songs)} 曲")
    print(f"  {OUT_JS}")
    print(f"  {OUT_JSON}")


if __name__ == "__main__":
    main()
