// Shared helpers used by every page: product loading, price maths,
// and the cart (kept in localStorage, no database needed).

const CART_KEY = "na_cart";
const LAST_ORDER_KEY = "na_last_order";

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
  const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
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
  };

  const cell = (row, i) => (i === -1 ? "" : row[i] || "");

  return dataRows
    .map((r) => ({
      id: cell(r, col.id).trim(),
      category: cell(r, col.category).trim() || "Other",
      name: cell(r, col.name).trim(),
      // "G" means the Price is per gram, anything else is treated as per kg
      unit: cell(r, col.unit).trim().toUpperCase() === "G" ? "G" : "KG",
      price: parseFloat(cell(r, col.price).replace(/,/g, "") || "0"),
      available: cell(r, col.available).trim().toLowerCase() === "yes",
      image: normalizeImageUrl(cell(r, col.image).trim()),
    }))
    .filter((p) => p.available && p.name);
}

// Google Drive "Share > Copy link" gives a viewer-page URL, which a browser
// cannot use as an <img> source. Rewrite any Drive link into the direct
// image form so whoever maintains the sheet can just paste what Drive
// hands them. Anything else (a normal image URL, or a path like
// "images/almond.jpg") is passed through untouched.
function normalizeImageUrl(url) {
  if (!url) return "";
  if (!/drive\.google\.com|docs\.google\.com/.test(url)) return url;

  // Matches /file/d/FILE_ID/..., /d/FILE_ID, and ?id=FILE_ID
  const match = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{20,})/) ||
                url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (!match) return url;

  return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
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
      image: product.image,
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

// "Almond Big (250g) x 2, Flax Seeds (1kg) x 1"
function cartOrderString() {
  return getCart()
    .map((item) => `${item.name} (${item.weightLabel}) x ${item.packets}`)
    .join(", ");
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

// A bad link in the sheet (a page URL instead of an image, a photo that was
// unshared, a typo) would otherwise show a broken-image icon to customers.
// Fall back to the same grey placeholder used when no image is set.
// The image sits inside a frame that does the sizing and clipping, which
// lets the CSS crop the faint near-white rim the product photos carry at
// their outer edge, so the photo meets the card edges seamlessly.
// A bad link in the sheet (a page URL instead of an image, a photo that was
// unshared, a typo) turns the frame into the same grey placeholder used
// when no image is set, rather than showing a broken-image icon.
function productImage(product, className) {
  if (!product.image) return `<div class="${className} placeholder"></div>`;

  const fallback =
    `this.onerror=null;` +
    `this.parentNode.classList.add('placeholder');` +
    `this.remove()`;

  return (
    `<div class="${className}">` +
    `<img src="${product.image}" alt="${product.name}" onerror="${fallback}" />` +
    `</div>`
  );
}
