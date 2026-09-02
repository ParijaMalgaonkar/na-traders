// ── MIGRATION NOTE ──────────────────────────────────────────────
// This is the ONLY file that needs to change when you move from the
// temporary Google account to the permanent one.
// ─────────────────────────────────────────────────────────────────

const CONFIG = {
  // The ID is the long string in your sheet's URL:
  // https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
  SHEET_ID: "1tkD89MnuD7Ls3gdzUC-ArJQnocTGJSwTmVV1H4aaYMk",

  // gid of the Prices tab specifically (find it in the sheet's URL after "#gid=")
  PRICES_GID: "0",

  // Live CSV export pinned to the Prices tab by gid, so it won't break
  // if you add/reorder other tabs later
  get PRICES_CSV_URL() {
    return `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/gviz/tq?tqx=out:csv&gid=${this.PRICES_GID}`;
  },

  // Google Apps Script Web App URL that writes orders into the sheet.
  // Paste the ".../exec" URL here after deploying apps-script/Code.gs.
  ORDER_ENDPOINT: "https://script.google.com/macros/s/AKfycbyF7QsqR7zwGNR5kKhYgXIKmgpFeEju3qEUnZrjOBMlU88R0ZBCn8z02T8sOqWPTUc2/exec",

  // Tab in the same spreadsheet holding the payment QR. It needs one row:
  // column A a label such as "QR Image", column B the Drive link to the QR.
  PAYMENT_QR_SHEET: "Payment QR",

  get PAYMENT_QR_CSV_URL() {
    return `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(this.PAYMENT_QR_SHEET)}`;
  },

  // Used only if that tab has no usable link — drop a QR here as a backup
  PAYMENT_QR: "images/payment-qr.png",

  // Weight choices shown as tags on the product page.
  // Each entry carries the same weight in both units. Which one gets
  // multiplied by the sheet's Price depends on that product's Unit column:
  //   Unit = Kg  ->  price x kg
  //   Unit = G   ->  price x g
  WEIGHTS: [
    { label: "250g", kg: 0.25, g: 250 },
    { label: "500g", kg: 0.5, g: 500 },
    { label: "750g", kg: 0.75, g: 750 },
    { label: "1kg", kg: 1, g: 1000 },
    { label: "1.5kg", kg: 1.5, g: 1500 },
    { label: "2kg", kg: 2, g: 2000 },
    { label: "3kg", kg: 3, g: 3000 },
  ],

  // Packet-count choices in the quantity dropdown
  MAX_PACKETS: 20,

  // How long the customer is held on the payment page before the site
  // resets itself and empties the cart (milliseconds)
  PAYMENT_RESET_MS: 3 * 60 * 1000,

  // Shown above the payment instructions
  COD_NOTE: "Cash on Delivery available ONLY in Mumbai",

  // Shown in the footer
  PHONE_1: "+91 7021553995",
  PHONE_2: "+91 9819007222",
};
