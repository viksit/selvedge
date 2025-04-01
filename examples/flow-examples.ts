// "Weaving prompts and code into structured, resilient patterns that won't unravel under pressure."

import { selvedge } from '../src';
import { flow, flowWithContext, validate, filter, parallel, transform } from '../src/lib/flow';

// ------------- MODEL CONFIGURATION -------------
// Register models with simple names
selvedge.models({
  fast: selvedge.openai("gpt-3.5-turbo"),
  smart: selvedge.anthropic("claude-3-opus")
});

// ------------- SIMPLE FUNCTIONS FOR EXAMPLES -------------
// Simple text classification function
async function classifyText(text: string): Promise<string> {
  // In a real implementation, this would use an LLM
  if (text.includes('problem') || text.includes('issue') || text.includes('broken')) {
    return 'complaint';
  } else if (text.includes('love') || text.includes('great') || text.includes('amazing')) {
    return 'praise';
  } else if (text.includes('how') || text.includes('what') || text.includes('when')) {
    return 'question';
  } else {
    return 'general';
  }
}

// Simple sentiment analysis function
async function analyzeSentiment(text: string): Promise<{ score: number, confidence: number }> {
  // In a real implementation, this would use an LLM
  let score = 0;
  
  // Simple keyword-based scoring
  const positiveWords = ['good', 'great', 'excellent', 'love', 'amazing', 'wonderful'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'disappointing', 'poor'];
  
  const words = text.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    if (positiveWords.includes(word)) score += 0.2;
    if (negativeWords.includes(word)) score -= 0.2;
  }
  
  // Clamp between -1 and 1
  score = Math.max(-1, Math.min(1, score));
  
  return {
    score,
    confidence: 0.7 + Math.random() * 0.3 // Simulate varying confidence
  };
}

// Simple entity extraction function
async function extractEntities(text: string): Promise<string[]> {
  // In a real implementation, this would use an LLM
  const entities: string[] = [];
  
  // Simple pattern matching
  const productPatterns = [
    /iPhone/i, /Android/i, /laptop/i, /computer/i, /TV/i, /headphones/i,
    /camera/i, /speaker/i, /watch/i, /tablet/i
  ];
  
  for (const pattern of productPatterns) {
    const match = text.match(pattern);
    if (match) entities.push(match[0]);
  }
  
  return entities;
}

// Simple response generation function
async function generateResponse(category: string, sentiment: number): Promise<string> {
  // In a real implementation, this would use an LLM
  if (category === 'complaint' && sentiment < 0) {
    return "We're sorry to hear about your negative experience. Our support team will reach out to help resolve this issue.";
  } else if (category === 'praise' && sentiment > 0) {
    return "Thank you for your kind words! We're delighted to hear you're enjoying our product.";
  } else if (category === 'question') {
    return "Thank you for your question. Our support team will get back to you with an answer shortly.";
  } else {
    return "Thank you for your feedback. We appreciate you taking the time to share your thoughts.";
  }
}

// ------------- FLOW EXAMPLES -------------

// ------------- EXAMPLE 1: SIMPLE FUNCTION COMPOSITION -------------
// The most basic flow - just a sequence of functions
console.log("EXAMPLE 1: SIMPLE FUNCTION COMPOSITION");

const simpleFlow = flow<string, string>(
  // Each step takes the output of the previous step as input
  async (text: string) => classifyText(text),
  async (category: string) => `Category: ${category}`
);

// Usage
async function runSimpleFlow() {
  const result = await simpleFlow("I love your product, it's amazing!");
  console.log(result); // Output: Category: praise
}

// ------------- EXAMPLE 2: FLOW WITH TYPE SAFETY -------------
// Flow with proper TypeScript types
console.log("\nEXAMPLE 2: FLOW WITH TYPE SAFETY");

interface SentimentResult {
  score: number;
  confidence: number;
}

interface ClassificationResult {
  category: string;
  sentiment: SentimentResult;
}

const typedFlow = flow<string, ClassificationResult>(
  // Each function's input/output types are checked by TypeScript
  async (text: string): Promise<string> => classifyText(text),
  async (category: string): Promise<ClassificationResult> => {
    const sentiment = await analyzeSentiment(category);
    return { category, sentiment };
  }
);

