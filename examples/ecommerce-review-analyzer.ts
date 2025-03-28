/**
 * E-commerce Review Analyzer Example
 * 
 * This example demonstrates how to use the selvedge library to:
 * 1. Extract product information from reviews using program generation
 * 2. Analyze sentiment using prompt templates
 * 3. Generate improvement suggestions based on negative reviews
 */
import { selvedge } from '../src';
import { ModelRegistry } from '../src/lib/models';

// ------------- MODEL CONFIGURATION -------------
// Register models with simple names
selvedge.models({
  fast: selvedge.mock('fast-model'),
  smart: selvedge.mock('smart-model'),
  code: selvedge.mock('code-model')
});

// Set up mock responses for demonstration
setupMockResponses();

// ------------- PROGRAM GENERATION -------------
// Create a program to extract product details from reviews
const extractProductInfo = selvedge.program`
  /**
   * Extract product information from a customer review
   * @param {string} review - The customer review text
   * @returns {object} Product details including category, features mentioned, and price indicators
   */
  function extractProductInfo(review) {
    // Implement logic to extract product information
  }
`.examples({
  "I love this phone! The battery lasts all day and the camera quality is excellent. Worth every penny of the $899 I paid.": 
    { 
      category: "phone", 
      features: ["battery life", "camera quality"],
      priceIndicators: { mentioned: true, value: 899, currency: "USD" }
    },
  "This laptop is too expensive for what it offers. The screen is nice but it runs hot and the keyboard feels cheap.": 
    { 
      category: "laptop", 
      features: ["screen", "temperature", "keyboard"],
      priceIndicators: { mentioned: true, value: null, currency: null }
    }
})
.using("code")
.persist("product-extractor");

// ------------- PROMPT TEMPLATES -------------
// Create a sentiment analyzer with training examples
const sentimentAnalyzer = selvedge.prompt`
Analyze the sentiment in this product review:
${review => review}

Provide a sentiment score from -1.0 (extremely negative) to 1.0 (extremely positive).
Also include key positive and negative points mentioned.
`.returns<{
  sentiment: {
    score: number;
    label: 'negative' | 'neutral' | 'positive';
  };
  points: {
    positive: string[];
    negative: string[];
  };
}>()
.train([
  { 
    text: "This product is amazing! I love everything about it.",
    output: {
      sentiment: { score: 0.9, label: 'positive' },
      points: {
        positive: ["amazing product", "loves everything"],
        negative: []
      }
    }
  },
  { 
    text: "Terrible experience. The product broke after one day and customer service was unhelpful.",
    output: {
      sentiment: { score: -0.8, label: 'negative' },
      points: {
        positive: [],
        negative: ["broke after one day", "unhelpful customer service"]
      }
    }
  }
])
.using("smart");

// Create a suggestion generator for negative reviews
const improvementSuggester = selvedge.prompt`
Based on this negative product review:
${review => review}

Generate 3 specific improvement suggestions for the product team.
`.returns<string[]>()
.using("smart");

