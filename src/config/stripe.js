// Initialize stripe with your secret key
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16", // Use the latest API version or specify the one you need
});

// Add configuration getter for Connect functionality
stripe.getConfig = () => {
  // Verify that all required environment variables are set
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }

  // Check if Connect-specific variables are configured
  const connect_enabled = Boolean(
      process.env.STRIPE_PLATFORM_ACCOUNT &&
      process.env.STRIPE_WEBHOOK_SECRET
  );

  return {
    connect_enabled,
    environment: process.env.NODE_ENV || "development",
    accountTypes: ["express", "standard"],
    webhookEnabled: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    defaultCurrency: process.env.STRIPE_DEFAULT_CURRENCY || "usd",
  };
};

module.exports = stripe;
