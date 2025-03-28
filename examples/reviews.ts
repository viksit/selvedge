// SELVEDGE - Complete TypeScript DSL
// "Weaving prompts and code into structured, resilient patterns that won't unravel under pressure."

import { selvedge } from 'selvedge';

// ------------- MODEL CONFIGURATION -------------
// Register models with simple names
selvedge.models({
  fast: selvedge.openai("gpt-3.5-turbo"),
  smart: selvedge.anthropic("claude-3-opus"),
  code: selvedge.openai("gpt-4")
});

// ------------- PROGRAM GENERATION -------------
// Define a function to be implemented by an LLM
const extractProduct = selvedge.program`
  /**
   * Extract product information from a review
   * @param {string} review - The customer review text
   * @returns {object} Product details with category and features
   */
  function extractProduct(review) {
    // LLM will implement this
  }
`.examples({
  "The phone has great battery life but the camera is poor":
    { category: "phone", features: ["battery life", "camera"] }
})
  .using("code") // Use code-optimized model
  .persist("product-extractor"); // Save generated implementation

// ------------- PROMPT TEMPLATES -------------
// Create an optimized sentiment analyzer
const sentimentAnalyzer = selvedge.prompt`
  Analyze sentiment in: ${text}
  Rate from -1.0 (negative) to 1.0 (positive)
  Include confidence (0.0-1.0)
`.returns<{ score: number, confidence: number }>()
  .using("smart") // Use smart model
  .train([
    { text: "I love this!", output: { score: 0.9, confidence: 0.95 } },
    { text: "This is awful", output: { score: -0.8, confidence: 0.9 } }
  ])
  .persist("sentiment-v1"); // Save optimized prompt

// Response generator with fast model
const generateResponse = selvedge.prompt`
  Write a response for a ${category} review.
  Sentiment score: ${score}
  Features mentioned: ${features}
`.using("fast"); // Use fast model for responses

// ------------- PIPELINE DEFINITION -------------
// Build a complete review analysis pipeline
const reviewAnalyzer = selvedge.flow(
  // Input validation
  selvedge.validate((input) => {
    if (typeof input !== 'string' || input.length < 10) {
      throw new Error("Review text required (10+ characters)");
    }
    return { text: input };
  }),

  // Parallel processing of product info and sentiment
  selvedge.parallel({
    product: ctx => extractProduct(ctx.text),
    sentiment: ctx => sentimentAnalyzer({ text: ctx.text })
  }),

  // Filter out low-confidence analyses
  selvedge.filter(ctx => ctx.sentiment.confidence >= 0.7),

  // Add additional metadata
  selvedge.enhance(ctx => ({
    ...ctx,
    timestamp: new Date().toISOString(),
    wordCount: ctx.text.split(/\s+/).length
  })),

  // Generate response based on the analysis
  ctx => generateResponse({
    category: ctx.product.category,
    score: ctx.sentiment.score,
    features: ctx.product.features.join(', ')
  }),

  // Format final output
  (response, ctx) => ({
    id: Math.random().toString(36).substring(2, 10),
    original: ctx.text,
    analysis: {
      product: ctx.product,
      sentiment: ctx.sentiment,
      wordCount: ctx.wordCount
    },
    response,
    timestamp: ctx.timestamp
  })
);

// Export pipeline for later use
selvedge.export(reviewAnalyzer, "review-pipeline-v1");

// ------------- PIPELINE USAGE -------------
// Method 1: Direct usage
async function processReview(review) {
  try {
    // Run the pipeline
    const result = await reviewAnalyzer(review);

    // Log the analysis
    console.log(`Analyzed ${result.analysis.product.category} review`);
    console.log(`Sentiment: ${result.analysis.sentiment.score.toFixed(2)}`);

    // Return the result
    return result;
  } catch (error) {
    if (error.message.includes("confidence")) {
      console.warn("Low confidence analysis skipped");
      return null;
    }
    throw error; // Re-throw other errors
  }
}

// Method 2: Batch processing
async function processBatch(reviews) {
  // Process multiple reviews in parallel
  const results = await Promise.all(
    reviews.map(review => reviewAnalyzer(review).catch(() => null))
  );

  // Filter out failed analyses
  return results.filter(Boolean);
}

// Method 3: Loading from storage
async function loadAndRun() {
  // Load the pipeline from storage
  const analyzer = await selvedge.import("review-pipeline-v1");

  // Run the loaded pipeline
  return analyzer("This new phone has amazing battery life but the camera is disappointing");
}

// ------------- PRACTICAL USAGE EXAMPLE -------------
// Option 1: Process a single review
processReview("This new phone has amazing battery life but the camera is disappointing")
  .then(result => {
    // Use the result
    if (result) {
      saveToDatabase(result);
      sendEmailResponse(result.response);
    }
  })
  .catch(err => console.error("Processing failed:", err));

// Option 2: Process a batch of reviews
const reviews = [
  "This laptop is incredibly fast and the screen is crystal clear!",
  "The headphones broke after just two weeks of normal use.",
  "Average product, does what it says but nothing special."
];

processBatch(reviews)
  .then(results => {
    console.log(`Successfully processed ${results.length} of ${reviews.length} reviews`);
    // Generate analytics from batch results
    const avgSentiment = results.reduce((sum, r) => sum + r.analysis.sentiment.score, 0) / results.length;
    console.log(`Average sentiment: ${avgSentiment.toFixed(2)}`);
  });

// Option 3: Scheduled job with loaded pipeline
async function dailyAnalysisJob() {
  const pipeline = await selvedge.import("review-pipeline-v1");
  const todaysReviews = await fetchTodaysReviews();
  const results = await Promise.all(todaysReviews.map(r => pipeline(r).catch(() => null)));
  await generateDailyReport(results.filter(Boolean));
}