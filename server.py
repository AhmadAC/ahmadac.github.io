# server.py

import os
import sys
import json
import re
import threading
import webbrowser
import urllib.request
import urllib.parse
import urllib.error
import mimetypes
import platform
import shutil
import subprocess
import time
import tempfile
import zipfile
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer
from datetime import datetime

CURRENT_VERSION = "v1.0.1.3"

# --- Hide Windows Console window automatically if running directly or as compiled exe ---
if platform.system() == "Windows":
    try:
        import ctypes
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)
    except Exception:
        pass

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w', encoding='utf-8', errors='ignore')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w', encoding='utf-8', errors='ignore')

if platform.system() == "Linux":
    os.environ["MOZ_ENABLE_WAYLAND"] = "1"
    if "QT_QPA_PLATFORM" not in os.environ:
        os.environ["QT_QPA_PLATFORM"] = "wayland;xcb"

mimetypes.init()
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/html', '.html')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('application/pdf', '.pdf')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('image/x-icon', '.ico')

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
    env = os.environ.copy()

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

# --- Background GitHub Update Management ---
_UPDATE_LOCK = threading.Lock()
_UPDATE_STATUS = {
    "checked": False,
    "available": False,
    "current_version": CURRENT_VERSION,
    "latest_version": CURRENT_VERSION,
    "download_url": "",
    "asset_name": "",
    "release_notes": "",
    "release_url": ""
}

def parse_version_tuple(v_str):
    if not v_str:
        return (0,)
    parts = re.findall(r'\d+', str(v_str))
    return tuple(map(int, parts)) if parts else (0,)

def fetch_json_safe(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'MrCooperQuizServer-App',
            'Accept': 'application/vnd.github.v3+json'
        })
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"[UPDATE] Remote request notification ({url}): HTTP {e.code}")
    except Exception:
        pass
    return None

def check_for_updates():
    global _UPDATE_STATUS
    time.sleep(2)  # Give local server a moment to finish initial launch sequence

    settings_path = os.path.join(DATA_DIR, 'settings.json')
    st = robust_json_load_file(settings_path) or {}
    if st.get('check_updates') is False:
        print("[UPDATE] Automatic update checks are disabled in settings.")
        with _UPDATE_LOCK:
            _UPDATE_STATUS["checked"] = True
            _UPDATE_STATUS["available"] = False
        return

    repo = "ahmadac/ahmadac.github.io"
    curr_tup = parse_version_tuple(CURRENT_VERSION)

    # 1. Try querying latest official release
    release_data = fetch_json_safe(f"https://api.github.com/repos/{repo}/releases/latest")

    # 2. If /releases/latest returned 404, check /releases list (includes pre-releases and recent tags)
    if not release_data:
        all_releases = fetch_json_safe(f"https://api.github.com/repos/{repo}/releases")
        if all_releases and isinstance(all_releases, list) and len(all_releases) > 0:
            release_data = all_releases[0]

    if release_data and isinstance(release_data, dict):
        tag = release_data.get('tag_name', '').strip()
        tag_tup = parse_version_tuple(tag)

        if tag_tup > curr_tup:
            assets = release_data.get('assets', [])
            target_url = None
            target_name = None

            is_win = platform.system() == "Windows"
            is_lin = platform.system() == "Linux"

            if is_win:
                for a in assets:
                    name = a.get('name', '').lower()
                    if name.endswith('.zip') and ('windows' in name or 'mrcooper' in name):
                        target_url = a.get('browser_download_url')
                        target_name = a.get('name')
                        break
                if not target_url:
                    for a in assets:
                        name = a.get('name', '').lower()
                        if name.endswith('.exe'):
                            target_url = a.get('browser_download_url')
                            target_name = a.get('name')
                            break
                if not target_url:
                    for a in assets:
                        if a.get('name', '').lower().endswith('.zip'):
                            target_url = a.get('browser_download_url')
                            target_name = a.get('name')
                            break
            elif is_lin:
                for a in assets:
                    name = a.get('name', '').lower()
                    if name.endswith('.appimage'):
                        target_url = a.get('browser_download_url')
                        target_name = a.get('name')
                        break

            if not target_url:
                target_url = release_data.get('zipball_url') or release_data.get('html_url')
                target_name = f"{tag}.zip"

            with _UPDATE_LOCK:
                _UPDATE_STATUS = {
                    "checked": True,
                    "available": True,
                    "current_version": CURRENT_VERSION,
                    "latest_version": tag,
                    "download_url": target_url,
                    "asset_name": target_name,
                    "release_notes": release_data.get('body', ''),
                    "release_url": release_data.get('html_url', '')
                }
            print(f"[UPDATE] New version found on GitHub Releases: {tag} (Current: {CURRENT_VERSION})")
            return

    # 3. Fallback: inspect raw config.js across main or master branches
    for branch in ["main", "master"]:
        try:
            raw_cfg_url = f"https://raw.githubusercontent.com/{repo}/{branch}/config.js"
            req_raw = urllib.request.Request(raw_cfg_url, headers={'User-Agent': 'MrCooperQuizServer-App'})
            with urllib.request.urlopen(req_raw, timeout=6) as resp:
                if resp.status == 200:
                    content = resp.read().decode('utf-8')
                    m = re.search(r'APP_VERSION\s*=\s*["\']([^"\']+)["\']', content)
                    if m:
                        remote_ver = m.group(1).strip()
                        if parse_version_tuple(remote_ver) > curr_tup:
                            zip_url = f"https://github.com/{repo}/archive/refs/heads/{branch}.zip"
                            with _UPDATE_LOCK:
                                _UPDATE_STATUS = {
                                    "checked": True,
                                    "available": True,
                                    "current_version": CURRENT_VERSION,
                                    "latest_version": remote_ver,
                                    "download_url": zip_url,
                                    "asset_name": f"MrCooperServer-{remote_ver}.zip",
                                    "release_notes": f"Update available from {branch} branch",
                                    "release_url": f"https://github.com/{repo}"
                                }
                            print(f"[UPDATE] Remote version in {branch} branch is newer: {remote_ver} (Current: {CURRENT_VERSION})")
                            return
        except Exception:
            pass

    # No newer versions detected
    with _UPDATE_LOCK:
        _UPDATE_STATUS["checked"] = True
        _UPDATE_STATUS["available"] = False
    print(f"[UPDATE] Server is up to date (Version: {CURRENT_VERSION}).")

