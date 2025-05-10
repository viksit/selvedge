import { selvedge as s } from '../src';

s.debug('*');
s.models({
  claude: s.anthropic('claude-3-5-sonnet-20241022')
});

const llmFunction = s.program`
  create a function that takes a user's message and returns a response
  using an LLM. by default use OpenAI, but support other providers too.

  - use only the context of this repository.
  - do not import any libraries that aren't already installed.
  - handle all edge cases.
  - include error and timeout handling using standard JS techniques.
`
.inputs(
  s.schema.shape({
    msg: s.schema.string(),
    provider: s.schema.string(),
    opts: s.schema.shape({})
  })
)
.outputs(
  s.schema.shape({
    response: s.schema.string(),
    tokenCount: s.schema.number()
  })
)
.using('claude')
.options({ temperature: 0.3 })
.persist('llmFunction1');

// Now llmFunction is an actual function we can call
const result = await llmFunction({
  msg: 'whats the capital of rawanda?',
  provider: 'openai',
  opts: {}
});
console.log(result);
