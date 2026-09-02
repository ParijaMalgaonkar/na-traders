// Product page: pick a weight (required), pick how many packets, add to cart.

let selectedWeight = null;

function renderProduct(product) {
  const main = document.getElementById("product-main");

  const weightTags = CONFIG.WEIGHTS.map(
    (w) => `<button type="button" class="tag" data-label="${w.label}">${w.label}</button>`
  ).join("");

  const packetOptions = Array.from(
    { length: CONFIG.MAX_PACKETS },
    (_, i) => `<option value="${i + 1}">${i + 1}</option>`
  ).join("");

  main.innerHTML = `
    <div class="product-detail">
      ${productImage(product, "product-img")}
      <h2>${product.name}</h2>
      <p class="price big">${rupees(product.price)} / ${unitLabel(product)}</p>

      <h3 class="field-label">Select weight</h3>
      <div class="tags" id="weight-tags">${weightTags}</div>

      <div id="packet-block" class="hidden">
        <h3 class="field-label">Number of packets</h3>
        <select id="packets" class="select">${packetOptions}</select>
      </div>

      <p id="line-preview" class="line-preview"></p>

      <button id="add-btn" class="primary-btn" disabled>Add to Cart</button>
    </div>
  `;

  const packetBlock = document.getElementById("packet-block");
  const packetSelect = document.getElementById("packets");
  const addBtn = document.getElementById("add-btn");
  const preview = document.getElementById("line-preview");

  function updatePreview() {
    if (!selectedWeight) return;
    const packets = parseInt(packetSelect.value, 10);
    const each = packetPrice(product, selectedWeight);
    preview.textContent = `${packets} × ${selectedWeight.label} @ ${rupees(each)} each = ${rupees(each * packets)}`;
  }

  document.getElementById("weight-tags").addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;

    document.querySelectorAll("#weight-tags .tag").forEach((t) => t.classList.remove("selected"));
    btn.classList.add("selected");

    selectedWeight = CONFIG.WEIGHTS.find((w) => w.label === btn.dataset.label);

    // Packets and the add button only become available once a weight is chosen
    packetBlock.classList.remove("hidden");
    addBtn.disabled = false;
    updatePreview();
  });

  packetSelect.addEventListener("change", updatePreview);

  addBtn.addEventListener("click", () => {
    if (!selectedWeight) return;
    addToCart(product, selectedWeight, parseInt(packetSelect.value, 10));
    window.location.href = "index.html";
  });
}

async function init() {
  if (enforcePaymentHold()) return;

  renderCartBadge();

  const id = new URLSearchParams(window.location.search).get("id");
  const main = document.getElementById("product-main");

  if (!id) {
    main.innerHTML = `<p class="error">No product selected. <a href="index.html">Go back</a></p>`;
    return;
  }

  try {
    const product = (await loadProducts()).find((p) => p.id === id);
    if (!product) {
      main.innerHTML = `<p class="error">That product is no longer available. <a href="index.html">Go back</a></p>`;
      return;
    }
    renderProduct(product);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<p class="error">Could not load this product. Please call us at ${CONFIG.PHONE_1}.</p>`;
  }
}

init();
