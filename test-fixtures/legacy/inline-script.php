<?php
// FAKE PAGE for testing Sundial. PHP code is ignored; only <script> blocks are scanned.
$total = $cart.handleCardSetup($items);
$publishableKey = getenv('STRIPE_PUBLISHABLE_KEY');
?>
<!doctype html>
<html>
  <body>
    <div id="fpx-bank-element"></div>
    <script>
      const stripe = Stripe('<?php echo $publishableKey; ?>');
      const elements = stripe.elements();
      const fpxBank = elements.create('fpxBank', { accountHolderType: 'individual' });
    </script>
  </body>
</html>
