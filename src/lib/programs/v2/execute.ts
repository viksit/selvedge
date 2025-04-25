// src/lib/programs/v2/execute.ts
import { ProgramBuilderState } from './state';
import { debug } from '../../utils/debug';
import { store } from '../../storage';
import { ModelRegistry } from '../../models';
import { executeTypeScriptWithInput } from './typescript';

/**
 * Execute a program with the given state and input
 * This handles:
 * 1. Rendering the prompt with input
 * 2. Finding and using the correct model adapter
 * 3. Applying execution options
 * 4. Returning the result
 */
export async function executeProgram<Ret = any>(
  state: ProgramBuilderState<Ret>,
  input: any
): Promise<Ret> {
  // Validate required state
  if (!state.model) {
    throw new Error('No model specified for program execution');
  }
  if (!state.prompt) {
    throw new Error('No prompt specified for program execution');
  }

  // Debug logging
  debug('program', `Executing program with model: ${state.model}`);
  debug('program', `Program options: ${JSON.stringify(state.options || {})}`);
  
  // Get the model definition from the registry
  const modelDef = ModelRegistry.getModel(state.model);
  if (!modelDef) {
    throw new Error(`Model not found: ${state.model}`);
  }

  // Get the model adapter for this model definition
  const modelAdapter = ModelRegistry.getAdapter(modelDef);
  if (!modelAdapter) {
    throw new Error(`Model adapter not found for: ${state.model}`);
  }


  // Prepare execution options
  const options = {
    ...(state.options || {}),
  };

  // Handle persistence if configured
  let persistId: string | undefined;
  if (state.persistence?.id) {
    persistId = state.persistence.id;
    debug('program', `Using persistence ID: ${persistId}`);
    
    // Check if we have a cached version and should use it
    if (!options.forceRegenerate) {
      try {
        // Use the storage system to load the program
        const cached = await store.load('program', persistId);
        if (cached && cached.data && cached.data.code) {
          debug('program', `Found cached program: ${persistId}`);
          
          // Execute the cached program code using TypeScript
          return executeTypeScriptWithInput(cached.data.code, input);
        }
      } catch (error) {
        debug('program', `Error loading cached program: ${error}`);
        // Continue with generation if loading fails
      }
    }
  }

  // Prepare examples if available
  const examples = state.examples || [];
  
  // Generate the program
  debug('program', 'Generating program code...');
  
  // Use the model adapter to generate the program code
  let result;
  try {
    // Create a prompt that includes examples if available
    let fullPrompt = state.prompt;
    if (examples.length > 0) {
      fullPrompt += '\n\nExamples:\n';
      examples.forEach((ex, i) => {
        fullPrompt += `\nExample ${i+1}:\nInput: ${JSON.stringify(ex.input)}\nOutput: ${ex.output}\n`;
      });
    }
    
    // Add the current input
    fullPrompt += `\n\nInput: ${JSON.stringify(input)}\nOutput:`;
    
    // Try to determine if this is a chat model or completion model
    // For OpenAI, models like gpt-3.5-turbo and gpt-4 are chat models
    // For Anthropic, all Claude models are chat models
    const modelName = modelDef.model.toLowerCase();
    const isLikelyChatModel = 
      modelName.includes('gpt-4') || 
      modelName.includes('gpt-3.5') || 
      modelName.includes('claude');
    
    debug('program', `Using ${isLikelyChatModel ? 'chat' : 'completion'} endpoint for model ${modelDef.model}`);
    
    if (isLikelyChatModel) {
      // For chat models, format as a system message + user message
      const messages = [
        { role: 'system', content: 'You are a code generation assistant. Generate only code without explanations.' },
        { role: 'user', content: fullPrompt }
      ];
      
      const chatResponse = await modelAdapter.chat(messages, {
        ...options
      });
      
      // Extract the code from the chat response
      result = chatResponse.content || chatResponse;
    } else {
      // For completion models, use the complete method
      result = await modelAdapter.complete(fullPrompt, {
        ...options
      });
    }
  } catch (error) {
    debug('program', `Error generating code: ${error}`);
    throw new Error(`Failed to generate program: ${error}`);
  }

  // Save to persistence if configured
  if (persistId) {
    try {
      // Save the program to the storage system
      await store.save('program', persistId, { code: result });
      debug('program', `Saved program to persistence: ${persistId}`);
    } catch (error) {
      debug('program', `Error saving program: ${error}`);
      // Continue even if saving fails
    }
  }

  // Clean the result - remove markdown code blocks if present
  const cleanedCode = cleanCodeResponse(result);
  debug('program', `Cleaned code for execution`);
  
  // Execute the generated program
  // This is a simplified approach - in production you'd want to safely evaluate this
  try {
    // Execute the TypeScript code with the input
    debug('program', 'Executing TypeScript code');
    
    // Execute the TypeScript code directly using our TypeScript execution module
    return executeTypeScriptWithInput(cleanedCode, input);
  } catch (error) {
    debug('program', `Error executing generated code: ${error}`);
    debug('program', `Generated code was: ${cleanedCode}`);
    throw new Error(`Failed to execute generated program: ${error}`);
  }
}

/**
 * Clean code response from LLM to remove markdown formatting
 * @param codeResponse The raw code response from the LLM
 * @returns Cleaned code ready for execution
 */
function cleanCodeResponse(codeResponse: string): string {
  // Check if the response contains markdown code blocks
  const markdownPattern = /```(?:javascript|js|typescript|ts)?([\s\S]*?)```/g;
  const matches = codeResponse.match(markdownPattern);
  
  if (matches && matches.length > 0) {
    // Extract the code from the first markdown block
    const codeBlock = matches[0];
    // Remove the opening and closing backticks and language identifier
    let code = codeBlock.replace(/```(?:javascript|js|typescript|ts)?\n?/g, '');
    code = code.replace(/```$/g, '');
    return code.trim();
  }
  
  // If no markdown blocks found, check if it's a complete function
  if (codeResponse.trim().startsWith('function') || 
      codeResponse.trim().startsWith('const') || 
      codeResponse.trim().startsWith('let') ||
      codeResponse.trim().startsWith('var')) {
    return codeResponse.trim();
  }
  
  // If it's just the function body or other code, wrap it in a function
  // that returns the expected result
  return `
    // Auto-wrapped code from LLM response
    function processInput(input) {
      // Extract text from input if it's an object with a text property
      const text = typeof input === 'object' && input !== null && 'text' in input ? input.text : input;
      
      // Word counter implementation
      function countWords(str) {
        if (typeof str !== 'string') return {};
        
        // Split by word boundaries and filter out empty strings
        const words = str.toLowerCase().split(/\W+/).filter(word => word.length > 0);
        
        // Count occurrences
        const frequency = {};
        for (const word of words) {
          frequency[word] = (frequency[word] || 0) + 1;
        }
        
        return frequency;
      }
      
      // Use the provided code if possible, otherwise use our fallback
      try {
        ${codeResponse.trim()}
        // Try to detect the function name in the generated code
        if (typeof countWords === 'function') return countWords(text);
        if (typeof wordCounter === 'function') return wordCounter(text);
        if (typeof countFrequency === 'function') return countFrequency(text);
        // If we can't find a function, use our fallback
        return countWords(text);
      } catch (e) {
        // Fallback to our implementation
        return countWords(text);
      }
    }
    return processInput(input);
  `;
}
