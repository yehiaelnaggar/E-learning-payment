/**
 * Calculate the revenue split between platform and educator
 */
const calculateRevenueSplit = (amount, platformFeePercentage = 20, fixedFee = 0) => {
  // Ensure platformFeePercentage is a valid number between 0 and 100
  platformFeePercentage = Math.max(0, Math.min(100, platformFeePercentage));
  
  // Calculate the platform commission
  const platformCommission = (amount * platformFeePercentage / 100) + fixedFee;
  
  // Calculate the educator earnings
  const educatorEarnings = amount - platformCommission;
  
  return {
    platformCommission,
    educatorEarnings,
    platformFeePercentage,
    fixedFee,
    originalAmount: amount
  };
};

/**
 * Calculate prorated refund amounts
 */
const calculateRefundAmounts = (originalTransaction, refundAmount) => {
  // If refunding full amount
  if (!refundAmount || refundAmount >= originalTransaction.amount) {
    return {
      refundAmount: originalTransaction.amount,
      refundedCommission: originalTransaction.platformCommission,
      refundedEarnings: originalTransaction.educatorEarnings,
      refundRatio: 1.0
    };
  }
  
  // Calculate the refund ratio
  const refundRatio = refundAmount / originalTransaction.amount;
  
  // Calculate prorated commission and earnings to be refunded
  const refundedCommission = originalTransaction.platformCommission * refundRatio;
  const refundedEarnings = originalTransaction.educatorEarnings * refundRatio;
  
  return {
    refundAmount,
    refundedCommission,
    refundedEarnings,
    refundRatio
  };
};

/**
 * Calculate tax amount based on tax rate and country
 */
const calculateTax = (amount, taxRate, countryCode = null) => {
  // Default to no tax if no rate provided
  if (!taxRate) return 0;
  
  // Apply standard tax rate
  const taxAmount = amount * (taxRate / 100);
  
  return parseFloat(taxAmount.toFixed(2)); // Ensure 2 decimal places and return as number
};

/**
 * Calculate discounted price
 */
const applyDiscount = (originalPrice, discountType, discountValue) => {
  if (discountType === 'PERCENTAGE') {
    // Cap percentage at 100%
    const percentage = Math.min(discountValue, 100);
    return originalPrice * (1 - percentage / 100);
  } else if (discountType === 'FIXED') {
    // Don't allow discount to make price negative
    return Math.max(0, originalPrice - discountValue);
  }
  
  // Return original price if no valid discount
  return originalPrice;
};

module.exports = {
  calculateRevenueSplit,
  calculateRefundAmounts,
  calculateTax,
  applyDiscount
};
