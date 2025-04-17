import { selvedge } from '../src';

// Enable debug logs
selvedge.debug("*");

// Configure models
selvedge.models({
  gpt4: selvedge.openai('gpt-4')
});

async function main() {
  console.log('Creating program with debug...');
  const program = selvedge.program`
    /**
     * Create a simple function that adds two numbers.
     */
  `.debug({
    showPrompt: true,
    showIterations: true,
    explanations: true
  });
  
  console.log('Debug config after debug():', program._debugConfig);
  
  console.log('Applying returns()...');
  const typedProgram = program.returns<(a: number, b: number) => number>();
  
  console.log('Debug config after returns():', typedProgram._debugConfig);
  
  console.log('Applying using()...');
  const finalProgram = typedProgram.using('gpt4');
  
  console.log('Debug config after using():', finalProgram._debugConfig);
}

main().catch(console.error);
