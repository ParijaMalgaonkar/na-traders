// Main page: product cards grouped into sections, a collapsible section nav,
// and an instant product search that jumps to a product on the page.

function groupByCategory(products) {
  return products.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});
}

// Section order = the canonical list in config (always shown, even when a
// section has no priced products yet), followed by any extra categories that
// turn up in the sheet but aren't listed there — so nothing is ever hidden.
function orderedSections(groups) {
  const canonical = CONFIG.SECTIONS.map(canonicalCategory);
  const extras = Object.keys(groups)
    .filter((c) => !canonical.includes(c))
    .sort();
  return [...canonical, ...extras];
}

function render(products) {
  const container = document.getElementById("catalog");
  container.innerHTML = "";

  if (products.length === 0) {
    container.innerHTML =
      `<p class="error">No products are available at the moment.
       Please call us at ${CONFIG.PHONE_1} to place an order.</p>`;
    buildNav([]);
    return;
  }

  const groups = groupByCategory(products);
  const sections = orderedSections(groups);
  const searchIndex = [];
  const navItems = [];
  let idx = 0;

  sections.forEach((cat) => {
    const items = groups[cat] || [];
    const secId = `sec-${slug(cat)}`;

    const section = document.createElement("section");
    section.className = "category";
    section.id = secId;

    const heading = document.createElement("h2");
    heading.textContent = cat;
    section.appendChild(heading);

    if (items.length === 0) {
      // Kept in the menu on purpose — prices/photos are on their way.
      const note = document.createElement("p");
      note.className = "coming-soon";
      note.textContent = "Coming soon.";
      section.appendChild(note);
    } else {
      const grid = document.createElement("div");
      grid.className = "grid";

      items.forEach((p) => {
        const cardId = `prod-${idx++}`;
        const card = document.createElement("a");
        card.className = "card";
        card.id = cardId;
        card.href = `product.html?id=${encodeURIComponent(p.id)}`;
        card.innerHTML = `
          ${productImage(p, "card-img")}
          <div class="card-body">
            <h3>${escapeAttr(p.name)}</h3>
            <p class="price">${rupees(p.price)} / ${unitLabel(p)}</p>
          </div>
        `;
        grid.appendChild(card);
        searchIndex.push({ name: p.name, cat, id: cardId });
      });

      section.appendChild(grid);
    }

    container.appendChild(section);
    navItems.push({ label: cat, id: secId, count: items.length });
  });

  document.getElementById("updated-at").textContent =
    "Prices last loaded: " + new Date().toLocaleString("en-IN");

  buildNav(navItems);
  setupSearch(searchIndex);
}

/* ── section nav (left drawer + burger) ─────────────────────────── */

function buildNav(navItems) {
  const list = document.getElementById("nav-list");
  if (!list) return;
  list.innerHTML = navItems
    .map(
      (it) =>
        `<li><a href="#${it.id}" data-target="${it.id}">` +
        `<span class="nav-label">${escapeAttr(it.label)}</span></a></li>`
    )
    .join("");
}

function setupNav() {
  const toggle = document.getElementById("nav-toggle");
  const drawer = document.getElementById("section-nav");
  const overlay = document.getElementById("nav-overlay");
  const closeBtn = document.getElementById("nav-close");
  const list = document.getElementById("nav-list");
  if (!toggle || !drawer) return;

  function open() {
    drawer.classList.add("open");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("show"));
    toggle.setAttribute("aria-expanded", "true");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }
  function close() {
    drawer.classList.remove("open");
    overlay.classList.remove("show");
    toggle.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    setTimeout(() => {
      if (!drawer.classList.contains("open")) overlay.hidden = true;
    }, 250);
  }

  toggle.addEventListener("click", () =>
    drawer.classList.contains("open") ? close() : open()
  );
  overlay.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Tapping a section scrolls to it and closes the drawer.
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-target]");
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(a.dataset.target);
    close();
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ── instant search ─────────────────────────────────────────────── */

function setupSearch(index) {
  const input = document.getElementById("search-input");
  const box = document.getElementById("search-suggestions");
  if (!input || !box) return;

  let matches = [];
  let active = -1;

  function hide() {
    box.hidden = true;
    box.innerHTML = "";
    active = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function show(list) {
    matches = list;
    active = -1;
    if (list.length === 0) {
      box.innerHTML = `<li class="no-match">No products found</li>`;
    } else {
      box.innerHTML = list
        .map(
          (m, i) =>
            `<li class="suggestion" role="option" data-id="${m.id}" data-i="${i}">` +
            `<span class="s-name">${highlightMatch(m.name, input.value)}</span>` +
            `<span class="s-cat">${escapeAttr(m.cat)}</span></li>`
        )
        .join("");
    }
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function flashCard(el) {
    el.classList.remove("flash");
    void el.offsetWidth; // restart the animation if it already flashed
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1800);
  }

  // Jump to the product's card in its section and flash it, so the shopper can
  // see exactly which item to tap for details. The flash fires once scrolling
  // settles (scrollend, with a timeout fallback), so it's visible on arrival
  // however long the scroll takes.
  function jumpTo(id) {
    const el = document.getElementById(id);
    hide();
    input.blur();
    if (!el) return;

    let done = false;
    const onEnd = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scrollend", onEnd);
      flashCard(el);
    };
    window.addEventListener("scrollend", onEnd);
    setTimeout(onEnd, 900);

    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function paintActive() {
    const items = box.querySelectorAll(".suggestion");
    items.forEach((it, i) => it.classList.toggle("active", i === active));
    if (items[active]) items[active].scrollIntoView({ block: "nearest" });
  }

  // Suggest from the very first character typed.
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return hide();
    show(index.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8));
  });

  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    const items = box.querySelectorAll(".suggestion");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(active + 1, items.length - 1);
      paintActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      paintActive();
    } else if (e.key === "Enter") {
      const pick = items[active] || items[0];
      if (pick) {
        e.preventDefault();
        jumpTo(pick.dataset.id);
      }
    } else if (e.key === "Escape") {
      hide();
    }
  });

  box.addEventListener("click", (e) => {
    const li = e.target.closest(".suggestion");
    if (li) jumpTo(li.dataset.id);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) hide();
  });
}

// Bold the matched span within a suggestion, escaping every piece.
function highlightMatch(name, query) {
  const q = query.trim();
  const at = name.toLowerCase().indexOf(q.toLowerCase());
  if (!q || at === -1) return escapeAttr(name);
  return (
    escapeAttr(name.slice(0, at)) +
    `<mark>${escapeAttr(name.slice(at, at + q.length))}</mark>` +
    escapeAttr(name.slice(at + q.length))
  );
}

/* ── boot ───────────────────────────────────────────────────────── */

async function init() {
  if (enforcePaymentHold()) return;

  setupNav();
  renderCartBadge();

  try {
    render(await loadProducts());
  } catch (err) {
    console.error(err);
    document.getElementById("catalog").innerHTML =
      `<p class="error">Could not load current prices. Please call us at ${CONFIG.PHONE_1}.</p>`;
  }
}

init();
