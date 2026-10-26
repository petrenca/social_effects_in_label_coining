"""Local lab server for the two-computer experiment (no PHP needed).

Run on ONE of the two lab computers (start_local.bat does this):
    py local_server.py            (port 8000)
    py local_server.py 8080       (other port)

It serves this folder and answers the same requests as the PHP scripts on the HU server:
    sync/sync.php                 shared pair store (actions get / set / join, see sync/sync.php)
    save_data.php                 writes data/social_<pair>_<role>_<timestamp>.csv
    save_data_test.php            writes data_test/TEST_social_<pair>_<role>_<timestamp>.csv
so the experiment code is identical locally and on the server. Keep this file in sync with
sync/sync.php and save_data*.php.

The other computer connects over the local network via the address printed at start-up.
Windows asks once whether Python may accept network connections: allow it for private networks.
Only standard library, no packages to install.
"""
import json
import re
import socket
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()  # both browsers may write at the same moment

SAVE_TARGETS = {
    "/save_data.php": (ROOT / "data", re.compile(r"^social_[0-9]+_(naive|confederate)_[0-9]+\.csv$")),
    "/save_data_test.php": (ROOT / "data_test", re.compile(r"^TEST_social_[0-9]+_(naive|confederate)_[0-9]+\.csv$")),
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # always serve the current files (stimuli, config) - never a copy cached by the browser
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "sync.php" not in self.path:  # polling would flood the console
            super().log_message(fmt, *args)

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        form = {k: v[0] for k, v in parse_qs(self.rfile.read(length).decode("utf-8"), keep_blank_values=True).items()}
        if path == "/sync/sync.php":
            self.handle_sync(form)
        elif path in SAVE_TARGETS:
            self.handle_save(form, *SAVE_TARGETS[path])
        else:
            self.reply(404, "not found")

    def reply(self, code, body, content_type="text/plain; charset=utf-8"):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_sync(self, form):
        action, pair, role = form.get("action", ""), form.get("pair", ""), form.get("role", "")
        state_dir = ROOT / "sync" / ("state_test" if form.get("test") == "1" else "state")
        # the values become file names / JSON keys, so only accept what the experiment uses
        if not re.fullmatch(r"[0-9]{1,6}", pair):
            return self.reply(400, '{"error": "bad pair"}')
        if action not in ("get", "set", "join"):
            return self.reply(400, '{"error": "bad action"}')
        if action != "get" and role not in ("naive", "confederate"):
            return self.reply(400, '{"error": "bad role"}')
        key = form.get("key", "")
        if action == "set" and not re.fullmatch(r"[A-Za-z0-9_]{1,80}", key):
            return self.reply(400, '{"error": "bad key"}')

        state_file = state_dir / f"pair_{pair}.json"
        with LOCK:
            try:
                state = json.loads(state_file.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError):
                state = {}
            if action != "get":
                entry = {"value": json.loads(form.get("value", "null")), "t": int(time.time() * 1000)}
                if action == "join":
                    state[role] = {"joined": entry}
                else:
                    state.setdefault(role, {})[key] = entry
                state_dir.mkdir(parents=True, exist_ok=True)
                state_file.write_text(json.dumps(state, ensure_ascii=False, indent=4), encoding="utf-8")
        self.reply(200, json.dumps(state, ensure_ascii=False), "application/json; charset=utf-8")

    def handle_save(self, form, folder, pattern):
        name = Path(form.get("filename", "")).name
        if not pattern.fullmatch(name) or "filedata" not in form:
            return self.reply(400, "bad request")
        folder.mkdir(exist_ok=True)
        (folder / name).write_text(form["filedata"], encoding="utf-8")
        print(f"  saved {folder.name}/{name}")
        self.reply(200, "ok")


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # no packet is sent; only picks the network interface
            return s.getsockname()[0]
    except OSError:
        return socket.gethostbyname(socket.gethostname())


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    ip = lan_ip()
    print("Experiment server running. Close this window to stop it.\n")
    print(f"  this computer:   http://localhost:{port}/main_social_basic.html")
    print(f"  other computer:  http://{ip}:{port}/main_social_basic.html\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
