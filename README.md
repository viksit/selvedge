# Selvedge: A TypeScript DSL for LLM Programming

Selvedge is a TypeScript Domain-Specific Language (DSL) for creating robust, type-safe interactions with Large Language Models (LLMs). It provides a consistent, structured approach to AI programming that eliminates boilerplate and brings predictability to generative AI workflows.

*Selvedge is named after the distinctive finished edge on premium denim jeans that prevents fraying. It rethinks how to write computer programs with LLMs in a consistent way*

## Program through intention, not implementation

Selvedge creates a consistent interface for working with language models, allowing you to:

- Write specifications that LLMs translate into working code
- Define typed prompts that generate predictable data structures
- Compose both into robust processing pipelines

This structured approach eliminates the chaos of prompt engineering and the tedium of boilerplate code. You focus on what you want to accomplish, and Selvedge creates the bridge between your intentions and executable solutions.

```typescript
// Describe the task 
const summarize = selvedge.prompt`Summarize this text: ${text => text}`;
// Execute the task (internally calls an LLM and gives you back a result)
const summary = await summarize.execute({ text: article });

// Describe the task
const analyzer = await selvedge.program`
  /** Analyze sentiment in text, return score from -1 to 1 */
`.build(); // creates a typescript function that you can call
const score = analyzer(customerReview);
```

## Installation

### coming soon (npm integration, for now please just clone this repo)
```bash
npm install selvedge
# or
yarn add selvedge
# or 
bun add selvedge
```

## Setup

Before using Selvedge, you need to set up your API keys and register the models you want to use. Just store the API keys in environment variables and you're good to go.
```
.env
ANTHROPIC_API_KEY=your_api_key_here
OPENAI_API_KEY=your_api_key_here
```

```typescript
import { selvedge } from 'selvedge';

// Register models with aliases
selvedge.models({
  fast: selvedge.openai('gpt-3.5-turbo'),
  smart: selvedge.anthropic('claude-3-5-haiku-20241022'),
  // For testing without API calls to run through pipelines
  // Experimental
  mock: selvedge.mock('test-model')
});
```

## Prompts

Prompts are the simplest way to interact with LLMs. They provide a template-based approach to creating natural language interactions.

### Simple Prompt Example

This example shows a basic prompt to summarize text:

```typescript
import { selvedge } from 'selvedge';

// Register a model
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022')
});

// Create a simple prompt template
const summarize = selvedge.prompt`
  Summarize this text in one sentence: ${text => text}
`.using('claude');

// Use the prompt
const text = "This article examines potential regulatory pathways for AI in the United States...";
const result = await summarize.execute({ text });
console.log("Summary:", result);
```

### Intermediate Prompt Example with Type Safety

Selvedge supports Zod-based type introspection, allowing you to create type-safe prompts:

```typescript
import { selvedge } from 'selvedge';

// Register models
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

// Define a type for the sentiment analysis result
interface SentimentResult {
  score: number;        // Score from -1.0 to 1.0
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;   // From 0.0 to 1.0
}

// Create a type-safe prompt template
const analyzeSentiment = selvedge.prompt`
  Analyze the sentiment in this text: ${text => text}
  
  Respond with a JSON object containing:
  - score: a number from -1.0 (negative) to 1.0 (positive)
  - label: one of "positive", "negative", or "neutral"
  - confidence: a number from 0.0 to 1.0 indicating confidence
`.returns<SentimentResult>().using('gpt4');

// Example usage
async function analyzeReviews() {
  const reviews = [
    "I absolutely loved this product! It's the best purchase I've made all year.",
    "It was okay, but not worth the price. Wouldn't recommend.",
    "This is the worst product I've ever bought. Stay away!"
  ];
  
  for (const review of reviews) {
    const result = await analyzeSentiment.execute({ text: review });
    
    // Type-safe access to properties
    console.log(`Review: "${review.substring(0, 30)}..."`);
    console.log(`  Sentiment: ${result.label} (${result.score.toFixed(2)})`);
    console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log();
  }
}

analyzeReviews().catch(console.error);
```

