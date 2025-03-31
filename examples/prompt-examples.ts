/**
 * Selvedge Prompt Examples
 * 
 * This file demonstrates progressively more advanced uses of selvedge.prompt,
 * from simple one-liners to complex templates with type safety, model selection,
 * and training examples.
 * 
 * IMPORTANT: To run these examples, you need to set the appropriate API keys:
 * - For Claude models: Set ANTHROPIC_API_KEY environment variable or provide directly in the code
 * - For OpenAI models: Set OPENAI_API_KEY environment variable or provide directly in the code
 */
import { selvedge } from '../src';

// apiKey: process.env.ANTHROPIC_API_KEY

// Set up models
selvedge.models({
  // Claude models
  claude: {
    ...selvedge.anthropic('claude-3-5-haiku-20241022'),
    config: {
      apiKey: process.env.ANTHROPIC_API_KEY
    }
  },
  // claudeHaiku: selvedge.anthropic('claude-3-haiku'),
  // OpenAI models
  // gpt4: selvedge.openai('gpt-4'),
  //gpt35: selvedge.openai('gpt-3.5-turbo')
});

/**
 * Example 1: Simple one-liner
 * 
 * This is the most basic usage of selvedge.prompt with a single variable.
 */
async function example1() {
  console.log("Example 1: Simple one-liner");
  console.log("---------------------------");

  const summarize = selvedge.prompt`Summarize this text in one sentence: ${text => text}`.using("claude");

  const result = await summarize.execute({
    text: "This article examines potential regulatory pathways for AI in the United States following the Trump administration's 2025 revocation of the Biden-era AI Executive Order. We outline two competing governance scenarios: decentralized state-level regulation (with minimal federal oversight) and centralized federal dominance (through legislative pre-emption). We critically evaluate each model's policy implications, constitutional challenges, and practical trade-offs, particularly regarding innovation and state autonomy. We argue that AI's technological characteristics and context-dependent nature complicate achieving regulatory coherence amid competing federal and state interests. As a result, even under the Trump administration's broader deregulatory agenda, targeted federal intervention may remain necessary."
  });

  console.log("Result:", result);
  console.log("\n");
}

/**
 * Example 2: Type-safe responses
 * 
 * This example shows how to specify the expected return type and parse JSON responses.
 */
async function example2() {
  console.log("Example 2: Type-safe responses");
  console.log("-----------------------------");

  // Define the return type
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
  `.returns<SentimentResult>().using("claude");

  const result = await analyzeSentiment.execute({
    text: "I absolutely love this product! It's the best purchase I've made all year."
  });

  console.log("Sentiment score:", result.score);
  console.log("Sentiment label:", result.label);
  console.log("Confidence:", result.confidence);
  console.log("\n");
}

/**
 * Example 3: Using Claude model with system prompt
 * 
 * This example demonstrates how to use Claude with a system prompt for better control.
 */
async function example3() {
  console.log("Example 3: Using Claude model with system prompt");
  console.log("----------------------------------------------");

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
  const result = await extractEntities.execute(
    {
      text: "Tim Cook announced Apple's new AI strategy at WWDC in San Francisco on June 10, 2024. Google and Microsoft were quick to respond with their own announcements the following week."
    },
    {
      system: "You are an expert at named entity recognition. Extract entities precisely and categorize them correctly.",
      temperature: 0.2 // Lower temperature for more deterministic results
    }
  );

  console.log("Extracted entities:");
  console.log("- People:", result.people);
  console.log("- Organizations:", result.organizations);
  console.log("- Locations:", result.locations);
  console.log("- Dates:", result.dates);
  console.log("\n");
}

/**
 * Example 4: Advanced template with training examples and model selection
 * 
 * This example shows how to create a more complex prompt with:
 * - Multiple variables
 * - Training examples for few-shot learning
 * - Model selection using the .using() method
 * - Prefix and suffix to modify the template
 */
async function example4() {
  console.log("Example 4: Advanced template with training examples and model selection");
  console.log("----------------------------------------------------------------");

  // Define a complex return type
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

    // Add a prefix to the template
    .prefix("You are a professional product reviewer with expertise in consumer electronics.\n\n")

    // Use the Claude Haiku model for faster responses
    .using("claude");

  const result = await analyzeReview.execute({
    product: "smartphone",
    review: "This phone has an incredible camera and the screen is beautiful. Battery life is decent, lasting about a day with heavy use. The processor is lightning fast, but it tends to get hot when gaming. The price seems high compared to similar models on the market.",
    price: "$899"
  });

  console.log("Review Analysis:");
  console.log("Summary:", result.summary);
  console.log("Pros:", result.pros);
  console.log("Cons:", result.cons);
  console.log("Rating:", result.rating, "/ 5");
  console.log("Recommendation:", result.recommendation);
  console.log("\n");
}

/**
 * Example 5: Chaining prompts for multi-step reasoning
 * 
 * This example demonstrates how to chain multiple prompts together
 * to perform complex reasoning tasks in steps.
 */
async function example5() {
  console.log("Example 5: Chaining prompts for multi-step reasoning");
  console.log("--------------------------------------------------");

  // Step 1: Extract key points from a complex text
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

  // Step 1: Extract key points
  const keyPoints = await extractKeyPoints.execute({ text: complexText });
  console.log("Key Points:");
  keyPoints.forEach((point, i) => console.log(`${i + 1}. ${point}`));
  console.log();

  // Step 2: Analyze implications
  const implications = await analyzeImplications.execute({ points: keyPoints });
  console.log("Implications Analysis:");
  Object.entries(implications).forEach(([point, analysis]) => {
    console.log(`Point: ${point}`);
    console.log("  Consequences:", analysis.consequences);
    console.log("  Stakeholders:", analysis.stakeholders);
  });
  console.log();

  // Step 3: Generate recommendations
  const recommendations = await generateRecommendations.execute({ analysis: implications });
  console.log("Strategic Recommendations:");
  recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec.title}`);
    console.log(`   ${rec.description}`);
  });
  console.log("\n");
}

// Run all examples
async function runExamples() {
  console.log("SELVEDGE PROMPT EXAMPLES");
  console.log("=======================\n");

  // Check if API keys are set
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(" ANTHROPIC_API_KEY environment variable is not set. Claude examples will fail.");
    console.warn("Please set your Anthropic API key using:");
    console.warn("export ANTHROPIC_API_KEY=your_api_key_here\n");
  }

  try {
    // await example1();
    await example2();
    // await example3();
    // await example4();
    // await example5();

    console.log("All examples completed successfully!");
  } catch (error) {
    console.error("Error running examples:", error);
  }
}

// Run the examples
runExamples().catch(console.error);
