/**
 * Mock LLM provider for testing
 */
import { ModelDefinition, ModelAdapter, ApiClientConfig } from '../../types';

/**
 * Mock-specific configuration options
 */
export interface MockConfig extends ApiClientConfig {
  /** Predefined responses for testing */
  responses?: {
    /** Default response for completions */
    completion?: string;
    /** Default response for chat */
    chat?: string;
    /** Response map for specific prompts */
    promptMap?: Record<string, string>;
  };
  /** Deliberately fail requests for testing error handling */
  shouldFail?: boolean;
  /** Delay responses to simulate network latency (ms) */
  responseDelay?: number;
}

/**
 * Adapter for mock models - useful for testing
 */
export class MockModelAdapter implements ModelAdapter {
  private modelDef: ModelDefinition;
  private config: MockConfig;
  
  /**
   * Create a new Mock adapter
   * 
   * @param modelDef - The model definition
   */
  constructor(modelDef: ModelDefinition) {
    this.modelDef = modelDef;
    this.config = (modelDef.config as MockConfig) || {};
  }
  
  /**
   * Helper to simulate network delay
   */
  private async delay(): Promise<void> {
    const ms = this.config.responseDelay || 0;
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }
  
  /**
   * Send a completion request to mock provider
   * 
   * @param prompt - The prompt text
   * @param options - Additional options for the request
   * @returns The completion text
   */
  async complete(prompt: string, options: Record<string, any> = {}): Promise<string> {
    await this.delay();
    
    // Simulate failures for testing error handling
    if (this.config.shouldFail) {
      throw new Error('Mock completion failed (intentional test error)');
    }
    
    // Respect max_tokens if specified in options
    let maxLength = options.maxTokens || 1000;
    
    // Check if we have a specific response for this prompt
    if (this.config.responses?.promptMap?.[prompt]) {
      const response = this.config.responses.promptMap[prompt];
      return response.substring(0, maxLength);
    }
    
    // Return default response or a generated one
    let response = this.config.responses?.completion || 
      `Mock response for model ${this.modelDef.model} with prompt: ${prompt.substring(0, 20)}...`;
      
    // Adjust response based on temperature if specified
    if (options.temperature && options.temperature > 0.7) {
      response += " [High creativity response]";
    }
      
    return response.substring(0, maxLength);
  }
  
  /**
   * Generate chat completions using mock provider
   * 
   * @param messages - Array of message objects (role and content)
   * @param options - Additional options for the request
   * @returns The chat completion response
   */
  async chat(messages: any[], options: Record<string, any> = {}): Promise<string> {
    await this.delay();
    
    // Simulate failures for testing error handling
    if (this.config.shouldFail) {
      throw new Error('Mock chat completion failed (intentional test error)');
    }
    
    // Respect max_tokens if specified in options
    let maxLength = options.maxTokens || 1000;
    
    // Get the last user message to use as a key for prompt map lookups
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content;
    
    // Check if we have a specific response for this message
    if (lastUserMessage && this.config.responses?.promptMap?.[lastUserMessage]) {
      const response = this.config.responses.promptMap[lastUserMessage];
      return response.substring(0, maxLength);
    }
    
    // Build a response acknowledging the conversation context
    let contextAwareness = '';
    if (options.system) {
      contextAwareness = `[System: ${options.system.substring(0, 20)}...] `;
    }
    
    // Return default response or a generated one
    let response = this.config.responses?.chat || 
      `${contextAwareness}Mock chat response for model ${this.modelDef.model} with ${messages.length} messages`;
      
    // Adjust response based on temperature if specified
    if (options.temperature && options.temperature > 0.7) {
      response += " [High creativity response]";
    }
      
    return response.substring(0, maxLength);
  }
}