### Advanced Prompt Features

Selvedge prompts offer additional features for complex use cases:

```typescript
import { selvedge } from 'selvedge';

// Set up models
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022')
});

// Define a complex product review type
interface ProductReview {
  summary: string;
  pros: string[];
  cons: string[];
  rating: number;  // 1-5 scale
  recommendation: 'recommended' | 'not_recommended' | 'neutral';
}

// Create a template with multiple variables
const analyzeReview = selvedge.prompt`
  Analyze this product review for a ${product => product}:
  
  REVIEW:
  ${review => review}
  
  PRICE POINT:
  ${price => price}
  
  Provide a structured analysis including a brief summary, pros, cons, 
  numerical rating (1-5), and whether you'd recommend the product.
`
  // Add a prefix to the template
  .prefix("You are a professional product reviewer with expertise in consumer electronics.\n\n")

  // Specify the return type
  .returns<ProductReview>()

  // Add training examples for few-shot learning
  .train([
    {
      text: {
        product: "wireless headphones",
        review: "These headphones have amazing sound quality and the battery lasts forever. The noise cancellation is top-notch. However, they're a bit tight on my head after a few hours.",
        price: "$299"
      },
      output: {
        summary: "High-quality wireless headphones with excellent sound and battery life, but may be uncomfortable for extended wear.",
        pros: ["Amazing sound quality", "Long battery life", "Effective noise cancellation"],
        cons: ["Uncomfortable for extended wear"],
        rating: 4.5,
        recommendation: "recommended"
      }
    }
  ])
  // Use the Claude model
  .using("claude");

// Save the prompt for reuse
await analyzeReview.save('product-review-analyzer');

// Later, load the saved prompt
const loadedAnalyzer = await selvedge.loadPrompt<ProductReview>('product-review-analyzer');
```

## Programs

Programs allow you to generate code from natural language descriptions, giving you reusable functions that can be integrated into your applications.

### Simple Program Example

```typescript
import { selvedge } from 'selvedge';

// Register a model
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022')
});

// Create a program to extract word frequencies
const frequencyCounter = selvedge.program`
/** 
 * Given some text, extract the frequency of each word
 * 
 * @param text - the text to analyze
 * @returns an object containing the frequency of each word in the text
 */

`.returns<{ [word: string]: number }>()
  .using("claude")
  .persist('word-frequency');

// Build and use the function
async function analyzeText() {
  // This will generate the function only once and save it
  const countWords = await frequencyCounter.build();
  
  const sampleText = "This is a test. This is only a test.";
  const result = countWords(sampleText);
  
  console.log("Word frequencies:", result);
  // Output: { this: 2, is: 2, a: 2, test: 2, only: 1 }
}

analyzeText().catch(console.error);
```

### Intermediate Program Example for Reviews

Using a product review analyzer, similar to the one from our prompt examples:

```typescript
import { selvedge } from 'selvedge';

// Register a model
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022')
});

// Define types for analyzing reviews
interface Review {
  text: string;
  rating: number;
  date: string;
}

interface ReviewAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  topics: string[];
  keyPhrases: string[];
  summary: string;
}

// Create a program to analyze reviews
const reviewAnalyzer = selvedge.program`
/**
 * Analyze a product review to extract sentiment, topics, and key phrases
 * 
 * @param review - Object containing the review text, rating, and date
 * @returns A structured analysis of the review
 */
