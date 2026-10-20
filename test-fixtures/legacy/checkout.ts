// FAKE CODE for testing Sundial. Browser code using old Stripe.js methods.
declare const Stripe: any;
const stripe = Stripe("pk_test_example");
const elements = stripe.elements();

const card = elements.create("card");
const ideal = elements.create("idealBank", { style: {} });

export async function pay(clientSecret: string) {
  return stripe.handleCardPayment(clientSecret, card);
}

export async function saveCard(clientSecret: string) {
  return stripe.handleCardSetup(clientSecret, card);
}

export async function makeSource() {
  return stripe.createSource(card, { type: "card" });
}

export function goToCheckout(sessionId: string) {
  return stripe.redirectToCheckout({ sessionId });
}
