
# quiz_store.py 
import os
import json
import re
import shutil
from config import DATA_DIR, CONFIG_FILES

_QUIZ_CACHE = {}

DEFAULT_CLASS_QUESTION_TEXT = (
    "Please select your class:<br>"
    "G6A = Grade 6 Class A<br>"
    "G6B = Grade 6 Class B<br>"
    "G6C = Grade 6 Class C<br>"
    "G7A = Grade 7 Class A<br>"
    "G7B = Grade 7 Class B<br>"
    "G7C = Grade 7 Class C<br>"
    "G8A = Grade 8 Class A<br>"
    "G8B = Grade 8 Class B<br>"
    "G8C = Grade 8 Class C"
)
DEFAULT_NAME_QUESTION_TEXT = "Please write your English name used in class:"


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


def _get_question_info(item):
    """Extracts (question_text, question_type, question_number) from either dict or list representations."""
    if isinstance(item, dict):
        if item.get("quiz_metadata"):
            return None, None, None
        q_txt = str(
            item.get("question text") or item.get("question_text") or 
            item.get("Question Text") or item.get("Question_Text") or 
            item.get("question") or ""
        ).strip()
        q_type = str(item.get("type") or item.get("question_type") or "").strip()
        q_num = item.get("question number") or item.get("question_number") or item.get("Question Number")
        return q_txt, q_type, q_num
    elif isinstance(item, list) and len(item) > 5:
        q_txt = str(item[5]).strip()
        q_type = str(item[2]).strip() if len(item) > 2 else ""
        q_num = item[1] if len(item) > 1 else None
        return q_txt, q_type, q_num
    return None, None, None


def _is_class_question(item):
    """Detects class selection questions while avoiding false positives on science questions (e.g. lever classes)."""
    q_txt, q_type, _ = _get_question_info(item)
    if q_txt is None:
        return False
    txt_lower = q_txt.lower()
    type_lower = (q_type or "").lower()

    if "class of lever" in txt_lower or "lever class" in txt_lower or "classify" in txt_lower or "classification" in txt_lower:
        return False

    if "select your class" in txt_lower or "select class" in txt_lower or "choose your class" in txt_lower or "pick your class" in txt_lower:
        return True

    if ("grade 6 class" in txt_lower or "g6a" in txt_lower or "g7a" in txt_lower or "g8a" in txt_lower) and "class" in txt_lower:
        return True

    if "your class" in txt_lower and ("multiple_choice" in type_lower or "matching" in type_lower or not type_lower):
        return True

    if (txt_lower.startswith("class:") or txt_lower.startswith("class :") or txt_lower == "class") and ("classic" not in txt_lower):
        return True

    return False


def _is_name_question(item):
    """Detects student English name questions."""
    q_txt, q_type, _ = _get_question_info(item)
    if q_txt is None:
        return False
    txt_lower = q_txt.lower()
    type_lower = (q_type or "").lower()

    if "english name" in txt_lower or "your name" in txt_lower or "student name" in txt_lower or "full name" in txt_lower:
        return True

    if (txt_lower.startswith("name:") or txt_lower.startswith("name :") or txt_lower == "name") and "essay" in type_lower:
        return True

    return False


