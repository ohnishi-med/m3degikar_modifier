/**
 * M3 Digikar Tampermonkey連携用 GAS API
 * 
 * スプレッドシートのB列（カルテID）をキーに検索し、
 * A列（検査年月日）、N列（点数）をJSONで返却します。
 * 
 * [デプロイ方法]
 * 1. GASエディタで「デプロイ」>「新しいデプロイ」を選択。
 * 2. 種類を「ウェブアプリ」にし、アクセスできるユーザーを「全員」に設定してデプロイ。
 * 3. 発行されたURLを Tampermonkey スクリプトの GAS_ENDPOINT に貼り付けてください。
 */

const SPREADSHEET_ID = "1EMvmu0a9FArhGDb6cMmL0XTcOzn2I4aNxXH-b6L7b4E";

function doGet(e) {
  const patientId = e.parameter.id;
  if (!patientId) {
    return createResponse({ error: "Patient ID is required" });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // 下から検索（最新のデータを優先）
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const rowPatientId = String(row[1]).trim(); // B列: カルテID
      
      if (rowPatientId === patientId) {
        let dateStr = "";
        if (row[0] instanceof Date) {
          dateStr = Utilities.formatDate(row[0], "JST", "yyyy/MM/dd");
        } else {
          dateStr = String(row[0]);
        }

        const result = {
          date: dateStr,    // A列: 検査年月日 (フォーマット済み)
          id: row[1],       // B列: カルテID
          score: row[13],    // N列: 点数 (Index 13)
          found: true
        };
        return createResponse(result);
      }
    }
    return createResponse({ found: false, error: "Patient not found" });
  } catch (err) {
    return createResponse({ error: err.toString() });
  }
}

function createResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
