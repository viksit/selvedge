import { selvedge } from '../src';

selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

async function main() {
  // Example 1: Sentiment Analysis using callable prompt template
  console.log('Example 1: Sentiment Analysis');
  
  // Create a template with type information
  const sentimentAnalyzer = selvedge.prompt`
    Analyze the sentiment in this text: ${text => text}
    Respond with a JSON object containing score (-1.0 to 1.0), label, and confidence.
  `
    .returns<{ score: number; label: string; confidence: number }>()
    .using("claude")
    .options({ temperature: 0.2 })
    .persist("sentiment");
  
  // Call it directly as a function
  const result = await sentimentAnalyzer({
    text: "I absolutely love this product!"
  });
  
  console.log("Sentiment result:", result);
  console.log();
  
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
    .persist("word-counter");
  
  // Call it directly as a function
  const frequency = await wordCounter("This is a test. This is only a test.");
  
  console.log("Word frequency:", frequency);
}

main().catch(console.error);
