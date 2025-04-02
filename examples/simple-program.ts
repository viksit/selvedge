import { selvedge } from '../src';

// Enable debug logging for program and persistence namespaces
selvedge.debug('program,persistence');

// Register models with aliases
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

const counterSpec = selvedge.program`
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

// Execute the program with forceRegenerate option - this will regenerate the function even if it exists
const freqencyCounter = await counterSpec.build({}, { forceRegenerate: true });
// const freqencyCounter = await counterSpec.build();
// console.log(freqencyCounter.g);
// Use the generated function
const result = freqencyCounter(sampleText);
console.log("??? Word frequencies:", result);
// Print the generated code
console.log(counterSpec.generatedCode);

// load the function from selvedge persistence
const frequencyCounterLoadedSpec = await selvedge.loadProgram('word-frequency')
console.log("Loaded program:", frequencyCounterLoadedSpec.generatedCode)
const frequencyCounterLoaded = await frequencyCounterLoadedSpec.build()
console.log(">>>>", frequencyCounterLoaded(sampleText))
