// FAKE CODE for testing Sundial. Up-to-date server code. Sundial should flag NOTHING here.
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function createPayment(amount: number) {
  return stripe.paymentIntents.create({ amount, currency: "usd", automatic_payment_methods: { enabled: true } });
}

export async function attachPaymentMethod(pm: string, customer: string) {
  return stripe.paymentMethods.attach(pm, { customer });
}

export async function previewNextInvoice(customer: string, subscription: string) {
  return stripe.invoices.createPreview({ customer, subscription });
}

export async function reportUsage(customerId: string) {
  return stripe.billing.meterEvents.create({
    event_name: "api_requests",
    payload: { stripe_customer_id: customerId, value: "10" },
  });
}

// customers.createSource is a different (server-side) method from Stripe.js
// createSource() and is not in our list, so it must not be flagged.
export async function addCardToCustomer(customer: string, token: string) {
  return stripe.customers.createSource(customer, { source: token });
}
