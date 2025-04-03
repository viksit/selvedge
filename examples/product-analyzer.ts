import { selvedge } from '../src';
selvedge.debug('*');

// Sample product pages HTML
const productPage1 = `
<div class="product">
  <h1 class="title">Wireless Noise-Cancelling Headphones</h1>
  <div class="price">$249.99</div>
  <div class="rating">4.7/5 (342 reviews)</div>
  <p class="description">Premium wireless headphones with active noise cancellation, 30-hour battery life, and comfortable over-ear design.</p>
  <ul class="features">
    <li>Active noise cancellation</li>
    <li>30-hour battery life</li>
    <li>Bluetooth 5.0</li>
    <li>Built-in microphone</li>
  </ul>
</div>
`;

const productPage2 = `
<div class="product">
  <h1 class="title">Smart Fitness Watch</h1>
  <div class="price">$199.99</div>
  <div class="rating">4.5/5 (187 reviews)</div>
  <p class="description">Advanced fitness tracker with heart rate monitoring, sleep tracking, and 7-day battery life. Water resistant up to 50m.</p>
  <ul class="features">
    <li>Heart rate monitoring</li>
    <li>Sleep tracking</li>
    <li>Water resistant (50m)</li>
    <li>7-day battery life</li>
  </ul>
</div>
`;

// Define product interface
interface Product {
  title: string;
  price: number;
  rating: number;
  reviewCount: number;
  description: string;
  features: string[];
}

// Interface for enriched product data
interface EnrichedProduct extends Product {
  category: string;
  targetAudience: string;
  competitiveAdvantage: string;
}

// Configure models
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022')
});

// 1. Program to extract product info from HTML
const extractProduct = selvedge.program`
/**
 * Extract product information from HTML using only simple string methods.
 * 
 * REQUIREMENTS:
 * - Use ONLY built-in JavaScript string methods (no DOM, no cheerio, no browser APIs)
 * - Focus on regex and string parsing
 * - Handle potentially malformed HTML gracefully
 * - Extract only basic product details (title, price, rating, etc.)
 * - Keep the function SIMPLE and ERROR-RESISTANT
 * - Avoid complex parsing architectures or frameworks
 * 
 * @param {string} html - HTML string from a product page
 * @returns {object} - Basic product information
 */
`
  .withExamples([
    {
      input: { html: productPage1 },
      output: JSON.stringify({
        title: "Wireless Noise-Cancelling Headphones",
        price: 249.99,
        rating: 4.7,
        reviewCount: 342,
        description: "Premium wireless headphones with active noise cancellation, 30-hour battery life, and comfortable over-ear design.",
        features: [
          "Active noise cancellation",
          "30-hour battery life",
          "Bluetooth 5.0",
          "Built-in microphone"
        ]
      })
    },
    {
      input: { html: productPage2 },
      output: JSON.stringify({
        title: "Smart Fitness Watch",
        price: 199.99,
        rating: 4.5,
        reviewCount: 187,
        description: "Advanced fitness tracker with heart rate monitoring, sleep tracking, and 7-day battery life. Water resistant up to 50m.",
        features: [
          "Heart rate monitoring",
          "Sleep tracking",
          "Water resistant (50m)",
          "7-day battery life"
        ]
      })
    }
  ])
  .returns<Product>()
  .using('claude')
  .persist('product-extractor');

// 2. Prompt to enrich product data
const enrichProduct = selvedge.prompt`
Analyze the following product information and enrich it with:
1. The most appropriate product category
2. The target audience for this product
3. The main competitive advantage

Product: 
${params => {
    const product = params.product;
    return `Title: ${product.title}
Price: ${product.price}
Rating: ${product.rating || 'N/A'}
Review Count: ${product.reviewCount}
Description: ${product.description}
Features: ${product.features.join(', ')}`;
  }}

Provide your response as a JSON object with the original product data plus the new fields (category, targetAudience, and competitiveAdvantage).
`.returns<EnrichedProduct>()
  .using('claude');

// 3. Prompt to compare products
const compareProducts = selvedge.prompt`
Compare these two products and provide a brief recommendation for which one offers better value:

Product 1: ${params => JSON.stringify(params.p1, null, 2)}

Product 2: ${params => JSON.stringify(params.p2, null, 2)}
`.using('claude');

// Step functions for the flow
async function extractProductInfo() {
  console.log("Extracting product information...");
  const extractor = await extractProduct.build({}, { forceRegenerate: false });

  console.log("Function type:", typeof extractor);

  const product1 = extractor(productPage1);
  const product2 = extractor(productPage2);

  console.log("Product 1 extracted:", JSON.stringify(product1, null, 2));
  console.log("Product 2 extracted:", JSON.stringify(product2, null, 2));

  return { product1, product2 };
}

async function enrichProductInfo(input: { product1: Product; product2: Product }) {
  console.log("Enriching product information...");
  console.log("Input to enrichProductInfo:", JSON.stringify(input, null, 2));

  const enriched1 = await enrichProduct.execute({ product: input.product1 });
  const enriched2 = await enrichProduct.execute({ product: input.product2 });

  console.log("Enriched product 1:", JSON.stringify(enriched1, null, 2));
  console.log("Enriched product 2:", JSON.stringify(enriched2, null, 2));

  return { ...input, enriched1, enriched2 };
}

async function compareProductInfo(input: {
  product1: Product;
  product2: Product;
  enriched1: EnrichedProduct;
  enriched2: EnrichedProduct
}) {
  console.log("Comparing products...");
  console.log("Input to compareProductInfo:", JSON.stringify(input, null, 2));

  const comparison = await compareProducts.execute({
    p1: input.enriched1,
    p2: input.enriched2
  });

  return { ...input, comparison };
}

function displayResults(input: {
  product1: Product;
  product2: Product;
  enriched1: EnrichedProduct;
  enriched2: EnrichedProduct;
  comparison: string
}) {
  console.log("\n--- Product Analysis Results ---");
  console.log("\nProduct 1:", input.enriched1.title);
  console.log("Category:", input.enriched1.category);
  console.log("Target Audience:", input.enriched1.targetAudience);

  console.log("\nProduct 2:", input.enriched2.title);
  console.log("Category:", input.enriched2.category);
  console.log("Target Audience:", input.enriched2.targetAudience);

  console.log("\nRecommendation:");
  console.log(input.comparison);

  return input;
}

// Create a flow to process products
const analyzeProducts = selvedge.flow([
  extractProductInfo,
  enrichProductInfo,
  compareProductInfo,
  displayResults
]);

// Execute the flow
analyzeProducts({})
  .then(result => console.log("Flow completed successfully"))
  .catch(error => console.error("Error in flow:", error));