def download_and_install_update():
    with _UPDATE_LOCK:
        dl_url = _UPDATE_STATUS.get('download_url')
        asset_name = _UPDATE_STATUS.get('asset_name') or 'update.bin'

    if not dl_url:
        raise ValueError("No update download URL available")

    temp_dir = tempfile.mkdtemp(prefix="mrcooper_update_")
    dest_file = os.path.join(temp_dir, asset_name)

    print(f"[UPDATE] Downloading update from: {dl_url}")
    req = urllib.request.Request(dl_url, headers={'User-Agent': 'MrCooperQuizServer-App'})
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest_file, 'wb') as out_f:
        shutil.copyfileobj(resp, out_f)

    is_frozen = getattr(sys, 'frozen', False)
    is_win = platform.system() == "Windows"
    is_linux = platform.system() == "Linux"

    if is_win:
        target_exe = sys.executable if is_frozen else os.path.join(EXE_DIR, "MrCooperServer.exe")
        target_dir = os.path.dirname(target_exe)

        if dest_file.lower().endswith('.zip'):
            extract_dir = os.path.join(temp_dir, "extracted")
            with zipfile.ZipFile(dest_file, 'r') as zf:
                zf.extractall(extract_dir)

            found_exe_dir = extract_dir
            for root, dirs, files in os.walk(extract_dir):
                if any(f.lower() == "mrcooperserver.exe" for f in files):
                    found_exe_dir = root
                    break

            bat_path = os.path.join(temp_dir, "install_update.bat")
            with open(bat_path, "w", encoding="utf-8") as bf:
                bf.write(f"""@echo off
timeout /t 2 /nobreak >nul
xcopy /E /Y /I "{found_exe_dir}\\*" "{target_dir}\\"
start "" "{target_exe}"
del "%~f0"
""")
        else:
            bat_path = os.path.join(temp_dir, "install_update.bat")
            with open(bat_path, "w", encoding="utf-8") as bf:
                bf.write(f"""@echo off
timeout /t 2 /nobreak >nul
copy /Y "{dest_file}" "{target_exe}"
start "" "{target_exe}"
del "%~f0"
""")

        creation_flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(["cmd.exe", "/c", bat_path], shell=True, creationflags=creation_flags, close_fds=True)

    elif is_linux:
        target_app = APPIMAGE_PATH if APPIMAGE_PATH else sys.executable
        sh_path = os.path.join(temp_dir, "install_update.sh")
        with open(sh_path, "w", encoding="utf-8") as sf:
            sf.write(f"""#!/bin/sh
sleep 2
cp -f "{dest_file}" "{target_app}"
chmod +x "{target_app}"
"{target_app}" &
rm -f "$0"
""")
        os.chmod(sh_path, 0o755)
        subprocess.Popen(["/bin/sh", sh_path], close_fds=True)

    else:
        raise OSError("Automatic update replacement is only supported on Windows and Linux.")

    def delayed_exit():
        time.sleep(1)
        os._exit(0)

    threading.Thread(target=delayed_exit, daemon=True).start()

def robust_json_load_file(file_path):
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        try:
            return json.loads(content, strict=False)
        except Exception:
            sanitized = re.sub(r'\\(?![/"\\bfnrtu]|u[0-9a-fA-F]{4})', r'\\\\', content)
            no_trailing = re.sub(r',\s*([}\]])', r'\1', sanitized)
            return json.loads(no_trailing, strict=False)
    except Exception:
        return None

