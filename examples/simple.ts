import { selvedge } from '../src';

// Register models with aliases
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4'),
});

// console.log("Example of how to list models registered right now")
// const models = selvedge.listModels();
// console.log('Registered models:', models);

console.log("Example 1: Simple prompt");
const textToSummarize = "This article examines potential regulatory pathways for AI in the United States following the Trump administration's 2025 revocation of the Biden-era AI Executive Order. We outline two competing governance scenarios: decentralized state-level regulation (with minimal federal oversight) and centralized federal dominance (through legislative pre-emption). We critically evaluate each model's policy implications, constitutional challenges, and practical trade-offs, particularly regarding innovation and state autonomy. We argue that AI's technological characteristics and context-dependent nature complicate achieving regulatory coherence amid competing federal and state interests. As a result, even under the Trump administration's broader deregulatory agenda, targeted federal intervention may remain necessary.";

const positiveSentiment = "I absolutely love this product! It's the best purchase I've made all year.";

const negativeSentiment = "I absolutely hate this product! It's the worst purchase I've made all year.";


// simple prompt
const summarize = selvedge.prompt`Summarize this text in one sentence: ${text => text}`.using("claude");
const result = await summarize.execute({
  text: textToSummarize
});
console.log("Result:", result);

// type safe prompt
console.log("Example 2: Type safe prompt");

interface SentimentResult {
  score: number;
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
}

const analyzeSentiment = selvedge.prompt`
  Analyze the sentiment in this text: ${text => text}
  
  Respond with a JSON object containing:
  - score: a number from -1.0 (negative) to 1.0 (positive)
  - label: one of "positive", "negative", or "neutral"
  - confidence: a number from 0.0 to 1.0 indicating confidence
`.returns<SentimentResult>().using("gpt4");

const result2 = await analyzeSentiment.execute({
  text: positiveSentiment
});
console.log("Sentiment score:", result2.score);
console.log("Sentiment label:", result2.label);
console.log("Confidence:", result2.confidence);
console.log("\n");

// using a system prompt
console.log("Example 3: Using a system prompt")
const extractEntities = selvedge.prompt`
    Extract the following entities from this text: ${text => text}
    
    - People (names of individuals)
    - Organizations (companies, institutions)
    - Locations (places, cities, countries)
    - Dates (any date references)
    
    Format as JSON with these categories as keys and arrays of strings as values.
  `.returns<{
  people: string[];
  organizations: string[];
  locations: string[];
  dates: string[];
}>().using("claude");

// Use Claude with a system prompt
const result3 = await extractEntities.execute(
  {
    text: "Tim Cook announced Apple's new AI strategy at WWDC in San Francisco on June 10, 2024. Google and Microsoft were quick to respond with their own announcements the following week."
  },
  {
    system: "You are an expert at named entity recognition. Extract entities precisely and categorize them correctly.",
    temperature: 0.2 // Lower temperature for more deterministic results
  }
);

console.log("Extracted entities:");
console.log("- People:", result3.people);
console.log("- Organizations:", result3.organizations);
console.log("- Locations:", result3.locations);
console.log("- Dates:", result3.dates);
console.log("\n");

