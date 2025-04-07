import { selvedge } from '../src';

selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

async function main() {
  console.log('-------- DEBUG TRACING --------');

  // Step 1: Create the initial prompt template
  const step1 = selvedge.prompt`
    Analyze the sentiment in this text: ${text => text}
    Respond with a JSON object containing score (-1.0 to 1.0), label, and confidence.
  `;
  console.log('Step 1 - Initial prompt template is callable?', typeof step1 === 'function');
  console.log('Step 1 - Properties:', Object.getOwnPropertyNames(step1));

  // Step 2: Call returns() method
  const step2 = step1.returns<{ score: number; label: string; confidence: number }>();
  console.log('Step 2 - After returns() is callable?', typeof step2 === 'function');
  console.log('Step 2 - Properties:', Object.getOwnPropertyNames(step2));

  // Step 3: Call using() method 
  const step3 = step2.using("claude");
  console.log('Step 3 - After using() is callable?', typeof step3 === 'function');
  console.log('Step 3 - Properties:', Object.getOwnPropertyNames(step3));

  // Step 4: Call options() method
  const step4 = step3.options({ temperature: 0.2 });
  console.log('Step 4 - After options() is callable?', typeof step4 === 'function');
  console.log('Step 4 - Properties:', Object.getOwnPropertyNames(step4));

  // Step 5: Call persist() method
  const step5 = step4.persist("sentiment");
  console.log('Step 5 - After persist() is callable?', typeof step5 === 'function');
  console.log('Step 5 - Properties:', Object.getOwnPropertyNames(step5));
  console.log('Step 5 - Constructor name:', step5?.constructor?.name);
  
  // Attempt to use the final template
  console.log('Attempting to call the template function');
  try {
    const result = await step5({
      text: "I absolutely love this product!"
    });
    console.log("Sentiment result:", result);
  } catch (error) {
    console.error('Error calling template:', error);
  }
  
  // Program example with step-by-step debugging
  console.log('\n----- PROGRAM DEBUG -----');
  
  // Step 1: Create initial program template
  const pgStep1 = selvedge.program`
    /**
     * Count the frequency of words in a text
     * @param text - The text to analyze
     * @returns An object mapping each word to its frequency
     */
  `;
  console.log('PG Step 1 - Is callable?', typeof pgStep1 === 'function'); 
  console.log('PG Step 1 - Properties:', Object.getOwnPropertyNames(pgStep1));
  
  // Step 2: Call returns() method
  const pgStep2 = pgStep1.returns<{ [word: string]: number }>();
  console.log('PG Step 2 - After returns() is callable?', typeof pgStep2 === 'function');
  console.log('PG Step 2 - Properties:', Object.getOwnPropertyNames(pgStep2));
  
  // Step 3: Call using() method
  const pgStep3 = pgStep2.using("gpt4");
  console.log('PG Step 3 - After using() is callable?', typeof pgStep3 === 'function');
  console.log('PG Step 3 - Properties:', Object.getOwnPropertyNames(pgStep3));
  
  // Step 4: Call options() method
  const pgStep4 = pgStep3.options({ forceRegenerate: false });
  console.log('PG Step 4 - After options() is callable?', typeof pgStep4 === 'function');
  console.log('PG Step 4 - Properties:', Object.getOwnPropertyNames(pgStep4));
  
  // Step 5: Call persist() method
  const pgStep5 = pgStep4.persist("word-counter");
  console.log('PG Step 5 - After persist() is callable?', typeof pgStep5 === 'function');
  console.log('PG Step 5 - Properties:', Object.getOwnPropertyNames(pgStep5));
  
  // Final step: Call the function
  console.log('PG Final - Attempting to call the program function');
  try {
    const frequency = await pgStep5("This is a test. This is only a test.");
    console.log("Word frequency:", frequency);
  } catch (error) {
    console.error('Error calling program:', error);
  }
}

main().catch(console.error);
