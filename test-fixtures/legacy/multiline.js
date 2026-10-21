// FAKE CODE for testing Sundial. Deprecated calls split across lines,
// the way code formatters (like Prettier) often write chained calls.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function makeSource() {
  return stripe.sources
    .create({ type: "card" });
}

async function preview(customer) {
  return stripe
    .invoices
    .retrieveUpcoming({ customer });
}

async function pay(stripeJs, secret, card) {
  /* old flow below */ return stripeJs.handleCardPayment(
    secret,
    card
  );
}

function link(id) {
  // A real call inside a template literal's ${...} is still code.
  return `Preview: ${stripe.invoices.listUpcomingLines(id)}`;
}

module.exports = { makeSource, preview, pay, link };
