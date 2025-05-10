import { selvedge as s } from '../src';

// s.debug('*');

// ------------------------------------------------------------------
// 0. Configure models
// ------------------------------------------------------------------
s.models({
  gpt4: s.openai('gpt-4')
});

// ------------------------------------------------------------------
// 1. Define a program
//    Program input  : number
//    Program output : number
// ------------------------------------------------------------------
const double = s.program`
    write a typescript function that doubles a number 
    ${x => x} and returns the result
  `
  .inputs(s.schema.shape({ x: s.schema.number() }))
  .outputs(s.schema.shape({ result: s.schema.number() }))
  .using('gpt4')
  .options({forceRegenerate: true})
  .persist('program-structured-1');
  
const result = await double({ x: 2 });
console.log(result);