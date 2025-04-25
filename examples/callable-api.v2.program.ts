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

// Example: Word Counter program
async function main() {
  console.log("Running word counter example...");
  const wordCounter = v2Program`
    /** Count word freq */
  `
    .returns<{ [word: string]: number }>()
    .model('gpt4')
    .options({ forceRegenerate: false })
    .persist({ id: 'word-counter-99' });
  const result = await wordCounter("This is a test. This is only a test.");
  console.log("Result:", result);
  console.log("Generated code:", wordCounter.state.generatedCode);
}
main().catch(console.error);
