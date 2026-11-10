"""Offline equipment-preset editor: data is kept in one local JSON file."""

import argparse
import json
import sqlite3
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
STATE = HERE / "presets.json"
OLD_DB = HERE / "presets.sqlite3"
MAX_BODY_BYTES = 1_000_000
FILES = {"/": ("index.html", "text/html; charset=utf-8"), "/index.html": ("index.html", "text/html; charset=utf-8"), "/style.css": ("style.css", "text/css; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8")}


def valid_database(value):
    if not isinstance(value, dict) or value.get("schemaVersion") != 2:
        return False
    for kind in ("weapon", "armor"):
        sets = value.get("equipment", {}).get(kind, {}).get("sets")
        if not isinstance(sets, dict):
            return False
        for group in sets.values():
            mains, subs, cells = (group.get(key) for key in ("mainOptions", "subOptions", "cells"))
            if not all(isinstance(items, list) for items in (mains, subs, cells)) or not all(isinstance(name, str) for name in mains + subs):
                return False
            if len(cells) != len(subs) or any(not isinstance(row, list) or len(row) != len(mains) or any(type(cell) is not bool for cell in row) for row in cells):
                return False
    return True


def write_state(data):
    temporary = STATE.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(STATE)


def load_state():
    if STATE.exists():
        data = json.loads(STATE.read_text(encoding="utf-8"))
    elif OLD_DB.exists():
        with sqlite3.connect(OLD_DB) as db:
            data = json.loads(db.execute("SELECT content FROM app_state WHERE id = 1").fetchone()[0])
        write_state(data)
    else:
        data = json.loads((STATIC / "seed.json").read_text(encoding="utf-8"))
        write_state(data)
    if not valid_database(data):
        raise ValueError("presets.json 형식이 올바르지 않습니다.")
    return data


class Handler(BaseHTTPRequestHandler):
    server_version = "PresetLocal/2.0"

    def allowed_request(self):
        host = self.headers.get("Host", "")
        if host not in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}:
            self.send_json(403, {"error": "로컬 주소에서만 사용할 수 있습니다."})
            return False
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{host}":
            self.send_json(403, {"error": "로컬 화면에서만 수정할 수 있습니다."})
            return False
        return True

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.allowed_request():
            return
        path = urlsplit(self.path).path
        if path == "/api/presets":
            self.send_json(200, load_state())
            return
        if path.startswith("/icons/"):
            name = path.removeprefix("/icons/")
            if Path(name).name != name or not name.endswith(".png"):
                self.send_error(404)
                return
            icon = STATIC / "icons" / name
            if not icon.is_file():
                self.send_error(404)
                return
            body = icon.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        asset = FILES.get(path)
        if asset is None:
            self.send_error(404)
            return
        filename, content_type = asset
        body = (STATIC / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        if not self.allowed_request():
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length)) if 0 < length <= MAX_BODY_BYTES else None
        except (ValueError, UnicodeDecodeError):
            data = None
        if urlsplit(self.path).path != "/api/presets" or not valid_database(data):
            self.send_json(400, {"error": "데이터 형식이 올바르지 않습니다."})
            return
        write_state(data)
        self.send_json(200, {"ok": True})


def main():
    parser = argparse.ArgumentParser(description="Offline Seven Knights gear preset editor")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    load_state()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"장비 판매 프리셋: {url}", flush=True)
    print(f"데이터 파일: {STATE}", flush=True)
    if not args.no_browser:
        webbrowser.open_new_tab(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
