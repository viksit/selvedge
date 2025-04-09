# Selvedge: A TypeScript DSL for LLM Programming

Selvedge is a functional toolkit for TypeScript developers that makes working with AI language models simpler and more reliable. Instead of wrestling with unpredictable AI responses and complex API calls, Selvedge gives you a clean, consistent way to integrate AI into your applications.

*Selvedge is named after the distinctive finished edge on premium denim jeans that prevents fraying. It rethinks how to write computer programs with LLMs in a consistent way*

## Program through intention, not implementation

Selvedge creates a consistent interface for working with language models, allowing you to:

- Write specifications that LLMs translate into working code
- Define typed prompts that generate predictable data structures
- Compose both into robust processing pipelines

This structured approach eliminates the chaos of prompt engineering and the tedium of boilerplate code. You focus on what you want to accomplish, and Selvedge creates the bridge between your intentions and executable solutions.

```typescript
// Before using Selvedge, you need to set up your API keys and register the models you want to use. 
// Just store the API keys in environment variables and you're good to go.
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

// Example 1: Sentiment Analysis using callable prompt template
const sentimentAnalyzer = selvedge.prompt`
  Analyze the sentiment in this text: ${text => text}
  Respond with a JSON object containing score (-1.0 to 1.0), label, and confidence.
  Include detailed rationale for the score.
`
  .returns<{ score: number; label: string; confidence: number; rationale: string }>()
  .using("claude")
  .options({ temperature: 0.2 })
  .persist("sentiment-test-1");

// call it directly as a function!
const result = await sentimentAnalyzer({
  text: "I absolutely love this product!"
});
console.log("Sentiment result:", result);


// Example 2: Word Counter using callable program template
const wordCounter = selvedge.program`
    /**
     * Count the frequency of words in a text
     * @param text - The text to analyze
     * @returns An object mapping each word to its frequency
     */
  `
    .returns<{ [word: string]: number }>()
    .using("gpt4")
    .options({ forceRegenerate: false })
    .persist("word-counter-99");

  // Call it directly as a function
  const frequency = await wordCounter("This is a test. This is only a test.");
  console.log("Word frequency:", frequency);

// Example 3: Link both with a flow 
const simpleFlow = selvedge.flow([
  // create a function that returns a sample object to give to sentiment analyzer
  () => ({ text: "I absolutely love this product!" }),
  sentimentAnalyzer,
  // transform for wordcounter
  (result) => (result.rationale),
  wordCounter
]);

// Execute the flow
const flowResult = await simpleFlow({});
console.log("Flow result:", flowResult);
```

## Installation
```bash
npm install selvedge
# or
yarn add selvedge
# or 
bun add selvedge
```


## Best Practices

1. **Type Safety**: Always specify return types with `.returns<T>()` to get type safety.
2. **Error Handling**: Wrap your calls in try/catch blocks for production code.
3. **Model Selection**: Use the appropriate model for the task - GPT-4 for complex reasoning, Claude for structured outputs, etc.
4. **Persistence**: Use `.persist()` and `.save()` to avoid regenerating the same code multiple times.
5. **Environment Variables**: Store your API keys in environment variables.
6. **Testing**: Use mock models for testing to avoid API costs.
7. **Flow Construction**: Build complex flows incrementally, testing each step.

## Command Line Interface

Selvedge includes a CLI for managing your saved prompts and programs. After installation, you can access it using the `selvedge` command:

```bash
# List all saved prompts and programs
selvedge list

# List only prompts or programs
selvedge list --prompts
selvedge list --programs

# Show detailed information with the verbose flag
selvedge list --verbose

# List all versions of a prompt or program
selvedge versions prompt <prompt-name>
selvedge versions program <program-name>

# Show detailed information about a prompt or program
selvedge info prompt <prompt-name>
selvedge info program <program-name>

# Add tags to a prompt or program
selvedge tag <type> <name> <tag1> <tag2> ...
```

## Debugging

Selvedge includes a built-in debug system that helps you understand what's happening under the hood. You can enable debugging globally or for specific namespaces:

```typescript
// Enable debugging for all namespaces
selvedge.debug('*');

// Enable debugging for specific namespaces
selvedge.debug('program,prompt');

// Enable debugging with more control
selvedge.debug({
  enabled: true,
  namespaces: ['program', 'persistence', 'llm']
});
```

Available debug namespaces include:
- `program`: Program generation and execution
- `prompt`: Prompt template rendering and execution
- `persistence`: Storage and retrieval of prompts and programs
- `llm`: LLM API calls and responses
- `flow`: Flow execution and steps
- `formatter`: Object formatting for prompts

When debugging is enabled, you'll see detailed logs prefixed with the namespace:

```
[program] Generating code for program "extract-data"
[llm] Sending request to OpenAI API
[prompt] Rendered prompt: ...
```

