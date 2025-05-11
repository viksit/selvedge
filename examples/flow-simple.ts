// Example: Using flow to connect a structured prompt and a program

import { selvedge as s } from '../src';

// Enable all debug output so you can inspect the steps
s.debug('*');

// Register a model alias (replace with your real key / env)
s.models({
  gpt4: s.openai('gpt-4')
});

// ------------------------------------------------------------------
// 1. Prompt that extracts entities from text
// ------------------------------------------------------------------
const extractEntities = s.prompt`
  Pick the food and drink entities from:
  ${text => text}
  
  For each entity, identify its name and whether it is **food** or **drink**.
`
  .inputs({ text: s.schema.string() })
  .outputs({
    entities: s.schema.array(
      s.schema.shape({ name: s.schema.string(), type: s.schema.string() })
    )
  })
  .using('gpt4');

// ------------------------------------------------------------------
// 2. Program that maps entities -> desired output shape
// ------------------------------------------------------------------
const mapEntities = s.program`
  for the given entities ${entities => entities}, 
  count the number of entities of each type 
  and return the results.
`
  .inputs(
    s.schema.array(
      s.schema.shape({ name: s.schema.string(), type: s.schema.string() })
    )
  )
  .outputs(
    // return the counts of entities of each type
    s.schema.array(
      s.schema.shape({
        type: s.schema.string(),
        count: s.schema.number(),
        entities: s.schema.array(s.schema.string())
      })
    )
  )
  .options({forceRegenerate: true})
  .using('gpt4');

// ------------------------------------------------------------------
// 3. Compose via flow
//    Flow input  : string text
//    Flow output : array<{ name, type }>
// ------------------------------------------------------------------
const pipeline = s.flow([
  extractEntities,
  (result) => result.entities,
  mapEntities
]);

// Run the pipeline
const result = await pipeline(
  {text: 'I like to eat pizza, ice cream, burgers, and drink beer and coffee'});
console.log('FLOW RESULT:', result);  

