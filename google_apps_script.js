/**
 * GOOGLE APPS SCRIPT FOR TOEIC VOCAB MASTER
 * Tự động tiếp nhận Đóng góp Ý kiến và Từ vựng TOEIC từ trang web và lưu vào Google Sheets.
 * 
 * HƯỚNG DẪN CẤU HÌNH:
 * 1. Tạo 1 file Google Sheet mới tại https://sheets.new
 * 2. Đặt tên Bảng tính tùy ý (ví dụ: TOEIC Vocab Feedback Data)
 * 3. Vào menu: Tiện ích mở rộng (Extensions) -> Apps Script
 * 4. Xóa hết code cũ, dán toàn bộ đoạn code bên dưới vào và bấm lưu (Ctrl + S).
 * 5. Bấm nút "Triển khai" (Deploy) -> "Triển khai dưới dạng ứng dụng web" (New deployment -> Web app)
 * 6. Cấu hình:
 *    - Mô tả: TOEIC Feedback Web API
 *    - Thực thi dưới dạng (Execute as): Tôi (Me)
 *    - Ai có quyền truy cập (Who has access): Bất kỳ ai (Anyone)
 * 7. Bấm "Triển khai" (Deploy) -> Cấp quyền truy cập (Grant access) -> Sao chép URL Ứng dụng Web (Web App URL).
 * 8. Dán URL vừa sao chép vào phần Cấu hình API trên trang web TOEIC Vocab Master!
 */

function doPost(e) {
  try {
    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ----------------------------------------------------
    // XỬ LÝ GÓP Ý HỆ THỐNG (SYSTEM FEEDBACK)
    // ----------------------------------------------------
    if (data.type === 'feedback') {
      var sheetFeedback = ss.getSheetByName("Góp Ý Hệ Thống");
      if (!sheetFeedback) {
        sheetFeedback = ss.insertSheet("Góp Ý Hệ Thống");
        sheetFeedback.appendRow([
          "Thời gian (Timestamp)", 
          "Loại góp ý (Type)", 
          "Họ tên (Name)", 
          "Email", 
          "Đánh giá (Rating)", 
          "Nội dung góp ý (Content)"
        ]);
        sheetFeedback.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
      }
      
      sheetFeedback.appendRow([
        new Date().toLocaleString("vi-VN"),
        data.feedbackType || "Góp ý chung",
        data.name || "Ẩn danh",
        data.email || "",
        data.rating ? data.rating + " ⭐" : "Chưa đánh giá",
        data.content || ""
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Cảm ơn bạn đã đóng góp ý kiến cho hệ thống!"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ----------------------------------------------------
    // XỬ LÝ ĐÓNG GÓP TỪ VỰNG TOEIC (VOCAB CONTRIBUTION)
    // ----------------------------------------------------
    if (data.type === 'vocabulary') {
      var sheetVocab = ss.getSheetByName("Từ Vựng Đóng Góp");
      if (!sheetVocab) {
        sheetVocab = ss.insertSheet("Từ Vựng Đóng Góp");
        sheetVocab.appendRow([
          "Thời gian (Timestamp)", 
          "Chủ đề (Topic)", 
          "Từ vựng (Term)", 
          "Phiên âm (IPA)", 
          "Từ loại (POS)", 
          "Định nghĩa (Definition)", 
          "Ví dụ Anh (Example EN)", 
          "Ví dụ Việt (Example VI)",
          "Định dạng JSON (JSON Format)"
        ]);
        sheetVocab.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#059669").setFontColor("#ffffff");
      }
      
      // Tạo định dạng JSON chuẩn cho từ vựng
      var wordJsonObject = {
        id: "contrib_" + Date.now(),
        term: data.term || "",
        ipa: data.ipa || "",
        part_of_speech: data.pos || "",
        definition: data.definition || "",
        example_en: data.example_en || "",
        example_vi: data.example_vi || ""
      };
      
      sheetVocab.appendRow([
        new Date().toLocaleString("vi-VN"),
        data.topic || "Từ vựng chung",
        data.term || "",
        data.ipa || "",
        data.pos || "",
        data.definition || "",
        data.example_en || "",
        data.example_vi || "",
        JSON.stringify(wordJsonObject, null, 2)
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Cảm ơn bạn đã đóng góp từ vựng mới cho kho TOEIC!"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Loại dữ liệu không hợp lệ."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "TOEIC Vocab Master Feedback API"
  })).setMimeType(ContentService.MimeType.JSON);
}
