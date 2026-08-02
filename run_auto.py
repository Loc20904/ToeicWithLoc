import sys
import time
import os

# Đảm bảo Console in tiếng Việt không lỗi trên Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src.config import Config
from src.pdf_extractor import render_page_to_png_bytes
from src.gemini_service import extract_vocab_from_image
from src.image_service import get_image_url
from src.sheets_service import get_sheets_client, get_worksheet, export_vocab_to_sheet
import src.progress as prog

def main():
    print("=" * 60)
    print("🚀 BẮT ĐẦU CHẠY TRÍCH XUẤT TỰ ĐỘNG TRACK 1, 2, 3 (TRANG 15 - 26)...")
    print("=" * 60)
    
    # 1. Xác thực cấu hình
    is_valid, errors = Config.validate()
    if not is_valid:
        print("❌ Lỗi cấu hình:")
        for err in errors:
            print(f"  - {err}")
        return

    # 2. Kết nối Google Sheet
    try:
        sheets_client = get_sheets_client(Config.GOOGLE_CREDENTIALS_FILE)
        worksheet = get_worksheet(sheets_client, Config.SPREADSHEET_NAME)
        print(f"✅ Kết nối thành công Google Sheet: '{Config.SPREADSHEET_NAME}'")
    except Exception as e:
        print(f"❌ Lỗi kết nối Google Sheets: {e}")
        return

    pdf_path = Config.DEFAULT_PDF_PATH
    
    # Phạm vi chạy: PDF trang 15 đến trang 26 (0-indexed: index 14 đến 25)
    start_page = 14
    end_page = 25
    pages_to_run = list(range(start_page, end_page + 1))
    
    # Tải tiến trình cũ để tránh chạy lại các trang đã hoàn thành
    progress = prog.load_progress(pdf_path)
    completed_pages = progress["completed_pages"]
    
    # Lọc ra các trang chưa làm
    pages_to_process = [p for p in pages_to_run if p not in completed_pages]
    
    if not pages_to_process:
        print("\n🎉 Tất cả các trang từ 15 đến 26 đã được xử lý xong trước đó!")
        print(f"📊 Tổng số từ trong tiến trình: {progress.get('total_extracted_words', 0)} từ.")
        return
        
    print(f"👉 Số trang chưa xử lý: {len(pages_to_process)}/{len(pages_to_run)} trang.")
    print(f"👉 Danh sách các trang sẽ chạy: {[p + 1 for p in pages_to_process]}")
    print("-" * 60)
    
    success_count = 0
    
    for idx, page_num in enumerate(pages_to_process):
        user_page = page_num + 1
        print(f"\n⏳ [{idx+1}/{len(pages_to_process)}] Đang xử lý trang {user_page}...")
        
        try:
            # A. Render PDF thành ảnh PNG
            img_bytes = render_page_to_png_bytes(pdf_path, page_num)
            
            # B. Gửi Gemini API để OCR và nhận JSON
            print("  -> Đang gửi ảnh sang Gemini (sử dụng gemini-3.5-flash)...")
            vocab_list = extract_vocab_from_image(img_bytes, Config.GEMINI_API_KEY)
            
            if not vocab_list:
                print(f"  ⚠️ Không phát hiện từ vựng chính ở trang {user_page}.")
                prog.mark_page_completed(pdf_path, page_num, 0)
                continue
                
            print(f"  ✨ Đã trích xuất {len(vocab_list)} từ vựng. Đang lấy ảnh minh họa...")
            
            # C. Tìm ảnh minh họa (API / Flickr Fallback)
            for item in vocab_list:
                term = item.get("term", "")
                keyword = item.get("image_keyword", term)
                img_url = get_image_url(keyword, Config.UNSPLASH_ACCESS_KEY)
                item["image_url"] = img_url
                print(f"    + {term} ({keyword}) -> {img_url[:45]}...")
                
            # D. Ghi vào Google Sheet
            print(f"  -> Ghi {len(vocab_list)} từ vào Google Sheet...")
            export_vocab_to_sheet(worksheet, vocab_list)
            
            # E. Lưu tiến trình
            prog.mark_page_completed(pdf_path, page_num, len(vocab_list))
            success_count += 1
            print(f"  ✅ Hoàn thành trang {user_page}!")
            
        except Exception as e:
            print(f"  ❌ Lỗi khi xử lý trang {user_page}: {e}")
            print("  🛑 Dừng chương trình. Bạn có thể chạy lại để tiếp tục từ trang này.")
            return
            
        # Nghỉ giữa mỗi request để bảo vệ hạn ngạch rate limit (5 RPM -> 13 giây)
        if idx < len(pages_to_process) - 1:
            print("  💤 Nghỉ 13 giây trước trang tiếp theo...")
            time.sleep(13)
            
    print("\n" + "=" * 60)
    print(f"🎉 HOÀN THÀNH BATCH! Đã xử lý thêm {success_count} trang.")
    print("=" * 60)

if __name__ == "__main__":
    main()
