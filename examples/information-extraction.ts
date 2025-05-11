// Example: Structured information extraction using Selvedge

import { selvedge as s } from '../src';

s.models({
  gpt4: s.openai('gpt-4')
});

const extractInfo = s.prompt`
  Extract structured information from the following text:
  ${ text => text }
`
.inputs({
  text: s.schema.string()
})
.outputs({
  title: s.schema.string(),
  headings: s.schema.array(s.schema.string()),
  entities: s.schema.array(
    s.schema.shape({
      name: s.schema.string(),
      type: s.schema.string(),
      role: s.schema.string().optional()
    })
  )
})
.using('gpt4');

const result = await extractInfo({
  text: `Apple Inc. announced its latest iPhone 14 today.
         The CEO, Tim Cook, highlighted its new features in a press release.`
});

console.log(result.title);
console.log(result.headings);
console.log(result.entities);