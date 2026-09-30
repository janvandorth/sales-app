// Apps Script for the target Google Sheet (Extensions → Apps Script), deployed as a web app with
// "Execute as: Me" and "Who has access: Anyone". The submit-form edge function POSTs each sale here.
// Keep SECRET equal to the SHEETS_WEBHOOK_SECRET Supabase secret; after changing it, deploy a new version.
const SECRET = "<same value as SHEETS_WEBHOOK_SECRET>"

function doPost(e) {
  const body = JSON.parse(e.postData.contents)
  if (body.secret !== SECRET) return reply({ ok: false, error: "unauthorized" })

  const lock = LockService.getScriptLock()
  lock.waitLock(10000) // concurrent sales must not write to the same row
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(body.tab) || SpreadsheetApp.getActive().getSheets()[0]
    const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, body.row.length)
    range.setNumberFormat("@").setValues([body.row]) // store as text so "+316…" is not parsed as a number
  } finally {
    lock.releaseLock()
  }
  return reply({ ok: true })
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)
}
