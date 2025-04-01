/**
 * Selvedge Code Generation Examples
 * 
 * This file demonstrates the use of selvedge.program for code generation.
 * 
 * IMPORTANT: To run these examples, you need to set the appropriate API keys:
 * - For Claude models: Set ANTHROPIC_API_KEY environment variable or provide directly in the code
 */
import { selvedge } from '../src';

// Set up models
selvedge.models({
  // Claude model
  claude: {
    ...selvedge.anthropic('claude-3-5-haiku-20241022'),
    config: {
      apiKey: process.env.ANTHROPIC_API_KEY
    }
  },
  // GPT-4o model
  gpt4o: {
    ...selvedge.openai('gpt-4o'),
    config: {
      apiKey: process.env.OPENAI_API_KEY
    }
  }
});

/**
 * Example 1: Simple function generation with direct execution
 * 
 * This example shows how to define a function signature and have the LLM implement it,
 * then use the function directly through the new execute method.
 */
async function example1() {
  console.log("Example 1: Simple function generation with direct execution");
  console.log("------------------------------------");

  // Define the email validator function signature
  const emailValidator = selvedge.program`
    /**
     * Checks if a string is a valid email address
     * @param {string} email - The email address to validate
     * @returns {boolean} - True if the email is valid, false otherwise
     */
    function isValidEmail(email) {
      // LLM will implement this function
    }
  `
    .examples({
      "user@example.com": true,
      "invalid-email": false,
      "user.name+tag@example.co.uk": true,
      "@missing-username.com": false
    })
    .using("claude")
    .persist("email-validator");

  try {
    console.log("Generating and executing email validator...");

    // Generate and get a callable proxy for the function
    const validator = await emailValidator.execute({});

    // Use the function directly with test cases
    const testEmails = [
      "user@example.com",
      "invalid-email",
      "user.name+tag@example.co.uk",
      "@missing-username.com"
    ];

    console.log("Testing the generated function:");

    // Test each email address
    for (const email of testEmails) {
      // We can call the validator directly as a function
      const isValid = validator(email);
      console.log(`Email "${email}" is ${isValid ? 'valid' : 'invalid'}`);
    }
    // We can also access the function by its name
    console.log("\nUsing the function by name:");
    const isValidByName = validator.isValidEmail("test@example.com");
    console.log(`Email "test@example.com" is ${isValidByName ? 'valid' : 'invalid'}`);

  } catch (error) {
    console.error("Error using the generated function:", error);
  }
}

/**
 * Example 2: Typed function generation
 * 
 * This example shows how to define TypeScript interfaces and generate
 * a function that works with those types.
 */
async function example2() {
  console.log("\nExample 2: Typed function generation");
  console.log("------------------------------------");

  // Define the product interface
  console.log("Defining a typed function for product analysis...");

  // Define the product analyzer function with TypeScript types
  const productAnalyzer = selvedge.program`
    /**
     * Interface for a product extracted from a review
     */
    interface Product {
      /** The product category (e.g., phone, laptop, headphones) */
      category: string;
      /** List of features mentioned in the review */
      features: string[];
      /** Overall sentiment score from -1.0 (negative) to 1.0 (positive) */
      sentiment: number;
    }

    /**
     * Analyzes a product review and extracts structured information
     * @param {string} review - The customer review text
     * @returns {Product} Structured product information
     */
    function analyzeProduct(review: string): Product {
      // LLM will implement this function
    }
  `
    .examples({
      "The phone has great battery life but the camera is poor":
      {
        category: "phone",
        features: ["battery life", "camera"],
        sentiment: 0.2 // slightly positive overall
      },
      "My new laptop is incredibly slow and crashes constantly":
      {
        category: "laptop",
        features: ["performance", "stability"],
        sentiment: -0.9 // very negative
      }
    })
    .using("claude")
    .returns<(review: string) => { category: string, features: string[], sentiment: number }>()
    .persist("product-analyzer");

  try {
    console.log("Generating and executing product analyzer...");

    // Generate and get a callable proxy for the function
    const analyzer = await productAnalyzer.execute({});

    // Test with some sample reviews
    const testReviews = [
      "The headphones have amazing sound quality but they're uncomfortable after an hour",
      "This smartwatch has terrible battery life, but the fitness tracking features are excellent"
    ];

    console.log("Testing the generated function with typed returns:");

    // Analyze each review
    for (const review of testReviews) {
      const result = analyzer(review);
      console.log(`\nReview: "${review}"`);
      console.log(`Category: ${result.category}`);
      console.log(`Features: ${result.features.join(", ")}`);
      console.log(`Sentiment: ${result.sentiment.toFixed(2)}`);
    }
  } catch (error) {
    console.error("Error using the generated function:", error);
  }
}

// Run the example
async function runExamples() {
  console.log("SELVEDGE CODE GENERATION EXAMPLES");
  console.log("================================\n");

  // Check if API keys are set
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY environment variable is not set. Examples will fail.");
    console.warn("Please set your Anthropic API key using:");
    console.warn("export ANTHROPIC_API_KEY=your_api_key_here\n");
    return;
  }

  try {
    await example1();
    await example2();
    console.log("Examples completed successfully!");
  } catch (error) {
    console.error("Error running example:", error);
  }
}

// Run the examples
runExamples().catch(console.error);
