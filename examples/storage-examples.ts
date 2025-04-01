/**
 * Examples of using the Selvedge storage and manager functionality
 * 
 * This demonstrates how to save, load, and manage prompts and programs
 * with versioning, metadata, and analytics.
 */
import { selvedge, manager } from '../src';

/**
 * Example 1: Basic storage of prompts and programs
 */
async function basicStorageExample() {
  console.log('\n=== Basic Storage Example ===');
  
  // Create a simple prompt for sentiment analysis
  const sentimentPrompt = selvedge.prompt`
    Analyze the sentiment in this text: ${text => text}
    Rate from -1.0 (negative) to 1.0 (positive)
  `.returns<{ score: number }>();
  
  // Save the prompt with versioning
  await sentimentPrompt.save('sentiment-analyzer');
  console.log('Saved sentiment analyzer prompt');
  
  // Create a simple program for code generation
  const reverseProgram = selvedge.program`
    /**
     * Function to reverse a string
     * @param str - The string to reverse
     * @returns The reversed string
     */
    function reverseString(str: string): string {
      // Your implementation here
      ${implementation => implementation}
    }
  `.withExamples([
    {
      input: { implementation: 'return str.split("").reverse().join("");' },
      output: 'return str.split("").reverse().join("");'
    }
  ]);
  
  // Save the program with versioning
  await reverseProgram.save('string-reverser');
  console.log('Saved string reverser program');
  
  // List all saved items
  const programs = await selvedge.listPrograms();
  const prompts = await selvedge.listPrompts();
  
  console.log(`Saved programs: ${programs.join(', ')}`);
  console.log(`Saved prompts: ${prompts.join(', ')}`);
}

/**
 * Example 2: Loading and using saved items
 */
async function loadingExample() {
  console.log('\n=== Loading Example ===');
  
  // Load the saved prompt
  const sentiment = await selvedge.loadPrompt<{ score: number }>('sentiment-analyzer');
  
  // Use the loaded prompt
  const result = await sentiment.execute({ text: 'I love this library! It makes working with LLMs so much easier.' });
  console.log(`Sentiment score: ${result.score}`);
  
  // Load the saved program
  const reverser = await selvedge.loadProgram('string-reverser');
  
  // Use the loaded program
  const code = await reverser.generate({ implementation: 'return str.split("").reverse().join("");' });
  console.log('Generated code:');
  console.log(code);
}

/**
 * Example 3: Working with versions
 */
async function versioningExample() {
  console.log('\n=== Versioning Example ===');
  
  // Load the sentiment prompt
  const sentiment = await selvedge.loadPrompt('sentiment-analyzer');
  
  // Modify and save a new version
  const enhancedSentiment = sentiment.suffix(`
    Also include a 'confidence' value from 0.0 to 1.0 indicating how confident you are in this assessment.
  `);
  
  await enhancedSentiment.save('sentiment-analyzer');
  console.log('Saved enhanced version of sentiment analyzer');
  
  // List all versions
  const versions = await selvedge.listPromptVersions('sentiment-analyzer');
  console.log(`Available versions: ${versions.join(', ')}`);
  
  // Load a specific version (the original one)
  const originalVersion = await selvedge.loadPrompt('sentiment-analyzer', versions[1]);
  console.log('Loaded original version');
  
  // Load the latest version (enhanced)
  const latestVersion = await selvedge.loadPrompt('sentiment-analyzer');
  console.log('Loaded latest version');
}

/**
 * Example 4: Using the SelvedgeManager for metadata and analytics
 */
async function managerExample() {
  console.log('\n=== Manager Example ===');
  
  // Load a prompt with usage tracking
  const sentiment = await manager.loadPrompt<{ score: number }>('sentiment-analyzer');
  
  // Use it a few times to generate usage data
  await sentiment.execute({ text: 'This is amazing!' });
  await sentiment.execute({ text: 'This is terrible.' });
  await sentiment.execute({ text: 'I feel neutral about this.' });
  
  // Add metadata
  await manager.addTags('prompt', 'sentiment-analyzer', ['nlp', 'analysis', 'sentiment']);
  await manager.setDescription('prompt', 'sentiment-analyzer', 'A prompt for analyzing sentiment in text with confidence scores');
  
  // Get item info with metadata
  const info = await manager.getItemInfo('prompt', 'sentiment-analyzer');
  console.log('Item info:');
  console.log(JSON.stringify(info, null, 2));
  
  // Compare versions
  const versions = await selvedge.listPromptVersions('sentiment-analyzer');
  if (versions.length >= 2) {
    const comparison = await manager.compareVersions('prompt', 'sentiment-analyzer', versions[1], versions[0]);
    console.log('Version comparison:');
    console.log(JSON.stringify(comparison, null, 2));
  }
  
  // List all items with metadata
  const allItems = await manager.listAllItems();
  console.log(`Total items: ${allItems.length}`);
  console.log('Items summary:');
  allItems.forEach(item => {
    console.log(`- ${item.name} (${item.type}): ${item.versionCount} versions, ${item.metadata.useCount} uses`);
  });
}

/**
 * Example 5: Import/Export functionality
 */
async function importExportExample() {
  console.log('\n=== Import/Export Example ===');
  
  // Export a prompt to a file
  const exportPath = './sentiment-analyzer-export.json';
  await manager.exportItem('prompt', 'sentiment-analyzer', exportPath);
  console.log(`Exported sentiment analyzer to ${exportPath}`);
  
  // Import it back with a different name
  const imported = await manager.importItem(exportPath);
  console.log(`Imported as: ${imported.type}/${imported.name} (version: ${imported.version})`);
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await basicStorageExample();
    await loadingExample();
    await versioningExample();
    await managerExample();
    await importExportExample();
    
    console.log('\nAll examples completed successfully!');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run the examples if this file is executed directly
if (require.main === module) {
  runExamples();
}

export { runExamples };
