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
5. **payment.html** — thank you, amount, payment QR; after 5 minutes the cart
   empties and the customer is returned to the main page

## Files

| File | What it does |
|---|---|
| `js/config.js` | **The only file to edit when changing accounts.** Sheet ID, order endpoint, weights, QR path, and the `SECTIONS` list (order + display names of the catalogue sections / side-nav) |
| `js/store.js` | Loads prices from the sheet, price maths, cart storage, image sources |
| `js/index.js` · `product.js` · `cart.js` · `checkout.js` · `payment.js` | One per page (`index.js` also builds the section nav + search) |
| `apps-script/Code.gs` | Paste into the spreadsheet's Apps Script to receive orders |
| `css/style.css` | All styling |
| `tools/build-images.mjs` | One-time image optimiser — downloads Drive photos and makes fast WebP copies (see **Product images** below) |
| `js/image-manifest.js` | **Auto-generated** — lists which images have optimised local copies. Don't edit by hand |

## Product images (fast loading)

Product photos are the single biggest thing affecting load time. Instead of
pulling full-size (~1.4 MB) photos straight from Google Drive on every visit —
slow, and Drive rate-limits under traffic — the site serves small **WebP**
copies (about 12–130 KB each) from this repo, lazy-loaded as the shopper
scrolls. This needs no paid service; everything below is free.

**How it works.** `tools/build-images.mjs` reads the Prices sheet, downloads
each Drive image once, and writes two WebP sizes into `images/products/`
(`<id>-400.webp` for cards, `<id>-800.webp` for the product page). It also
writes `js/image-manifest.js`. At runtime the site uses the local WebP when the
manifest has it, and otherwise falls back to the Drive link — so a brand-new
product still shows immediately; it just isn't optimised until you re-run the
build.

**When to run it.** After your friend adds new products or changes photos in the
sheet:

```bash
npm install        # first time only (pulls in the free "sharp" library)
npm run build-images
```

Re-runs are cheap — images already built are skipped. Then reload the site.
(`node_modules/` is git-ignored; the WebP files in `images/products/` and
`js/image-manifest.js` are committed and served.)

> A handful of images can occasionally fail with "fetch failed" if Drive
> throttles the download. They just fall back to Drive in the meantime — simply
> run `npm run build-images` again to pick them up.

## Setup

### 1. Prices tab

The `Prices` tab needs these headers (order doesn't matter):

```
ProductID | Category | Name | Unit | Price | Available | Image URL | Website Name
```

- **`Unit` decides how `Price` is read.** `Kg` means the price is per kilogram
  (a 500g packet costs Price × 0.5). `G` means the price is per gram
  (a 500g packet costs Price × 500). Nuts are `Kg`; seeds are `G`.
- `Available` = `Yes` to show the product, anything else hides it.
- `Image URL` is optional; blank shows a grey placeholder. Three forms work:
  - a **Google Drive share link** pasted straight from Drive's "Copy link"
    (the file must be shared "Anyone with the link"). The site rewrites it
    into a direct image URL automatically — this is the no-technical-skills
    route for whoever maintains the sheet.
  - a **direct image URL** ending in `.jpg` / `.png` / `.webp`
  - a **path inside this repo**, e.g. `images/almond-big.jpg`
- **`Website Name`** (optional) is the short name shown on the catalogue cards,
  so you control card wording from the sheet. Blank falls back to an automatic
  short name (the product `Name` with the section's own words trimmed, e.g.
  "Almond - Small" → "Small"). The product page, cart and order always use the
  full `Name`. To fill this column with the current names as a starting point,
  run `apps-script/populate-website-names.gs` once (see its header comment).
- Update prices here daily — the website and cart pick them up automatically.

Sections on the site are derived from the sheet: every category with at least
one priced product appears, in the order it first shows up in the sheet, spelled
exactly as typed. Nothing about names/order is hard-coded.

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
Order Number | Customer Name | Customer Phone | Customer Email | Customer Address | Order | Total | Status | Payment Proof
```

These must stay in this order — the script appends values positionally.

`Status` starts at `Placed` and has a dropdown for `Paid`, `Confirmed`,
`Delivered`. `Payment Proof` is left blank for you to fill in by hand.

To check the deployment is live, open the `/exec` URL in a browser — it should
return `{"ok":true,...}`.

### 3. Payment QR

Save your UPI QR code as `images/payment-qr.png`. Until then the payment page
shows a "QR image not found" notice instead.

## Running locally

From the project folder:

```bash
python3 -m http.server 5500
```

Then open http://localhost:5500

## Moving to a different Google / GitHub account

Everything account-specific is in `js/config.js`:

- `SHEET_ID` — from the new spreadsheet's URL
- `PRICES_GID` — the `#gid=` number of the Prices tab
- `ORDER_ENDPOINT` — re-deploy `Code.gs` on the new spreadsheet and paste the new URL

For GitHub, the repo can be transferred to the new account directly
(Settings → Transfer ownership) — no code changes needed.