def ensure_admin_questions_in_file(file_path, is_bonus=False):
    """
    Checks if a quiz JSON file contains 'Select your class' and 'Insert your English name' questions.
    Ensures exactly one set exists (removes duplicates) and saves the cleaned file directly.
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
        (isinstance(item, dict) and not item.get("quiz_metadata") and (
            item.get("question text") or item.get("question_text") or 
            item.get("Question Text") or item.get("type") or item.get("question_type")
        )) or (isinstance(item, list) and len(item) > 5)
        for item in items
    )
    if not has_any_question:
        return False

    metadata_items = []
    regular_items = []
    class_items = []
    name_items = []

    for item in items:
        if isinstance(item, dict) and item.get("quiz_metadata"):
            metadata_items.append(item)
        elif _is_class_question(item):
            class_items.append(item)
        elif _is_name_question(item):
            name_items.append(item)
        else:
            regular_items.append(item)

    needs_change = False

    # Check for duplicates, missing questions, or unwanted class selection in bonus quizzes
    if len(class_items) > 1:
        needs_change = True
    if len(name_items) > 1:
        needs_change = True
    if is_bonus and len(class_items) > 0:
        needs_change = True
    if not is_bonus and len(class_items) == 0:
        needs_change = True
    if len(name_items) == 0:
        needs_change = True

    if not needs_change:
        return False

    # Compute maximum question number from regular items
    max_q_num = 0.0
    for item in regular_items:
        _, _, raw_num = _get_question_info(item)
        if raw_num is not None:
            try:
                num_str = re.sub(r'^[Qq]', '', str(raw_num).strip())
                num_val = float(num_str)
                if num_val > max_q_num:
                    max_q_num = num_val
            except Exception:
                pass

    new_items = []
    new_items.extend(metadata_items)
    new_items.extend(regular_items)

    # 1. Exactly one English Name question
    if name_items:
        # Prefer the item containing the full prompt if available
        chosen_name = next((n for n in name_items if "english name used in class" in str(n).lower()), name_items[0])
        if isinstance(chosen_name, dict):
            chosen_name["question number"] = max_q_num + 1.0
            chosen_name["question_name"] = f"Question {int(max_q_num + 1.0)}"
        elif isinstance(chosen_name, list) and len(chosen_name) > 1:
            chosen_name[0] = f"Question {int(max_q_num + 1.0)}"
            chosen_name[1] = str(int(max_q_num + 1.0))
        new_items.append(chosen_name)
    else:
        new_name_q = {
            "url": "",
            "question number": max_q_num + 1.0,
            "type": "essay_question",
            "points": 0.0,
            "question text": DEFAULT_NAME_QUESTION_TEXT
        }
        new_items.append(new_name_q)

    # 2. Exactly one Class Selection question (unless bonus)
    if not is_bonus:
        if class_items:
            # Prefer the item containing the full class breakdown if available
            chosen_class = next((c for c in class_items if "grade 6 class a" in str(c).lower()), class_items[0])
            if isinstance(chosen_class, dict):
                chosen_class["question number"] = max_q_num + 2.0
                chosen_class["question_name"] = f"Question {int(max_q_num + 2.0)}"
            elif isinstance(chosen_class, list) and len(chosen_class) > 1:
                chosen_class[0] = f"Question {int(max_q_num + 2.0)}"
                chosen_class[1] = str(int(max_q_num + 2.0))
            new_items.append(chosen_class)
        else:
            new_class_q = {
                "url": "",
                "question number": max_q_num + 2.0,
                "type": "matching_question",
                "points": 0.0,
                "question text": DEFAULT_CLASS_QUESTION_TEXT,
                "answers": [
                    {"answer_text": "G6A", "weight": 0},
                    {"answer_text": "G6B", "weight": 0},
                    {"answer_text": "G6C", "weight": 0},
                    {"answer_text": "G7A", "weight": 0},
                    {"answer_text": "G7B", "weight": 0},
                    {"answer_text": "G7C", "weight": 0},
                    {"answer_text": "G8A", "weight": 0},
                    {"answer_text": "G8B", "weight": 0},
                    {"answer_text": "G8C", "weight": 0}
                ]
            }
            new_items.append(new_class_q)

    if is_list:
        final_data = new_items
    else:
        raw["data"] = new_items
        final_data = raw

    try:
        tmp_path = file_path + ".tmp"
        with open(tmp_path, 'w', encoding='utf-8') as out_f:
            json.dump(final_data, out_f, indent=4, ensure_ascii=False)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        shutil.move(tmp_path, file_path)
        print(f"[AUTO-ADMIN] Cleaned and ensured single set of admin questions in: {os.path.basename(file_path)}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save updated admin questions to '{file_path}': {e}")
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

                # Automatically clean duplicates and ensure Class and Name questions exist directly in the JSON on disk
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