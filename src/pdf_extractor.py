import os
import fitz  # PyMuPDF

def get_pdf_page_count(pdf_path: str) -> int:
    """Trả về tổng số trang của file PDF."""
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"Không tìm thấy file PDF tại đường dẫn: {pdf_path}")
    
    try:
        doc = fitz.open(pdf_path)
        count = len(doc)
        doc.close()
        return count
    except Exception as e:
        raise IOError(f"Lỗi khi đọc file PDF: {e}")

def render_page_to_png_bytes(pdf_path: str, page_num: int, dpi: int = 150) -> bytes:
    """Render một trang cụ thể của PDF thành dữ liệu ảnh PNG (bytes) trong bộ nhớ.
    
    Args:
        pdf_path: Đường dẫn tuyệt đối hoặc tương đối tới file PDF.
        page_num: Số trang (0-indexed).
        dpi: Độ phân giải của ảnh (mặc định 150 DPI cho chất lượng đủ tốt để OCR).
        
    Returns:
        Dữ liệu PNG dạng bytes.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"Không tìm thấy file PDF tại đường dẫn: {pdf_path}")
        
    try:
        doc = fitz.open(pdf_path)
        if page_num < 0 or page_num >= len(doc):
            doc.close()
            raise IndexError(f"Số trang {page_num} nằm ngoài phạm vi của tài liệu (0 - {len(doc)-1})")
            
        page = doc[page_num]
        # Render trang thành pixmap (độ phân giải dpi)
        pix = page.get_pixmap(dpi=dpi)
        # Chuyển đổi trực tiếp pixmap thành định dạng PNG dạng bytes
        png_bytes = pix.tobytes("png")
        doc.close()
        return png_bytes
    except Exception as e:
        raise IOError(f"Lỗi khi render trang {page_num}: {e}")