// Usage
async function runTypedFlow() {
  const result = await typedFlow("I have a question about my order");
  console.log(`Category: ${result.category}`);
  console.log(`Sentiment: ${result.sentiment.score.toFixed(2)} (${result.sentiment.confidence.toFixed(2)} confidence)`);
}

// ------------- EXAMPLE 3: FLOW WITH BUILT-IN OPERATIONS -------------
// Flow using the built-in utility functions
console.log("\nEXAMPLE 3: FLOW WITH BUILT-IN OPERATIONS");

const utilityFlow = flow<string, { category: string, sentiment: SentimentResult, response: string }>(
  // Input validation
  validate((text: string) => {
    if (!text || text.length < 5) throw new Error("Text too short");
    return text;
  }),
  
  // Parallel execution of classification and sentiment analysis
  parallel({
    category: (text: string) => classifyText(text),
    sentiment: (text: string) => analyzeSentiment(text)
  }),
  
  // Filter out low-confidence results
  filter(result => result.sentiment.confidence >= 0.8),
  
  // Transform the result into the final output
  transform(result => ({
    ...result,
    response: generateResponse(result.category, result.sentiment.score)
  }))
);

// Usage
async function runUtilityFlow() {
  try {
    const result = await utilityFlow("I'm having a problem with my new iPhone, it keeps crashing");
    console.log(`Category: ${result.category}`);
    console.log(`Sentiment: ${result.sentiment.score.toFixed(2)}`);
    console.log(`Response: ${result.response}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
  }
}

// ------------- EXAMPLE 4: FLOW WITH CONTEXT PRESERVATION -------------
// Flow that preserves context between steps
console.log("\nEXAMPLE 4: FLOW WITH CONTEXT PRESERVATION");

interface AnalysisContext {
  original: string;
  timestamp: string;
  wordCount: number;
}

const contextFlow = flowWithContext<string, { summary: string, entities: string[], response: string }>(
  // Initial context creation
  (text, ctx) => {
    // Add metadata to the context
    ctx.original = text;
    ctx.timestamp = new Date().toISOString();
    ctx.wordCount = text.split(/\s+/).length;
    
    // Return the text for the next step
    return text;
  },
  
  // Process the text and add results to context
  async (text, ctx) => {
    const category = await classifyText(text);
    const sentiment = await analyzeSentiment(text);
    const entities = await extractEntities(text);
    
    // Return structured data for the next step
    return {
      category,
      sentiment,
      entities
    };
  },
  
  // Generate a response using data from previous steps
  async (analysis, ctx) => {
    const response = await generateResponse(analysis.category, analysis.sentiment.score);
    
    // Create a summary using context information
    const summary = `${analysis.category.toUpperCase()} (${analysis.sentiment.score.toFixed(2)}) - ${ctx.wordCount} words`;
    
    // Return the final result
    return {
      summary,
      entities: analysis.entities,
      response
    };
  }
);

// Usage
async function runContextFlow() {
  const result = await contextFlow("I love my new iPhone 14, the camera is amazing!");
  console.log(`Summary: ${result.summary}`);
  console.log(`Entities: ${result.entities.join(', ')}`);
  console.log(`Response: ${result.response}`);
}

// ------------- EXAMPLE 5: FLOW WITH STORAGE INTEGRATION -------------
// Flow that can be saved and loaded
console.log("\nEXAMPLE 5: FLOW WITH STORAGE INTEGRATION");

const storableFlow = flow<string, { category: string, response: string }>(
  async (text: string) => {
    const category = await classifyText(text);
    const sentiment = await analyzeSentiment(text);
    return { text, category, sentiment };
  },
  async (data) => {
    const response = await generateResponse(data.category, data.sentiment.score);
    return { category: data.category, response };
  }
)
.describe("A simple text classification and response flow")
.tag("classification", "response", "demo");

// Usage
async function saveAndLoadFlow() {
  // Save the flow
  const version = await storableFlow.save("text-classifier");
  console.log(`Saved flow as version: ${version}`);
  
  // In a real implementation, we would load and use the flow
  // const loadedFlow = await selvedge.loadFlow<string, { category: string, response: string }>("text-classifier");
  // const result = await loadedFlow("I have a question about my order");
}

// ------------- RUN ALL EXAMPLES -------------
async function runAllExamples() {
  await runSimpleFlow();
  await runTypedFlow();
  await runUtilityFlow();
  await runContextFlow();
  await saveAndLoadFlow();
}

runAllExamples().catch(console.error);
