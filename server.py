# server.py

import os
import sys
import json
import threading
import webbrowser
import urllib.request
import urllib.parse
import mimetypes
import platform
import shutil
import subprocess
import time
import tempfile
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer
from datetime import datetime

# --- Hide Windows Console window automatically if running directly or as compiled exe ---
if platform.system() == "Windows":
    try:
        import ctypes
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            # SW_HIDE = 0
            ctypes.windll.user32.ShowWindow(hwnd, 0)
    except Exception:
        pass

# Ensure standard output / error do not fail if running in noconsole/windowed mode
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w', encoding='utf-8', errors='ignore')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w', encoding='utf-8', errors='ignore')

# --- Linux / Fedora / Wayland Compatibility ---
if platform.system() == "Linux":
    os.environ["MOZ_ENABLE_WAYLAND"] = "1"
    if "QT_QPA_PLATFORM" not in os.environ:
        os.environ["QT_QPA_PLATFORM"] = "wayland;xcb"

# 1. FORCE EXPLICIT MIME-TYPE OVERRIDES
mimetypes.init()
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/html', '.html')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('application/pdf', '.pdf')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('audio/mpeg', '.mp3')

# 2. RESOLVE DIRECTORIES FOR APP PORTABILITY AND APPIMAGE
if getattr(sys, 'frozen', False):
    EXE_DIR = os.path.dirname(sys.executable)
    BUNDLE_DIR = getattr(sys, '_MEIPASS', EXE_DIR)
else:
    EXE_DIR = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = EXE_DIR

APPDIR = os.environ.get("APPDIR")
LAUNCH_DIR = os.environ.get("OWD", os.getcwd())
APPIMAGE_PATH = os.environ.get("APPIMAGE")
APPIMAGE_DIR = os.path.dirname(APPIMAGE_PATH) if APPIMAGE_PATH else None

# Find where web UI assets (index.html, JS, CSS) reside
candidate_web_dirs = []
if APPDIR:
    candidate_web_dirs.extend([
        os.path.join(APPDIR, "usr", "share", "mrcooper"),
        os.path.join(APPDIR, "usr", "bin"),
        APPDIR
    ])
candidate_web_dirs.extend([
    EXE_DIR,
    BUNDLE_DIR,
    os.path.dirname(os.path.abspath(__file__)),
    LAUNCH_DIR
])

WEB_DIR = None
for candidate in candidate_web_dirs:
    if candidate and os.path.exists(os.path.join(candidate, "index.html")):
        WEB_DIR = os.path.normpath(candidate)
        break

if not WEB_DIR:
    WEB_DIR = BUNDLE_DIR

os.chdir(WEB_DIR)

def get_clean_env():
    """Returns a clean environment dictionary for launching external host processes without AppImage library pollution."""
    env = os.environ.copy()

    # Restore original LD_LIBRARY_PATH from host system
    if "LD_LIBRARY_PATH_ORIG" in env:
        if env["LD_LIBRARY_PATH_ORIG"]:
            env["LD_LIBRARY_PATH"] = env["LD_LIBRARY_PATH_ORIG"]
        else:
            env.pop("LD_LIBRARY_PATH", None)
    else:
        ld_path = env.get("LD_LIBRARY_PATH", "")
        if ld_path:
            cleaned_parts = [
                p for p in ld_path.split(":")
                if p and not p.startswith("/tmp/.mount_") and "usr/bin/_internal" not in p and (not APPDIR or not p.startswith(APPDIR))
            ]
            if cleaned_parts:
                env["LD_LIBRARY_PATH"] = ":".join(cleaned_parts)
            else:
                env.pop("LD_LIBRARY_PATH", None)

    for var in ["PYTHONPATH", "PYTHONHOME", "PYTHONEXECUTABLE"]:
        env.pop(var, None)

    return env

