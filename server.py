#################### START OF FILE: server.py ####################
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

# --- Linux / Fedora / Wayland Compatibility ---
if platform.system() == "Linux":
    os.environ["MOZ_ENABLE_WAYLAND"] = "1"
    os.environ["QT_QPA_PLATFORM"] = "xcb"

# 1. FORCE EXPLICIT WINDOWS MIME-TYPE OVERRIDES
mimetypes.init()
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/html', '.html')
mimetypes.add_type('image/svg+xml', '.svg')

# 2. RESOLVE DIRECTORIES FOR APP PORTABILITY
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

WEB_DIR = BASE_DIR
os.chdir(WEB_DIR)

def get_data_dir():
    config_path = os.path.join(BASE_DIR, "folder_config.txt")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                path = f.read().strip()
            if path:
                if os.path.isabs(path): return os.path.normpath(path)
                else: return os.path.normpath(os.path.join(BASE_DIR, path))
        except: pass

    sibling_config = os.path.abspath(os.path.join(BASE_DIR, "..", "OfflineQuiz", "folder_config.txt"))
    if os.path.exists(sibling_config):
        try:
            with open(sibling_config, 'r', encoding='utf-8') as f:
                path = f.read().strip()
            if path:
                if os.path.isabs(path): return os.path.normpath(path)
                else: return os.path.normpath(os.path.join(os.path.dirname(sibling_config), path))
        except: pass

    for folder in ["0_Quiz", "0 Quiz"]:
        candidate = os.path.join(BASE_DIR, folder)
        if os.path.exists(candidate):
            return os.path.normpath(candidate)
            
    return os.path.normpath(os.path.join(BASE_DIR, "0_Quiz"))

DATA_DIR = get_data_dir()
CONFIG_FILES = {'canvas.json', 'settings.json', 'ignore.json', 'autolink.json', 'order.json', 'QuizResults.json', 'missing.json', 'quiz_index.json'}

# In-memory points and index cache for instant API responses
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
    except: pass
    return pts

def update_quiz_index():
    global _QUIZ_CACHE
    index_data = {}
    if not os.path.exists(DATA_DIR):
        return index_data, []

    all_quizzes = []
    for root, dirs, files in os.walk(DATA_DIR):
        if "media" in root or "bonus" in root: continue
        for f in files:
            if f.endswith('.json') and f not in CONFIG_FILES:
                quiz_name = f[:-5]
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, DATA_DIR).replace('\\', '/')
                index_data[quiz_name] = rel_path
                
                # Fast caching using file modification timestamp
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
    except: pass
        
    return index_data, all_quizzes

class QuizAPIHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        try:
            msg = format % args
            if not ('" 200 ' in msg or '" 304 ' in msg):
                print(f"[SERVER LOG]: {self.address_string()} - {msg}")
        except: pass

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
                        with open(path, 'r', encoding='utf-8') as f: return json.load(f)
                    except: pass
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
                "show_results": False
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
                    ctype = self.guess_type(target_file)
                    self.send_header("Content-type", ctype)
                    self.end_headers()
                    with open(target_file, 'rb') as f:
                        self.wfile.write(f.read())
                    return
                else:
                    self.send_error(404, f"File {relative_file_path} not found in custom quiz folder")
                    return

        super().do_GET()

    def do_POST(self):
        if self.path == '/api/config':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            def safe_write(fname, data):
                path = os.path.join(DATA_DIR, fname)
                with open(path, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)
                    
            if 'canvas' in payload: safe_write('canvas.json', payload['canvas'])
            if 'ignore' in payload: safe_write('ignore.json', payload['ignore'])
            if 'autolink' in payload: safe_write('autolink.json', payload['autolink'])
            if 'order' in payload: safe_write('order.json', payload['order'])
            if 'settings' in payload: safe_write('settings.json', payload['settings'])
            if 'folder' in payload:
                with open(os.path.join(BASE_DIR, "folder_config.txt"), 'w', encoding='utf-8') as f:
                    f.write(payload['folder'])
                    
            if 'delete_quizzes' in payload:
                index_path = os.path.join(DATA_DIR, 'quiz_index.json')
                try:
                    with open(index_path, 'r') as f: idx = json.load(f)
                except: idx = {}
                for dq in payload['delete_quizzes']:
                    fp = os.path.join(DATA_DIR, idx[dq]) if dq in idx else os.path.join(DATA_DIR, f"{dq}.json")
                    if os.path.exists(fp): os.remove(fp)
                update_quiz_index()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

        elif self.path == '/api/save_result':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                results_file = os.path.join(DATA_DIR, 'QuizResults.json')
                data = {}
                if os.path.exists(results_file):
                    with open(results_file, 'r', encoding='utf-8') as f:
                        try: data = json.load(f)
                        except: pass
                            
                cls, name = payload.get('studentClass', 'Unknown'), payload.get('studentName', 'Unknown')
                quizName, score, total = payload.get('quizName', 'Unknown'), payload.get('score', 0), payload.get('totalPossible', 0)
                
                if cls not in data: data[cls] = {}
                if name not in data[cls]: data[cls][name] = {}
                if quizName not in data[cls][name]: data[cls][name][quizName] = {"best": 0, "attempts": []}
                
                data[cls][name][quizName]["attempts"].append({"s": score, "t": total, "ts": datetime.now().isoformat()})
                if score > data[cls][name][quizName]["best"]: data[cls][name][quizName]["best"] = score
                    
                with open(results_file, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)
                    
                autolink_config, webhook_success = {"enabled": False, "webhook_url": ""}, False
                if os.path.exists(os.path.join(DATA_DIR, 'autolink.json')):
                    try:
                        with open(os.path.join(DATA_DIR, 'autolink.json'), 'r') as f: autolink_config = json.load(f)
                    except: pass
                        
                if autolink_config.get("enabled"):
                    webhook_url = autolink_config.get("webhook_url", "").strip() or "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=2cGDgH4Pcdag3rgX3j1BCgZ82ePKwD5S9Kcw84c7G6733Py3AHQnhgBnrqfcqYBu0e8mEpuBTkJj3HgqUstHB3zNoJdadg0y4A2TGOqElbp2"
                    webhook_payload = {"add_records": [{"values": {"f04Gwj": str(name), "ftQMc5": str(cls), "ftk5Tx": str(quizName), "ffFwIh": int(score), "fn8TJd": int(total)}}]}
                    req = urllib.request.Request(webhook_url, data=json.dumps(webhook_payload).encode('utf-8'), headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
                    try:
                        urllib.request.urlopen(req, timeout=5)
                        webhook_success = True
                    except Exception as we: print(f"Webhook error: {we}")
                        
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
    """Finds Edge or Chrome and launches with a persistent warm cache and maximized viewport."""
    executable = None
    
    if platform.system() == "Windows":
        paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        for p in paths:
            if os.path.exists(p):
                executable = p
                break
        if not executable:
            for b in ["chrome.exe", "msedge.exe"]:
                path = shutil.which(b)
                if path:
                    executable = path
                    break
    else:
        browsers = ["google-chrome-stable", "google-chrome", "microsoft-edge-stable", "microsoft-edge", "chromium-browser", "chromium"]
        for b in browsers:
            path = shutil.which(b)
            if path:
                executable = path
                break
                
    if executable:
        print(f"[DEBUG] Launching native browser engine in App Mode: {executable}")
        return subprocess.Popen([
            executable, 
            f"--app={url}", 
            f"--user-data-dir={profile_dir}",
            "--start-maximized",
            "--no-first-run", 
            "--no-default-browser-check",
            "--disable-sync",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-features=EdgeFre,EdgeAccountConsistency,MSAWebSiteSSOUsingThisProfileAllowed,ImplicitSignin"
        ])
    else:
        print("[DEBUG] No Chromium browser found. Falling back to default system browser.")
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
    
    print(f"==================================================")
    print(f"Mr. Cooper's Quiz Server is running locally!")
    print(f"Serving Web Files from: {WEB_DIR}")
    print(f"Serving Quiz Data from: {DATA_DIR}")
    print(f"Background Port: {assigned_port}")
    print(f"==================================================")

    # Optional PySide6 Organizer Dialog
    try:
        unorganized_files = [f for f in os.listdir(DATA_DIR) if f.endswith('.json') and f not in CONFIG_FILES and os.path.isfile(os.path.join(DATA_DIR, f))]
        if unorganized_files:
            from PySide6.QtWidgets import QApplication, QDialog, QVBoxLayout, QHBoxLayout, QLabel, QListWidget, QListWidgetItem, QComboBox, QPushButton, QInputDialog
            from PySide6.QtCore import Qt
            
            app = QApplication.instance() or QApplication(sys.argv)
            
            class QuizOrganizerDialog(QDialog):
                def __init__(self, unorganized, data_dir):
                    super().__init__()
                    self.unorganized = unorganized
                    self.data_dir = data_dir
                    self.setWindowTitle("Smart Folder Organizer")
                    self.resize(550, 450)
                    
                    layout = QVBoxLayout(self)
                    layout.addWidget(QLabel("<b>Unorganized quizzes detected in the root folder!</b><br>Move them into class-specific folders to keep things tidy."))
                    
                    sel_layout = QHBoxLayout()
                    sel_all_btn = QPushButton("Select All")
                    sel_all_btn.clicked.connect(self.select_all)
                    sel_none_btn = QPushButton("Select None")
                    sel_none_btn.clicked.connect(self.select_none)
                    sel_layout.addWidget(sel_all_btn)
                    sel_layout.addWidget(sel_none_btn)
                    sel_layout.addStretch()
                    layout.addLayout(sel_layout)

                    self.list_widget = QListWidget()
                    for f in self.unorganized:
                        item = QListWidgetItem(f)
                        item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
                        item.setCheckState(Qt.Checked)
                        self.list_widget.addItem(item)
                    layout.addWidget(self.list_widget)
                    
                    ctrl_layout = QHBoxLayout()
                    ctrl_layout.addWidget(QLabel("Move selected to:"))
                    self.folder_combo = QComboBox()
                    self.refresh_folders()
                    ctrl_layout.addWidget(self.folder_combo)
                    new_folder_btn = QPushButton("Create New Folder...")
                    new_folder_btn.clicked.connect(self.create_new_folder)
                    ctrl_layout.addWidget(new_folder_btn)
                    layout.addLayout(ctrl_layout)
                    
                    btn_layout = QHBoxLayout()
                    move_btn = QPushButton("Move Selected Quizzes")
                    move_btn.setStyleSheet("background-color: #2ECC71; color: white; font-weight: bold; border-radius: 4px; padding: 6px;")
                    move_btn.clicked.connect(self.move_selected)
                    skip_btn = QPushButton("Done / Skip")
                    skip_btn.clicked.connect(self.accept)
                    btn_layout.addWidget(skip_btn)
                    btn_layout.addStretch()
                    btn_layout.addWidget(move_btn)
                    layout.addLayout(btn_layout)
                
                def select_all(self):
                    for i in range(self.list_widget.count()): self.list_widget.item(i).setCheckState(Qt.Checked)
                def select_none(self):
                    for i in range(self.list_widget.count()): self.list_widget.item(i).setCheckState(Qt.Unchecked)
                def refresh_folders(self):
                    self.folder_combo.clear()
                    folders = set(["Common", "G6", "G7", "G8"])
                    for d in os.listdir(self.data_dir):
                        if os.path.isdir(os.path.join(self.data_dir, d)) and d not in ["media", "bonus"]: folders.add(d)
                    self.folder_combo.addItems(sorted(list(folders)))
                def create_new_folder(self):
                    name, ok = QInputDialog.getText(self, "New Folder", "Enter exact folder name:")
                    if ok and name:
                        os.makedirs(os.path.join(self.data_dir, name), exist_ok=True)
                        self.refresh_folders()
                        self.folder_combo.setCurrentText(name)
                def move_selected(self):
                    target_folder = self.folder_combo.currentText()
                    if not target_folder: return
                    target_path = os.path.join(self.data_dir, target_folder)
                    os.makedirs(target_path, exist_ok=True)
                    items_to_remove = []
                    for i in range(self.list_widget.count()):
                        item = self.list_widget.item(i)
                        if item.checkState() == Qt.Checked:
                            src, dst = os.path.join(self.data_dir, item.text()), os.path.join(target_path, item.text())
                            try:
                                shutil.move(src, dst)
                                items_to_remove.append(item)
                            except Exception as e: print(f"Failed to move: {e}")
                    for item in items_to_remove: self.list_widget.takeItem(self.list_widget.row(item))
                    if self.list_widget.count() == 0: self.accept()

            dialog = QuizOrganizerDialog(unorganized_files, DATA_DIR)
            dialog.exec()
    except:
        pass

    # Pre-index files before browser launches
    update_quiz_index()

    # Use a persistent warm profile directory in the system temp folder for instant startup
    local_url = f"http://127.0.0.1:{assigned_port}/index.html"
    warm_profile = os.path.join(tempfile.gettempdir(), "MrCooperAppEdgeProfile")
    os.makedirs(warm_profile, exist_ok=True)
    
    proc = launch_browser_app(local_url, warm_profile)

    if proc:
        print("\n[INFO] App Window is open. Use Ctrl+ and Ctrl- to zoom.")
        print("[INFO] Close the application window to automatically stop the server.")
        try:
            proc.wait()
        except KeyboardInterrupt:
            pass
    else:
        print(f"\n[INFO] Running... Open {local_url} manually if your browser did not open.")
        print("Press Ctrl+C inside this console window to terminate the server.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
            
    print("\nServer shutting down cleanly...")
    httpd.shutdown()

if __name__ == '__main__':
    run_app()
#################### END OF FILE: server.py ####################