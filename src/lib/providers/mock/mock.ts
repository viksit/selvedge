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
    chat?: string | ((messages: any[]) => string);
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
   * Set the mock responses for testing
   * 
   * @param responses - Object containing completion and chat responses
   */
  public setResponses(responses: { 
    completion?: string; 
    chat?: string | ((messages: any[]) => string); 
    promptMap?: Record<string, string> 
  }): void {
    this.config.responses = this.config.responses || {};
    if (responses.completion) {
      this.config.responses.completion = responses.completion;
    }
    if (responses.chat) {
      this.config.responses.chat = responses.chat;
    }
    if (responses.promptMap) {
      this.config.responses.promptMap = responses.promptMap;
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
    let response = this.config.responses?.completion ?? 
      `Mock response for model ${this.modelDef.model} with prompt: ${prompt}`;
      
    // Adjust response based on temperature if specified
    if (options.temperature && options.temperature > 0.7) {
      response += " [High creativity response]";
    }
      
    return response.substring(0, maxLength);
  }
  
  /**
   * Send a chat request to mock provider
   * 
   * @param messages - Array of chat messages
   * @param options - Additional options for the request
   * @returns The chat response
   */
  async chat(messages: any[], options: Record<string, any> = {}): Promise<string> {
    await this.delay();
    
    // Simulate failures for testing error handling
    if (this.config.shouldFail) {
      throw new Error('Mock chat failed (intentional test error)');
    }
    
    // Respect max_tokens if specified in options
    let maxLength = options.maxTokens || 1000;
    
    // If the chat response is a function, call it with the messages
    if (typeof this.config.responses?.chat === 'function') {
      return this.config.responses.chat(messages);
    }
    
    // Return default response or a generated one
    let response = this.config.responses?.chat || 
      `Mock chat response for model ${this.modelDef.model}`;
      
    // Add some context from the last user message if available
    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (lastUserMessage) {
      const content = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : JSON.stringify(lastUserMessage.content);
      const preview = content.substring(0, 30) + (content.length > 30 ? '...' : '');
      response += ` responding to: "${preview}"`;
    }
    
    // Adjust response based on temperature if specified
    if (options.temperature && options.temperature > 0.7) {
      response += " [High creativity response]";
    }
    
    return response.substring(0, maxLength);
  }
}
