# server.py

import os
import sys
import json
import threading
import webbrowser
import urllib.request
import urllib.parse
import mimetypes
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer
from datetime import datetime

# 1. FORCE EXPLICIT WINDOWS MIME-TYPE OVERRIDES
# Prevents Windows registry corruption from serving .css and .js files as 'text/plain',
# which blocks chromium from styling or executing the web interface correctly.
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

# Point static web assets to the directory containing this script
WEB_DIR = BASE_DIR
os.chdir(WEB_DIR)

# Find where the student results and quiz JSON data are stored (supporting migrations)
def get_data_dir():
    # A. Check if folder_config.txt exists locally next to server.py
    config_path = os.path.join(BASE_DIR, "folder_config.txt")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                path = f.read().strip()
            if path:
                if os.path.isabs(path):
                    return os.path.normpath(path)
                else:
                    return os.path.normpath(os.path.join(BASE_DIR, path))
        except:
            pass

    # B. Sibling folder check: Fallback to old OfflineQuiz folder_config.txt to assist migration
    sibling_config = os.path.abspath(os.path.join(BASE_DIR, "..", "OfflineQuiz", "folder_config.txt"))
    if os.path.exists(sibling_config):
        try:
            with open(sibling_config, 'r', encoding='utf-8') as f:
                path = f.read().strip()
            if path:
                if os.path.isabs(path):
                    return os.path.normpath(path)
                else:
                    return os.path.normpath(os.path.join(os.path.dirname(sibling_config), path))
        except:
            pass

    # C. Default local fallback search inside current folder
    for folder in ["0_Quiz", "0 Quiz"]:
        candidate = os.path.join(BASE_DIR, folder)
        if os.path.exists(candidate):
            return os.path.normpath(candidate)
            
    return os.path.normpath(os.path.join(BASE_DIR, "0_Quiz"))

DATA_DIR = get_data_dir()

class QuizAPIHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Keep the background console clean
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Decode the URL and normalize it
        clean_path = urllib.parse.unquote(self.path).replace('\\', '/')
        
        # FIX: Discard cache-busting query strings (?t=1234567) before validating paths
        if '?' in clean_path:
            clean_path = clean_path.split('?')[0]

        # 1. Unified Configuration & Sync Endpoint (Matches Desktop Feature Parity)
        if clean_path == '/api/config':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            def safe_read(fname, default):
                path = os.path.join(DATA_DIR, fname)
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            return json.load(f)
                    except:
                        pass
                return default

            canvas_data = safe_read('canvas.json', {"6": {}, "7": {}, "8": {}})
            ignore_data = safe_read('ignore.json', [])
            autolink_data = safe_read('autolink.json', {"enabled": False, "webhook_url": ""})
            order_data = safe_read('order.json', {})
            
            all_quizzes = []
            if os.path.exists(DATA_DIR):
                for f in os.listdir(DATA_DIR):
                    if f.endswith('.json') and f not in ['canvas.json', 'settings.json', 'ignore.json', 'autolink.json', 'order.json', 'QuizResults.json', 'missing.json']:
                        pts = 0
                        try:
                            # Parse JSON to grab point totals dynamically for the Mapping Manager UI
                            with open(os.path.join(DATA_DIR, f), 'r', encoding='utf-8-sig') as qf:
                                qd = json.load(qf)
                                if isinstance(qd, list):
                                    for item in qd:
                                        if isinstance(item, dict):
                                            pts += int(float(item.get('points', item.get('points_possible', 0))))
                                elif isinstance(qd, dict) and "data" in qd:
                                    for item in qd["data"]:
                                        if isinstance(item, dict):
                                            pts += int(float(item.get('points', item.get('points_possible', 0))))
                        except:
                            pass
                        all_quizzes.append({"name": f.replace('.json', ''), "points": pts})
                        
            response = {
                "is_offline_mode": True,
                "canvas": canvas_data,
                "ignore": ignore_data,
                "autolink": autolink_data,
                "order": order_data,
                "quizzes": all_quizzes,
                "folder": DATA_DIR
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return

        # 2. Intercept and map requests for data/media files inside DATA_DIR
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

        # 3. Fall back to standard server for frontend assets inside WEB_DIR
        super().do_GET()

    def do_POST(self):
        # Universal Configuration Updater
        if self.path == '/api/config':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            def safe_write(fname, data):
                path = os.path.join(DATA_DIR, fname)
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                    
            if 'canvas' in payload: safe_write('canvas.json', payload['canvas'])
            if 'ignore' in payload: safe_write('ignore.json', payload['ignore'])
            if 'autolink' in payload: safe_write('autolink.json', payload['autolink'])
            if 'order' in payload: safe_write('order.json', payload['order'])
            if 'folder' in payload:
                folder_cfg = os.path.join(BASE_DIR, "folder_config.txt")
                with open(folder_cfg, 'w', encoding='utf-8') as f:
                    f.write(payload['folder'])
                    
            if 'delete_quizzes' in payload:
                for dq in payload['delete_quizzes']:
                    fp = os.path.join(DATA_DIR, f"{dq}.json")
                    if os.path.exists(fp):
                        os.remove(fp)

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
                
                # Save locally to QuizResults.json inside your specified DATA_DIR
                results_file = os.path.join(DATA_DIR, 'QuizResults.json')
                data = {}
                if os.path.exists(results_file):
                    with open(results_file, 'r', encoding='utf-8') as f:
                        try:
                            data = json.load(f)
                        except json.JSONDecodeError:
                            pass
                            
                cls = payload.get('studentClass', 'Unknown')
                name = payload.get('studentName', 'Unknown')
                quizName = payload.get('quizName', 'Unknown')
                score = payload.get('score', 0)
                total = payload.get('totalPossible', 0)
                
                if cls not in data: data[cls] = {}
                if name not in data[cls]: data[cls][name] = {}
                if quizName not in data[cls][name]: data[cls][name][quizName] = {"best": 0, "attempts": []}
                
                data[cls][name][quizName]["attempts"].append({
                    "s": score,
                    "t": total,
                    "ts": datetime.now().isoformat()
                })
                if score > data[cls][name][quizName]["best"]:
                    data[cls][name][quizName]["best"] = score
                    
                with open(results_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                    
                # Dynamically Trigger Tencent Webhook if Enabled
                autolink_file = os.path.join(DATA_DIR, 'autolink.json')
                autolink_config = {"enabled": False, "webhook_url": ""}
                if os.path.exists(autolink_file):
                    try:
                        with open(autolink_file, 'r', encoding='utf-8') as f:
                            autolink_config = json.load(f)
                    except json.JSONDecodeError:
                        pass
                        
                webhook_success = False
                if autolink_config.get("enabled"):
                    webhook_url = autolink_config.get("webhook_url", "").strip()
                    if not webhook_url:
                        # Fallback default if they toggle it on without supplying a URL
                        webhook_url = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=2cGDgH4Pcdag3rgX3j1BCgZ82ePKwD5S9Kcw84c7G6733Py3AHQnhgBnrqfcqYBu0e8mEpuBTkJj3HgqUstHB3zNoJdadg0y4A2TGOqElbp2"

                    webhook_payload = {
                        "add_records": [
                            {
                                "values": {
                                    "f04Gwj": str(name),
                                    "ftQMc5": str(cls),
                                    "ftk5Tx": str(quizName),
                                    "ffFwIh": int(score),
                                    "fn8TJd": int(total)
                                }
                            }
                        ]
                    }
                    
                    req = urllib.request.Request(
                        webhook_url, 
                        data=json.dumps(webhook_payload).encode('utf-8'),
                        headers={'Content-Type': 'application/json', 'Accept': 'application/json'}
                    )
                    
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
                print(f"Save error: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_app():
    # Start local server on a free port
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

    try:
        # Attempt to launch with PySide6 embedded web engine
        from PySide6.QtWidgets import QApplication, QMainWindow
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtCore import QUrl
        from PySide6.QtGui import QIcon

        class WebQuizPlayer(QMainWindow):
            def __init__(self, port, httpd_instance):
                super().__init__()
                self.httpd = httpd_instance
                self.setWindowTitle("Mr. Cooper's Quiz Suite")
                
                icon_path = os.path.join(BASE_DIR, "icon.ico")
                if os.path.exists(icon_path):
                    self.setWindowIcon(QIcon(icon_path))
                    
                self.showMaximized()

                self.browser = QWebEngineView()
                self.setCentralWidget(self.browser)
                
                # Point to the local background server
                self.browser.setUrl(QUrl(f"http://127.0.0.1:{port}/index.html"))

            def closeEvent(self, event):
                # Shut down the daemon server cleanly on exit
                if self.httpd:
                    threading.Thread(target=self.httpd.shutdown).start()
                event.accept()

        app = QApplication(sys.argv)
        window = WebQuizPlayer(assigned_port, httpd)
        sys.exit(app.exec())

    except ImportError:
        # If PySide6 is not installed on the system, gracefully fall back
        print("\n[INFO] PySide6 is not installed. Falling back to default Web Browser...")
        local_url = f"http://127.0.0.1:{assigned_port}/index.html"
        webbrowser.open(local_url)
        print(f"Running... Open {local_url} manually if your browser did not open.")
        print("Press Ctrl+C inside this console window to terminate the server.")
        
        try:
            # Keep thread alive to serve files to standard browser
            while True:
                threading.Event().wait(1.0)
        except KeyboardInterrupt:
            print("\nServer shutting down cleanly...")
            httpd.shutdown()

if __name__ == '__main__':
    run_app()