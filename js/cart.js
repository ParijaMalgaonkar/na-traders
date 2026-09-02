// Cart page: one row per line item, grand total, then the Buy button.

function render() {
  const main = document.getElementById("cart-main");
  const cart = getCart();

  if (cart.length === 0) {
    main.innerHTML = `
      <div class="empty">
        <p>Your cart is empty.</p>
        <a href="index.html" class="primary-btn inline">Browse Products</a>
      </div>
    `;
    return;
  }

  const rows = cart
    .map(
      (item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>
          <div class="cell-product">
            ${productImage(item, "thumb")}
            <span>${item.name}</span>
          </div>
        </td>
        <td>${item.weightLabel}</td>
        <td>${item.packets}</td>
        <td>${rupees(item.unitPrice)}</td>
        <td>${rupees(item.unitPrice * item.packets)}</td>
        <td><button class="remove-btn" data-key="${item.key}" aria-label="Remove">✕</button></td>
      </tr>`
    )
    .join("");

  main.innerHTML = `
    <div class="table-wrap">
      <table class="cart-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>Weight</th>
            <th>Qty</th>
            <th>Price for one</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="grand-total">
      <span>Total</span>
      <strong>${rupees(cartTotal())}</strong>
    </div>

    <button id="buy-btn" class="primary-btn big-btn">Buy</button>
  `;

  main.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromCart(btn.dataset.key);
      render();
    });
  });

  document.getElementById("buy-btn").addEventListener("click", () => {
    window.location.href = "checkout.html";
  });
}

if (!enforcePaymentHold()) render();