`.withExamples([
  {
    input: { 
      review: {
        text: "This wireless charger works great with my phone. Fast charging and the design looks sleek on my desk. A bit pricey though.",
        rating: 4,
        date: "2024-02-15"
      }
    },
    output: JSON.stringify({
      sentiment: "positive",
      topics: ["charging speed", "design", "price"],
      keyPhrases: ["works great", "fast charging", "sleek", "bit pricey"],
      summary: "Positive review highlighting fast charging and good design, with minor concern about price."
    })
  }
])
.returns<ReviewAnalysis>()
.using("claude")
.persist('review-analyzer');

// Use the program
async function analyzeProductReviews() {
  // Generate the function
  const analyze = await reviewAnalyzer.build();
  
  // Sample reviews
  const reviews: Review[] = [
    {
      text: "I've had this laptop for a month now and it's fantastic. Battery lasts all day, screen is crystal clear, and it's lightning fast. Best purchase I've made this year.",
      rating: 5,
      date: "2024-03-10"
    },
    {
      text: "The camera quality is decent, but the app crashes constantly. Customer service wasn't helpful at all when I reached out. Save your money.",
      rating: 2,
      date: "2024-02-28"
    }
  ];
  
  // Analyze each review
  for (const review of reviews) {
    const analysis = analyze(review);
    
    console.log(`Review: "${review.text.substring(0, 30)}..."`);
    console.log(`Sentiment: ${analysis.sentiment}`);
    console.log(`Topics: ${analysis.topics.join(', ')}`);
    console.log(`Summary: ${analysis.summary}`);
    console.log();
  }
}

analyzeProductReviews().catch(console.error);
```

## Flows

Flows allow you to chain multiple prompts and programs together to create complex pipelines of AI processing.

### Simple Flow Example with Prompts

```typescript
import { selvedge } from 'selvedge';

// Register a model
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022')
});

// Create two simple prompts
const extractKeyPoints = selvedge.prompt`
  Extract the key points from this text:
  ${text => text}
  
  Return a JSON array of strings, with each string being a key point.
`.returns<string[]>().using("claude");

const summarize = selvedge.prompt`
  Create a one paragraph summary based on these key points:
  ${points => JSON.stringify(points, null, 2)}
`.using("claude");

// Create a flow that chains these prompts
const analyzeTextFlow = selvedge.flow([
  // First step: extract key points from input text
  async (input: { text: string }) => {
    const keyPoints = await extractKeyPoints.execute({ text: input.text });
    return { text: input.text, keyPoints };
  },
  // Second step: summarize the key points
  async (input: { text: string, keyPoints: string[] }) => {
    const summary = await summarize.execute({ points: input.keyPoints });
    return { text: input.text, keyPoints: input.keyPoints, summary };
  }
]);

// Use the flow
async function processArticle() {
  const article = "AI regulation is becoming increasingly important as these technologies become more widespread...";
  
  const result = await analyzeTextFlow({ text: article });
  
  console.log("Original text:", result.text.substring(0, 30) + "...");
  console.log("Key points:", result.keyPoints);
  console.log("Summary:", result.summary);
}

processArticle().catch(console.error);
```

### Intermediate Flow Example with Programs

```typescript
import { selvedge } from 'selvedge';

// Register models
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022')
});

// Define types
interface Product {
  title: string;
  price: number;
  description: string;
  features: string[];
}

interface EnrichedProduct extends Product {
  category: string;
  targetAudience: string;
  competitiveAdvantage: string;
}

// 1. Create a program to extract product info from HTML
const extractProduct = selvedge.program`
/**
 * Extract product information from HTML using string methods.
 * 
 * @param {string} html - HTML string from a product page
 * @returns {object} - Basic product information
 */
`.returns<Product>()
  .using('claude')
  .persist('product-extractor');

// 2. Create a prompt to enrich product data
const enrichProduct = selvedge.prompt`
Analyze the following product information and enrich it with:
1. The most appropriate product category
2. The target audience for this product
3. The main competitive advantage

Product: ${params => JSON.stringify(params.product, null, 2)}

