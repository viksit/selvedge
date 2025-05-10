import { selvedge as s } from '../src';

s.debug("*");
s.models({
  gpt4: s.openai('gpt-4')
});

const classify = s.prompt`
  Analyze the sentiment of the following sentence:
  ${ sentence => sentence }
`
.inputs({
  sentence: s.schema.string("sentence to classify")
})
.outputs({
  sentiment: s.schema.string("positive, negative, or neutral"),
  confidence: s.schema.number("0 to -1")
})
.using('gpt4');

// Run the prompt
const result = await classify({
  sentence: 'This book was super fun to read, though not the last chapter. But it was WAY TOO LONG!!!'
});

console.log('Sentiment:', result.sentiment);
console.log('Confidence:', result.confidence);