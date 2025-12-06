# Selvedge: A TypeScript DSL for LLM Programming

Selvedge is a functional toolkit for TypeScript developers that makes working with AI language models simpler and more reliable. Instead of wrestling with unpredictable AI responses and complex API calls, Selvedge gives you a clean, consistent way to integrate AI into your applications.

*Selvedge is named after the distinctive finished edge on premium denim jeans that prevents fraying. It rethinks how to write computer programs with LLMs in a consistent way*

## Program through intention, not implementation

Selvedge creates a consistent interface for working with language models, allowing you to:

- Write specifications that LLMs translate into working code
- Define typed prompts that generate predictable data structures
- Compose both into robust processing pipelines

This structured approach eliminates the chaos of prompt engineering and the tedium of boilerplate code. You focus on what you want to accomplish, and Selvedge creates the bridge between your intentions and executable solutions.

See examples/ for how to get started.

## Installation
```bash
npm install selvedge
# or
yarn add selvedge
# or
bun add selvedge
```

## High-level overview

Selvedge is a TypeScript-first DSL that wraps the moving parts of LLM applications—prompt templates, typed schemas, model routing, and orchestration—behind a single `selvedge` namespace. Core capabilities include:

- **Typed prompts** via helpers in `lib/prompts` and `lib/schema`, making model inputs and outputs explicit.
- **Programs** that generate and execute code from specifications in `lib/programs`, allowing intent-driven automation.
- **Flows** that compose prompts, transforms, validators, and filters from `lib/flow` into reusable pipelines.
- **Model registry and providers** in `lib/models` and `lib/providers` to register OpenAI, Anthropic, or mock backends with friendly aliases.
- **Optimization** helpers (e.g., few-shot tuning) in `lib/optimize` to iteratively improve prompts.
- **Storage and management** layers in `lib/storage` and `lib/manager` for sharing state and coordinating runs.

### Architecture at a glance

The library layers are small and composable. At runtime you usually interact with the merged `selvedge` export from `src/index.ts`, while each subsystem stays focused on a single responsibility:

```
                             +--------------------+
                             |  selvedge namespace|
                             |  (src/index.ts)    |
                             +---------+----------+
                                       |
           +---------------------------+----------------------------+
           |                            |                           |
    +------+------+            +--------+--------+          +-------+-------+
    | Prompts &   |            | Programs &      |          | Flow engine   |
    | Schemas     |            | Optimizers      |          | (lib/flow)    |
    | (lib/prompts|            | (lib/programs,  |          | compose steps |
    |  lib/schema)|            |  lib/optimize)  |          | & run filters)|
    +------+------+            +--------+--------+          +-------+-------+
           |                            |                           |
           +----------------------------+---------------------------+
                                       |
                               +-------+-------+
                               | Model registry|
                               | (lib/models & |
                               |  providers)   |
                               +-------+-------+
                                       |
                               +-------+-------+
                               | Storage &     |
                               | Manager       |
                               | (lib/storage, |
                               |  lib/manager) |
                               +---------------+
```

### Common use cases

- Building **structured generation** features where LLM outputs must conform to typed schemas.
- Creating **multi-step reasoning pipelines** that validate, branch, or filter intermediate results.
- Prototyping **agentic behaviors** by turning high-level specifications into executable programs.
- Running **A/B experiments or prompt optimizations** with interchangeable model backends.
- Developing **tests and mocks** for LLM-dependent code paths via the mock provider.

### Quick example

```ts
import selvedge from "selvedge";

// 1) Register models
selvedge.models({
  fast: selvedge.openai("gpt-4o-mini"),
  smart: selvedge.anthropic("claude-3-opus"),
});

// 2) Define a typed prompt template
const summarize = selvedge.prompt<{ text: string }, { bullets: string[] }>`
Summarize the following article into 3 bullet points.
Text: {{text}}
Return JSON with a "bullets" array of strings.
`;

// 3) Compose a flow with validation
const pipeline = selvedge.flow([
  summarize,
  selvedge.validate(({ bullets }) => Array.isArray(bullets) && bullets.length === 3),
]);

// 4) Run the flow against a registered model
const result = await pipeline({ text: "Long-form content" }, { model: "fast" });
console.log(result.bullets);
```