Provide your response as a JSON object with the original product data plus the new fields.
`.returns<EnrichedProduct>()
  .using('claude');

// 3. Create a flow that processes products
const productProcessingFlow = selvedge.flow([
  // Extract product info from HTML
  async (input: { html: string }) => {
    const extractor = await extractProduct.build();
    const product = extractor(input.html);
    return { html: input.html, product };
  },
  
  // Enrich the product data
  async (input: { html: string, product: Product }) => {
    const enriched = await enrichProduct.execute({ product: input.product });
    return { html: input.html, product: input.product, enriched };
  },
  
  // Final processing step (could add more)
  (input: { html: string, product: Product, enriched: EnrichedProduct }) => {
    return {
      originalProduct: input.product,
      enrichedProduct: input.enriched,
      // Additional info or processing could go here
      processedAt: new Date().toISOString()
    };
  }
]);

// Use the flow
async function processProductPage() {
  // Sample product HTML
  const productHTML = `
    <div class="product">
      <h1 class="title">Wireless Noise-Cancelling Headphones</h1>
      <div class="price">$249.99</div>
      <p class="description">Premium wireless headphones with active noise cancellation, 30-hour battery life.</p>
      <ul class="features">
        <li>Active noise cancellation</li>
        <li>30-hour battery life</li>
        <li>Bluetooth 5.0</li>
      </ul>
    </div>
  `;
  
  const result = await productProcessingFlow({ html: productHTML });
  
  console.log("Original Product:", result.originalProduct);
  console.log("Enriched Product:", result.enrichedProduct);
}

processProductPage().catch(console.error);
```

### Advanced Flow Example with Prompts and Programs

This example combines multiple prompts and programs in a complex processing flow:

```typescript
import { selvedge } from 'selvedge';

// Register models
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});

// 1. Define types
interface NewsArticle {
  title: string;
  content: string;
  date: string;
  source: string;
}

interface EntityMention {
  entity: string;
  type: 'person' | 'organization' | 'location' | 'date' | 'other';
  count: number;
  sentiment: number; // -1.0 to 1.0
}

interface ArticleAnalysis {
  summary: string;
  topics: string[];
  keyEntities: EntityMention[];
  sentiment: number;
  bias: 'left' | 'right' | 'center' | 'unknown';
}

interface FinalReport {
  article: NewsArticle;
  analysis: ArticleAnalysis;
  visualData: any; // For simplicity, could be more specific
  recommendations: string[];
}

// 2. Create programs and prompts

// Program to extract entities and count mentions
const entityExtractor = selvedge.program`
/**
 * Extract named entities from text and count their occurrences
 * 
 * @param {string} text - The text to analyze
 * @returns {Array<EntityMention>} Array of entity mentions with counts and types
 */
`.returns<EntityMention[]>()
  .using('claude')
  .persist('entity-extractor');

// Prompt for article summarization
const summarizeArticle = selvedge.prompt`
Summarize this news article in 2-3 sentences:

TITLE: ${article => article.title}

CONTENT: ${article => article.content}

Provide only the summary text, no additional comments.
`.using('claude');

// Prompt for topic extraction
const extractTopics = selvedge.prompt`
Extract the main topics from this news article:

TITLE: ${article => article.title}

CONTENT: ${article => article.content}

Return a JSON array of strings, with each string being a topic.
`.returns<string[]>().using('gpt4');

// Prompt for bias analysis
const analyzeBias = selvedge.prompt`
Analyze the potential political bias in this news article:

TITLE: ${article => article.title}

CONTENT: ${article => article.content}

Classify as 'left', 'right', 'center', or 'unknown'.
Include a brief explanation of your reasoning.

Return a JSON object with "bias" and "explanation" fields.
`.returns<{bias: 'left' | 'right' | 'center' | 'unknown', explanation: string}>()
  .using('gpt4');

// Program to generate recommendations
const recommendationGenerator = selvedge.program`
/**
 * Generate reading recommendations based on article analysis
 * 
 * @param {ArticleAnalysis} analysis - Analysis of the article
 * @param {string} bias - Detected bias of the article
 * @returns {string[]} Array of recommendations
 */
