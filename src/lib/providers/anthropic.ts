/**
 * Anthropic provider adapter
 */
import Anthropic from '@anthropic-ai/sdk';
import { ModelDefinition, ModelAdapter, ApiClientConfig } from '../types';

/**
 * Anthropic-specific configuration options
 */
export interface AnthropicConfig extends ApiClientConfig {
  /** Anthropic-specific API version */
  apiVersion?: string;
}

/**
 * Adapter for Anthropic models
 */
export class AnthropicModelAdapter implements ModelAdapter {
  private client: Anthropic;
  private modelDef: ModelDefinition;
  
  /**
   * Create a new Anthropic adapter
   * 
   * @param modelDef - The model definition
   */
  constructor(modelDef: ModelDefinition) {
    this.modelDef = modelDef;
    
    // Extract configuration
    const config = modelDef.config as AnthropicConfig || {};
    
    // Create the Anthropic client
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
    });
  }
  
  /**
   * Send a completion request to Anthropic
   * Note: This uses the messages API since Anthropic's newer models all use chat
   * 
   * @param prompt - The prompt text
   * @param options - Additional options for the request
   * @returns The completion text
   */
  async complete(prompt: string, options: Record<string, any> = {}): Promise<string> {
    try {
      // Format as a system + user message pair
      const systemPrompt = options.system || 'You are a helpful assistant.';
      
      const response = await this.client.messages.create({
        model: this.modelDef.model,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP,
        stop_sequences: options.stop,
      });
      
      return response.content[0]?.text || '';
    } catch (error) {
      console.error('Anthropic completion error:', error);
      throw new Error(`Anthropic completion failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Generate chat completions using Anthropic
   * 
   * @param messages - Array of message objects (role and content)
   * @param options - Additional options for the request
   * @returns The chat completion response
   */
  async chat(messages: any[], options: Record<string, any> = {}): Promise<any> {
    try {
      // Convert messages to Anthropic format if needed
      const formattedMessages = messages.map(msg => {
        // Anthropic only accepts 'user' or 'assistant' roles
        let role: 'user' | 'assistant';
        
        // Map different role formats to Anthropic's expected format
        if (msg.role === 'assistant') {
          role = 'assistant';
        } else {
          // Default to 'user' for any other role (like 'user', 'system', etc.)
          role = 'user';
        }
        
        return { role, content: msg.content };
      });
      
      const isStreaming = options.stream === true;
      
      const response = await this.client.messages.create({
        model: this.modelDef.model,
        system: options.system || 'You are a helpful assistant.',
        messages: formattedMessages,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP,
        stop_sequences: options.stop,
        stream: isStreaming,
      });
      
      // If streaming, return the stream directly
      if (isStreaming) {
        return response;
      }
      
      // For non-streaming, we can safely access content
      return (response as Anthropic.Message).content[0]?.text || '';
    } catch (error) {
      console.error('Anthropic chat completion error:', error);
      throw new Error(`Anthropic chat completion failed: ${(error as Error).message}`);
    }
  }
}
