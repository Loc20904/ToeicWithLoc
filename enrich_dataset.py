"""
Script to enrich web/data/toeic_topics.json with high quality images and formatted synonyms.
"""

import json
import os
import sys
from src.image_service import get_image_url
from src.config import Config

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

WEB_DATA_PATH = os.path.join("web", "data", "toeic_topics.json")

def main():
    if not os.path.exists(WEB_DATA_PATH):
        print(f"Không tìm thấy file dataset: {WEB_DATA_PATH}")
        return

    with open(WEB_DATA_PATH, "r", encoding="utf-8") as f:
        topics = json.load(f)

    updated_count = 0
    synonym_count = 0

    access_key = getattr(Config, "UNSPLASH_ACCESS_KEY", "")

    for topic in topics:
        for word in topic.get("words", []):
            term = word.get("term", "")
            
            # 1. Set Image URL dynamically if current image is missing or broken
            current_url = word.get("image_url", "")
            if not current_url or "source.unsplash.com" in current_url:
                word["image_url"] = get_image_url(term, access_key)
            
            updated_count += 1

            # 2. Ensure synonym is formatted string or list
            syn = word.get("synonym")
            if isinstance(syn, list):
                if len(syn) > 0:
                    word["synonym_text"] = ", ".join(syn)
                    synonym_count += 1
                else:
                    word["synonym_text"] = ""
            elif isinstance(syn, str):
                word["synonym_text"] = syn
                if len(syn.strip()) > 0:
                    synonym_count += 1
            else:
                word["synonym_text"] = ""

    with open(WEB_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(topics, f, ensure_ascii=False, indent=2)

    print(f"Đã cập nhật hình ảnh và từ đồng nghĩa cho {updated_count} từ vựng ({synonym_count} từ có đồng nghĩa).")

if __name__ == "__main__":
    main()