`.returns<string[]>()
  .using('claude')
  .persist('recommendation-generator');

// 3. Create the flow
const newsAnalysisFlow = selvedge.flow([
  // Step 1: Basic extraction and summarization
  async (input: { article: NewsArticle }) => {
    const article = input.article;
    
    // Run these in parallel
    const [summary, topics, entities] = await Promise.all([
      summarizeArticle.execute({ article }),
      extractTopics.execute({ article }),
      entityExtractor.build().then(extract => extract(article.content))
    ]);
    
    return {
      article,
      partialAnalysis: {
        summary,
        topics,
        entities
      }
    };
  },
  
  // Step 2: Bias analysis
  async (input) => {
    const { article, partialAnalysis } = input;
    
    // Analyze bias
    const biasResult = await analyzeBias.execute({ article });
    
    // Calculate overall sentiment from entity sentiments
    const entitySentiments = partialAnalysis.entities.map(e => e.sentiment);
    const avgSentiment = entitySentiments.length > 0 
      ? entitySentiments.reduce((a, b) => a + b, 0) / entitySentiments.length 
      : 0;
    
    // Complete the analysis
    const analysis: ArticleAnalysis = {
      summary: partialAnalysis.summary,
      topics: partialAnalysis.topics,
      keyEntities: partialAnalysis.entities.sort((a, b) => b.count - a.count).slice(0, 10),
      sentiment: avgSentiment,
      bias: biasResult.bias
    };
    
    return {
      article,
      analysis,
      biasExplanation: biasResult.explanation
    };
  },
  
  // Step 3: Generate recommendations and prepare final report
  async (input) => {
    const { article, analysis, biasExplanation } = input;
    
    // Generate recommendations based on analysis
    const recommendationGen = await recommendationGenerator.build();
    const recommendations = recommendationGen(analysis, analysis.bias);
    
    // Prepare visualization data (in a real app, this would be more complex)
    const visualData = {
      entityDistribution: analysis.keyEntities.map(e => ({ 
        name: e.entity, 
        type: e.type, 
        count: e.count 
      })),
      sentimentScore: analysis.sentiment,
      topicCloud: analysis.topics.map(t => ({ text: t, value: 1 }))
    };
    
    // Construct final report
    const finalReport: FinalReport = {
      article,
      analysis,
      visualData,
      recommendations
    };
    
    return finalReport;
  }
]);

// 4. Use the flow
async function analyzeNewsArticle() {
  // Sample article
  const article: NewsArticle = {
    title: "Tech Regulation Bill Advances Through Senate Committee",
    content: "A bipartisan bill aimed at regulating major technology companies passed through the Senate Commerce Committee on Thursday with a vote of 15-7. The legislation would require platforms with over 50 million users to implement new data protection measures and provide more transparency around algorithmic decision-making. Tech industry representatives have criticized the bill as potentially stifling innovation, while consumer advocates praise it as a necessary step to protect user privacy. Senator Maria Johnson, the bill's primary sponsor, stated that the legislation strikes 'a careful balance between encouraging technological innovation and protecting consumers.'",
    date: "2024-03-15",
    source: "National Daily News"
  };
  
  // Process the article
  const analysisReport = await newsAnalysisFlow({ article });
  
  // Display results
  console.log("ARTICLE ANALYSIS REPORT");
  console.log("=======================");
  console.log(`Title: ${analysisReport.article.title}`);
  console.log(`Source: ${analysisReport.article.source}`);
  console.log(`Date: ${analysisReport.article.date}`);
  console.log("\nSUMMARY");
  console.log(analysisReport.analysis.summary);
  console.log("\nTOPICS");
  console.log(analysisReport.analysis.topics.join(", "));
  console.log("\nKEY ENTITIES");
  analysisReport.analysis.keyEntities.forEach(entity => {
    console.log(`- ${entity.entity} (${entity.type}): ${entity.count} mentions`);
  });
  console.log("\nSENTIMENT");
  console.log(`Overall: ${analysisReport.analysis.sentiment.toFixed(2)} (-1.0 to 1.0)`);
  console.log("\nPOLITICAL BIAS");
  console.log(`Classification: ${analysisReport.analysis.bias}`);
  console.log("\nRECOMMENDATIONS");
  analysisReport.recommendations.forEach((rec, i) => {
    console.log(`${i+1}. ${rec}`);
  });
}

analyzeNewsArticle().catch(console.error);
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
selvedge.debug('all');

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

