// Apps Script for the target Google Sheet (Extensions → Apps Script), deployed as a web app with
// "Execute as: Me" and "Who has access: Anyone". The submit-form edge function POSTs each sale here.
// Keep SECRET equal to the SHEETS_WEBHOOK_SECRET Supabase secret; after changing it, deploy a new version.
const SECRET = "<same value as SHEETS_WEBHOOK_SECRET>"

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)
    if (body.secret !== SECRET) return reply({ ok: false, error: "unauthorized" })

    const lock = LockService.getScriptLock()
    lock.waitLock(10000) // concurrent sales must not write to the same row
    try {
      const spreadsheet = SpreadsheetApp.getActive()
      const sheet = spreadsheet.getSheetByName(body.tab) || spreadsheet.getSheets()[0]
      // Last filled row in column A (RowId); getLastRow() would also count checkboxes or formulas further down.
      const lastRow = sheet.getRange(sheet.getMaxRows(), 1).getNextDataCell(SpreadsheetApp.Direction.UP).getRow()
      const range = sheet.getRange(lastRow + 1, 1, 1, body.row.length)
      range.setNumberFormat("@").setValues([body.row]) // store as text so "+316…" is not parsed as a number
      // Where the row went; logged by the backend so a wrong file or tab is easy to spot.
      return reply({
        ok: true,
        spreadsheet: spreadsheet.getName(),
        url: spreadsheet.getUrl(),
        tab: sheet.getName(),
        row: lastRow + 1,
      })
    } finally {
      lock.releaseLock()
    }
  } catch (error) {
    // Report the cause (e.g. missing edit access) to the caller; it ends up in the Supabase function logs.
    return reply({ ok: false, error: String(error) })
  }
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)
}
