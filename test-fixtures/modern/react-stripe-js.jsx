// FAKE CODE for testing Sundial. The current React library. Should NOT be flagged.
import { Elements, CardElement, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe("pk_test_example");
export const App = () => <Elements stripe={stripePromise}><CardElement /></Elements>;