// ------------- MAIN FUNCTIONALITY -------------
// Function to analyze a batch of reviews
async function analyzeReviews(reviews: string[]) {
  console.log("🛍️ E-commerce Review Analyzer");
  console.log("==========================\n");
  
  interface ReviewResult {
    review: string;
    productInfo: {
      category: string;
      features: string[];
      priceIndicators: {
        mentioned: boolean;
        value: number | null;
        currency: string | null;
      };
    };
    sentimentAnalysis: {
      sentiment: {
        score: number;
        label: 'negative' | 'neutral' | 'positive';
      };
      points: {
        positive: string[];
        negative: string[];
      };
    };
    needsImprovement: boolean;
  }
  
  const results: ReviewResult[] = [];
  
  for (const review of reviews) {
    console.log(`REVIEW: "${review.substring(0, 50)}${review.length > 50 ? '...' : ''}"`);
    
    try {
      // 1. Extract product information
      const productInfoResponse = await extractProductInfo.generate({ review });
      
      // Parse the response if it's a string (it might be returned as a string from the mock adapter)
      let productInfo;
      try {
        if (typeof productInfoResponse === 'string') {
          productInfo = JSON.parse(productInfoResponse);
        } else {
          productInfo = productInfoResponse;
        }
        
        console.log(`\nPRODUCT INFO:`);
        console.log(`- Category: ${productInfo.category || 'unknown'}`);
        console.log(`- Features mentioned: ${(productInfo.features || []).join(', ') || 'none'}`);
      } catch (parseError) {
        console.error(`Error parsing product info: ${parseError}`);
        console.log(`Raw response: ${productInfoResponse}`);
        // Create a default product info object to continue processing
        productInfo = {
          category: "unknown",
          features: [],
          priceIndicators: { mentioned: false, value: null, currency: null }
        };
      }
      
      // 2. Analyze sentiment
      const sentimentAnalysis = await sentimentAnalyzer.execute({ review });
      console.log(`\nSENTIMENT ANALYSIS:`);
      console.log(`- Score: ${sentimentAnalysis.sentiment.score.toFixed(1)} (${sentimentAnalysis.sentiment.label})`);
      
      if (sentimentAnalysis.points.positive.length > 0) {
        console.log(`- Positive points: ${sentimentAnalysis.points.positive.join(', ')}`);
      }
      
      if (sentimentAnalysis.points.negative.length > 0) {
        console.log(`- Negative points: ${sentimentAnalysis.points.negative.join(', ')}`);
      }
      
      // 3. Generate improvement suggestions for negative reviews
      if (sentimentAnalysis.sentiment.score < 0) {
        const suggestions = await improvementSuggester.execute({ review });
        console.log(`\nIMPROVEMENT SUGGESTIONS:`);
        suggestions.forEach((suggestion, i) => {
          console.log(`${i+1}. ${suggestion}`);
        });
      }
      
      // Store results
      results.push({
        review,
        productInfo,
        sentimentAnalysis,
        needsImprovement: sentimentAnalysis.sentiment.score < 0
      });
      
      console.log("\n---------------------------\n");
    } catch (error) {
      console.error(`Error analyzing review: ${error}`);
    }
  }
  
  // Display summary
  const positiveCount = results.filter(r => r.sentimentAnalysis.sentiment.label === 'positive').length;
  const neutralCount = results.filter(r => r.sentimentAnalysis.sentiment.label === 'neutral').length;
  const negativeCount = results.filter(r => r.sentimentAnalysis.sentiment.label === 'negative').length;
  
  console.log("ANALYSIS SUMMARY:");
  console.log(`Total reviews analyzed: ${results.length}`);
  console.log(`Positive reviews: ${positiveCount} (${((positiveCount/results.length)*100).toFixed(1)}%)`);
  console.log(`Neutral reviews: ${neutralCount} (${((neutralCount/results.length)*100).toFixed(1)}%)`);
  console.log(`Negative reviews: ${negativeCount} (${((negativeCount/results.length)*100).toFixed(1)}%)`);
  
  // Group by product category
  const categoryGroups = results.reduce((groups, result) => {
    const category = result.productInfo.category;
    groups[category] = groups[category] || [];
    groups[category].push(result);
    return groups;
  }, {} as Record<string, typeof results>);
  
  console.log("\nCATEGORY BREAKDOWN:");
  for (const [category, items] of Object.entries(categoryGroups)) {
    const avgSentiment = items.reduce((sum, item) => sum + item.sentimentAnalysis.sentiment.score, 0) / items.length;
    console.log(`- ${category}: ${items.length} reviews, avg sentiment: ${avgSentiment.toFixed(1)}`);
  }
}

// Sample reviews for testing
const sampleReviews = [
  "I absolutely love this smartphone! The camera quality is exceptional and the battery lasts all day. The screen is bright and responsive. Best phone I've ever owned.",
  "This laptop is a disappointment. It's slow, overheats easily, and the keyboard feels cheap. Not worth the premium price tag.",
  "The headphones are decent. Sound quality is good but not great. They're comfortable to wear for long periods. Battery life could be better.",
  "Terrible tablet experience. It freezes constantly and the charging port stopped working after just two weeks. Customer service was unhelpful when I tried to get it fixed."
];

