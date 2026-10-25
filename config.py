import os
import sys
import re
import platform
import shutil
import mimetypes

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


def get_version_from_config(preferred_dir=None):
    """Dynamically parses APP_VERSION from config.js to avoid writing it in two places."""
    search_dirs = [preferred_dir] if preferred_dir else []
    search_dirs.extend(candidate_web_dirs)
    for c_dir in search_dirs:
        if c_dir:
            cfg_path = os.path.join(c_dir, "config.js")
            if os.path.exists(cfg_path):
                try:
                    with open(cfg_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    m = re.search(r'APP_VERSION\s*=\s*["\']([^"\']+)["\']', content)
                    if m:
                        return m.group(1).strip()
                except Exception:
                    pass
    return "v1.0.0.0"


CURRENT_VERSION = get_version_from_config(WEB_DIR)


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
CONFIG_FILES = {
    'canvas.json', 'settings.json', 'ignore.json', 'autolink.json',
    'order.json', 'QuizResults.json', 'missing.json', 'quiz_index.json'
}