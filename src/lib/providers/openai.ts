/**
 * OpenAI provider adapter
 */
import OpenAI from 'openai';
import { ModelDefinition, ModelAdapter, ApiClientConfig } from '../types';

/**
 * OpenAI-specific configuration options
 */
export interface OpenAIConfig extends ApiClientConfig {
  /** Override organization ID */
  organization?: string;
}

/**
 * Adapter for OpenAI models
 */
export class OpenAIModelAdapter implements ModelAdapter {
  private client: OpenAI;
  private modelDef: ModelDefinition;
  
  /**
   * Create a new OpenAI adapter
   * 
   * @param modelDef - The model definition
   */
  constructor(modelDef: ModelDefinition) {
    this.modelDef = modelDef;
    
    // Extract configuration
    const config = modelDef.config as OpenAIConfig || {};
    
    // Create the OpenAI client
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      organization: config.organization || process.env.OPENAI_ORGANIZATION,
      baseURL: config.baseUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries || 3,
    });
  }
  
  /**
   * Send a completion request to OpenAI
   * 
   * @param prompt - The prompt text
   * @param options - Additional options for the request
   * @returns The completion text
   */
  async complete(prompt: string, options: Record<string, any> = {}): Promise<string> {
    try {
      const completion = await this.client.completions.create({
        model: this.modelDef.model,
        prompt,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stop,
      });
      
      return completion.choices[0]?.text || '';
    } catch (error) {
      console.error('OpenAI completion error:', error);
      throw new Error(`OpenAI completion failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Generate chat completions using OpenAI
   * 
   * @param messages - Array of message objects (role and content)
   * @param options - Additional options for the request
   * @returns The chat completion response
   */
  async chat(messages: any[], options: Record<string, any> = {}): Promise<any> {
    try {
      const isStreaming = options.stream === true;
      
      const response = await this.client.chat.completions.create({
        model: this.modelDef.model,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stop,
        stream: isStreaming,
      });
      
      // For streaming, return the stream directly
      if (isStreaming) {
        return response;
      }
      
      // For non-streaming, safely extract the content
      return (response as OpenAI.ChatCompletion).choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenAI chat completion error:', error);
      throw new Error(`OpenAI chat completion failed: ${(error as Error).message}`);
    }
  }
}