// Function to set up mock responses
function setupMockResponses() {
  // Get the mock adapters
  const fastAdapter = ModelRegistry.getAdapter(selvedge.mock('fast-model'));
  const smartAdapter = ModelRegistry.getAdapter(selvedge.mock('smart-model'));
  const codeAdapter = ModelRegistry.getAdapter(selvedge.mock('code-model'));
  
  if (fastAdapter && typeof fastAdapter.setResponses === 'function') {
    fastAdapter.setResponses({
      chat: (messages) => {
        return "Mock response from fast model";
      }
    });
  }
  
  if (codeAdapter && typeof codeAdapter.setResponses === 'function') {
    codeAdapter.setResponses({
      chat: (messages) => {
        const userMessage = messages.find(m => m.role === 'user')?.content || '';
        
        // Extract the review from the user message
        // Look for the review in the INSTRUCTION and INPUT sections
        let review = '';
        
        // First try to find it in the INPUT section which should contain the JSON with the review
        const inputMatch = userMessage.match(/INPUT:\s*\n([\s\S]*?)(?:\n\n|$)/);
        if (inputMatch) {
          try {
            const inputJson = JSON.parse(inputMatch[1]);
            if (inputJson && inputJson.review) {
              review = inputJson.review;
            }
          } catch (e) {
            // If JSON parsing fails, continue with other extraction methods
          }
        }
        
        // If we couldn't extract from INPUT, try to find it directly
        if (!review) {
          const reviewMatch = userMessage.match(/review["']?:\s*["']([^"']+)["']/i);
          if (reviewMatch) {
            review = reviewMatch[1];
          }
        }
        
        console.log("Extracted review for product info:", review.substring(0, 30) + "...");
        
        // Product extraction responses based on the actual review content
        if (review.includes('smartphone') || review.includes('phone')) {
          return `{
            "category": "smartphone",
            "features": ["camera quality", "battery life", "screen"],
            "priceIndicators": { "mentioned": false, "value": null, "currency": null }
          }`;
        } else if (review.includes('laptop')) {
          return `{
            "category": "laptop",
            "features": ["performance", "temperature", "keyboard"],
            "priceIndicators": { "mentioned": true, "value": null, "currency": null }
          }`;
        } else if (review.includes('headphones')) {
          return `{
            "category": "headphones",
            "features": ["sound quality", "comfort", "battery life"],
            "priceIndicators": { "mentioned": false, "value": null, "currency": null }
          }`;
        } else if (review.includes('tablet')) {
          return `{
            "category": "tablet",
            "features": ["stability", "charging port", "customer service"],
            "priceIndicators": { "mentioned": false, "value": null, "currency": null }
          }`;
        } else {
          return `{
            "category": "unknown",
            "features": [],
            "priceIndicators": { "mentioned": false, "value": null, "currency": null }
          }`;
        }
      }
    });
  }
  
  if (smartAdapter && typeof smartAdapter.setResponses === 'function') {
    smartAdapter.setResponses({
      chat: (messages) => {
        const userMessage = messages.find(m => m.role === 'user')?.content || '';
        
        // Extract the review from the user message
        let review = '';
        
        // First try to find it in a specific format
        const directMatch = userMessage.match(/Analyze the sentiment in this product review:\s*\n([\s\S]*?)(?:\n\nProvide|$)/);
        if (directMatch) {
          review = directMatch[1].trim();
        }
        
        // If we couldn't extract directly, try to find it as a variable
        if (!review) {
          const reviewMatch = userMessage.match(/review["']?:\s*["']([^"']+)["']/i);
          if (reviewMatch) {
            review = reviewMatch[1];
          }
        }
        
        console.log("Extracted review for sentiment:", review.substring(0, 30) + "...");
        
        // Sentiment analysis responses
        if (userMessage.includes('Analyze the sentiment')) {
          if (review.includes('love') || review.includes('exceptional') || review.includes('Best')) {
            return JSON.stringify({
              sentiment: { score: 0.9, label: 'positive' },
              points: {
                positive: ["camera quality", "battery life", "responsive screen"],
                negative: []
              }
            });
          } else if (review.includes('disappointment') || review.includes('Terrible') || 
                    review.includes('slow') || review.includes('overheats')) {
            return JSON.stringify({
              sentiment: { score: -0.8, label: 'negative' },
              points: {
                positive: [],
                negative: ["slow performance", "overheating", "cheap keyboard", "freezing issues"]
              }
            });
          } else {
            return JSON.stringify({
              sentiment: { score: 0.2, label: 'neutral' },
              points: {
                positive: ["sound quality", "comfort"],
                negative: ["battery life"]
              }
            });
          }
        }
        
        // Improvement suggestions
        if (userMessage.includes('improvement suggestions')) {
          return JSON.stringify([
            "Improve quality control to address hardware failures",
            "Enhance thermal management to prevent overheating",
            "Provide better training for customer service representatives"
          ]);
        }
        
        return "Default mock response from smart model";
      }
    });
  }
}

// Run the example
analyzeReviews(sampleReviews).catch(console.error);
