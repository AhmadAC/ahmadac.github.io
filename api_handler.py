import os
import json
import shutil
import urllib.request
import urllib.parse
from http.server import SimpleHTTPRequestHandler
from datetime import datetime

from config import WEB_DIR, DATA_DIR, EXE_DIR, LAUNCH_DIR, CONFIG_FILES
from quiz_store import (
    robust_json_load_file,
    ensure_admin_questions_in_file,
    update_quiz_index,
    _QUIZ_CACHE
)
from updater import _UPDATE_LOCK, _UPDATE_STATUS, download_and_install_update


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
                    if target_file.lower().endswith('.json') and os.path.basename(target_file) not in CONFIG_FILES:
                        is_bonus_file = "bonus" in target_file.replace('\\', '/').split('/')
                        ensure_admin_questions_in_file(target_file, is_bonus=is_bonus_file)

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

                cls = payload.get('studentClass', 'Unknown')
                name = payload.get('studentName', 'Unknown')
                quizName = payload.get('quizName', 'Unknown')
                score = payload.get('score', 0)
                total = payload.get('totalPossible', 0)

                if cls not in data:
                    data[cls] = {}
                if name not in data[cls]:
                    data[cls][name] = {}
                if quizName not in data[cls][name]:
                    data[cls][name][quizName] = {"best": 0, "attempts": []}

                data[cls][name][quizName]["attempts"].append({
                    "s": score,
                    "t": total,
                    "ts": datetime.now().isoformat()
                })
                if score > data[cls][name][quizName]["best"]:
                    data[cls][name][quizName]["best"] = score

                with open(results_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)

                autolink_config = robust_json_load_file(os.path.join(DATA_DIR, 'autolink.json')) or {"enabled": False, "webhook_url": ""}
                webhook_success = False

                if autolink_config.get("enabled"):
                    webhook_url = autolink_config.get("webhook_url", "").strip() or "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=2cGDgH4Pcdag3rgX3j1BCgZ82ePKwD5S9Kcw84c7G6733Py3AHQnhgBnrqfcqYBu0e8mEpuBTkJj3HgqUstHB3zNoJdadg0y4A2TGOqElbp2"
                    webhook_payload = {
                        "add_records": [{
                            "values": {
                                "f04Gwj": str(name),
                                "ftQMc5": str(cls),
                                "ftk5Tx": str(quizName),
                                "ffFwIh": int(score),
                                "fn8TJd": int(total)
                            }
                        }]
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
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()