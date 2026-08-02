"""
Export PDF / Gemini / Sheets Extracted Vocabulary into Web App Compatible Dataset format (`web/data/toeic_topics.json`)
"""

import json
import os
from typing import List, Dict, Any

WEB_DATA_PATH = os.path.join("web", "data", "toeic_topics.json")

def format_vocab_item(raw_item: Dict[str, Any], word_id: str) -> Dict[str, Any]:
    """Convert raw vocabulary dict to web application format."""
    return {
        "id": word_id,
        "term": raw_item.get("term", "").strip(),
        "ipa": raw_item.get("ipa", "").strip(),
        "pos": raw_item.get("part_of_speech", raw_item.get("pos", "(N)")).strip(),
        "synonym": raw_item.get("synonym", raw_item.get("image_keyword", "")).strip(),
        "definition": raw_item.get("definition", "").strip(),
        "note": raw_item.get("note", "").strip(),
        "example_en": raw_item.get("example_en", "").strip(),
        "example_vi": raw_item.get("example_vi", "").strip(),
        "image_url": raw_item.get("image_url", "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=600&q=80")
    }

def add_topic_words(topic_id: str, topic_name: str, words_list: List[Dict[str, Any]], description: str = "", icon: str = "📚"):
    """Thêm một học phần/chủ đề mới vào file JSON web app."""
    os.makedirs(os.path.dirname(WEB_DATA_PATH), exist_ok=True)
    
    topics = []
    if os.path.exists(WEB_DATA_PATH):
        try:
            with open(WEB_DATA_PATH, "r", encoding="utf-8") as f:
                topics = json.load(f)
        except Exception:
            topics = []
            
    # Tìm xem chủ đề đã tồn tại chưa
    existing_topic = next((t for t in topics if t["topic_id"] == topic_id), None)
    
    formatted_words = []
    for idx, item in enumerate(words_list):
        word_id = f"{topic_id}_{idx+1:03d}"
        formatted_words.append(format_vocab_item(item, word_id))
        
    if existing_topic:
        existing_topic["words"] = formatted_words
        existing_topic["topic_name"] = topic_name
        existing_topic["description"] = description
        existing_topic["icon"] = icon
    else:
        topics.append({
            "topic_id": topic_id,
            "topic_name": topic_name,
            "description": description,
            "icon": icon,
            "words": formatted_words
        })
        
    with open(WEB_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(topics, f, ensure_ascii=False, indent=2)
        
    print(f"✅ Đã cập nhật học phần '{topic_name}' ({len(formatted_words)} từ) vào {WEB_DATA_PATH}")

if __name__ == "__main__":
    print("Tool chuyển đổi dữ liệu từ vựng sang định dạng Web App TOEIC.")
