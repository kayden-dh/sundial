// FAKE CODE for testing Sundial. A single backtick in JSX text is just text
// to React, but it used to look like the start of a template literal.
export function InstallHelp() {
  return <p>Run `npm i to install, then reload.</p>;
}

export async function pay(stripe, clientSecret, card) {
  return stripe.handleCardPayment(clientSecret, card);
}

export function goToCheckout(stripe, sessionId) {
  return stripe.redirectToCheckout({ sessionId });
}
