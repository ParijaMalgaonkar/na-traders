// Checkout page: item count + total, then the required details form.
// Place Order writes one row to the Google Sheet via the Apps Script endpoint.

function render() {
  const main = document.getElementById("checkout-main");
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

  const count = cartItemCount();
  const total = cartTotal();

  const notConfigured = !CONFIG.ORDER_ENDPOINT
    ? `<p class="warn">Setup pending: the Google Sheet connection is not configured yet, so this order will
       <strong>not</strong> be saved. Add your Apps Script URL to <code>js/config.js</code>.</p>`
    : "";

  main.innerHTML = `
    <div class="summary-line">
      <span>${count} item${count === 1 ? "" : "s"}</span>
      <strong>${rupees(total)}</strong>
    </div>

    ${notConfigured}

    <form id="checkout-form" class="form" novalidate>
      <label for="name">Name</label>
      <input id="name" type="text" autocomplete="name" required />

      <label for="phone">Phone Number</label>
      <input id="phone" type="tel" inputmode="tel" autocomplete="tel" required />

      <label for="address">Address</label>
      <textarea id="address" rows="3" autocomplete="street-address" required></textarea>

      <p id="form-error" class="error hidden"></p>

      <button id="place-btn" type="submit" class="primary-btn big-btn" disabled>Place Order</button>
    </form>
  `;

  const form = document.getElementById("checkout-form");
  const placeBtn = document.getElementById("place-btn");
  const errorEl = document.getElementById("form-error");
  const fields = ["name", "phone", "address"].map((id) => document.getElementById(id));

  // Button stays disabled until all three details are filled in
  function validate() {
    placeBtn.disabled = !fields.every((f) => f.value.trim() !== "");
  }
  fields.forEach((f) => f.addEventListener("input", validate));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (placeBtn.disabled) return;

    placeBtn.disabled = true;
    placeBtn.textContent = "Placing order...";
    errorEl.classList.add("hidden");

    const payload = {
      name: document.getElementById("name").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      address: document.getElementById("address").value.trim(),
      order: cartOrderString(),
      total: Math.round(total * 100) / 100,
    };

    try {
      if (CONFIG.ORDER_ENDPOINT) {
        const res = await fetch(CONFIG.ORDER_ENDPOINT, {
          method: "POST",
          // text/plain keeps this a "simple" request so the browser skips the
          // CORS preflight that Apps Script web apps do not answer
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!result.ok) throw new Error(result.error || "Sheet rejected the order");
        payload.orderNumber = result.orderNumber;
      } else {
        console.warn("CONFIG.ORDER_ENDPOINT is empty — order was not saved to the sheet.");
      }

      // Payment page reads these; cart itself is cleared after the 10 min reset
      sessionStorage.setItem(
        LAST_ORDER_KEY,
        JSON.stringify({ total: payload.total, orderNumber: payload.orderNumber || null })
      );
      window.location.href = "payment.html";
    } catch (err) {
      console.error(err);
      errorEl.textContent =
        `Could not place the order. Please try again, or call us at ${CONFIG.PHONE_1}.`;
      errorEl.classList.remove("hidden");
      placeBtn.disabled = false;
      placeBtn.textContent = "Place Order";
    }
  });
}

render();
