// FAKE CODE for testing Sundial. Up-to-date Stripe.js code. Sundial should flag NOTHING here.
const stripe = Stripe("pk_test_example");
const elements = stripe.elements();
const paymentElement = elements.create("payment");
const messaging = elements.create("paymentMethodMessaging", { amount: 5000, currency: "usd" });

async function pay(clientSecret, card) {
  return stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
}

async function saveCard(clientSecret, card) {
  return stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
}

async function payWithFpx(clientSecret, fpxBank) {
  return stripe.confirmFpxPayment(clientSecret, { payment_method: { fpx: fpxBank } });
}

function goToCheckout(session) {
  window.location.href = session.url;
}
