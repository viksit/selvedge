/**
 * Review Analyzer Example
 * 
 * This example demonstrates how to use the selvedge prompt template system
 * to analyze product reviews and extract structured information.
 */
import { selvedge } from '../src';

// First, let's register our models
// In a real application, you would use actual OpenAI or Anthropic models
// For this example, we'll use the mock provider for demonstration
selvedge.models({
  // Fast but less accurate model for simple tasks
  fast: selvedge.mock('fast-model'),
  
  // More powerful model for complex analysis
  smart: selvedge.mock('smart-model'),
});

// Define the structure of our analysis result
interface ReviewAnalysis {
  sentiment: {
    score: number;  // -1.0 to 1.0
    label: 'negative' | 'neutral' | 'positive';
  };
  keyPoints: string[];
  suggestedImprovements: string[];
  customerIntent: {
    willBuyAgain: boolean;
    willRecommend: boolean;
  };
}

// Create a template for analyzing reviews
const reviewAnalyzer = selvedge.prompt`
You are a product review analyst. Analyze the following review and extract key information.

REVIEW:
${review => review}

Please provide your analysis in the following JSON format:
{
  "sentiment": {
    "score": <number between -1.0 and 1.0>,
    "label": <"negative", "neutral", or "positive">
  },
  "keyPoints": [
    <list of key points mentioned in the review>
  ],
  "suggestedImprovements": [
    <list of improvements suggested by the reviewer or implied by complaints>
  ],
  "customerIntent": {
    "willBuyAgain": <boolean indicating if the customer seems likely to buy again>,
    "willRecommend": <boolean indicating if the customer seems likely to recommend the product>
  }
}
`.returns<ReviewAnalysis>();

// Function to analyze a batch of reviews
async function analyzeReviews(reviews: string[]): Promise<ReviewAnalysis[]> {
  console.log(`Analyzing ${reviews.length} reviews...`);
  
  const results: ReviewAnalysis[] = [];
  
  for (const review of reviews) {
    try {
      // Use the smart model for complex analysis
      const analysis = await reviewAnalyzer.execute(
        { review }, 
        { 
          model: 'smart',
          temperature: 0.2  // Lower temperature for more consistent results
        }
      );
      
      results.push(analysis);
      console.log(`✅ Analyzed review: "${review.substring(0, 50)}..."`);
      console.log(`   Sentiment: ${analysis.sentiment.label} (${analysis.sentiment.score.toFixed(2)})`);
      console.log(`   Key points: ${analysis.keyPoints.length}`);
      console.log(`   Improvements: ${analysis.suggestedImprovements.length}`);
      console.log();
    } catch (error) {
      console.error(`❌ Error analyzing review: ${error}`);
    }
  }
  
  return results;
}

// Example reviews
const reviews = [
  "I absolutely love this product! The quality is exceptional and it has made my life so much easier. The only improvement I would suggest is adding more color options.",
  
  "Disappointed with my purchase. The item broke after just two weeks of use. Customer service was unhelpful when I tried to get a replacement. Would not recommend.",
  
  "It's okay. Does the job but nothing special. The price seems a bit high for what you get, but it works as advertised. Might buy again if on sale."
];

// When running this example with the mock provider, we need to set up mock responses
// In a real application with actual API keys, this wouldn't be necessary
import { ModelRegistry } from '../src';
import { ModelProvider } from '../src/lib/types';
import { MockModelAdapter } from '../src/lib/providers/mock/mock';

// Get the mock adapter
const mockAdapter = ModelRegistry.getAdapter({
  provider: ModelProvider.MOCK,
  model: 'smart-model'
}) as MockModelAdapter;

// Set up mock responses for each review
mockAdapter.setResponses({
  promptMap: {
    // The keys are the full prompts that will be sent to the model
    // We'll use a function to generate these responses when the example is run
  }
});

// Function to generate mock responses based on the review content
function setupMockResponses() {
  const responses: Record<string, string> = {};
  
  // For each review, create a mock response
  reviews.forEach(review => {
    // Generate the full prompt that will be sent to the model
    const prompt = reviewAnalyzer.render({ review });
    
    // Create a mock response based on the review content
    let mockResponse: ReviewAnalysis;
    
    if (review.includes("love") || review.includes("exceptional")) {
      mockResponse = {
        sentiment: { score: 0.9, label: "positive" },
        keyPoints: ["High quality", "Makes life easier"],
        suggestedImprovements: ["More color options"],
        customerIntent: { willBuyAgain: true, willRecommend: true }
      };
    } else if (review.includes("Disappointed") || review.includes("broke")) {
      mockResponse = {
        sentiment: { score: -0.8, label: "negative" },
        keyPoints: ["Product broke quickly", "Poor customer service"],
        suggestedImprovements: ["Improve durability", "Better customer support"],
        customerIntent: { willBuyAgain: false, willRecommend: false }
      };
    } else {
      mockResponse = {
        sentiment: { score: 0.1, label: "neutral" },
        keyPoints: ["Works as advertised", "Price seems high"],
        suggestedImprovements: ["Lower price", "Add more features"],
        customerIntent: { willBuyAgain: true, willRecommend: false }
      };
    }
    
    // Add the mock response to our map
    responses[prompt] = JSON.stringify(mockResponse);
  });
  
  // Set the responses in the mock adapter
  mockAdapter.setResponses({ promptMap: responses });
}

// Main function to run the example
async function main() {
  console.log("🔍 Review Analyzer Example");
  console.log("==========================\n");
  
  // Set up mock responses
  setupMockResponses();
  
  // Analyze the reviews
  const results = await analyzeReviews(reviews);
  
  // Calculate average sentiment
  const avgSentiment = results.reduce((sum, r) => sum + r.sentiment.score, 0) / results.length;
  
  console.log("==========================");
  console.log(`📊 Analysis Summary:`);
  console.log(`   Reviews analyzed: ${results.length}`);
  console.log(`   Average sentiment: ${avgSentiment.toFixed(2)}`);
  console.log(`   Positive reviews: ${results.filter(r => r.sentiment.label === 'positive').length}`);
  console.log(`   Neutral reviews: ${results.filter(r => r.sentiment.label === 'neutral').length}`);
  console.log(`   Negative reviews: ${results.filter(r => r.sentiment.label === 'negative').length}`);
  
  // Extract all suggested improvements
  const allImprovements = results.flatMap(r => r.suggestedImprovements);
  console.log(`\n🔧 All suggested improvements:`);
  allImprovements.forEach(imp => console.log(`   - ${imp}`));
}

// Run the example
main().catch(console.error);
