// Minimal v2 program definitions ported from callable-api.ts
import { selvedge } from '../src';
import { program as v2Program } from '../src/lib/programs/v2/entry';

// Enable debug logging
selvedge.debug("*");

// Register models - this is required before using them
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

// Example 1: Sentiment Analyzer program (prompt template is not ported, only the program)
export const wordCounter = v2Program`
  /**
   * Count the frequency of words in a text
   * @param text - The text to analyze
   * @returns An object mapping each word to its frequency
   */
`
  .returns<{ [word: string]: number }>()
  .model('gpt4')
  .options({ forceRegenerate: false })
  .persist({ id: 'word-counter-99' });

// Wrap execution in an async function
async function main(): Promise<Record<string, number> | void> {
  try {
    console.log("Running word counter example...");
    
    // Call the word counter program
    const result = await wordCounter({ text: "This is a test. This is only a test." });
    
    // Format and display the result
    console.log("Word frequency result:");
    if (result) {
      // Format the result as a table for better readability
      console.table(result);
      return result; // Return the result for the main function
    } else {
      console.log("No result returned from word counter");
    }
  } catch (error) {
    console.error("Error running example:", error);
  }
}

// Execute the main function
void main().catch(console.error);

// // If you want to port the sentimentAnalyzer as a program (not a prompt), you can do so as well:
// export const sentimentAnalyzer = v2Program`
//   Analyze the sentiment in this text: ${text => text}
//   Respond with a JSON object containing score (-1.0 to 1.0), label, and confidence.
//   Include detailed rationale for the score.
// `
//   .returns<{ score: number; label: string; confidence: number; rationale: string }>()
//   .model('claude')
//   .options({ temperature: 0.2 })
//   .persist({ id: 'sentiment-test-99' });

// // These exports are just the program definitions using the v2 builder, no execution or flow logic included.
