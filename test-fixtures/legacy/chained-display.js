// FAKE CODE for testing Sundial. Chained calls: the report should show the
// object the method is called on ("stripe"), not just ".redirectToCheckout(".
function goToCheckout(stripe, sessionId) {
  stripe
    .redirectToCheckout({ sessionId });
}

async function confirm(stripe, secret) {
  const result = stripe
    // comment lines in between are skipped when picking the line to show
    ?.handleCardPayment(secret);
  return result;
}

module.exports = { goToCheckout, confirm };
