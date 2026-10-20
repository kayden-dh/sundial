// FAKE CODE for testing Sundial. Server-side code using old Stripe APIs.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function chargeWithSource(token) {
  // Deprecated: Sources API
  const source = await stripe.sources.create({ type: "card", token });
  return source;
}

async function previewNextInvoice(customerId) {
  // Removed in 2025-03-31.basil
  return stripe.invoices.retrieveUpcoming({ customer: customerId });
}

async function reportUsage(subscriptionItemId) {
  // Removed in 2025-03-31.basil
  await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, { quantity: 10 });
}

async function createMeteredPrice(productId) {
  return stripe.prices.create({
    product: productId,
    currency: "usd",
    recurring: { interval: "month", usage_type: "metered", aggregate_usage: "sum" },
  });
}

module.exports = { chargeWithSource, previewNextInvoice, reportUsage, createMeteredPrice };
