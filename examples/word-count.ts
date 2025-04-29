import { selvedge } from '../src';

// Enable specific debug namespaces to see persistence-related logs
selvedge.debug("*");

selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

interface WordCounter {
  [word: string]: number;
  totalWords: number;
}

async function main() {

  console.log('Example 2: Word Counter');

  // Create a program with type information
  const wordCounter = selvedge.program`
    /**
     * Count the frequency of words in a text
     * @param text - The text to analyze
     * @returns An object mapping each word to its frequency
     */
  `
    .returns<WordCounter>()
    .using("gpt4")
    .options({ forceRegenerate: false })
    .persist("word-counter-if");

  // Call it directly as a function
  const frequency = await wordCounter("This is a test. This is only a test.");
  console.log("Word frequency:", frequency);

}

main().catch(console.error);
