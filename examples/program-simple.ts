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
    and returns the result
  `
  .inputs(s.schema.number())
  .outputs(s.schema.number())
  .using('gpt4')
  .persist('double-program-4');
  
const result = await double(2);
console.log(result);