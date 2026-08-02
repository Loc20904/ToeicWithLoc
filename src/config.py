import os
from dotenv import load_dotenv

# Tự động tải các biến môi trường từ file .env ở thư mục gốc
load_dotenv()

class Config:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    UNSPLASH_ACCESS_KEY = os.getenv("UNSPLASH_ACCESS_KEY")
    SPREADSHEET_NAME = os.getenv("SPREADSHEET_NAME", "Quizlet_Vocab_Import")
    GOOGLE_CREDENTIALS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")
    
    # Đường dẫn mặc định tới file PDF từ vựng
    DEFAULT_PDF_PATH = "Full bộ từ vựng ôn thi TOEIC từ 0- 990.pdf"

    @classmethod
    def validate(cls):
        """Kiểm tra tính hợp lệ của cấu hình."""
        errors = []
        if not cls.GEMINI_API_KEY or cls.GEMINI_API_KEY == "YOUR_GEMINI_API_KEY":
            errors.append("Thiếu GEMINI_API_KEY hoặc khóa chưa được thay thế trong file .env.")
            
        if not os.path.exists(cls.GOOGLE_CREDENTIALS_FILE):
            errors.append(f"Không tìm thấy file credentials '{cls.GOOGLE_CREDENTIALS_FILE}' cho Google Sheets API. Vui lòng tải về và đặt ở thư mục gốc.")
            
        if not os.path.exists(cls.DEFAULT_PDF_PATH):
            errors.append(f"Không tìm thấy file PDF mặc định '{cls.DEFAULT_PDF_PATH}' trong thư mục dự án.")
            
        return len(errors) == 0, errors
