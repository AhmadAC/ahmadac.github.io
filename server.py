# server.py
import os
import sys
import json
import glob
import datetime
import threading
import urllib.request
import urllib.parse
from flask import Flask, request, jsonify, send_from_directory
import webview

def get_base_path():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

# Configure folders
BASE_DIR = get_base_path()
WEB_ROOT = os.path.join(BASE_DIR, 'web_root') # Where your HTML/JS/CSS goes
QUIZ_DIR = os.path.join(BASE_DIR, '0_Quiz')

if not os.path.exists(QUIZ_DIR):
    os.makedirs(QUIZ_DIR)

app = Flask(__name__, static_folder=WEB_ROOT)

# ---------------------------------------------------------
# 1. STATIC WEB SERVER
# ---------------------------------------------------------
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    # Allow serving files directly from the 0_Quiz folder for media/json
    if filename.startswith('0_Quiz/'):
        target_path = os.path.join(BASE_DIR, filename)
        directory = os.path.dirname(target_path)
        file = os.path.basename(target_path)
        return send_from_directory(directory, file)
    return send_from_directory(app.static_folder, filename)

# ---------------------------------------------------------
# 2. LOCAL OFFLINE APIs (Called by your JavaScript)
# ---------------------------------------------------------
@app.route('/api/status', methods=['GET'])
def get_status():
    """Tells the JS it's running in Offline Mode and if there are unmapped quizzes."""
    canvas_path = os.path.join(QUIZ_DIR, 'canvas.json')
    ignore_path = os.path.join(QUIZ_DIR, 'ignore.json')
    
    # Load mapped/ignored
    canvas_data = {}
    if os.path.exists(canvas_path):
        with open(canvas_path, 'r', encoding='utf-8') as f:
            try: canvas_data = json.load(f)
            except: pass
            
    ignored = []
    if os.path.exists(ignore_path):
        with open(ignore_path, 'r', encoding='utf-8') as f:
            try: ignored = json.load(f)
            except: pass

    # Find expected quizzes from canvas.json
    expected_quizzes = set()
    for grade, content in canvas_data.items():
        if isinstance(content, dict):
            for key, val in content.items():
                if isinstance(val, dict):
                    for q in val.keys(): expected_quizzes.add(q)
                else:
                    expected_quizzes.add(key)

    # Scan physical files
    all_files = glob.glob(os.path.join(QUIZ_DIR, '*.json'))
    unmapped = []
    
    for f in all_files:
        basename = os.path.splitext(os.path.basename(f))[0]
        if basename not in ['canvas', 'config', 'missing', 'QuizResults', 'ignore', 'autolink', 'order']:
            if basename not in expected_quizzes and basename not in ignored:
                unmapped.append(basename)

    return jsonify({
        "is_offline_mode": True,
        "unmapped_quizzes": unmapped
    })

@app.route('/api/save_mapping', methods=['POST'])
def save_mapping():
    """API for the Mapping Manager / New Quiz UI to save assignments."""
    req_data = request.json
    updates = req_data.get('updates', [])
    new_ignored = req_data.get('ignored', [])
    
    # Save ignores
    with open(os.path.join(QUIZ_DIR, 'ignore.json'), 'w', encoding='utf-8') as f:
        json.dump(new_ignored, f, indent=4)
        
    # Rebuild canvas.json
    canvas_path = os.path.join(QUIZ_DIR, 'canvas.json')
    old_data = {}
    if os.path.exists(canvas_path):
        with open(canvas_path, 'r', encoding='utf-8') as f:
            try: old_data = json.load(f)
            except: pass

    now_str = datetime.datetime.now().isoformat()
    final_data = {"6": {}, "7": {}, "8": {}}
    
    # Simple assignment logic (You can easily port your Python rebuild_canvas_json logic here)
    for update in updates:
        q_name = update.get('name')
        targets = update.get('targets', [])
        for cls in targets:
            if len(cls) >= 2 and cls[1] in ['6', '7', '8']:
                grade = cls[1]
                if cls not in final_data[grade]:
                    final_data[grade][cls] = {}
                final_data[grade][cls][q_name] = now_str

    with open(canvas_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, indent=4, ensure_ascii=False)
        
    return jsonify({"success": True})

@app.route('/api/save_result', methods=['POST'])
def save_result():
    """Saves local result and triggers Tencent webhook."""
    data = request.json
    q_name = data.get("quizName", "Unknown")
    name = data.get("studentName", "Unknown")
    cls = data.get("studentClass", "Unknown")
    score = data.get("score", 0)
    total = data.get("totalPossible", 0)

    # 1. Save locally to QuizResults.json
    results_path = os.path.join(QUIZ_DIR, 'QuizResults.json')
    all_results = {}
    if os.path.exists(results_path):
        with open(results_path, 'r', encoding='utf-8') as f:
            try: all_results = json.load(f)
            except: pass

    if cls not in all_results: all_results[cls] = {}
    if name not in all_results[cls]: all_results[cls][name] = {}
    if q_name not in all_results[cls][name]: all_results[cls][name][q_name] = {"best": 0, "attempts": []}
    
    all_results[cls][name][q_name]["attempts"].append({
        "s": score, "t": total, "ts": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    
    if score > all_results[cls][name][q_name]["best"]:
        all_results[cls][name][q_name]["best"] = score
        
    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=4)

    # 2. Trigger Webhook
    def trigger_webhook():
        webhook_url = "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=2cGDgH4Pcdag3rgX3j1BCgZ82ePKwD5S9Kcw84c7G6733Py3AHQnhgBnrqfcqYBu0e8mEpuBTkJj3HgqUstHB3zNoJdadg0y4A2TGOqElbp2"
        payload = {
            "add_records": [{"values": {"f04Gwj": name, "ftQMc5": cls, "ftk5Tx": q_name, "ffFwIh": score, "fn8TJd": total}}]
        }
        try:
            req = urllib.request.Request(webhook_url, method="POST")
            req.add_header('Content-Type', 'application/json; charset=utf-8')
            req.add_header('Accept', 'application/json')
            urllib.request.urlopen(req, data=json.dumps(payload).encode('utf-8'), timeout=5)
        except Exception as e:
            print(f"Webhook error: {e}")
            
    threading.Thread(target=trigger_webhook, daemon=True).start()
    return jsonify({"success": True})

# ---------------------------------------------------------
# 3. NATIVE DESKTOP WINDOW LAUNCHER
# ---------------------------------------------------------
if __name__ == '__main__':
    # PyWebView starts the Flask server and creates a native desktop window
    window = webview.create_window(
        "Mr. Cooper's Quiz Suite", 
        app, 
        width=1280, 
        height=800,
        min_size=(800, 600)
    )
    # Start the application
    webview.start(debug=False)