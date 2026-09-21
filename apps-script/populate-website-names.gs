/**
 * ONE-TIME HELPER — populate the "Website Name" column.
 *
 * The catalogue cards show the "Website Name" column when it's filled, so the
 * shop owner can control card names straight from the sheet (no code changes).
 * This script adds that column (if missing) and fills every row with the same
 * short name the website generates automatically, giving you a starting point
 * to tweak by hand.
 *
 * How to run (once):
 *   1. Open the Prices spreadsheet → Extensions → Apps Script
 *   2. Paste this file in (new script file), Save
 *   3. Run → populateWebsiteNames  (authorise if prompted)
 *   4. Back in the sheet, a "Website Name" column is now filled in.
 *
 * Safe to re-run: it only fills EMPTY cells, so names you customise are kept.
 * Blank cells always fall back to the automatic short name on the site, so you
 * only need to type a "Website Name" when you want to override the default.
 */

// The Prices spreadsheet (same ID as js/config.js SHEET_ID) and tab name.
const PRICES_SHEET_ID = "1tkD89MnuD7Ls3gdzUC-ArJQnocTGJSwTmVV1H4aaYMk";
const PRICES_TAB = "Prices";

function populateWebsiteNames() {
  const ss = SpreadsheetApp.openById(PRICES_SHEET_ID);
  const sheet = ss.getSheetByName(PRICES_TAB) || ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const header = values[0].map(norm);
  const catCol = header.indexOf("category");
  const nameCol = header.indexOf("name");
  if (catCol === -1 || nameCol === -1) {
    throw new Error("Could not find both 'Category' and 'Name' columns on the Prices tab.");
  }

  // Reuse the "Website Name" column if it exists, otherwise append a new one.
  let wnCol = header.indexOf("websitename");
  if (wnCol === -1) {
    wnCol = values[0].length;
    sheet.getRange(1, wnCol + 1).setValue("Website Name");
  }

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const existing = String(values[i][wnCol] || "").trim();
    const cat = String(values[i][catCol] || "");
    const name = String(values[i][nameCol] || "");
    out.push([existing || cardName(cat, name)]);
  }
  sheet.getRange(2, wnCol + 1, out.length, 1).setValues(out);
}

// Same short-name rule as cardName() in js/store.js — keep the two in sync.
function cardName(cat, name) {
  name = (name || "").replace(/\s+/g, " ").trim();
  cat = (cat || "").replace(/\s+/g, " ").trim();
  if (!name) return "";

  const words = new Set();
  (cat.split("(")[0].match(/[A-Za-z]+/g) || []).forEach((w) => {
    const lw = w.toLowerCase();
    words.add(lw);
    words.add(lw.endsWith("s") ? lw.slice(0, -1) : lw + "s");
  });

  let r = name;
  (cat.match(/\(([^)]*)\)/g) || []).forEach((p) => {
    const inner = p.slice(1, -1).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    r = r.replace(new RegExp("\\(\\s*" + inner + "\\s*\\)", "ig"), " ");
  });
  r = r.replace(/[A-Za-z]+/g, (m) => (words.has(m.toLowerCase()) ? "" : m));
  r = r.replace(/(\S)-\s+/g, "$1 ").replace(/\(\s*\)/g, " ");
  r = r.replace(/\s+/g, " ").replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, "").trim();
  return r || name;
}
