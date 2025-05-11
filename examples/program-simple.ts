import { selvedge as s } from '../src';

s.debug('*');

s.models({
  gpt4: s.openai('gpt-4')
});


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