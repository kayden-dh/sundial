// FAKE CODE for testing Sundial. display_items was removed from Checkout
// Sessions in API version 2020-08-27.
function onCheckoutCompleted(session) {
  const items = session.display_items;
  return items.map((item) => item.price);
}

const savedEvent = { "display_items": [] };

// Mentioning display_items in a comment is fine.
module.exports = { onCheckoutCompleted, savedEvent };
