/**
 * OpenAI provider adapter
 */
import OpenAI from 'openai';
import { ModelDefinition, ModelAdapter, ApiClientConfig } from '../types';
import { debug } from '../utils/debug';

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
    debug('llm', 'Creating OpenAI adapter for model: %s', modelDef.model);
    
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
    debug('llm', 'OpenAI client initialized');
  }
  
  /**
   * Send a completion request to OpenAI
   * 
   * @param prompt - The prompt text
   * @param options - Additional options for the request
   * @returns The completion text
   */
  async complete(prompt: string, options: Record<string, any> = {}): Promise<string> {
    debug('llm', 'Sending completion request to OpenAI model: %s', this.modelDef.model);
    debug('llm', 'Completion options: %o', options);
    debug('llm', 'Sending prompt: %s', prompt);
    try {
      debug('llm', 'Prompt length: %d characters', prompt.length);
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
      
      const result = completion.choices[0]?.text || '';
      debug('llm', 'Received completion response of %d characters', result.length);
      return result;
    } catch (error) {
      debug('llm', 'OpenAI completion error: %o', error);
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
    debug('llm', 'Sending chat request to OpenAI model: %s', this.modelDef.model);
    debug('llm', 'Chat options: %o', options);
    debug('llm', 'Messages count: %d', messages.length);
    
    try {
      const isStreaming = options.stream === true;
      debug('llm', 'Stream mode: %s', isStreaming ? 'enabled' : 'disabled');
      
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
        debug('llm', 'Returning stream response');
        return response;
      }
      
      // For non-streaming, safely extract the content
      const content = (response as OpenAI.ChatCompletion).choices[0]?.message?.content || '';
      debug('llm', 'Received chat response of %d characters', content.length);
      return content;
    } catch (error) {
      debug('llm', 'OpenAI chat completion error: %o', error);
      console.error('OpenAI chat completion error:', error);
      throw new Error(`OpenAI chat completion failed: ${(error as Error).message}`);
    }
  }
}
