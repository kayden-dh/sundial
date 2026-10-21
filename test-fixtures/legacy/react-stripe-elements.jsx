// FAKE CODE for testing Sundial. The old React wrapper for Stripe.js.
import React from "react";
import { Elements, CardElement, injectStripe } from "react-stripe-elements";
export { StripeProvider } from 'react-stripe-elements';
const legacy = require("react-stripe-elements");
const lazyLoad = () => import(`react-stripe-elements`);

// Mentioning react-stripe-elements in a comment is fine,
console.log("and so is a log line about react-stripe-elements");

export const Checkout = injectStripe(() => <CardElement />);
