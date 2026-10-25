import os
import platform
import shutil
import subprocess
import webbrowser

from config import get_clean_env, WEB_DIR, DATA_DIR, EXE_DIR


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
        # Prefer Firefox on Linux/Fedora44 over Edge/Chromium
        if shutil.which("firefox"):
            print("[DEBUG] Launching native Firefox in new window mode with custom icon.")
            
            icon_path = "firefox"
            possible_icon_paths = [
                os.path.join(WEB_DIR, 'icon.png'),
                os.path.join(DATA_DIR, 'icon.png'),
                os.path.join(EXE_DIR, 'icon.png'),
                os.path.join(WEB_DIR, 'icon.ico'),
                os.path.join(DATA_DIR, 'icon.ico'),
                os.path.join(EXE_DIR, 'icon.ico')
            ]
            for p in possible_icon_paths:
                if os.path.exists(p):
                    icon_path = os.path.abspath(p)
                    break

            desktop_dir = os.path.expanduser("~/.local/share/applications")
            os.makedirs(desktop_dir, exist_ok=True)
            desktop_file = os.path.join(desktop_dir, "MrCooperApp.desktop")
            
            desktop_content = (
                "[Desktop Entry]\n"
                "Version=1.0\n"
                "Name=Mr. Cooper's STEAM & CS\n"
                "Exec=firefox --class=MrCooperApp --name=MrCooperApp --new-window %u\n"
                "Terminal=false\n"
                "Type=Application\n"
                f"Icon={icon_path}\n"
                "StartupWMClass=MrCooperApp\n"
            )
            
            try:
                with open(desktop_file, "w", encoding="utf-8") as f:
                    f.write(desktop_content)
                if shutil.which("update-desktop-database"):
                    subprocess.run(["update-desktop-database", desktop_dir], check=False, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
            except Exception as e:
                print(f"[DEBUG] Failed to create .desktop file: {e}")

            return subprocess.Popen(["firefox", "--class=MrCooperApp", "--name=MrCooperApp", "--new-window", url], env=clean_env)

        if shutil.which("flatpak"):
            try:
                out = subprocess.check_output(["flatpak", "list", "--app"], env=clean_env, universal_newlines=True, stderr=subprocess.DEVNULL)
                if "org.mozilla.firefox" in out:
                    print("[DEBUG] Launching Flatpak Firefox in new window mode.")
                    return subprocess.Popen(["flatpak", "run", "org.mozilla.firefox", "--new-window", url], env=clean_env)
            except Exception:
                pass

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
        if shutil.which("xdg-open"):
            print("[DEBUG] Launching via xdg-open.")
            return subprocess.Popen(["xdg-open", url], env=clean_env)

    print("[DEBUG] Falling back to default system browser.")
    webbrowser.open(url)
    return None