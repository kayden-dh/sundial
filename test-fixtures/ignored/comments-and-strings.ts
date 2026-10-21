// FAKE CODE for testing Sundial. Deprecated methods are only MENTIONED here,
// in comments and strings. Sundial should flag NOTHING in this file.
declare const stripe: any;

// Old code used stripe.sources.create({ type: "card" }) here.
// stripe.handleCardPayment(clientSecret, card);

/*
  Before the migration we called:
    stripe.invoices.retrieveUpcoming({ customer })
    stripe.subscriptionItems.createUsageRecord(id, { quantity: 1 })
*/

/**
 * Pays an invoice. Replaces the old handleCardSetup(secret, card) flow.
 * Do not use redirectToCheckout({ sessionId }) any more.
 */
export async function pay(clientSecret: string, card: unknown) {
  return stripe.confirmCardPayment(clientSecret, { payment_method: { card } }); // was handleCardPayment(
}

export const MIGRATION_NOTE = "We replaced stripe.sources.create() with paymentMethods.create()";
export const OLD_CALL = 'stripe.handleCardSetup(secret, card)';
export const HELP = `Call confirmCardPayment(), not handleCardPayment(), for ${"3DS"} support`;
export const ESCAPED = "quote \" then stripe.redirectToCheckout() still in the string";
