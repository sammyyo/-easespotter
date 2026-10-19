import OpenAI from "openai";

// Check if API key is available
if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. AI assistant features will fall back to simulated responses.');
}

// Initialize OpenAI client if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Generate a chat completion using OpenAI
 * @param messages Array of chat messages to send to OpenAI
 * @returns The generated response text
 */
export async function generateChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!openai) {
    throw new Error('OpenAI client not initialized due to missing API key');
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
    });

    return response.choices[0].message.content || "";
  } catch (error: any) {
    // Handle different OpenAI error types
    if (error.error?.type === 'insufficient_quota') {
      throw new Error('API credit balance too low. Please check your OpenAI account.');
    } else if (error.status === 401) {
      throw new Error('Invalid API key or authentication issue with OpenAI service.');
    } else if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else {
      console.error('OpenAI API error:', error);
      throw new Error(`Error generating AI response: ${error.message}`);
    }
  }
}

/**
 * Generate a structured JSON response using OpenAI
 * @param messages Array of chat messages to send to OpenAI
 * @returns The generated response as a structured object
 */
export async function generateJsonResponse<T>(messages: ChatMessage[]): Promise<T> {
  if (!openai) {
    throw new Error('OpenAI client not initialized due to missing API key');
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content || "{}";
    return JSON.parse(content) as T;
  } catch (error: any) {
    // Handle different OpenAI error types
    if (error.error?.type === 'insufficient_quota') {
      throw new Error('API credit balance too low. Please check your OpenAI account.');
    } else if (error.status === 401) {
      throw new Error('Invalid API key or authentication issue with OpenAI service.');
    } else if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (error.name === 'SyntaxError') {
      // Handle JSON parsing errors
      throw new Error('Failed to parse AI response as JSON. The response format was invalid.');
    } else {
      console.error('OpenAI API error:', error);
      throw new Error(`Error generating AI response: ${error.message}`);
    }
  }
}
