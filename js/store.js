// Shared helpers used by every page: product loading, price maths,
// and the cart (kept in localStorage, no database needed).

const CART_KEY = "na_cart";
const LAST_ORDER_KEY = "na_last_order";
const PAYMENT_DEADLINE_KEY = "na_payment_deadline";

/* ── CSV loading ───────────────────────────────────────────────── */

// Minimal CSV parser that handles quoted fields containing commas (e.g. "1,400.00")
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && next === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function rowsToProducts(rows) {
  const [header, ...dataRows] = rows;

  // Tolerant header matching: ignores case, spaces and punctuation, so
  // "Product ID", "ProductID" and "product_id" all resolve to the same column.
  // Digits are kept, so headers like "50-200g Required" stay distinct.
  const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalized = header.map(normalize);
  const idx = (...aliases) => {
    for (const a of aliases) {
      const i = normalized.indexOf(normalize(a));
      if (i !== -1) return i;
    }
    return -1;
  };

  const col = {
    id: idx("ProductID", "Product ID"),
    category: idx("Category"),
    name: idx("Name", "ProductName"),
    unit: idx("Unit"),
    price: idx("Price"),
    available: idx("Available"),
    image: idx("Image URL"),
    smallWeights: idx("50-200g Required"),
    // Optional: the exact name to show on the catalogue cards. Lets the shop
    // owner control card names from the sheet. Blank falls back to the
    // auto-shortened name.
    websiteName: idx("Website Name", "WebsiteName", "Website"),
  };

  // If the sheet's headers cannot be recognised, fail loudly. Carrying on
  // would quietly drop every product and leave the customer on a page with
  // no explanation.
  if (col.name === -1 || col.price === -1) {
    throw new Error(
      `Prices sheet headers not recognised. Found: ${header.join(", ")}`
    );
  }

  const cell = (row, i) => (i === -1 ? "" : row[i] || "");

  return dataRows
    .map((r) => ({
      id: cell(r, col.id).trim(),
      category: canonicalCategory(cell(r, col.category).trim() || "Other"),
      // Collapse stray spaces/newlines that appear inside some sheet names
      name: cell(r, col.name).trim().replace(/\s+/g, " "),
      // "G" means the Price is per gram, anything else is treated as per kg
      unit: cell(r, col.unit).trim().toUpperCase() === "G" ? "G" : "KG",
      price: parseFloat(cell(r, col.price).replace(/,/g, "") || "0"),
      available: cell(r, col.available).trim().toLowerCase() === "yes",
      img: imageSources(cell(r, col.image).trim()),
      smallWeights: cell(r, col.smallWeights).trim().toLowerCase() === "yes",
      websiteName: cell(r, col.websiteName).trim(),
    }))
    // A product with no price would show as ₹0 and be orderable for free,
    // so an unpriced row is hidden until a price is filled in.
    .filter((p) => p.available && p.name && p.price > 0);
}

// Pulls the file ID out of any Google Drive link:
// /file/d/FILE_ID/..., /d/FILE_ID, and ?id=FILE_ID
function driveFileId(url) {
  if (!url || !/drive\.google\.com|docs\.google\.com/.test(url)) return null;
  const m =
    url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{20,})/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

// Used only for the payment QR (a single small image). Rewrites a Drive
// "Copy link" URL into a usable <img> source; other URLs pass through.
function normalizeImageUrl(url) {
  if (!url) return "";
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : url;
}

