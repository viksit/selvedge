import { selvedge } from '../src';

// Enable specific debug namespaces to see persistence-related logs
selvedge.debug("*");

selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

async function main() {
  // Example 1: Sentiment Analysis using callable prompt template
  console.log('Example 1: Sentiment Analysis');
  const sentimentAnalyzer = selvedge.prompt`
    Analyze the sentiment in this text: ${text => text}
    Respond with a JSON object containing score (-1.0 to 1.0), label, and confidence.
    Include detailed rationale for the score.
  `
    .returns<{ score: number; label: string; confidence: number; rationale: string }>()
    .using("claude")
    .options({ temperature: 0.2 })
    .persist("sentiment-test-99");

  // call it directly as a function!
  const result = await sentimentAnalyzer({
    text: "I absolutely love this product!"
  });
  console.log("Sentiment result:", result);
  //console.log();

  // Example 2: Word Counter using callable program template
  console.log('Example 2: Word Counter');

  // Create a program with type information
  const wordCounter = selvedge.program`
    /**
     * Count the frequency of words in a text
     * @param text - The text to analyze
     * @returns An object mapping each word to its frequency
     */
  `
    .returns<{ [word: string]: number }>()
    .using("gpt4")
    .options({ forceRegenerate: false })
    .persist("word-counter-99");

  // Call it directly as a function
  const frequency = await wordCounter("This is a test. This is only a test.");
  console.log("Word frequency:", frequency);

  // Example 3: Link both with a flow 
  console.log('Example 3: Flow');
  const simpleFlow = selvedge.flow([
    // create a function that returns a sample object to give to sentiment analyzer
    () => ({ text: "I absolutely love this product!" }),
    sentimentAnalyzer,
    // transform for wordcounter
    (result) => (result.rationale),
    wordCounter
  ]);

  // Execute the flow
  const flowResult = await simpleFlow({});
  console.log("Flow result:", flowResult);

  // Example 4: Debug functionality
  console.log('\nExample 4: Debug functionality');
  const emailValidator = selvedge.program`
    /**
     * Create a function that validates email addresses according to RFC 5322.
     * @param email - The email address to validate
     * @returns True if the email is valid, false otherwise
     */
  `
    .debug({
      showPrompt: true,      // See the actual prompt sent to the LLM
      showIterations: true,  // See intermediate results if multiple generations
      explanations: true     // Get explanations of why code was generated this way
    })
    .returns<(email: string) => boolean>()
    .using("gpt4");

  // Call the function to generate the code
  const isValid = await emailValidator("test@example.com");
  console.log("Email is valid:", isValid);
  
  // Access debug information after execution
  console.log('\nDebug information:');
  console.log('Explanation:', emailValidator.explanation);
  console.log('Iterations:', emailValidator.iterations?.length);
  console.log('Final prompt (first 100 chars):', emailValidator.finalPrompt?.substring(0, 100) + '...');
}

main().catch(console.error);
