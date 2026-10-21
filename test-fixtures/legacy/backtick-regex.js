// FAKE CODE for testing Sundial. A regex containing a backtick used to put
// the comment/string stripper into "template" mode for the rest of the file.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const BACKTICK = /`/g;

function escapeTicks(text) {
  return text.replace(BACKTICK, "'");
}

async function makeSource() {
  return stripe.sources.create({ type: "card" });
}

async function preview(customer) {
  return stripe.invoices.retrieveUpcoming({ customer });
}

module.exports = { escapeTicks, makeSource, preview };
