/**
 * Model registry and adapters for different LLM providers
 */
import { ModelDefinition, ModelProvider, SelvedgeInstance, ModelAdapter } from './types';
import { OpenAIModelAdapter, AnthropicModelAdapter, MockModelAdapter } from './providers';

/** 
 * Maps model aliases to model definitions 
 * @internal
 */
const registeredModels: Map<string, ModelDefinition> = new Map();

/**
 * Maps model provider + name to adapter instances
 * @internal
 */
const modelAdapters: Map<string, any> = new Map();

/**
 * Registry for model definitions and adapters
 */
export class ModelRegistry {
  /**
   * Register multiple models with aliases
   * 
   * @param modelMap - Object mapping aliases to model definitions
   * @param selvedge - The selvedge instance to return
   * @returns The selvedge instance for chaining
   */
  public static registerModels(
    modelMap: Record<string, ModelDefinition>,
    selvedge: SelvedgeInstance
  ): SelvedgeInstance {
    // Add each model to the registry
    Object.entries(modelMap).forEach(([alias, definition]) => {
      registeredModels.set(alias, definition);
    });
    
    return selvedge;
  }
  
  /**
   * Get a model definition by its alias
   * 
   * @param alias - The model alias
   * @returns The model definition, or undefined if not found
   */
  public static getModel(alias: string): ModelDefinition | undefined {
    return registeredModels.get(alias);
  }
  
  /**
   * Get or create a model adapter for a given model definition
   * 
   * @param modelDef - The model definition
   * @returns The adapter for the model
   */
  public static getAdapter(modelDef: ModelDefinition): ModelAdapter | undefined {
    const cacheKey = `${modelDef.provider}:${modelDef.model}`;
    
    // Check if we already have an adapter instance
    if (modelAdapters.has(cacheKey)) {
      return modelAdapters.get(cacheKey);
    }
    
    // Create the appropriate adapter based on the provider
    let adapter: ModelAdapter | undefined;
    
    switch (modelDef.provider) {
      case ModelProvider.OPENAI:
        adapter = new OpenAIModelAdapter(modelDef);
        break;
        
      case ModelProvider.ANTHROPIC:
        adapter = new AnthropicModelAdapter(modelDef);
        break;
        
      case ModelProvider.MOCK:
        adapter = new MockModelAdapter(modelDef);
        break;
        
      default:
        throw new Error(`Unsupported model provider: ${modelDef.provider}`);
    }
    
    // Cache the adapter
    modelAdapters.set(cacheKey, adapter);
    return adapter;
  }

  /**
   * Clear all registered models and adapters
   * Primarily used for testing purposes
   */
  public static clear(): void {
    registeredModels.clear();
    modelAdapters.clear();
  }
}
