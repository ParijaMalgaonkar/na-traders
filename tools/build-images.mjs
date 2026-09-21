// ─────────────────────────────────────────────────────────────────────────
// NA Traders — one-time (re-runnable) image optimiser.
//
//   npm install        # once, pulls in sharp
//   npm run build-images
//
// What it does:
//   1. Reads the live Prices sheet (same CSV the site uses).
//   2. Finds every Google Drive image referenced in the "Image URL" column.
//   3. Downloads each ONCE and produces two WebP sizes:
//        images/products/<fileId>-800.webp   (product detail page)
//        images/products/<fileId>-400.webp   (catalogue cards + cart thumbs)
//   4. Writes js/image-manifest.js listing which images are available locally.
//
// The site then serves these tiny local WebPs from the free GitHub Pages /
// jsDelivr CDN instead of pulling ~1.4 MB PNGs from Google Drive on every view.
// Images not yet built here fall back to Drive automatically, so nothing
// breaks when your friend adds a new product — just re-run this to optimise it.
//
// Re-runs are cheap: an image whose two WebPs already exist is skipped.
// Pass --force to rebuild everything.
// ─────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "images", "products");
const MANIFEST = join(ROOT, "js", "image-manifest.js");

// Same sheet the site reads (see js/config.js).
const SHEET_ID = "1tkD89MnuD7Ls3gdzUC-ArJQnocTGJSwTmVV1H4aaYMk";
const PRICES_GID = "0";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&gid=${PRICES_GID}`;

const SIZES = [800, 400]; // widths to emit, largest first
const WEBP_QUALITY = 80;
const CONCURRENCY = 3; // gentle on Drive's rate limiter
const MAX_RETRIES = 4;
const FORCE = process.argv.includes("--force");

/* ── tiny CSV parser (handles quoted fields with commas/newlines) ────────── */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Same extraction the site uses: /file/d/ID, /d/ID, ?id=ID
function driveFileId(url) {
  if (!url || !/drive\.google\.com|docs\.google\.com/.test(url)) return null;
  const m =
    url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{20,})/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Drive's thumbnail endpoint throttles by returning a 0-byte / HTML body with
// a 200, so we validate we actually got image bytes and retry with backoff.
async function downloadImage(fileId) {
  const urls = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
  ];
  let lastErr = "unknown";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const url = urls[Math.min(attempt - 1, urls.length - 1)];
    try {
      const res = await fetch(url, { redirect: "follow" });
      const type = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.ok && type.startsWith("image/") && buf.length > 1024) return buf;
      lastErr = `HTTP ${res.status} type=${type} bytes=${buf.length}`;
    } catch (e) {
      lastErr = e.message;
    }
    await sleep(500 * attempt * attempt); // 0.5s, 2s, 4.5s, 8s
  }
  throw new Error(lastErr);
}

async function buildOne(fileId) {
  const targets = SIZES.map((w) => join(OUT_DIR, `${fileId}-${w}.webp`));
  if (!FORCE && targets.every((p) => existsSync(p))) return "cached";

  const buf = await downloadImage(fileId);
  const base = sharp(buf, { failOn: "none" });
  for (const w of SIZES) {
    await base
      .clone()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(join(OUT_DIR, `${fileId}-${w}.webp`));
  }
  return "built";
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching price sheet…");
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch sheet: HTTP ${res.status}`);
  const rows = parseCSV(await res.text());
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const imgCol = header.indexOf("imageurl");
  if (imgCol === -1) throw new Error("No 'Image URL' column found");

  const ids = [...new Set(
    rows.slice(1)
      .map((r) => driveFileId((r[imgCol] || "").trim()))
      .filter(Boolean)
  )];
  console.log(`Found ${ids.length} unique Drive images referenced.\n`);

  const results = { built: 0, cached: 0, failed: [] };
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      const n = String(i).padStart(3, " ");
      try {
        const r = await buildOne(id);
        results[r]++;
        console.log(`[${n}/${ids.length}] ${r === "cached" ? "· cached" : "✓ built "} ${id}`);
      } catch (e) {
        results.failed.push(id);
        console.log(`[${n}/${ids.length}] ✗ FAILED ${id} — ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Manifest = every fileId that has a full local set on disk (so a partial
  // failure never makes the site point at a missing file).
  const files = new Set(await readdir(OUT_DIR));
  const available = ids.filter((id) => SIZES.every((w) => files.has(`${id}-${w}.webp`)));
  const manifest =
    `// AUTO-GENERATED by tools/build-images.mjs — do not edit by hand.\n` +
    `// Maps Google Drive file IDs to locally-optimised WebP images.\n` +
    `// Built ${new Date().toISOString()} · ${available.length} images.\n` +
    `const IMAGE_MANIFEST = {\n` +
    `  base: "images/products",\n` +
    `  widths: [400, 800],\n` +
    `  ids: {\n` +
    available.map((id) => `    "${id}": 1`).join(",\n") +
    `\n  }\n};\n`;
  await writeFile(MANIFEST, manifest);

  console.log(
    `\nDone. built=${results.built} cached=${results.cached} ` +
    `failed=${results.failed.length} → manifest lists ${available.length} images.`
  );
  if (results.failed.length) {
    console.log("Failed (will fall back to Drive until re-run):", results.failed.join(", "));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
