# 📘 TOEIC Vocabulary Master

Ứng dụng ôn luyện từ vựng TOEIC thông minh với giao diện Flashcard, Trắc nghiệm, Điền từ và Quản lý tiến độ học tập.

🌐 **Trang web Live (GitHub Pages)**: [https://loc20904.github.io/ToeicWithLoc/](https://loc20904.github.io/ToeicWithLoc/)

---

### ✨ Tính năng nổi bật
- 🃏 **Flashcard tương tác**: Học từ vựng kèm phát âm, ví dụ và hình ảnh minh họa.
- 🎯 **Chế độ Luyện tập**: Trắc nghiệm, gõ từ vựng, rèn luyện phản xạ.
- 📊 **Theo dõi tiến độ**: Lưu tiến độ học tập tự động trên trình duyệt (`localStorage`).
- 💡 **Đóng góp & Góp ý hệ thống**: Đóng góp ý kiến, báo lỗi hoặc gợi ý tính năng mới.
- 📚 **Xây dựng kho từ vựng TOEIC**: Đóng góp từ vựng mới theo chuẩn định dạng JSON TOEIC.
- 📊 **Tự động đồng bộ Google Sheets**: Tự động lưu ý kiến góp ý vào Sheet **"Góp Ý Hệ Thống"** và từ vựng đóng góp vào Sheet **"Từ Vựng Đóng Góp"**.

---

### ⚙️ Hướng dẫn cấu hình Google Sheets API (Google Apps Script)
1. Tạo 1 Bảng tính Google Sheet mới tại [https://sheets.new](https://sheets.new).
2. Vào menu **Tiện ích mở rộng** (Extensions) -> **Apps Script**.
3. Sao chép toàn bộ mã nguồn từ file [`google_apps_script.js`](file:///d:/FPT/SU26/Toeic_PDF2quizlet/google_apps_script.js) trong dự án và dán vào Apps Script.
4. Nhấn **Triển khai** (Deploy) -> **Triển khai dưới dạng ứng dụng web** (New deployment -> Web app).
   - *Thực thi dưới dạng (Execute as)*: **Tôi (Me)**
   - *Ai có quyền truy cập (Who has access)*: **Bất kỳ ai (Anyone)**
5. Bấm **Triển khai**, cấp quyền và sao chép URL Web App.
6. Mở trang web TOEIC Vocab Master -> Bấm **Đóng Góp & Góp Ý** -> Chọn **Cấu hình Google Sheets Web App API URL** và dán URL vào!
