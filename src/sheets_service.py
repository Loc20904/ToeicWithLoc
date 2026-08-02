import gspread
from google.oauth2.service_account import Credentials
from typing import List, Dict, Any

def get_sheets_client(credentials_file: str) -> gspread.Client:
    """Khởi tạo client Google Sheets bằng Service Account."""
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    creds = Credentials.from_service_account_file(credentials_file, scopes=scopes)
    return gspread.authorize(creds)

def get_worksheet(client: gspread.Client, spreadsheet_name: str) -> gspread.Worksheet:
    """Mở bảng tính Google Sheets bằng tên và chọn Sheet1."""
    try:
        spreadsheet = client.open(spreadsheet_name)
        return spreadsheet.sheet1
    except gspread.SpreadsheetNotFound:
        raise ValueError(
            f"Không tìm thấy bảng tính Google Sheet có tên '{spreadsheet_name}'.\n"
            f"Vui lòng đảm bảo:\n"
            f"1. Tên bảng tính trong file .env chính xác.\n"
            f"2. Bạn đã Chia sẻ (Share) bảng tính này với email của Service Account với quyền Editor."
        )
    except Exception as e:
        raise IOError(f"Lỗi kết nối Google Sheet: {e}")

def export_vocab_to_sheet(sheet: gspread.Worksheet, vocab_list: List[Dict[str, Any]]) -> int:
    """Định dạng từ vựng và ghi vào Google Sheet dưới dạng lô (batch).
    
    Quy cách định dạng cho Quizlet:
    - Cột 1 (Term): 'Từ vựng [phiên âm] (từ loại.)'
    - Cột 2 (Definition): 'Định nghĩa Việt\nEx: Ví dụ Anh\n(Dịch ví dụ Việt)'
    - Cột 3 (Image URL): Đường dẫn link ảnh từ Unsplash.
    """
    # 1. Kiểm tra và ghi tiêu đề nếu sheet trống
    try:
        existing_rows = len(sheet.get_all_values())
    except Exception as e:
        # Dự phòng nếu lỗi đọc sheet
        existing_rows = 0
        
    if existing_rows == 0:
        sheet.append_row(["Term (Mặt trước)", "Definition & Example (Mặt sau)", "Image URL (Link Ảnh)"])
        
    rows_to_add = []
    for item in vocab_list:
        term = item.get("term", "").strip()
        ipa = item.get("ipa", "").strip()
        pos = item.get("part_of_speech", "").strip()
        definition = item.get("definition", "").strip()
        example_en = item.get("example_en", "").strip()
        example_vi = item.get("example_vi", "").strip()
        image_url = item.get("image_url", "").strip()
        
        # Định dạng cột Mặt trước (Term)
        term_parts = [term]
        if ipa:
            term_parts.append(ipa)
        if pos:
            # Chuẩn hóa từ loại (ví dụ: 'n' thành '(n.)', 'v.' thành '(v.)')
            pos_clean = pos.strip("(). ")
            if pos_clean:
                term_parts.append(f"({pos_clean}.)")
        term_col = " ".join(term_parts)
        
        # Định dạng cột Mặt sau (Definition & Example)
        # Dùng ký hiệu phân cách "  |  " thay cho xuống dòng "\n" để tránh lỗi Quizlet tự ý cắt thành nhiều thẻ
        def_lines = [definition]
        if example_en:
            def_lines.append(f"Ex: {example_en}")
        if example_vi:
            def_lines.append(f"({example_vi})")
        def_col = "  |  ".join(def_lines)
        
        rows_to_add.append([term_col, def_col, image_url])
        
    # Ghi dữ liệu theo dạng lô (append_rows) để tránh Rate Limit API
    if rows_to_add:
        sheet.append_rows(rows_to_add)
        
    return len(rows_to_add)
