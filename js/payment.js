// Payment page: thank you, amount, static QR. After 10 minutes the cart is
// emptied and the customer is sent back to the main page.

function render() {
  const main = document.getElementById("payment-main");

  let last = null;
  try {
    last = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY) || "null");
  } catch {
    last = null;
  }

  // Fall back to the live cart total if the session value is missing
  const total = last && typeof last.total === "number" ? last.total : cartTotal();
  const orderNumber = last && last.orderNumber ? last.orderNumber : null;

  main.innerHTML = `
    <div class="payment-box">
      <h2 class="thanks">Thank you for ordering!</h2>
      <p class="thanks-sub">Please make payment to this QR code and inform us after doing so. Thank you!</p>

      ${orderNumber ? `<p class="order-no">Order ${orderNumber}</p>` : ""}

      <p class="amount">${rupees(total)}</p>

      <div id="qr-slot"><p class="muted small">Loading payment QR...</p></div>

      <p class="phones">Any questions? ${CONFIG.PHONE_1} / ${CONFIG.PHONE_2}</p>
      <p id="countdown" class="muted small"></p>
    </div>
  `;

  startResetTimer();
  loadQr();
}

// The QR lives in the "Payment QR" tab of the prices spreadsheet, so it can
// be changed without touching the site. Falls back to a local image, and
// tells the customer to call if neither is available.
async function loadQr() {
  const slot = document.getElementById("qr-slot");

  let url = "";
  try {
    url = await loadPaymentQrUrl();
  } catch (err) {
    console.error(err);
  }
  if (!url) url = CONFIG.PAYMENT_QR;

  const img = new Image();
  img.className = "qr";
  img.alt = "Payment QR code";

  img.onload = () => slot.replaceChildren(img);
  img.onerror = () => {
    slot.innerHTML =
      `<p class="warn">The payment QR could not be loaded. Please call us at
       ${CONFIG.PHONE_1} to complete your payment.</p>`;
  };

  img.src = url;
}

function startResetTimer() {
  const endsAt = Date.now() + CONFIG.PAYMENT_RESET_MS;
  const countdown = document.getElementById("countdown");

  const tick = setInterval(() => {
    const remaining = endsAt - Date.now();

    if (remaining <= 0) {
      clearInterval(tick);
      clearCart();
      sessionStorage.removeItem(LAST_ORDER_KEY);
      window.location.href = "index.html";
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    countdown.textContent =
      `This page resets in ${mins}:${String(secs).padStart(2, "0")}`;
  }, 1000);
}

render();
