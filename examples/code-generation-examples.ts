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
  }
});

/**
 * Example 1: Simple function generation with a cleaner approach
 * 
 * This example shows how to define a function signature and have the LLM implement it.
 */
async function example1() {
  console.log("Example 1: Simple function generation");
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

  // Generate the implementation
  console.log("Generating email validator implementation...");
  const implementation = await emailValidator.generate({});
  
  console.log("Generated function:");
  console.log(implementation);
  console.log("\n");
  
  // Evaluate the generated code to use it in the program
  console.log("Using the generated function:");
  
  try {
    // Create a function that evaluates the code and returns the isValidEmail function
    const getIsValidEmail = new Function(`
      ${implementation}
      return isValidEmail;
    `);
    
    // Get the function from the evaluated code
    const isValidEmail = getIsValidEmail();
    
    // Use the function with some test cases
    const testEmails = [
      "user@example.com",
      "invalid-email",
      "user.name+tag@example.co.uk",
      "@missing-username.com"
    ];
    
    // Test each email address
    for (const email of testEmails) {
      const isValid = isValidEmail(email);
      console.log(`Email "${email}" is ${isValid ? 'valid' : 'invalid'}`);
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
    console.log("Example completed successfully!");
  } catch (error) {
    console.error("Error running example:", error);
  }
}

// Run the examples
runExamples().catch(console.error);
