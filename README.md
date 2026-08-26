# NA Traders — Order Website

A static website (no server, no database) where customers browse products at
today's prices, build a cart, and place an order that lands as one row in a
Google Sheet.

Cart state lives in the browser's `localStorage`. The only backend is a Google
Apps Script attached to your spreadsheet.

## Customer flow

1. **index.html** — product cards with live prices, cart button top right
2. **product.html** — pick a weight (tag buttons), pick number of packets, Add to Cart
3. **cart.html** — line items, grand total, Buy
4. **checkout.html** — item count + total, then name / phone / address (all required)
5. **payment.html** — thank you, amount, payment QR; after 10 minutes the cart
   empties and the customer is returned to the main page

## Files

| File | What it does |
|---|---|
| `js/config.js` | **The only file to edit when changing accounts.** Sheet ID, order endpoint, weights, QR path |
| `js/store.js` | Loads prices from the sheet, price maths, cart storage |
| `js/index.js` · `product.js` · `cart.js` · `checkout.js` · `payment.js` | One per page |
| `apps-script/Code.gs` | Paste into the spreadsheet's Apps Script to receive orders |
| `css/style.css` | All styling |

## Setup

### 1. Prices tab

The `Prices` tab needs these headers (order doesn't matter):

```
ProductID | Category | Name | Unit | Price | Available | Image URL
```

- **`Unit` decides how `Price` is read.** `Kg` means the price is per kilogram
  (a 500g packet costs Price × 0.5). `G` means the price is per gram
  (a 500g packet costs Price × 500). Nuts are `Kg`; seeds are `G`.
- `Available` = `Yes` to show the product, anything else hides it.
- `Image URL` is optional; blank shows a grey placeholder.
- Update prices here daily — the website and cart pick them up automatically.

### 2. Deploy the order endpoint

1. Open the spreadsheet → **Extensions** → **Apps Script**
2. Delete the placeholder code, paste all of `apps-script/Code.gs`, save
3. **Deploy** → **New deployment** → type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize (click **Advanced** → **Go to … (unsafe)** → **Allow**; this is
   normal for your own scripts)
5. Copy the `.../exec` URL into `ORDER_ENDPOINT` in `js/config.js`

The script creates the `Orders` tab itself on the first order, with columns:

```
Order Number | Customer Name | Customer Phone | Customer Address | Order | Total | Status | Payment Proof
```

`Status` starts at `Placed` and has a dropdown for `Paid`, `Confirmed`,
`Delivered`. `Payment Proof` is left blank for you to fill in by hand.

To check the deployment is live, open the `/exec` URL in a browser — it should
return `{"ok":true,...}`.

### 3. Payment QR

Save your UPI QR code as `images/payment-qr.png`. Until then the payment page
shows a "QR image not found" notice instead.

## Running locally

```bash
python3 -m http.server 5500 --directory /Users/parijamalgaonkar/Desktop/NA-Traders-Website
```

Then open http://localhost:5500

## Moving to a different Google / GitHub account

Everything account-specific is in `js/config.js`:

- `SHEET_ID` — from the new spreadsheet's URL
- `PRICES_GID` — the `#gid=` number of the Prices tab
- `ORDER_ENDPOINT` — re-deploy `Code.gs` on the new spreadsheet and paste the new URL

For GitHub, the repo can be transferred to the new account directly
(Settings → Transfer ownership) — no code changes needed.
