import os
import json
import re
import shutil
from config import DATA_DIR, CONFIG_FILES

_QUIZ_CACHE = {}


def robust_json_load_file(file_path):
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        try:
            return json.loads(content, strict=False)
        except Exception:
            sanitized = re.sub(r'\\(?![/"\\bfnrtu]|u[0-9a-fA-F]{4})', r'\\\\', content)
            no_trailing = re.sub(r',\s*([}\]])', r'\1', sanitized)
            return json.loads(no_trailing, strict=False)
    except Exception:
        return None


def ensure_admin_questions_in_file(file_path, is_bonus=False):
    """
    Checks if a quiz JSON file contains 'Select your class' and 'Insert your English name' questions.
    If either is missing, appends them to the JSON and saves the file directly.
    """
    if not os.path.exists(file_path):
        return False
    try:
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        raw = json.loads(content, strict=False)
    except Exception:
        raw = robust_json_load_file(file_path)

    if raw is None:
        return False

    is_list = isinstance(raw, list)
    is_dict_data = isinstance(raw, dict) and isinstance(raw.get("data"), list)
    
    if not is_list and not is_dict_data:
        return False

    items = raw if is_list else raw["data"]

    # Verify that this file actually represents a quiz
    has_any_question = any(
        isinstance(item, dict) and not item.get("quiz_metadata") and (
            item.get("question text") or item.get("question_text") or 
            item.get("Question Text") or item.get("type") or item.get("question_type")
        )
        for item in items
    )
    if not has_any_question:
        return False

    has_class_q = False
    has_name_q = False
    max_q_num = 0.0

    for item in items:
        if not isinstance(item, dict) or item.get("quiz_metadata"):
            continue

        q_txt = str(
            item.get("question text") or item.get("question_text") or 
            item.get("Question Text") or item.get("Question_Text") or 
            item.get("question") or ""
        ).lower()
        q_type = str(item.get("type") or item.get("question_type") or "").lower()

        raw_num = item.get("question number") or item.get("question_number") or item.get("Question Number")
        if raw_num is not None:
            try:
                num_val = float(raw_num)
                if num_val > max_q_num:
                    max_q_num = num_val
            except Exception:
                pass

        if "select your class" in q_txt or "select class" in q_txt or (("class" in q_txt) and ("classic" not in q_txt) and ("multiple_choice" in q_type or "matching" in q_type)):
            has_class_q = True

        if "english name" in q_txt or "your name" in q_txt or (("name" in q_txt) and ("essay" in q_type)):
            has_name_q = True

    modified = False

    if not is_bonus and not has_class_q:
        max_q_num += 1.0
        class_q = {
            "url": "",
            "question number": max_q_num,
            "type": "multiple_choice_question",
            "points": 0.0,
            "correct ans index": "",
            "question text": "Select your class:",
            "a": "", "b": "", "c": "", "d": "", "e": "", "f": "", "g": "", "h": "", "i": ""
        }
        items.append(class_q)
        modified = True

    if not has_name_q:
        max_q_num += 1.0
        name_q = {
            "url": "",
            "question number": max_q_num,
            "type": "essay_question",
            "points": 0.0,
            "question text": "Insert your English name:"
        }
        items.append(name_q)
        modified = True

    if modified:
        try:
            tmp_path = file_path + ".tmp"
            with open(tmp_path, 'w', encoding='utf-8') as out_f:
                json.dump(raw, out_f, indent=4, ensure_ascii=False)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
            shutil.move(tmp_path, file_path)
            print(f"[AUTO-ADMIN] Added missing Class/Name questions to: {os.path.basename(file_path)}")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to save updated admin questions to '{file_path}': {e}")
            return False

    return False


def get_quiz_points(file_path):
    pts = 0
    qd = robust_json_load_file(file_path)
    if qd:
        items = qd if isinstance(qd, list) else qd.get("data", []) if isinstance(qd, dict) else []
        for item in items:
            if isinstance(item, dict):
                try:
                    raw_pts = item.get('points', item.get('points_possible', 0))
                    pts += int(float(raw_pts))
                except Exception:
                    pass
            elif isinstance(item, list) and len(item) > 4:
                try:
                    pts += int(float(item[4]))
                except Exception:
                    pass
    return pts


def update_quiz_index():
    global _QUIZ_CACHE
    index_data = {}
    if not os.path.exists(DATA_DIR):
        return index_data, []

    all_quizzes = []
    for root, dirs, files in os.walk(DATA_DIR):
        if "media" in root:
            continue
        is_bonus_dir = "bonus" in root
        for f in files:
            if f.endswith('.json') and f not in CONFIG_FILES:
                quiz_name = f[:-5]
                full_path = os.path.join(root, f)

                # Automatically ensure Class and Name questions exist directly in the JSON on disk
                ensure_admin_questions_in_file(full_path, is_bonus=is_bonus_dir)

                rel_path = os.path.relpath(full_path, DATA_DIR).replace('\\', '/')
                index_data[quiz_name] = rel_path

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
    except Exception:
        pass

    return index_data, all_quizzes