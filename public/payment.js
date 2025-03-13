document.addEventListener('DOMContentLoaded', () => {
    // Your Stripe publishable key
    const stripe = Stripe('pk_test_YOUR_PUBLISHABLE_KEY');
    const elements = stripe.elements();
  
    // Course data (would typically come from your database)
    const courses = {
      course_1: {
        id: 'course_1',
        name: 'Web Development Bootcamp',
        amount: 99.99,
        educatorId: 'edu_123'
      },
      course_2: {
        id: 'course_2',
        name: 'Data Science Fundamentals',
        amount: 149.99,
        educatorId: 'edu_456'
      },
      course_3: {
        id: 'course_3',
        name: 'Machine Learning Masterclass',
        amount: 199.99,
        educatorId: 'edu_789'
      }
    };
  
    // Create a card Element and mount it
    const cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#32325d',
          fontFamily: 'Arial, sans-serif',
          '::placeholder': {
            color: '#aab7c4',
          },
        },
        invalid: {
          color: '#fa755a',
          iconColor: '#fa755a',
        },
      },
    });
    
    cardElement.mount('#card-element');
  
    // Handle validation errors on the card Element
    cardElement.on('change', (event) => {
      const displayError = document.getElementById('card-errors');
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = '';
      }
    });
  
    // Handle form submission
    const form = document.getElementById('payment-form');
    const submitButton = document.getElementById('submit-button');
    const spinner = document.getElementById('spinner');
    const successMessage = document.getElementById('payment-success');
    const errorMessage = document.getElementById('payment-error');
    
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      // Disable the submit button and show spinner
      submitButton.disabled = true;
      spinner.style.display = 'inline-block';
      
      // Hide any previous messages
      successMessage.style.display = 'none';
      errorMessage.style.display = 'none';
      
      const courseSelect = document.getElementById('course');
      const currencySelect = document.getElementById('currency');
      
      const courseId = courseSelect.value;
      const currency = currencySelect.value;
      
      // Make sure a course is selected
      if (!courseId) {
        document.getElementById('card-errors').textContent = 'Please select a course';
        submitButton.disabled = false;
        spinner.style.display = 'none';
        return;
      }
      
      // Get course data
      const course = courses[courseId];
      
      try {
        // Step 1: Create a PaymentMethod with card information
        const { paymentMethod, error } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
        });
        
        if (error) {
          throw new Error(error.message);
        }
        
        // Step 2: Send the payment information to your server
        const response = await fetch('http://localhost:3002/api/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Add auth token if required
            'Authorization': 'Bearer mock-auth-token'
          },
          body: JSON.stringify({
            courseId: course.id,
            amount: course.amount,
            currency: currency,
            source: paymentMethod.id,
            educatorId: course.educatorId,
            description: `Payment for ${course.name}`
          })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.message || 'Payment processing failed');
        }
        
        // Show success message
        successMessage.style.display = 'block';
        form.reset();
        
        console.log('Payment successful:', result);
      } catch (error) {
        // Show error message
        console.error('Payment error:', error);
        errorMessage.textContent = error.message || 'Payment failed. Please try again.';
        errorMessage.style.display = 'block';
      } finally {
        // Re-enable the button and hide spinner
        submitButton.disabled = false;
        spinner.style.display = 'none';
      }
    });
  });