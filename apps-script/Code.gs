/**
 * NA Traders — order receiver.
 *
 * Paste this into Extensions > Apps Script on your NA Traders spreadsheet,
 * then Deploy > New deployment > Web app:
 *   Execute as:       Me
 *   Who has access:   Anyone
 * Copy the /exec URL into ORDER_ENDPOINT in js/config.js.
 */

// The spreadsheet to write orders into, taken from its URL:
// https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
// Set explicitly rather than relying on which spreadsheet the script is
// attached to, so the script works standalone and is easy to re-point
// when moving to a different Google account.
const SPREADSHEET_ID = "1TIAZDwAZB51zO-Alaq6D_zQXeImkC_BIsYgU_uRTliM";

const SHEET_NAME = "Orders";
// The order of these must match the columns in the Orders tab exactly.
const HEADERS = [
  "Order Number",
  "Customer Name",
  "Customer Phone",
  "Customer Email",
  "Customer Address",
  "Order",
  "Total",
  "Status",
  "Payment Proof",
];
const STATUS_OPTIONS = ["Placed", "Paid", "Confirmed", "Delivered"];

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    // Serialise concurrent orders so two customers can't take the same number
    lock.waitLock(30000);

    const data = JSON.parse(e.postData.contents);

    const required = ["name", "phone", "email", "address", "order"];
    for (const field of required) {
      if (!data[field] || String(data[field]).trim() === "") {
        return json({ ok: false, error: "Missing field: " + field });
      }
    }

    const sheet = getOrCreateSheet();
    const orderNumber = nextOrderNumber(sheet);

    sheet.appendRow([
      orderNumber,
      data.name,
      // Leading apostrophe keeps +91 / leading zeros intact instead of
      // Sheets mangling the number
      "'" + String(data.phone),
      data.email,
      data.address,
      data.order,
      Number(data.total) || 0,
      "Placed",
      "", // Payment Proof — filled in by hand later
    ]);

    applyStatusDropdown(sheet, sheet.getLastRow());

    return json({ ok: true, orderNumber: orderNumber });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Lets you confirm the deployment is live by opening the /exec URL in a browser.
// Also reports exactly which spreadsheet and tab orders will be written to.
function doGet() {
  try {
    const sheet = getOrCreateSheet();
    return json({
      ok: true,
      message: "NA Traders order endpoint is live",
      spreadsheet: sheet.getParent().getName(),
      tab: sheet.getName(),
      ordersSoFar: Math.max(sheet.getLastRow() - 1, 0),
    });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

// NAT-0001, NAT-0002, ... based on how many order rows already exist
function nextOrderNumber(sheet) {
  const rowCount = Math.max(sheet.getLastRow() - 1, 0);
  return "NAT-" + String(rowCount + 1).padStart(4, "0");
}

function applyStatusDropdown(sheet, row) {
  const statusCol = HEADERS.indexOf("Status") + 1;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(row, statusCol).setDataValidation(rule);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
