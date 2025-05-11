import { selvedge as s } from '../src';

s.debug('*');

s.models({
  gpt4: s.openai('gpt-4')
});

const extract = s.prompt`
  pick the food and drink entities from:
  ${ text => text }
  
  For each entity, identify its name and type (food or drink).
`
.inputs({ text: s.schema.string() })
.outputs({ 
  entities: s.schema.array(
    s.schema.shape({
      name: s.schema.string(),
      type: s.schema.string()
    })
  ) 
})
.options({temperature: 0.9})
.using('gpt4');

const result = await extract.execute({ text: 'I like to eat pizza and drink beer' });
console.log(result.entities);