#!/usr/bin/env python3
"""未来喫茶 ローカル開発サーバー（自動リロード付き）

目的:
  ローカルでコードを直すたびに、ブラウザ（ホーム画面アプリ含む）が
  自動で最新を読み込むようにする。

やっていること:
  1. すべてのレスポンスに Cache-Control: no-store を付け、キャッシュを無効化
     （?v=NN を手で上げなくても常に最新のJS/CSSが読まれる）
  2. css / js / *.html などの更新時刻を監視するトークンを /__livereload で公開
  3. 配信する HTML に小さなポーリングスクリプトを注入し、
     ファイルが変わったらページを自動リロード

使い方:
  python3 tools/dev-server.py            # http://localhost:8000/
  python3 tools/dev-server.py --port 5500
  python3 tools/dev-server.py --open     # 起動後にブラウザを開く

  同じLANのスマホから見る場合は表示される 192.168.x.x のURLを開く。
"""
import argparse
import json
import os
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WATCH_DIRS = ["css", "js", "data", "img", "."]
WATCH_EXT = {".html", ".css", ".js", ".json"}

LIVERELOAD_SNIPPET = """
<script>
(function () {
  var url = '/__livereload';
  var current = null;
  function poll() {
    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (current === null) { current = d.token; }
        else if (d.token !== current) { location.reload(); }
      })
      .catch(function () {})
      .finally(function () { setTimeout(poll, 1000); });
  }
  poll();
})();
</script>
"""


def compute_token():
    """監視対象ファイルの最終更新時刻の最大値をトークンにする。"""
    latest = 0.0
    for d in WATCH_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        if base.is_file():
            files = [base]
        elif d == ".":
            files = base.glob("*")
        else:
            files = base.rglob("*")
        for f in files:
            try:
                if f.is_file() and f.suffix in WATCH_EXT:
                    m = f.stat().st_mtime
                    if m > latest:
                        latest = m
            except OSError:
                continue
    return round(latest, 3)


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/__livereload":
            body = json.dumps({"token": compute_token()}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # HTML はライブリロード用スクリプトを差し込んで配信
        fs_path = self.translate_path(self.path)
        if os.path.isdir(fs_path):
            for idx in ("index.html", "index.htm"):
                cand = os.path.join(fs_path, idx)
                if os.path.isfile(cand):
                    fs_path = cand
                    break
        if fs_path.endswith((".html", ".htm")) and os.path.isfile(fs_path):
            with open(fs_path, "rb") as fh:
                html = fh.read().decode("utf-8", "replace")
            snippet = LIVERELOAD_SNIPPET
            if "</body>" in html:
                html = html.replace("</body>", snippet + "</body>", 1)
            else:
                html += snippet
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()


def local_ip():
    import socket

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser(description="未来喫茶 ローカル開発サーバー")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--open", action="store_true", help="起動後にブラウザを開く")
    args = ap.parse_args()

    handler = partial(DevHandler, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), handler)
    url = f"http://localhost:{args.port}/"
    print("未来喫茶 開発サーバー起動（自動リロード / キャッシュ無効）")
    print(f"  ローカル:   {url}")
    print(f"  同一LAN:    http://{local_ip()}:{args.port}/")
    print("  停止: Ctrl+C")
    if args.open:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")
        httpd.shutdown()


if __name__ == "__main__":
    main()
