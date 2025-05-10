// Example: Using Chain of Thought to solve a problem

import { selvedge as s } from '../src';

s.models({
  gpt4: s.openai('gpt-4')
}); 

const cot = s.ChainOfThought`answer ${q => q} given ${ctx => ctx}`
  .inputs({ 
    q: s.schema.string(), 
    ctx: s.schema.string() })
  .outputs({ 
    answer: s.schema.string(), 
    rationale: s.schema.string() 
  });

const result = await cot.execute({ 
  q: 'what is the diagnosis for fever, persistent cough, fatigue', 
  ctx: 'patient is a 30 year old male. non-smoker, no travel, vaccinated against COVID'
});
console.log(result);