def get_quiz_points(file_path):
    pts = 0
    qd = robust_json_load_file(file_path)
    if qd:
        items = qd if isinstance(qd, list) else qd.get("data", []) if isinstance(qd, dict) else []
        for item in items:
            if isinstance(item, dict):
                try:
                    raw_pts = item.get('points', item.get('points_possible', 0))
                    pts += int(float(raw_pts))
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

        if clean_path in ['/favicon.ico', '/favicon', '/icon.ico']:
            possible_icon_paths = [
                os.path.join(WEB_DIR, 'icon.ico'),
                os.path.join(DATA_DIR, 'icon.ico'),
                os.path.join(EXE_DIR, 'icon.ico'),
                os.path.join(LAUNCH_DIR, 'icon.ico')
            ]
            for ico_path in possible_icon_paths:
                if os.path.exists(ico_path):
                    self.send_response(200)
                    self.send_header('Content-type', 'image/x-icon')
                    self.end_headers()
                    with open(ico_path, 'rb') as f:
                        self.wfile.write(f.read())
                    return

        if clean_path == '/api/results':
            results_file = os.path.join(DATA_DIR, 'QuizResults.json')
            data = robust_json_load_file(results_file) or {}
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        if clean_path == '/api/check_update':
            with _UPDATE_LOCK:
                resp_data = dict(_UPDATE_STATUS)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(resp_data).encode('utf-8'))
            return

        if clean_path == '/api/config':
            _, all_quizzes = update_quiz_index()

            def safe_read(fname, default):
                path = os.path.join(DATA_DIR, fname)
                loaded = robust_json_load_file(path)
                return loaded if loaded is not None else default

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
                "check_updates": True,
                "subjects": {
                    "6": [],
                    "7": ["Computer Science (CS)", "STEAM"],
                    "8": []
                }
            })

            header_items = set()
            def harvest_headers(node):
                if isinstance(node, dict):
                    for k, v in node.items():
                        if isinstance(v, (str, int, float)) and (k.startswith('[HEADER]') or k.startswith('[NOTICE]')):
                            header_items.add(k)
                        elif isinstance(v, dict):
                            harvest_headers(v)
            harvest_headers(canvas_data)
            for h in header_items:
                if not any(q.get('name') == h for q in all_quizzes):
                    all_quizzes.append({"name": h, "points": 0, "isHeader": True})

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            response = {
                "is_offline_mode": True,
                "show_save_image": False,
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

        if clean_path == '/api/apply_update':
            try:
                download_and_install_update()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Update downloaded. Restarting application..."}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
            return

        if clean_path == '/api/config':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'), strict=False)

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

            if 'rename_quizzes' in payload and payload['rename_quizzes']:
                index_path = os.path.join(DATA_DIR, 'quiz_index.json')
                idx = robust_json_load_file(index_path) or {}
                for r in payload['rename_quizzes']:
                    old_name = r.get('old_name')
                    new_name = r.get('new_name')
                    if not old_name or not new_name or old_name == new_name:
                        continue
                    
                    if old_name.startswith('[HEADER]') or old_name.startswith('[NOTICE]'):
                        continue

                    old_rel = idx.get(old_name)
                    if old_rel:
                        old_path = os.path.join(DATA_DIR, old_rel)
                    else:
                        old_path = os.path.join(DATA_DIR, f"{old_name}.json")

                    if os.path.exists(old_path):
                        dir_name = os.path.dirname(old_path)
                        new_path = os.path.join(dir_name, f"{new_name}.json")
                        try:
                            if os.path.exists(new_path) and os.path.normpath(old_path).lower() != os.path.normpath(new_path).lower():
                                os.remove(new_path)
                            os.rename(old_path, new_path)
                            if old_path in _QUIZ_CACHE:
                                _QUIZ_CACHE[new_path] = _QUIZ_CACHE.pop(old_path)
                            print(f"[SUCCESS] Renamed quiz file from '{old_path}' to '{new_path}'")
                        except Exception as e:
                            print(f"[ERROR] Failed to rename quiz file '{old_path}' to '{new_path}': {e}")

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
                idx = robust_json_load_file(index_path) or {}
                for dq in payload['delete_quizzes']:
                    if dq.startswith('[HEADER]') or dq.startswith('[NOTICE]'):
                        continue
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
                payload = json.loads(post_data.decode('utf-8'), strict=False)
                results_file = os.path.join(DATA_DIR, 'QuizResults.json')
                data = robust_json_load_file(results_file) or {}

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

                autolink_config = robust_json_load_file(os.path.join(DATA_DIR, 'autolink.json')) or {"enabled": False, "webhook_url": ""}
                webhook_success = False

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
    print(f"Current Version: {CURRENT_VERSION}")
    print("==================================================")

    update_quiz_index()

    # Start background update checker
    update_thread = threading.Thread(target=check_for_updates, daemon=True)
    update_thread.start()

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