import os
import sys
import json
import re
import threading
import urllib.request
import urllib.parse
import urllib.error
import platform
import shutil
import subprocess
import time
import tempfile
import zipfile

from config import CURRENT_VERSION, DATA_DIR, EXE_DIR, APPIMAGE_PATH
from quiz_store import robust_json_load_file

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