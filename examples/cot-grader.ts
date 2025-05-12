import { selvedge as s } from '../src/lib/core';

s.debug('*');

s.models({
  gpt4: s.openai('gpt-4')
});

const judge = s.ChainOfThought`
  You are a strict grader.

  Given:
  - question: ${ q => q.question }
  - answer:   ${ q => q.response }
  - truth:    ${ q => q.ground_truth }

  Grade the answer as:
    • perfect : answer === truth
    • partial : answer is related but not exactly truth
    • poor    : answer is wrong or unrelated
`
.inputs({
  q: s.schema.shape({
    question: s.schema.string(),
    response: s.schema.string(),
    ground_truth: s.schema.string()
  })
})
.outputs({
  correctness: s.schema.enumerated(['perfect', 'partial', 'poor'])
})
.using('gpt4')               // or any alias you registered to GPT-4-level model
.options({ temperature: 0 }); // make the grading deterministic

const result = await judge.execute({
  q: {
    question: 'who wrote the iliad?',
    response: 'homer',
    ground_truth: 'homer'
  }
});

console.log(result);