// Turns a sheet "Image URL" cell into the set of sources the site actually
// serves, at the right sizes. Three tiers, fastest first:
//   1. A locally-optimised WebP built by tools/build-images.mjs (tiny, on our
//      own free CDN) — used whenever the manifest knows this Drive file.
//   2. A Drive link we haven't optimised yet — right-sized Drive thumbnails
//      (w400 / w800) instead of the old 1.4 MB w1000-everywhere. Nothing
//      breaks when your friend adds a product; re-run the build to optimise it.
//   3. A plain URL or an in-repo path — used as-is.
// Returns { small, large, srcset } or null when there's no image.
function imageSources(rawUrl) {
  const url = (rawUrl || "").trim();
  if (!url) return null;

  const id = driveFileId(url);
  const manifest = typeof IMAGE_MANIFEST !== "undefined" ? IMAGE_MANIFEST : null;

  if (id && manifest && manifest.ids && manifest.ids[id]) {
    const small = `${manifest.base}/${id}-400.webp`;
    const large = `${manifest.base}/${id}-800.webp`;
    return { small, large, srcset: `${small} 400w, ${large} 800w` };
  }

  if (id) {
    const small = `https://drive.google.com/thumbnail?id=${id}&sz=w400`;
    const large = `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
    return { small, large, srcset: `${small} 400w, ${large} 800w` };
  }

  return { small: url, large: url, srcset: "" };
}

// Normalise only whitespace, so "Walnuts " and "Walnuts" group together.
// Spelling and wording are left exactly as typed in the sheet — the sheet is
// the single source of truth for every name shown on the site.
function canonicalCategory(cat) {
  return (cat || "").replace(/\s+/g, " ").trim();
}

// URL/DOM-safe id fragment, e.g. "Cashew Nuts (Kaju)" -> "cashew-nuts-kaju"
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Name shown on the catalogue cards. If the sheet's "Website Name" column is
// filled for this product, that wins — so the shop owner controls card names
// from the sheet. Otherwise we auto-shorten: since each card already sits under
// its section heading, we drop the section's own words from the product name so
// "Almond - Small" reads as just "Small". Nothing is hard-coded — the words to
// drop are derived from the product's own category, and a name that doesn't
// repeat the category (e.g. "Mamra Badam") is left untouched. The product page,
// cart and order always use the full name from the sheet.
function cardName(product) {
  if (product.websiteName) return product.websiteName;

  const name = product.name || "";
  const cat = product.category || "";

  // Words that make up the category (before any parenthetical), plus simple
  // singular/plural variants, e.g. "Almonds" -> {almonds, almond}.
  const words = new Set();
  (cat.split("(")[0].match(/[A-Za-z]+/g) || []).forEach((w) => {
    const lw = w.toLowerCase();
    words.add(lw);
    words.add(lw.endsWith("s") ? lw.slice(0, -1) : lw + "s");
  });

  let r = name;
  // Drop a parenthetical that just repeats the category's own, e.g. "(Kaju)".
  (cat.match(/\(([^)]*)\)/g) || []).forEach((p) => {
    r = r.replace(new RegExp("\\(\\s*" + escapeRegExp(p.slice(1, -1).trim()) + "\\s*\\)", "ig"), " ");
  });
  // Drop the category's words wherever they appear (whole words only).
  r = r.replace(/[A-Za-z]+/g, (m) => (words.has(m.toLowerCase()) ? "" : m));
  // Tidy up leftovers: a hyphen glued to a word by a removal, empty (), edges.
  r = r.replace(/(\S)-\s+/g, "$1 ").replace(/\(\s*\)/g, " ");
  r = r.replace(/\s+/g, " ").replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, "").trim();
  return r || name;
}

// Escapes a string for safe use inside a double-quoted HTML attribute.
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadProducts() {
  const res = await fetch(CONFIG.PRICES_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load prices");
  return rowsToProducts(parseCSV(await res.text()));
}

// Reads the payment QR link out of its own tab in the same spreadsheet.
// Rather than depending on an exact cell, it scans every cell for the first
// thing that looks like a link, so the sheet can be laid out with or without
// a header row and the columns can be in either order.
async function loadPaymentQrUrl() {
  const res = await fetch(CONFIG.PAYMENT_QR_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load the payment QR sheet");

  for (const row of parseCSV(await res.text())) {
    for (const cell of row) {
      const value = (cell || "").trim();
      if (/^https?:\/\//i.test(value)) return normalizeImageUrl(value);
    }
  }
  return "";
}

/* ── formatting ────────────────────────────────────────────────── */

function rupees(amount) {
  const rounded = Math.round(amount * 100) / 100;
  return "₹" + rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// "gram" for per-gram products, "kg" for the rest
function unitLabel(product) {
  return product.unit === "G" ? "gram" : "kg";
}

// Price of one packet of the given weight, in that product's own unit
function packetPrice(product, weight) {
  return product.unit === "G" ? product.price * weight.g : product.price * weight.kg;
}

// Which weight tags a product offers. Kesar is checked first, so saffron
// always gets the gram-scale set regardless of the sheet's other columns.
function weightsFor(product) {
  const isKesar =
    product.category.trim().toLowerCase() === CONFIG.KESAR_CATEGORY.toLowerCase();

  if (isKesar) return CONFIG.WEIGHT_SETS.kesar;
  if (product.smallWeights) return CONFIG.WEIGHT_SETS.small;
  return CONFIG.WEIGHT_SETS.standard;
}

/* ── cart ──────────────────────────────────────────────────────── */

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
}

// A product at two different weights is two separate cart lines.
function lineKey(productId, weightLabel) {
  return `${productId}__${weightLabel}`;
}

function addToCart(product, weight, packets) {
  const cart = getCart();
  const key = lineKey(product.id, weight.label);
  const existing = cart.find((item) => item.key === key);

  if (existing) {
    existing.packets += packets;
    // Price is refreshed on every add so the cart reflects today's rate
    existing.unitPrice = packetPrice(product, weight);
  } else {
    cart.push({
      key,
      id: product.id,
      name: product.name,
      category: product.category,
      img: product.img,
      weightLabel: weight.label,
      weightKg: weight.kg,
      packets,
      unitPrice: packetPrice(product, weight),
    });
  }
  saveCart(cart);
}

function removeFromCart(key) {
  saveCart(getCart().filter((item) => item.key !== key));
}

function cartItemCount() {
  return getCart().reduce((sum, item) => sum + item.packets, 0);
}

function cartTotal() {
  return getCart().reduce((sum, item) => sum + item.unitPrice * item.packets, 0);
}

// Full category + name so each order row is unambiguous for fulfilment, e.g.
// "Almonds (Badam) - Almond - Medium (250g) x 2, Seeds - Flax Seeds (1kg) x 1"
// (older carts saved before category was stored fall back to the name alone).
function cartOrderString() {
  return getCart()
    .map((item) => {
      const full = item.category ? `${item.category} - ${item.name}` : item.name;
      return `${full} (${item.weightLabel}) x ${item.packets}`;
    })
    .join(", ");
}

/* ── payment hold ──────────────────────────────────────────────── */

// Once an order is placed the customer is held on the payment page until the
// deadline passes. The deadline is stored rather than counted from page load,
// so reloading the page cannot restart or shorten the wait.

function setPaymentDeadline() {
  localStorage.setItem(PAYMENT_DEADLINE_KEY, String(Date.now() + CONFIG.PAYMENT_RESET_MS));
}

function getPaymentDeadline() {
  const raw = parseInt(localStorage.getItem(PAYMENT_DEADLINE_KEY) || "", 10);
  return Number.isFinite(raw) ? raw : null;
}

function clearPaymentDeadline() {
  localStorage.removeItem(PAYMENT_DEADLINE_KEY);
}

// Called at the top of every page except the payment page itself. Sends the
// customer back to the payment page while the hold is active, and does the
// reset here too, so the cart still empties if they closed that page.
function enforcePaymentHold() {
  const deadline = getPaymentDeadline();
  if (deadline === null) return false;

  if (Date.now() < deadline) {
    window.location.replace("payment.html");
    return true;
  }

  clearPaymentDeadline();
  clearCart();
  sessionStorage.removeItem(LAST_ORDER_KEY);
  return false;
}

/* ── shared UI bits ────────────────────────────────────────────── */

// Keeps the little cart badge in sync wherever it appears
function renderCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge) return;
  const count = cartItemCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-flex" : "none";
}

// Accepts a product (with an `img` object) or an older cart item (which stored
// a plain `image` URL string), so both keep working after the image change.
function imgFor(p) {
  if (p && p.img && p.img.small) return p.img;
  if (p && p.image) return { small: p.image, large: p.image, srcset: "" };
  return null;
}

// Builds a product image inside a sizing/clipping frame. The frame keeps every
// card identical and crops the faint near-white rim the photos carry, so the
// picture meets the edges seamlessly. A missing or broken image turns the frame
// into a grey placeholder rather than showing a broken-image icon.
//
// Every image is lazy-loaded and served with a srcset so phones fetch the small
// (400px) file and only the product page pulls the larger (800px) one — and the
// detail image reuses the card's already-cached file, so it no longer reloads.
function productImage(product, className) {
  const img = imgFor(product);
  if (!img) return `<div class="${className} placeholder"></div>`;

  // sizes tells the browser how wide the image renders, so it can pick the
  // lightest file from the srcset for each layout.
  const sizes =
    className === "product-img" ? "(max-width: 560px) 92vw, 520px" :
    // Cards are small (~170px on a 2-col phone). Describe them narrow so even
    // high-DPI phones pick the light 400px file (~32 KB) instead of the 800px
    // one (~100 KB) — much faster to load section-by-section, still sharp.
    className === "card-img" ? "(max-width: 600px) 130px, 240px" :
    "56px"; // cart thumbnail

  const src = className === "product-img" ? img.large : img.small;
  const srcsetAttr = img.srcset ? ` srcset="${img.srcset}" sizes="${sizes}"` : "";

  const fallback =
    `this.onerror=null;` +
    `this.parentNode.classList.add('placeholder');` +
    `this.remove()`;

  return (
    `<div class="${className}">` +
    `<img src="${src}"${srcsetAttr} alt="${escapeAttr(product.name || "")}" ` +
    `loading="lazy" decoding="async" onerror="${fallback}" />` +
    `</div>`
  );
}