def get_data_dir():
    search_locations = []
    if EXE_DIR and EXE_DIR not in search_locations:
        search_locations.append(EXE_DIR)
    if LAUNCH_DIR and LAUNCH_DIR not in search_locations:
        search_locations.append(LAUNCH_DIR)
    if APPIMAGE_DIR and APPIMAGE_DIR not in search_locations:
        search_locations.append(APPIMAGE_DIR)

    for loc in search_locations:
        config_path = os.path.join(loc, "folder_config.txt")
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    path = f.read().strip()
                if path:
                    if os.path.isabs(path):
                        return os.path.normpath(path)
                    else:
                        return os.path.normpath(os.path.join(loc, path))
            except Exception:
                pass

    for loc in search_locations:
        for folder in ["0_Quiz", "0 Quiz"]:
            candidate = os.path.join(loc, folder)
            if os.path.exists(candidate):
                return os.path.normpath(candidate)

    # Seed bundled templates to a writable directory if running from an AppImage or executable
    target_base = EXE_DIR if os.path.exists(EXE_DIR) else LAUNCH_DIR
    target_data_dir = os.path.normpath(os.path.join(target_base, "0_Quiz"))
    try:
        os.makedirs(target_data_dir, exist_ok=True)
        if APPDIR:
            bundled_quiz = os.path.join(APPDIR, "usr", "share", "mrcooper", "0_Quiz")
            if os.path.exists(bundled_quiz) and not os.listdir(target_data_dir):
                shutil.copytree(bundled_quiz, target_data_dir, dirs_exist_ok=True)
    except Exception:
        fallback_dir = os.path.expanduser("~/.local/share/MrCooperQuiz/0_Quiz")
        os.makedirs(fallback_dir, exist_ok=True)
        return fallback_dir

    return target_data_dir

DATA_DIR = get_data_dir()
CONFIG_FILES = {'canvas.json', 'settings.json', 'ignore.json', 'autolink.json', 'order.json', 'QuizResults.json', 'missing.json', 'quiz_index.json'}

_QUIZ_CACHE = {}

def get_quiz_points(file_path):
    pts = 0
    try:
        with open(file_path, 'r', encoding='utf-8-sig') as qf:
            qd = json.load(qf)
            items = qd if isinstance(qd, list) else qd.get("data", []) if isinstance(qd, dict) else []
            for item in items:
                if isinstance(item, dict):
                    pts += int(float(item.get('points', item.get('points_possible', 0))))
    except Exception:
        pass
    return pts

def update_quiz_index():
    global _QUIZ_CACHE
    index_data = {}
    if not os.path.exists(DATA_DIR):
        return index_data, []

    all_quizzes = []
    for root, dirs, files in os.walk(DATA_DIR):
        if "media" in root or "bonus" in root:
            continue
        for f in files:
            if f.endswith('.json') and f not in CONFIG_FILES:
                quiz_name = f[:-5]
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, DATA_DIR).replace('\\', '/')
                index_data[quiz_name] = rel_path

                mtime = os.path.getmtime(full_path)
                cached = _QUIZ_CACHE.get(full_path)
                if cached and cached.get("mtime") == mtime:
                    pts = cached.get("points", 0)
                else:
                    pts = get_quiz_points(full_path)
                    _QUIZ_CACHE[full_path] = {"mtime": mtime, "points": pts}

                all_quizzes.append({"name": quiz_name, "points": pts})

    try:
        with open(os.path.join(DATA_DIR, 'quiz_index.json'), 'w', encoding='utf-8') as out_f:
            json.dump(index_data, out_f, indent=4)
    except Exception:
        pass

    return index_data, all_quizzes

class QuizAPIHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        try:
            msg = format % args
            if not ('" 200 ' in msg or '" 304 ' in msg):
                print(f"[SERVER LOG]: {self.address_string()} - {msg}")
        except Exception:
            pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        clean_path = urllib.parse.unquote(self.path).replace('\\', '/')
        if '?' in clean_path:
            clean_path = clean_path.split('?')[0]

        if clean_path == '/api/config':
            _, all_quizzes = update_quiz_index()

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            def safe_read(fname, default):
                path = os.path.join(DATA_DIR, fname)
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            return json.load(f)
                    except Exception:
                        pass
                return default

            canvas_data = safe_read('canvas.json', {"6": {}, "7": {}, "8": {}})
            ignore_data = safe_read('ignore.json', [])
            autolink_data = safe_read('autolink.json', {"enabled": False, "webhook_url": ""})
            order_data = safe_read('order.json', {})
            settings_data = safe_read('settings.json', {
                "anchor_date": "2026-06-15",
                "anchor_week": 37,
                "manual_week_override": None,
                "manual_date_string": None,
                "show_bonus": True,
                "show_results": False,
                "subjects": {
                    "6": [],
                    "7": ["Computer Science (CS)", "STEAM"],
                    "8": []
                }
            })

            response = {
                "is_offline_mode": True,
                "canvas": canvas_data,
                "ignore": ignore_data,
                "autolink": autolink_data,
                "order": order_data,
                "settings": settings_data,
                "quizzes": all_quizzes,
                "folder": DATA_DIR
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return

        custom_folder_name = os.path.basename(DATA_DIR)
        for prefix in ["/0_Quiz/", "/0 Quiz/", f"/{custom_folder_name}/"]:
            if clean_path.startswith(prefix):
                relative_file_path = clean_path[len(prefix):]
                target_file = os.path.join(DATA_DIR, relative_file_path)
                if os.path.exists(target_file) and os.path.isfile(target_file):
                    self.send_response(200)
                    ctype = self.guess_type(target_file) or 'application/octet-stream'
                    if target_file.lower().endswith('.pdf'):
                        ctype = 'application/pdf'
                    self.send_header("Content-type", ctype)
                    filename = os.path.basename(target_file)
                    quoted_filename = urllib.parse.quote(filename)
                    self.send_header("Content-Disposition", f'inline; filename="{filename}"; filename*=UTF-8\'\'{quoted_filename}')
                    self.end_headers()
                    with open(target_file, 'rb') as f:
                        self.wfile.write(f.read())
                    return
                else:
                    self.send_error(404, f"File {relative_file_path} not found in quiz folder")
                    return

        super().do_GET()

    def do_POST(self):
        clean_path = urllib.parse.unquote(self.path).replace('\\', '/')
        if '?' in clean_path:
            clean_path = clean_path.split('?')[0]

        if clean_path == '/api/config':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))

            def safe_write(fname, data):
                path = os.path.join(DATA_DIR, fname)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                tmp_path = path + ".tmp"
                with open(tmp_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass
                shutil.move(tmp_path, path)

            if 'canvas' in payload:
                safe_write('canvas.json', payload['canvas'])
            if 'ignore' in payload:
                safe_write('ignore.json', payload['ignore'])
            if 'autolink' in payload:
                safe_write('autolink.json', payload['autolink'])
            if 'order' in payload:
                safe_write('order.json', payload['order'])
            if 'settings' in payload:
                safe_write('settings.json', payload['settings'])
            if 'folder' in payload:
                save_cfg_loc = EXE_DIR if os.path.exists(EXE_DIR) else LAUNCH_DIR
                try:
                    with open(os.path.join(save_cfg_loc, "folder_config.txt"), 'w', encoding='utf-8') as f:
                        f.write(payload['folder'])
                except Exception:
                    pass

            if 'delete_quizzes' in payload and payload['delete_quizzes']:
                index_path = os.path.join(DATA_DIR, 'quiz_index.json')
                try:
                    with open(index_path, 'r', encoding='utf-8') as f:
                        idx = json.load(f)
                except Exception:
                    idx = {}
                for dq in payload['delete_quizzes']:
                    fp = os.path.join(DATA_DIR, idx[dq]) if dq in idx else os.path.join(DATA_DIR, f"{dq}.json")
                    if os.path.exists(fp):
                        try:
                            os.remove(fp)
                        except Exception:
                            pass

            update_quiz_index()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        elif clean_path == '/api/save_result':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                results_file = os.path.join(DATA_DIR, 'QuizResults.json')
                data = {}
                if os.path.exists(results_file):
                    with open(results_file, 'r', encoding='utf-8') as f:
                        try:
                            data = json.load(f)
                        except Exception:
                            pass

                cls, name = payload.get('studentClass', 'Unknown'), payload.get('studentName', 'Unknown')
                quizName, score, total = payload.get('quizName', 'Unknown'), payload.get('score', 0), payload.get('totalPossible', 0)

                if cls not in data:
                    data[cls] = {}
                if name not in data[cls]:
                    data[cls][name] = {}
                if quizName not in data[cls][name]:
                    data[cls][name][quizName] = {"best": 0, "attempts": []}

                data[cls][name][quizName]["attempts"].append({"s": score, "t": total, "ts": datetime.now().isoformat()})
                if score > data[cls][name][quizName]["best"]:
                    data[cls][name][quizName]["best"] = score

                with open(results_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)

                autolink_config, webhook_success = {"enabled": False, "webhook_url": ""}, False
                if os.path.exists(os.path.join(DATA_DIR, 'autolink.json')):
                    try:
                        with open(os.path.join(DATA_DIR, 'autolink.json'), 'r') as f:
                            autolink_config = json.load(f)
                    except Exception:
                        pass

                if autolink_config.get("enabled"):
                    webhook_url = autolink_config.get("webhook_url", "").strip() or "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=2cGDgH4Pcdag3rgX3j1BCgZ82ePKwD5S9Kcw84c7G6733Py3AHQnhgBnrqfcqYBu0e8mEpuBTkJj3HgqUstHB3zNoJdadg0y4A2TGOqElbp2"
                    webhook_payload = {"add_records": [{"values": {"f04Gwj": str(name), "ftQMc5": str(cls), "ftk5Tx": str(quizName), "ffFwIh": int(score), "fn8TJd": int(total)}}]}
                    req = urllib.request.Request(webhook_url, data=json.dumps(webhook_payload).encode('utf-8'), headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
                    try:
                        urllib.request.urlopen(req, timeout=5)
                        webhook_success = True
                    except Exception as we:
                        print(f"Webhook error: {we}")

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "webhook_success": webhook_success}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def launch_browser_app(url, profile_dir):
    """Finds Chromium, Chrome, Edge, Firefox, or Flatpak browsers and launches in App or dedicated window mode."""
    clean_env = get_clean_env()
    cmd_prefix = []

    if platform.system() == "Windows":
        paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        for p in paths:
            if os.path.exists(p):
                cmd_prefix = [p]
                break
        if not cmd_prefix:
            for b in ["chrome.exe", "msedge.exe"]:
                path = shutil.which(b)
                if path:
                    cmd_prefix = [path]
                    break

    elif platform.system() == "Darwin":
        mac_paths = [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
        ]
        for p in mac_paths:
            if os.path.exists(p):
                cmd_prefix = [p]
                break

    else:
        # Linux Binary Search (Edge, Chrome, Chromium, Brave, Vivaldi)
        linux_binaries = [
            "microsoft-edge-stable", "microsoft-edge", "microsoft-edge-beta", "microsoft-edge-dev", "msedge",
            "google-chrome-stable", "google-chrome", "google-chrome-beta", "google-chrome-unstable",
            "chromium-browser", "chromium", "brave-browser", "brave", "vivaldi-stable", "vivaldi"
        ]

        for b in linux_binaries:
            found = shutil.which(b)
            if found:
                cmd_prefix = [found]
                break

        # Linux Direct Filesystem Paths (/opt, /usr, /var/lib/flatpak, ~/.local/share/flatpak)
        if not cmd_prefix:
            home_dir = os.path.expanduser("~")
            direct_linux_paths = [
                "/opt/microsoft/msedge/msedge",
                "/opt/google/chrome/google-chrome",
                "/opt/google/chrome/chrome",
                "/usr/bin/microsoft-edge",
                "/usr/bin/microsoft-edge-stable",
                "/usr/bin/google-chrome",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
                "/usr/local/bin/microsoft-edge",
                "/usr/local/bin/google-chrome",
                "/snap/bin/microsoft-edge",
                "/snap/bin/chromium",
                os.path.join(home_dir, ".local/share/flatpak/exports/bin/com.microsoft.Edge"),
                "/var/lib/flatpak/exports/bin/com.microsoft.Edge",
                os.path.join(home_dir, ".local/share/flatpak/exports/bin/com.google.Chrome"),
                "/var/lib/flatpak/exports/bin/com.google.Chrome",
                os.path.join(home_dir, ".local/share/flatpak/exports/bin/org.chromium.Chromium"),
                "/var/lib/flatpak/exports/bin/org.chromium.Chromium"
            ]
            for p in direct_linux_paths:
                if os.path.exists(p):
                    cmd_prefix = [p]
                    break

        # Flatpak CLI Runner Search (Standard on Fedora Kinoite / Silverblue)
        if not cmd_prefix and shutil.which("flatpak"):
            flatpak_app_ids = ["com.microsoft.Edge", "com.google.Chrome", "org.chromium.Chromium", "com.brave.Browser"]
            try:
                out = subprocess.check_output(["flatpak", "list", "--app"], env=clean_env, universal_newlines=True, stderr=subprocess.DEVNULL)
                for app_id in flatpak_app_ids:
                    if app_id in out:
                        cmd_prefix = ["flatpak", "run", app_id]
                        break
            except Exception:
                pass

    if cmd_prefix:
        print(f"[DEBUG] Launching native Chromium engine in App Mode: {' '.join(cmd_prefix)}")
        launch_args = cmd_prefix + [
            f"--app={url}",
            f"--user-data-dir={profile_dir}",
            "--start-maximized",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-pinch"
        ]
        return subprocess.Popen(launch_args, env=clean_env)

    # Firefox / Flatpak Firefox Fallback (Default browser on Fedora Kinoite)
    if platform.system() == "Linux":
        if shutil.which("flatpak"):
            try:
                out = subprocess.check_output(["flatpak", "list", "--app"], env=clean_env, universal_newlines=True, stderr=subprocess.DEVNULL)
                if "org.mozilla.firefox" in out:
                    print("[DEBUG] Launching Flatpak Firefox in new window mode.")
                    return subprocess.Popen(["flatpak", "run", "org.mozilla.firefox", "--new-window", url], env=clean_env)
            except Exception:
                pass

        if shutil.which("firefox"):
            print("[DEBUG] Launching native Firefox in new window mode.")
            return subprocess.Popen(["firefox", "--new-window", url], env=clean_env)

        if shutil.which("xdg-open"):
            print("[DEBUG] Launching via xdg-open.")
            return subprocess.Popen(["xdg-open", url], env=clean_env)

    print("[DEBUG] Falling back to default system browser.")
    webbrowser.open(url)
    return None

def run_app():
    try:
        httpd = ThreadingTCPServer(("127.0.0.1", 0), QuizAPIHandler)
        assigned_port = httpd.server_address[1]
    except OSError as e:
        print(f"Failed to bind local server address: {e}")
        sys.exit(1)

    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    print("==================================================")
    print("Mr. Cooper's Quiz Server is running locally!")
    print(f"Serving Web Files from: {WEB_DIR}")
    print(f"Serving Quiz Data from: {DATA_DIR}")
    print(f"Background Port: {assigned_port}")
    print("==================================================")

    update_quiz_index()

    local_url = f"http://127.0.0.1:{assigned_port}/index.html"
    warm_profile = os.path.join(tempfile.gettempdir(), "MrCooperAppEdgeProfile")
    os.makedirs(warm_profile, exist_ok=True)

    proc = launch_browser_app(local_url, warm_profile)

    if proc:
        t0 = time.time()
        try:
            proc.wait()
        except KeyboardInterrupt:
            pass

        # If the browser process delegated to an existing browser instance and exited in < 5 seconds,
        # keep the server alive so that user interactions and saves continue working properly.
        if time.time() - t0 < 5:
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
    else:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

    print("\nServer shutting down cleanly...")
    httpd.shutdown()

if __name__ == '__main__':
    run_app()