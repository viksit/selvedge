import { selvedge } from '../src';

selvedge.debug('*');

selvedge.models({
  gpt4: selvedge.openai('gpt-4')
});

const extract = selvedge.prompt`
  pick the food entities from:
  ${ text => text }
`
.inputs({ text: selvedge.schema.string() })
.outputs({ entities: selvedge.schema.array(selvedge.schema.string()) })
.using('gpt4');
const result = await extract.execute({ text: 'I like to eat pizza and drink beer' });
console.log(result);