// advanced template with training examples and model selection
console.log("Example 4: Advanced template with training examples and model selection")
interface ProductReview {
  summary: string;
  pros: string[];
  cons: string[];
  rating: number;
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
  // Use the Claude Haiku model for faster responses
  .using("claude");
const result4 = await analyzeReview.execute({
  product: "smartphone",
  review: "This phone has an incredible camera and the screen is beautiful. Battery life is decent, lasting about a day with heavy use. The processor is lightning fast, but it tends to get hot when gaming. The price seems high compared to similar models on the market.",
  price: "$899"
});

console.log("Review Analysis:");
console.log("Summary:", result4.summary);
console.log("Pros:", result4.pros);
console.log("Cons:", result4.cons);
console.log("Rating:", result4.rating, "/ 5");
console.log("Recommendation:", result4.recommendation);
console.log("\n");

// chaining prompts for multi-step reasoning
console.log("Example 5: Chaining prompts for multi-step reasoning");

const extractKeyPoints = selvedge.prompt`
    Extract the key points from this text:
    ${text => text}
    
    Return a JSON array of strings, with each string being a key point.
  `.returns<string[]>().using("claude");

// Step 2: Analyze the implications of those key points
const analyzeImplications = selvedge.prompt`
    Analyze the implications of these key points:
    ${points => JSON.stringify(points, null, 2)}
    
    For each point, identify potential consequences and stakeholders affected.
    Return as a JSON object where keys are the original points and values are objects
    with "consequences" (array of strings) and "stakeholders" (array of strings).
  `.returns<Record<string, { consequences: string[], stakeholders: string[] }>>().using("claude");

// Step 3: Generate recommendations based on the analysis
const generateRecommendations = selvedge.prompt`
    Based on this analysis:
    ${analysis => JSON.stringify(analysis, null, 2)}
    
    Generate 3-5 strategic recommendations.
    Return as a JSON array of recommendation objects, each with a "title" and "description".
  `.returns<Array<{ title: string, description: string }>>().using("claude");

// Execute the chain
const complexText = `The rapid adoption of artificial intelligence in healthcare is creating new opportunities for diagnosis and treatment, but also raising concerns about privacy, bias, and the doctor-patient relationship. Recent studies show that AI can outperform human radiologists in detecting certain conditions, while other research highlights cases where algorithmic bias led to disparities in care. Meanwhile, regulatory frameworks are struggling to keep pace with the technology, creating uncertainty for healthcare providers and technology companies alike.`;

// here's a simple way to chain prompts.
// Step 1: Extract key points
const keyPointsResult = await extractKeyPoints.execute({ text: complexText });
console.log("Key Points:");
// Check if keyPointsResult is an array, otherwise handle it appropriately
let keyPoints: string[] = [];
if (Array.isArray(keyPointsResult)) {
  keyPoints = keyPointsResult;
  keyPoints.forEach((point, i) => console.log(`${i + 1}. ${point}`));
} else {
  // If it's not an array, log the structure to understand what we're getting
  console.log("Received data structure:", JSON.stringify(keyPointsResult, null, 2));
  // Try to extract points if they're in a different property
  if (keyPointsResult && typeof keyPointsResult === 'object') {
    const possiblePoints = (keyPointsResult as any).keyPoints;
    if (Array.isArray(possiblePoints)) {
      keyPoints = possiblePoints;
      keyPoints.forEach((point, i) => console.log(`${i + 1}. ${point}`));
    } else {
      console.log("Could not find array of key points in the returned data");
    }
  } else {
    console.log("Unexpected data structure returned");
  }
}
console.log();

// Step 2: Analyze implications
const implicationsResult = await analyzeImplications.execute({ points: keyPoints });
console.log("Implications Analysis:");
let implications: Record<string, { consequences: string[], stakeholders: string[] }> = {};
if (implicationsResult && typeof implicationsResult === 'object') {
  implications = implicationsResult as Record<string, { consequences: string[], stakeholders: string[] }>;
  Object.entries(implications).forEach(([point, analysis]) => {
    console.log(`Point: ${point}`);
    console.log("  Consequences:", analysis.consequences);
    console.log("  Stakeholders:", analysis.stakeholders);
  });
} else {
  console.log("Unexpected implications data structure:", JSON.stringify(implicationsResult, null, 2));
}
console.log();

// Step 3: Generate recommendations
const recommendationsResult = await generateRecommendations.execute({ analysis: implications });
console.log("Strategic Recommendations:");
let recommendations: Array<{ title: string, description: string }> = [];
if (Array.isArray(recommendationsResult)) {
  recommendations = recommendationsResult;
  recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec.title}`);
    console.log(`   ${rec.description}`);
  });
} else {
  console.log("Unexpected recommendations data structure:", JSON.stringify(recommendationsResult, null, 2));
  // Try to extract recommendations if they're in a recommendations property
  if (recommendationsResult && typeof recommendationsResult === 'object' && 
      (recommendationsResult as any).recommendations && 
      Array.isArray((recommendationsResult as any).recommendations)) {
    recommendations = (recommendationsResult as any).recommendations;
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec.title}`);
      console.log(`   ${rec.description}`);
    });
  }
}
console.log("\n");

// or we can do something simpler
// use the flow system to chain the prompts we defined above

console.log("Example 6: Using the flow system to chain prompts");

// Create adapter functions that handle the expected data structures
const extractKeyPointsAdapter = async (input: any) => {
  const result = await extractKeyPoints.execute(input);
  // Handle potential nested structure
  if (Array.isArray(result)) {
    return { points: result };
  } else if (result && typeof result === 'object' && (result as any).keyPoints) {
    return { points: (result as any).keyPoints };
  }
  return { points: [] };
};

const analyzeImplicationsAdapter = async (input: any) => {
  // Extract points from the previous step
  const points = input.points || [];
  const result = await analyzeImplications.execute({ points });
  return { analysis: result };
};

const generateRecommendationsAdapter = async (input: any) => {
  // Extract analysis from the previous step
  const analysis = input.analysis || {};
  const result = await generateRecommendations.execute({ analysis });
  
  // Handle potential nested structure
  if (Array.isArray(result)) {
    return result;
  } else if (result && typeof result === 'object' && (result as any).recommendations) {
    return (result as any).recommendations;
  }
  return [];
};

// Create the flow with adapter functions
const analysisFlow = selvedge.flow([
  extractKeyPointsAdapter,
  analyzeImplicationsAdapter,
  generateRecommendationsAdapter
]);

// Execute the flow directly by calling it as a function
const result6 = await analysisFlow({ text: complexText });
console.log("Strategic Recommendations from Flow:");
if (Array.isArray(result6)) {
  result6.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec.title}`);
    console.log(`   ${rec.description}`);
  });
} else {
  console.log("Unexpected flow result:", JSON.stringify(result6, null, 2));
}
console.log("\n");
