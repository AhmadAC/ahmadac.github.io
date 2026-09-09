import sys
import os
import re
import shutil
import subprocess
import stat

def get_pythonw_executable():
    """Finds pythonw.exe for windowless execution on Windows."""
    current_exe = sys.executable
    dir_name = os.path.dirname(current_exe)
    
    # 1. Check same directory as current python interpreter
    c1 = os.path.join(dir_name, "pythonw.exe")
    if os.path.exists(c1):
        return c1
        
    # 2. Check regex replacement in path
    c2 = re.sub(r'python\.exe$', 'pythonw.exe', current_exe, flags=re.IGNORECASE)
    if os.path.exists(c2):
        return c2

    # 3. Check sys.exec_prefix / base_exec_prefix
    for prefix in [sys.exec_prefix, sys.base_exec_prefix]:
        c3 = os.path.join(prefix, "pythonw.exe")
        if os.path.exists(c3):
            return c3

    # 4. Check system PATH
    which_path = shutil.which("pythonw.exe") or shutil.which("pythonw")
    if which_path and os.path.exists(which_path):
        return which_path

    # 5. Check pyw launcher
    pyw_path = shutil.which("pyw.exe") or shutil.which("pyw")
    if pyw_path and os.path.exists(pyw_path):
        return pyw_path

    return current_exe

def get_linux_desktop_dir():
    """Finds the user's localized Desktop directory using xdg-user-dir."""
    try:
        res = subprocess.run(
            ["xdg-user-dir", "DESKTOP"],
            capture_output=True,
            text=True,
            check=True
        )
        desktop_dir = res.stdout.strip()
        if os.path.isdir(desktop_dir):
            return desktop_dir
    except Exception:
        pass
    
    fallback = os.path.expanduser("~/Desktop")
    os.makedirs(fallback, exist_ok=True)
    return fallback

def create_linux_desktop_shortcut(app_name, python_exe, target_script, working_dir, icon_path):
    """Creates a .desktop file for Fedora Kinoite (KDE Plasma) and other Linux systems."""
    # Sanitize filename for Linux
    safe_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', app_name.lower()) + ".desktop"
    
    desktop_dir = get_linux_desktop_dir()
    desktop_shortcut_path = os.path.join(desktop_dir, safe_filename)
    menu_shortcut_dir = os.path.expanduser("~/.local/share/applications")
    menu_shortcut_path = os.path.join(menu_shortcut_dir, safe_filename)

    desktop_entry = [
        "[Desktop Entry]",
        "Version=1.0",
        "Type=Application",
        f"Name={app_name}",
        f"Comment=Launch {app_name}",
        f'Exec="{python_exe}" "{target_script}"',
        f"Path={working_dir}",
        "Terminal=false",
        "Categories=Utility;Education;"
    ]

    if icon_path and os.path.exists(icon_path):
        desktop_entry.append(f"Icon={icon_path}")

    content = "\n".join(desktop_entry) + "\n"

    target_paths = [desktop_shortcut_path]
    # Also register in ~/.local/share/applications for KDE Launcher (Kickoff)
    if os.path.exists(menu_shortcut_dir) or True:
        os.makedirs(menu_shortcut_dir, exist_ok=True)
        target_paths.append(menu_shortcut_path)

    for path in target_paths:
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            
            # KDE Plasma / Linux requires the executable bit (+x) to run .desktop files safely
            current_stat = os.stat(path)
            os.chmod(path, current_stat.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
            
            # Mark file as trusted in KDE/GNOME if gio is available
            if shutil.which("gio"):
                try:
                    subprocess.run(["gio", "set", path, "metadata::trusted", "true"], check=False, capture_output=True)
                except Exception:
                    pass

            print(f"[SUCCESS] Linux shortcut created: {path}")
        except Exception as e:
            print(f"[ERROR] Failed to create shortcut at '{path}': {e}")

def create_windows_shortcut(app_name, python_exe, target_script, working_dir, icon_path):
    shortcut_path = os.path.join(working_dir, f"{app_name}.lnk")

    print(f"Creating Windows shortcut targeting: {python_exe}")
    print(f"Target script: {target_script}")
    print(f"Working directory: {working_dir}")
    print(f"Icon location: {icon_path}")
    print(f"Shortcut destination: {shortcut_path}")

    if os.path.exists(shortcut_path):
        try:
            os.remove(shortcut_path)
        except Exception as e:
            print(f"Notice: Could not remove existing shortcut ({e}), overwriting...")

    def ps_quote(s):
        return "'" + s.replace("'", "''") + "'"

    ps_command = f"""
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut({ps_quote(shortcut_path)})
    $Shortcut.TargetPath = {ps_quote(python_exe)}
    $Shortcut.Arguments = {ps_quote(f'"{target_script}"')}
    $Shortcut.WorkingDirectory = {ps_quote(working_dir)}
    """
    
    if icon_path and os.path.exists(icon_path):
        ps_command += f"\n$Shortcut.IconLocation = {ps_quote(icon_path)}"
        
    ps_command += "\n$Shortcut.Save()"

    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_command], check=True)
        print(f"[SUCCESS] Windows shortcut created successfully: {shortcut_path}")
    except Exception as e:
        print(f"[ERROR] Failed to create Windows shortcut: {e}")

def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    target_script = os.path.join(project_root, "server.py")
    app_name = "Mr. Cooper's Quiz Server"

    if not os.path.exists(target_script):
        print(f"Error: Target script not found at '{target_script}'.")
        sys.exit(1)

    # Search for icon candidates (.png / .svg / .ico)
    icon_candidates = [
        os.path.join(project_root, "icon.png"),
        os.path.join(project_root, "icon.svg"),
        os.path.join(project_root, "icon.ico"),
        r"E:\2027\MrCooperSuite\0HTMLOfflineQUiz\ahmadac.github.io\icon.ico"
    ]
    
    icon_path = ""
    for candidate in icon_candidates:
        if os.path.exists(candidate):
            icon_path = candidate
            break

    if sys.platform == "win32":
        python_exe = get_pythonw_executable()
        create_windows_shortcut(app_name, python_exe, target_script, project_root, icon_path)
    elif sys.platform.startswith("linux"):
        # On Linux, sys.executable points to the current Python binary (system or venv)
        python_exe = sys.executable
        create_linux_desktop_shortcut(app_name, python_exe, target_script, project_root, icon_path)
    else:
        print(f"Unsupported platform: '{sys.platform}'")

if __name__ == "__main__":
    main()