import sys
import time
import os

# Đảm bảo in ký tự tiếng Việt không lỗi trên Console Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src.config import Config
from src.pdf_extractor import get_pdf_page_count, render_page_to_png_bytes
from src.gemini_service import extract_vocab_from_image
from src.image_service import get_image_url
from src.sheets_service import get_sheets_client, get_worksheet, export_vocab_to_sheet
import src.progress as prog

def print_header():
    print("=" * 60)
    print("   TOEIC PDF TO QUIZLET IMPORT TOOL (Bản nâng cấp Multimodal)  ")
    print("=" * 60)

def main():
    print_header()
    
    # 1. Xác thực cấu hình môi trường
    print("⏳ Bước 1: Kiểm tra cấu hình và kết nối...")
    is_valid, errors = Config.validate()
    if not is_valid:
        print("\n❌ LỖI CẤU HÌNH. Vui lòng kiểm tra lại các mục sau:")
        for err in errors:
            print(f"  - {err}")
        print("\n👉 Xem hướng dẫn trong file 'implementation_plan.md' hoặc điền đầy đủ file '.env'.")
        return

    # 2. Thử kết nối Google Sheet trước để báo lỗi sớm
    try:
        sheets_client = get_sheets_client(Config.GOOGLE_CREDENTIALS_FILE)
        worksheet = get_worksheet(sheets_client, Config.SPREADSHEET_NAME)
        print(f"✅ Kết nối Google Sheet thành công: '{Config.SPREADSHEET_NAME}'")
    except Exception as e:
        print(f"\n❌ Không thể kết nối tới Google Sheets:")
        print(f"  {e}")
        return

    # 3. Lấy thông tin PDF
    pdf_path = Config.DEFAULT_PDF_PATH
    try:
        total_pages = get_pdf_page_count(pdf_path)
        print(f"✅ Đọc thành công file PDF: '{pdf_path}' ({total_pages} trang)")
    except Exception as e:
        print(f"\n❌ Lỗi đọc file PDF: {e}")
        return

    # 4. Tải tiến trình cũ
    progress = prog.load_progress(pdf_path)
    completed_pages = progress["completed_pages"]
    
    start_page = 0
    end_page = total_pages - 1
    resume_mode = False

    if completed_pages:
        print(f"\nℹ️ Phát hiện tiến trình cũ:")
        print(f"  - Đã hoàn thành: {len(completed_pages)}/{total_pages} trang.")
        print(f"  - Tổng số từ vựng đã trích xuất: {progress.get('total_extracted_words', 0)} từ.")
        choice = input("👉 Bạn có muốn chạy tiếp tục từ tiến trình cũ? (y/n): ").strip().lower()
        if choice == 'y':
            resume_mode = True
            print("▶️ Chế độ: Chạy tiếp tục.")
        else:
            choice_del = input("⚠️ Bạn có chắc chắn muốn xóa lịch sử tiến trình cũ và bắt đầu lại? (y/n): ").strip().lower()
            if choice_del == 'y':
                prog.clear_progress()
                progress = prog.load_progress(pdf_path)
                completed_pages = []
                print("🧹 Đã xóa lịch sử tiến trình.")
            else:
                print("▶️ Giữ lịch sử cũ nhưng sẽ hỏi khoảng trang cần xử lý.")

    # 5. Xác định khoảng trang để quét (nếu không chạy chế độ Resume tự động hoàn toàn)
    if not resume_mode:
        print(f"\n👉 Nhập khoảng trang bạn muốn trích xuất (từ 1 đến {total_pages}):")
        try:
            user_start = int(input(f"  - Trang bắt đầu (mặc định 1): ") or 1)
            user_end = int(input(f"  - Trang kết thúc (mặc định {total_pages}): ") or total_pages)
            
            # Chuyển đổi sang 0-indexed cho hệ thống
            start_page = max(0, user_start - 1)
            end_page = min(total_pages - 1, user_end - 1)
            
            if start_page > end_page:
                print("❌ Lỗi: Trang bắt đầu phải nhỏ hơn hoặc bằng trang kết thúc.")
                return
        except ValueError:
            print("❌ Lỗi: Vui lòng nhập số nguyên hợp lệ.")
            return

    # Tạo danh sách các trang cần chạy
    pages_to_process = []
    if resume_mode:
        # Chạy tất cả các trang chưa hoàn thành
        pages_to_process = [p for p in range(total_pages) if p not in completed_pages]
    else:
        # Chạy trong khoảng người dùng chọn, bỏ qua các trang đã chạy
        pages_to_process = [p for p in range(start_page, end_page + 1) if p not in completed_pages]

    if not pages_to_process:
        print("\n🎉 Tất cả các trang trong khoảng lựa chọn đã được xử lý trước đó!")
        return

    print(f"\n🚀 Bắt đầu xử lý {len(pages_to_process)} trang...")
    print("-" * 60)
    
    success_count = 0
    
    for idx, page_num in enumerate(pages_to_process):
        user_friendly_page = page_num + 1
        print(f"\n⏳ [{idx+1}/{len(pages_to_process)}] Đang xử lý trang {user_friendly_page}...")
        
        try:
            # Bước A: Render trang PDF thành ảnh PNG trong bộ nhớ
            img_bytes = render_page_to_png_bytes(pdf_path, page_num, dpi=150)
            
            # Bước B: Gọi Gemini API để OCR và nhận dạng JSON từ ảnh
            print("  -> Gửi ảnh sang Gemini API để trích xuất...")
            vocab_list = extract_vocab_from_image(img_bytes, Config.GEMINI_API_KEY)
            
            if not vocab_list:
                print(f"  ⚠️ Trang {user_friendly_page} không chứa từ vựng chính nào hoặc không nhận diện được.")
                prog.mark_page_completed(pdf_path, page_num, 0)
                continue
                
            print(f"  ✨ Đã phát hiện {len(vocab_list)} từ vựng. Đang tìm ảnh minh họa...")
            
            # Bước C: Tìm kiếm ảnh minh họa từ Unsplash cho từng từ vựng
            for item in vocab_list:
                term = item.get("term", "")
                keyword = item.get("image_keyword", term)
                # Tìm kiếm link ảnh
                img_url = get_image_url(keyword, Config.UNSPLASH_ACCESS_KEY)
                item["image_url"] = img_url
                print(f"    + {term} ({keyword}) -> {img_url[:45]}...")
                
            # Bước D: Đẩy toàn bộ từ vựng của trang lên Google Sheet
            print(f"  -> Ghi {len(vocab_list)} từ vào Google Sheet...")
            export_vocab_to_sheet(worksheet, vocab_list)
            
            # Bước E: Đánh dấu trang hoàn thành
            prog.mark_page_completed(pdf_path, page_num, len(vocab_list))
            success_count += 1
            print(f"  ✅ Hoàn thành trang {user_friendly_page}!")
            
        except Exception as e:
            print(f"  ❌ Lỗi khi xử lý trang {user_friendly_page}: {e}")
            choice = input("👉 Bạn có muốn tiếp tục xử lý các trang tiếp theo? (y/n): ").strip().lower()
            if choice != 'y':
                print("\n🛑 Đã dừng chương trình. Tiến trình của bạn đã được lưu lại.")
                return
                
        # Bước F: Độ trễ để tránh Rate Limit của Gemini API (5 RPM -> ~12 giây/request, đặt 13 giây để an toàn)
        if idx < len(pages_to_process) - 1:
            delay = 13
            print(f"  💤 Nghỉ {delay} giây để tránh giới hạn API...")
            time.sleep(delay)

    print("\n" + "=" * 60)
    print(f"🎉 HOÀN THÀNH! Đã xử lý thành công {success_count} trang.")
    print(f"📊 Truy cập Google Sheet '{Config.SPREADSHEET_NAME}' để xem kết quả.")
    print("=" * 60)

if __name__ == "__main__":
    main()
