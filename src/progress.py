import json
import os
from typing import Dict, List, Any

PROGRESS_FILE = "progress.json"

def load_progress(pdf_path: str) -> Dict[str, Any]:
    """Tải tiến trình xử lý từ file progress.json.
    
    Nếu file chưa tồn tại hoặc thuộc về file PDF khác, khởi tạo một cấu trúc mới.
    """
    default_progress = {
        "pdf_path": pdf_path,
        "completed_pages": [],
        "total_extracted_words": 0
    }
    
    if not os.path.exists(PROGRESS_FILE):
        return default_progress
        
    try:
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # Kiểm tra xem file tiến trình có khớp với file PDF hiện tại không
        if data.get("pdf_path") == pdf_path:
            # Đảm bảo các kiểu dữ liệu đúng định dạng
            if "completed_pages" not in data:
                data["completed_pages"] = []
            if "total_extracted_words" not in data:
                data["total_extracted_words"] = 0
            return data
    except Exception as e:
        print(f"⚠️ Không thể đọc file tiến trình '{PROGRESS_FILE}': {e}. Sẽ khởi tạo lại.")
        
    return default_progress

def save_progress(progress: Dict[str, Any]) -> None:
    """Lưu cấu trúc tiến trình hiện tại vào file progress.json."""
    try:
        # Sắp xếp các trang đã hoàn thành để dễ theo dõi
        progress["completed_pages"] = sorted(list(set(progress["completed_pages"])))
        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Lỗi khi lưu file tiến trình '{PROGRESS_FILE}': {e}")

def mark_page_completed(pdf_path: str, page_num: int, new_words_count: int) -> None:
    """Đánh dấu một trang đã xử lý và ghi nhận số từ vựng trích xuất được."""
    progress = load_progress(pdf_path)
    if page_num not in progress["completed_pages"]:
        progress["completed_pages"].append(page_num)
        progress["total_extracted_words"] += new_words_count
        save_progress(progress)

def clear_progress() -> None:
    """Xóa file tiến trình để bắt đầu lại từ đầu."""
    if os.path.exists(PROGRESS_FILE):
        try:
            os.remove(PROGRESS_FILE)
            print(f"🧹 Đã xóa tiến trình cũ.")
        except Exception as e:
            print(f"⚠️ Không thể xóa file tiến trình: {e}")
