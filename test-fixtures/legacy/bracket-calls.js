// FAKE CODE for testing Sundial. Methods called with bracket syntax.
async function pay(stripe, secret, card) {
  await stripe["handleCardPayment"](secret, card);
  await stripe['confirmSetupIntent'](secret, { payment_method: { card } });
  await stripe?.[`redirectToCheckout`]?.({ sessionId: "cs_test_123" });
}

async function server(stripe, customer, itemId) {
  await stripe.invoices["retrieveUpcoming"]({ customer });
  await stripe.subscriptionItems["createUsageRecord"](itemId, { quantity: 1 });
  // Server-side customers.createSource is a different method: NOT flagged.
  await stripe.customers["createSource"](customer, { source: "tok_visa" });
}

// KNOWN GAP: the method name lives in a variable, so text matching can't see it.
function viaVariable(stripe, secret, card) {
  const method = "handleCardPayment";
  return stripe[method](secret, card);
}

module.exports = { pay, server, viaVariable };
