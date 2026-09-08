# create_shortcut.py
import sys
import os
import re
import shutil
import subprocess

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

    # Search for icon in local folder first, then absolute fallback path
    icon_candidate_local = os.path.join(project_root, "icon.ico")
    icon_candidate_fallback = r"E:\2027\MrCooperSuite\0HTMLOfflineQUiz\ahmadac.github.io\icon.ico"

    if os.path.exists(icon_candidate_local):
        icon_path = icon_candidate_local
    elif os.path.exists(icon_candidate_fallback):
        icon_path = icon_candidate_fallback
    else:
        icon_path = icon_candidate_local

    if sys.platform == "win32":
        python_exe = get_pythonw_executable()
        create_windows_shortcut(app_name, python_exe, target_script, project_root, icon_path)
    else:
        print(f"Platform is '{sys.platform}'. Windows shortcut (.lnk) creation is intended for Windows systems.")

if __name__ == "__main__":
    main()