# Selvedge Storage System

The Selvedge storage system provides versioned persistence for prompts and programs, allowing you to save, load, and manage your LLM assets with rich metadata and analytics.

## Features

- **Versioned Storage**: Every save creates a new version with a unique ID, preserving the history of your prompts and programs
- **Metadata Tracking**: Automatically tracks usage statistics, performance metrics, and custom metadata
- **Analytics**: Compare versions and analyze performance trends
- **Tagging System**: Organize your assets with custom tags and descriptions
- **Import/Export**: Share your prompts and programs with others
- **CLI Interface**: Manage your assets from the command line

## Basic Usage

### Saving Prompts and Programs

```typescript
import { selvedge } from 'selvedge';

// Create and save a prompt
const sentimentPrompt = selvedge.prompt`
  Analyze the sentiment in this text: ${text => text}
  Rate from -1.0 (negative) to 1.0 (positive)
`.returns<{ score: number }>();

// Save with versioning
await sentimentPrompt.save('sentiment-analyzer');

// Create and save a program
const reverseProgram = selvedge.program`
  function reverseString(str) {
    ${implementation => implementation}
  }
`.withExamples([
  {
    input: { implementation: 'return str.split("").reverse().join("");' },
    output: 'return str.split("").reverse().join("");'
  }
]);

// Save with versioning
await reverseProgram.save('string-reverser');
```

### Loading Saved Items

```typescript
// Load the latest version of a prompt
const sentiment = await selvedge.loadPrompt<{ score: number }>('sentiment-analyzer');

// Use the loaded prompt
const result = await sentiment.execute({ text: 'I love this library!' });
console.log(`Sentiment score: ${result.score}`);

// Load the latest version of a program
const reverser = await selvedge.loadProgram('string-reverser');

// Use the loaded program
const code = await reverser.generate({ implementation: 'return str.split("").reverse().join("");' });
console.log(code);
```

### Working with Versions

```typescript
// List all versions of a prompt
const versions = await selvedge.listPromptVersions('sentiment-analyzer');
console.log(`Available versions: ${versions.join(', ')}`);

// Load a specific version
const specificVersion = await selvedge.loadPrompt('sentiment-analyzer', versions[1]);
```

## Advanced Usage with SelvedgeManager

The `SelvedgeManager` provides enhanced functionality for managing your prompts and programs, including metadata tracking, version comparison, and analytics.

```typescript
import { manager } from 'selvedge';

// Load a prompt with usage tracking
const sentiment = await manager.loadPrompt<{ score: number }>('sentiment-analyzer');

// Add metadata
await manager.addTags('prompt', 'sentiment-analyzer', ['nlp', 'analysis']);
await manager.setDescription('prompt', 'sentiment-analyzer', 'Analyzes sentiment in text');

// Get detailed information
const info = await manager.getItemInfo('prompt', 'sentiment-analyzer');
console.log(info.metadata);

// Compare versions
const comparison = await manager.compareVersions(
  'prompt', 
  'sentiment-analyzer', 
  versions[1], 
  versions[0]
);
console.log(comparison.differences);

// Export to a file
await manager.exportItem('prompt', 'sentiment-analyzer', './sentiment-export.json');

// Import from a file
const imported = await manager.importItem('./sentiment-export.json');
```

## Command Line Interface

Selvedge includes a CLI for managing your prompts and programs from the command line:

```bash
# List all saved items
selvedge list

# Show detailed information with metadata
selvedge list --verbose

# List versions of an item
selvedge versions prompt sentiment-analyzer

# Show detailed information about an item
selvedge info prompt sentiment-analyzer

# Add tags to an item
selvedge tag prompt sentiment-analyzer --add "nlp,analysis"

# Set a description
selvedge describe prompt sentiment-analyzer "Analyzes sentiment in text"

# Compare versions
selvedge compare prompt sentiment-analyzer v1 v2

# Export an item
selvedge export prompt sentiment-analyzer ./sentiment-export.json

# Import an item
selvedge import ./sentiment-export.json
```

## Storage Location

By default, Selvedge stores your prompts and programs in the `~/.selvedge` directory with the following structure:

```
~/.selvedge/
  ├── prompts/
  │   └── sentiment-analyzer/
  │       ├── latest.json
  │       ├── m8yrz30z-1-abcd.json
  │       └── m8yrz30z-2-efgh.json
  ├── programs/
  │   └── string-reverser/
  │       ├── latest.json
  │       └── m8yrz30z-3-ijkl.json
  └── metadata/
      ├── prompt-sentiment-analyzer.json
      └── program-string-reverser.json
```

Each saved item has its own directory containing all versions, with a `latest.json` file that always points to the most recent version. Metadata is stored separately in the `metadata` directory.

## Custom Storage Location

You can customize the storage location by creating a Store instance with a custom path:

```typescript
import { Store } from 'selvedge';

// Create a custom store
const customStore = new Store('/path/to/custom/storage');

// Use the custom store for all operations
customStore.save('prompt', 'my-prompt', data);
customStore.load('prompt', 'my-prompt');
```

## API Reference

### Store

- `save(type, name, data)`: Save an item with automatic versioning
- `load(type, name, version?)`: Load an item (latest version by default)
- `list(type)`: List all items of a specific type
- `listVersions(type, name)`: List all versions of an item
- `delete(type, name, version?)`: Delete an item or specific version

### SelvedgeManager

- `trackUsage(type, name, executionTime?, success?)`: Track usage of an item
- `updateMetadata(type, name, updates)`: Update metadata for an item
- `compareVersions(type, name, v1, v2)`: Compare two versions of an item
- `loadProgram(name, version?)`: Load a program with usage tracking
- `loadPrompt(name, version?)`: Load a prompt with usage tracking
- `getItemInfo(type, name)`: Get detailed information about an item
- `exportItem(type, name, outputPath, version?)`: Export an item to a file
- `importItem(filePath)`: Import an item from a file
- `listAllItems()`: List all items with their metadata
- `addTags(type, name, tags)`: Add tags to an item
- `removeTags(type, name, tags)`: Remove tags from an item
- `setDescription(type, name, description)`: Set a description for an item
