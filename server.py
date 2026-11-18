import os
import sys
import time
import tempfile
import threading
import platform
import shutil
import subprocess
from socketserver import ThreadingTCPServer

# Re-export key interfaces to preserve backward compatibility as a facade
from config import (
    EXE_DIR,
    BUNDLE_DIR,
    APPDIR,
    LAUNCH_DIR,
    APPIMAGE_PATH,
    APPIMAGE_DIR,
    WEB_DIR,
    DATA_DIR,
    CONFIG_FILES,
    CURRENT_VERSION,
    DEFAULT_SCREENS,
    get_version_from_config,
    parse_screen_count,
    get_clean_env,
    get_data_dir
)
from quiz_store import (
    robust_json_load_file,
    ensure_admin_questions_in_file,
    get_quiz_points,
    update_quiz_index,
    _QUIZ_CACHE
)
from updater import (
    _UPDATE_LOCK,
    _UPDATE_STATUS,
    parse_version_tuple,
    fetch_json_safe,
    check_for_updates,
    download_and_install_update
)
from browser import launch_browser_app
from api_handler import QuizAPIHandler


def keep_screen_awake_virtual_key():
    """Waits 3 seconds after startup, then enters a non-intrusive virtual key once to keep the screen awake."""
    time.sleep(3)
    try:
        if platform.system() == "Windows":
            import ctypes
            # VK_F15 (0x7E) is a non-character virtual function key in Windows.
            # Pressing and releasing it simulates user input without polluting text inputs or altering state.
            VK_F15 = 0x7E
            KEYEVENTF_KEYUP = 0x0002
            ctypes.windll.user32.keybd_event(VK_F15, 0, 0, 0)
            time.sleep(0.05)
            ctypes.windll.user32.keybd_event(VK_F15, 0, KEYEVENTF_KEYUP, 0)

            # Signal Windows kernel that display is required to remain powered on
            ES_CONTINUOUS = 0x80000000
            ES_SYSTEM_REQUIRED = 0x00000001
            ES_DISPLAY_REQUIRED = 0x00000002
            ctypes.windll.kernel32.SetThreadExecutionState(
                ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
            )
            print("[AWAKE] Virtual key entered after 3 seconds to keep screen awake.")
        elif platform.system() == "Linux":
            if shutil.which("xdotool"):
                subprocess.run(
                    ["xdotool", "key", "XF86WakeUp"],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            print("[AWAKE] Linux display awake event entered.")
    except Exception as e:
        print(f"[AWAKE] Notice: Unable to enter awake virtual key: {e}")


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
    print(f"Initial Screens Mode: {DEFAULT_SCREENS}")
    print("==================================================")

    update_quiz_index()

    update_thread = threading.Thread(target=check_for_updates, daemon=True)
    update_thread.start()

    # Launch awake background thread to press a virtual key after 3 seconds
    awake_thread = threading.Thread(target=keep_screen_awake_virtual_key, daemon=True)
    awake_thread.start()

    local_url = f"http://127.0.0.1:{assigned_port}/index.html?screens={DEFAULT_SCREENS}"
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