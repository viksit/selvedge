/**
 * Model registry and adapters for different LLM providers
 */
import { ModelDefinition, ModelProvider, SelvedgeInstance } from './types';
import { OpenAIModelAdapter, AnthropicModelAdapter, MockModelAdapter } from './providers';

/** 
 * Map of registered model aliases to their definitions
 */
const registeredModels: Map<string, ModelDefinition> = new Map();

/**
 * Map of model definitions to their corresponding adapters
 */
const modelAdapters: Map<string, any> = new Map();

/**
 * Helper class for model registration and management
 */
export class ModelRegistry {
  /**
   * Register multiple models with aliases
   * 
   * @param modelMap - Object mapping aliases to model definitions
   * @param instance - The selvedge instance for chaining
   * @returns The updated selvedge instance
   */
  static registerModels(
    modelMap: Record<string, ModelDefinition>,
    instance: SelvedgeInstance
  ): SelvedgeInstance {
    // Register each model by its alias
    Object.entries(modelMap).forEach(([alias, definition]) => {
      registeredModels.set(alias, definition);
      
      // Create model adapter if it doesn't exist yet
      const modelKey = `${definition.provider}:${definition.model}`;
      if (!modelAdapters.has(modelKey)) {
        modelAdapters.set(modelKey, ModelRegistry.createAdapter(definition));
      }
    });
    
    return instance;
  }
  
  /**
   * Get a registered model by its alias
   * 
   * @param alias - The model alias
   * @returns The model definition or undefined if not found
   */
  static getModel(alias: string): ModelDefinition | undefined {
    return registeredModels.get(alias);
  }
  
  /**
   * Get the adapter for a model definition
   * 
   * @param modelDef - The model definition
   * @returns The model adapter
   */
  static getAdapter(modelDef: ModelDefinition): any {
    const modelKey = `${modelDef.provider}:${modelDef.model}`;
    return modelAdapters.get(modelKey);
  }
  
  /**
   * Create a model adapter based on the provider
   * 
   * @param modelDef - The model definition
   * @returns A new model adapter instance
   */
  private static createAdapter(modelDef: ModelDefinition): any {
    switch (modelDef.provider) {
      case ModelProvider.OPENAI:
        return new OpenAIModelAdapter(modelDef);
      case ModelProvider.ANTHROPIC:
        return new AnthropicModelAdapter(modelDef);
      case ModelProvider.MOCK:
        return new MockModelAdapter(modelDef);
      default:
        throw new Error(`Unsupported model provider: ${modelDef.provider}`);
    }
  }
}
