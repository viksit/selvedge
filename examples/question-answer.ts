import { selvedge as s } from '../src';

s.models({
  gpt4: s.openai('gpt-4')
});

const predict = s.prompt`
  answer the question:
  ${ q => q }
`
.inputs({ q: s.schema.string() })
.outputs({ answer: s.schema.string() })
.using('gpt4');

const result = await predict({ q: 'What is the capital of France?' });
console.log(result);