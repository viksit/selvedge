import { selvedge } from '../src';

// Enable debug logging
selvedge.debug("*");

// Register models - this is required before using them
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

// Example: Word Counter program
async function main() {
  console.log("Running word counter example...");
  const wordCounter = selvedge.program`
    /** Write a typescript program that
     *  counts word freq only if the word starts with q 
     **/
  `
    .returns<{ [word: string]: number }>()
    .model('claude')
    .options({ forceRegenerate: false })
    .persist('word-counter-5');
  const result = await wordCounter("the quick brown fox jumps over the lazy dog");
  console.log("Result:", result);
  console.log("Generated code:", wordCounter.state.generatedCode);
}
main().catch(console.error);
