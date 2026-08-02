/**
 * GOOGLE APPS SCRIPT FOR TOEIC VOCAB MASTER
 * Tự động tiếp nhận Góp ý và Đóng góp Từ vựng TOEIC lưu trực tiếp vào 2 Google Sheet riêng biệt.
 * 
 * SPREADSHEETS LIÊN KẾT:
 * 1. Sheet Feedback: https://docs.google.com/spreadsheets/d/1WELlctXST5g26iUexZ-fWjI3uQzejwxHOEIcDbIZMRM/edit
 * 2. Sheet Vocab: https://docs.google.com/spreadsheets/d/1lAbnTaYAOEFvaaM9sYGaFr1Bm2DQ12C63_lTEAR5ahQ/edit
 */

var FEEDBACK_SPREADSHEET_ID = "1WELlctXST5g26iUexZ-fWjI3uQzejwxHOEIcDbIZMRM";
var VOCAB_SPREADSHEET_ID    = "1lAbnTaYAOEFvaaM9sYGaFr1Bm2DQ12C63_lTEAR5ahQ";

function doPost(e) {
  try {
    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    
    // ----------------------------------------------------
    // 1. XỬ LÝ GÓP Ý HỆ THỐNG (SYSTEM FEEDBACK)
    // ----------------------------------------------------
    if (data.type === 'feedback') {
      var ssFeedback = SpreadsheetApp.openById(FEEDBACK_SPREADSHEET_ID);
      var sheetFB = ssFeedback.getSheets()[0];
      
      // Nếu sheet trống, ghi hàng tiêu đề
      if (sheetFB.getLastRow() === 0) {
        sheetFB.appendRow([
          "Thời gian (Timestamp)", 
          "Loại góp ý (Type)", 
          "Họ tên (Name)", 
          "Email", 
          "Đánh giá (Rating)", 
          "Nội dung góp ý (Content)"
        ]);
        sheetFB.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
      }
      
      sheetFB.appendRow([
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
    // 2. XỬ LÝ ĐÓNG GÓP TỪ VỰNG TOEIC (VOCAB BATCH SUBMISSION)
    // ----------------------------------------------------
    if (data.type === 'vocabulary') {
      var ssVocab = SpreadsheetApp.openById(VOCAB_SPREADSHEET_ID);
      var sheetVocab = ssVocab.getSheets()[0];
      
      // Nếu sheet trống, ghi hàng tiêu đề
      if (sheetVocab.getLastRow() === 0) {
        sheetVocab.appendRow([
          "Thời gian (Timestamp)", 
          "Chủ đề (Topic)", 
          "Từ vựng (Term)", 
          "Từ loại (POS)", 
          "Định nghĩa tiếng Việt (Definition)", 
          "Ví dụ (Example)",
          "Link Hình ảnh (Image URL)"
        ]);
        sheetVocab.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#059669").setFontColor("#ffffff");
      }
      
      var topicName = data.topic || "Chủ đề chung";
      var wordsList = Array.isArray(data.words) ? data.words : [data];
      var rowsToAdd = [];
      var nowStr = new Date().toLocaleString("vi-VN");

      for (var i = 0; i < wordsList.length; i++) {
        var w = wordsList[i];
        if (!w.term && !w.definition) continue; // Bỏ qua dòng trống
        
        rowsToAdd.push([
          nowStr,
          topicName,
          w.term || "",
          w.pos || "",
          w.definition || "",
          w.example || "",
          w.image || ""
        ]);
      }

      if (rowsToAdd.length > 0) {
        sheetVocab.getRange(sheetVocab.getLastRow() + 1, 1, rowsToAdd.length, 7).setValues(rowsToAdd);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Đã lưu thành công " + rowsToAdd.length + " từ vựng mới vào Google Sheet!"
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
    service: "TOEIC Vocab Master Multi-Sheet API"
  })).setMimeType(ContentService.MimeType.JSON);
}
