import { selvedge } from '../src';

// Register models with aliases
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

const p1 = selvedge.program`
/** 
 * given some text, extract some frequency characteristics from it 
 * 
 * @param text - the text to analyze
 * @returns an object containing the frequency of each word in the text
 */

`.returns<{ [word: string]: number }>()
  .using("claude")
  .persist('word-frequency');

// Sample text to analyze
const sampleText = "This is a test. This is only a test.";

// Execute the program - this will generate the function if not provided
const freqencyCounter = await p1.execute();

// Use the generated function
const result = freqencyCounter(sampleText);
console.log("Word frequencies:", result);

// load the function from selvedge persistence
const frequencyCounter2 = await selvedge.loadProgram('word-frequency')
// console.log("Loaded program:", frequencyCounter2.generatedCode)
const lp = await frequencyCounter2.execute()
console.log(lp(sampleText))
