import json
import google.generativeai as genai
from typing import List, Dict, Any

def extract_vocab_from_image(image_bytes: bytes, api_key: str) -> List[Dict[str, Any]]:
    """Gửi dữ liệu ảnh trang sách (bytes) lên Gemini API để trích xuất từ vựng thành danh sách JSON.
    
    Args:
        image_bytes: Dữ liệu ảnh PNG/JPEG dạng bytes.
        api_key: Gemini API Key.
        
    Returns:
        Danh sách các từ vựng đã được cấu trúc hóa.
        Ví dụ:
        [
          {
            "term": "cancellation",
            "ipa": "[kænsə'leiʃ(ə)n]",
            "part_of_speech": "n.",
            "definition": "sự hủy bỏ",
            "example_en": "We are sorry to inform you of the cancellation of the conference.",
            "example_vi": "Chúng tôi thật tiếc phải thông báo với quý vị về việc hủy bỏ buổi hội nghị.",
            "image_keyword": "cancel"
          }
        ]
    """
    # Cấu hình API Key
    genai.configure(api_key=api_key)
    
    # Sử dụng mô hình gemini-3.5-flash tối ưu cho bài toán OCR và xử lý đa phương thức
    model = genai.GenerativeModel("gemini-3.5-flash")
    
    prompt = """
    Bạn là một chuyên gia ngôn ngữ và hệ thống OCR thông minh.
    Đây là ảnh quét một trang sách học từ vựng TOEIC. Hãy quét ảnh này và trích xuất tất cả các từ vựng chính xuất hiện trên trang.
    
    Quy tắc trích xuất:
    1. Tìm tất cả các từ vựng chính trên trang (thông thường có khoảng 4-5 từ vựng chính nằm trong các khung/khối màu xám hoặc ngăn cách nhau).
    2. Với mỗi từ vựng chính, hãy trích xuất các thông tin sau:
       - 'term': Từ vựng gốc tiếng Anh (ví dụ: 'cancellation', 'gather', 'hold').
       - 'ipa': Phiên âm tiếng Anh (ví dụ: '[kænsə'leiʃ(ə)n]', '['gæðə]').
       - 'part_of_speech': Từ loại viết tắt như n., v., adj., adv. (ví dụ: 'n.', 'v.').
       - 'definition': Nghĩa tiếng Việt của từ đó được ghi ngay bên dưới phiên âm (ví dụ: 'sự hủy bỏ', 'tập trung, tụ họp').
       - 'example_en': Câu ví dụ tiếng Anh đi kèm bên dưới từ đó (ví dụ: 'We are sorry to inform you...').
       - 'example_vi': Câu dịch tiếng Việt của câu ví dụ đó (ví dụ: 'Chúng tôi thật tiếc phải thông báo...').
       - 'image_keyword': 1-2 từ khóa tiếng Anh ngắn gọn, thực tế và trực quan nhất để đại diện cho từ vựng này giúp tìm kiếm hình ảnh minh họa trên Unsplash. Ưu tiên các danh từ chỉ hành động, sự vật cụ thể. (Ví dụ: với 'cancellation' có thể dùng 'cancel' hoặc 'cancelled'; với 'gather' có thể dùng 'gathering' hoặc 'meeting').

    Lưu ý quan trọng:
    - Hãy chỉ lấy các từ vựng chính của trang (không lấy các phần phụ như Synonyms/Antonyms ở cột bên phải làm từ chính, nhưng hãy chú ý đọc đúng từ vựng chính).
    - Trả về kết quả dưới dạng một JSON Array hợp lệ. Không chèn markdown, không thêm ký tự đặc biệt ngoài định dạng JSON được yêu cầu.

    Cấu trúc định dạng đầu ra mong muốn:
    [
      {
        "term": "tên từ",
        "ipa": "phiên âm",
        "part_of_speech": "từ loại",
        "definition": "định nghĩa tiếng Việt",
        "example_en": "ví dụ tiếng Anh",
        "example_vi": "dịch ví dụ tiếng Việt",
        "image_keyword": "từ khóa tìm ảnh"
      }
    ]
    """
    
    # Chuẩn bị dữ liệu đầu vào cho Gemini
    image_part = {
        "mime_type": "image/png",
        "data": image_bytes
    }
    
    try:
        # Gọi Gemini API với cấu hình bắt buộc trả về định dạng JSON
        response = model.generate_content(
            contents=[prompt, image_part],
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Làm sạch chuỗi văn bản phản hồi
        raw_text = response.text.strip()
        
        # Loại bỏ các ký tự code fence block ```json ... ``` nếu có
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()
        
        # Cơ chế Tự Vá Lỗi (Self-healing JSON):
        # Nếu chuỗi bắt đầu bằng '[' đại diện cho danh sách nhưng kết thúc bằng '}'
        if raw_text.startswith("[") and raw_text.endswith("}"):
            raw_text = raw_text[:-1] + "]"
            
        # Parse chuỗi JSON nhận được
        vocab_list = json.loads(raw_text)
        
        # Đảm bảo đầu ra là một list
        if isinstance(vocab_list, list):
            return vocab_list
        elif isinstance(vocab_list, dict) and "vocab" in vocab_list:
            # Phòng trường hợp mô hình tự bọc trong key "vocab"
            return vocab_list["vocab"]
        else:
            raise ValueError("Định dạng dữ liệu trả về từ Gemini không phải là JSON array.")
            
    except json.JSONDecodeError as je:
        print(f"⚠️ Lỗi cú pháp JSON từ Gemini: {je}")
        print(f"Nội dung thô nhận được:\n{response.text if 'response' in locals() else 'None'}")
        raise
    except Exception as e:
        print(f"⚠️ Lỗi khi gọi Gemini API: {e}")
        raise
