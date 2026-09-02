// Main page: product cards grouped by category, each linking to product.html

function groupByCategory(products) {
  return products.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});
}

function render(products) {
  const container = document.getElementById("catalog");
  container.innerHTML = "";

  const groups = groupByCategory(products);

  Object.keys(groups).forEach((category) => {
    const section = document.createElement("section");
    section.className = "category";

    const heading = document.createElement("h2");
    heading.textContent = category;
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "grid";

    groups[category].forEach((p) => {
      const card = document.createElement("a");
      card.className = "card";
      card.href = `product.html?id=${encodeURIComponent(p.id)}`;
      card.innerHTML = `
        ${productImage(p, "card-img")}
        <div class="card-body">
          <h3>${p.name}</h3>
          <p class="price">${rupees(p.price)} / ${unitLabel(p)}</p>
        </div>
      `;
      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });

  document.getElementById("updated-at").textContent =
    "Prices last loaded: " + new Date().toLocaleString("en-IN");
}

async function init() {
  if (enforcePaymentHold()) return;

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
