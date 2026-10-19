import { generateChatCompletion, generateJsonResponse, ChatMessage } from './openai-service';

// Define the structure of price recommendation response
interface PricingRecommendation {
  recommendation?: {
    optimalPriceAdjustment: string;
    confidence: number;
  };
  rationale?: string;
  insights?: string[];
  competitorAnalysis?: {
    positioningSummary: string;
    priceGap: string;
  };
  whatIfScenarios?: Array<{
    name: string;
    priceChange: string;
    estimatedImpact: {
      revenue: string;
      margin: string;
      salesVolume: string;
      totalProfit: string;
    };
    riskLevel: string;
  }>;
  error?: boolean;
  errorType?: string;
}

// Store conversation history for each user
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationContext {
  lastUpdated: Date;
  messages: Message[];
  productContext?: string;
  pricingParameters?: {
    targetMargin: number;
    competitorFocus: boolean;
    demandElasticity: number;
    marketShare: boolean;
  };
}

// Keep conversation history for 30 minutes of inactivity
const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Store conversation by userId
const conversationStore = new Map<number, ConversationContext>();

// Clean up old conversations periodically
setInterval(() => {
  const now = new Date();
  // Convert entries to array first to avoid ES5 compatibility issues
  const entries = Array.from(conversationStore.entries());
  for (const [userId, context] of entries) {
    if (now.getTime() - context.lastUpdated.getTime() > CONVERSATION_TIMEOUT) {
      conversationStore.delete(userId);
      console.log(`Cleaned up conversation for user ${userId} due to inactivity`);
    }
  }
}, 15 * 60 * 1000); // Check every 15 minutes

// Get or create conversation context for a user
function getConversationContext(userId: number): ConversationContext {
  if (!conversationStore.has(userId)) {
    conversationStore.set(userId, {
      lastUpdated: new Date(),
      messages: [{
        role: 'assistant',
        content: "Hi there! I'm your AI Pricing Assistant. How can I help optimize your pricing strategy today?",
      }],
    });
  }
  
  // Update timestamp
  const context = conversationStore.get(userId)!;
  context.lastUpdated = new Date();
  
  return context;
}

// Handle user message
export async function handleUserMessage(userId: number, message: string, productInfo?: any, parameters?: any) {
  if (!process.env.EaseSpotter) {
    return { content: "AI Pricing Assistant is not available at the moment. Please configure your API key." };
  }
  
  try {
    const context = getConversationContext(userId);
    
    // Update context if product or parameters info was provided
    if (productInfo) {
      context.productContext = `Current product: ${productInfo.name} with current price $${productInfo.currentPrice} (base price: $${productInfo.basePrice})\nCategory: ${productInfo.category || 'Unknown'}\n`;
    }
    
    if (parameters) {
      context.pricingParameters = parameters;
    }
    
    // Add user message to history
    context.messages.push({
      role: 'user',
      content: message,
    });
    
    // Prepare the system message with context
    let systemMessage = `You are an AI Pricing Assistant for "EaseSpotter", an e-commerce dynamic pricing platform.\n`;
    systemMessage += `Your role is to help users optimize their pricing strategies based on market data and pricing best practices.\n`;
    systemMessage += `Provide concise, professional advice without excessive enthusiasm or unnecessary praise.\n\n`;
    
    if (context.productContext) {
      systemMessage += `Product Context:\n${context.productContext}\n`;
    }
    
    if (context.pricingParameters) {
      systemMessage += `Pricing Parameters:\n`;
      systemMessage += `- Target Profit Margin: ${context.pricingParameters.targetMargin}%\n`;
      systemMessage += `- Prioritize Competitor Positioning: ${context.pricingParameters.competitorFocus ? 'Yes' : 'No'}\n`;
      systemMessage += `- Demand Elasticity: ${context.pricingParameters.demandElasticity}/10 (higher value means more price-sensitive customers)\n`;
      systemMessage += `- Focus on Market Share: ${context.pricingParameters.marketShare ? 'Yes' : 'No'}\n\n`;
    }
    
    systemMessage += `Guidelines for your responses:\n`;
    systemMessage += `1. When asked about pricing strategies, explain concepts clearly and concisely.\n`;
    systemMessage += `2. Use practical examples that relate to the user's product or industry when possible.\n`;
    systemMessage += `3. If asked about technical pricing concepts (like price elasticity, markup vs. margin, dynamic pricing), explain them in simple terms.\n`;
    systemMessage += `4. When making recommendations, consider context like target margin, competition focus, and elasticity if provided.\n`;
    systemMessage += `5. Don't make claims about specific numerical predictions unless the user has shared actual data.\n`;
    systemMessage += `6. Format your responses with clear sections and bulleted lists when appropriate.\n`;
    
    // Convert context messages to ChatMessage format for OpenAI
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemMessage },
      ...context.messages.slice(-10).map(msg => ({ 
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content 
      })),
    ];
    
    // Send to OpenAI API
    console.log('Sending message to OpenAI API');
    const assistantMessageContent = await generateChatCompletion(chatMessages);
    
    // Add to conversation history
    context.messages.push({
      role: 'assistant',
      content: assistantMessageContent,
    });
    
    return { content: assistantMessageContent };
  } catch (error: any) {
    console.error('Error in AI chat:', error);
    
    // Check for specific error message patterns to identify error types
    const errorMessage = error.message || '';
    
    if (errorMessage.includes('credit balance too low') || errorMessage.includes('insufficient_quota')) {
      return { 
        content: "⚠️ **API Credit Issue**: The OpenAI API credit balance is too low. Please contact the administrator to add credits to the account or update the API key.",
        error: true,
        errorType: 'credit_balance'
      };
    } else if (errorMessage.includes('Invalid API key') || errorMessage.includes('authentication issue')) {
      return { 
        content: "⚠️ **API Authentication Error**: There's an issue with the AI service authentication. Please contact the administrator to verify the API key.",
        error: true,
        errorType: 'auth_error'
      };
    } else if (errorMessage.includes('Rate limit exceeded')) {
      return { 
        content: "⚠️ **Rate Limit Exceeded**: The AI service is currently experiencing high demand. Please try again in a few minutes.",
        error: true,
        errorType: 'rate_limit'
      };
    }
    
    // Default error message
    return { 
      content: "I'm sorry, I encountered an error processing your request. Please try again later.",
      error: true,
      errorType: 'unknown'
    };
  }
}

// Get detailed pricing recommendation
export async function getPricingRecommendation(userId: number, productId: number, parameters: any): Promise<PricingRecommendation> {
  try {
    if (!process.env.EaseSpotter) {
      return {
        optimalPriceAdjustment: '+0.0%',
        confidence: 50,
        rationale: 'Unable to generate recommendation at this time.',
        insights: ['API key is missing.'],
        competitorAnalysis: {
          positioningSummary: 'Unable to analyze.',
          priceGap: 'Unknown',
        },
        whatIfScenarios: [
          {
            name: 'Default',
            priceChange: '+0%',
            estimatedImpact: {
              revenue: 'No change',
              margin: 'No change',
              salesVolume: 'No change',
              totalProfit: 'No change',
            },
            riskLevel: 'Unknown',
          }
        ],
      };
    }

    // Prepare structured data for the AI to work with
    const structuredData = {
      inputs: {
        targetMargin: parameters.targetMargin || 0,
        competitorFocus: parameters.competitorFocus || false,
        demandElasticity: parameters.demandElasticity || 5,
        marketShare: parameters.marketShare || false,
        category: parameters.category || 'general',
        averageProductPrice: parameters.currentPrice || 0,
        averageCompetitorPrice: 0,
        priceTrend: 0,
      },
      productData: {},
      competitorData: {},
      marketData: {},
      additionalPrompt: parameters.prompt || ''
    };

    // Create a system message to guide the AI
    const systemMessage = `You are an AI Pricing Assistant for an e-commerce platform. 
Your task is to analyze the provided data and generate a pricing recommendation based on the following parameters:
- Target margin: The desired profit margin percentage
- Competitor focus: Whether to prioritize competitive positioning
- Demand elasticity: How sensitive demand is to price changes (1-10 scale, 10 being highly elastic)
- Market share focus: Whether to prioritize gaining market share over short-term margins
- Product category: The category of products being analyzed
- Average product price: The current average price of the products
- Average competitor price: The current average price of competing products
- Price trend: The recent trend in price changes

Please provide a structured response in JSON format with the following properties:
- recommendation: { optimalPriceAdjustment: string (e.g. "+5.2%"), confidence: number (50-95) }
- rationale: string explaining the recommendation
- insights: array of strings with 3-5 pricing strategy insights
- competitorAnalysis: { positioningSummary: string, priceGap: string }
- whatIfScenarios: array of objects with the following structure:
  { name: string, priceChange: string, estimatedImpact: { revenue: string, margin: string, salesVolume: string, totalProfit: string }, riskLevel: string }`;

    const userMessage = `Based on the following pricing data and parameters, provide a detailed pricing recommendation:\n\n${JSON.stringify(structuredData, null, 2)}`;

    // Use OpenAI to generate the recommendation
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ];

    console.log('Sending pricing recommendation request to OpenAI API');
    const recommendation = await generateJsonResponse<PricingRecommendation>(chatMessages);
    
    // Store the recommendation in the conversation context
    const context = getConversationContext(userId);
    
    // Access the recommendation data safely
    // Define a default structure if the API returns an unexpected format
    const defaultRecommendation = {
      recommendation: {
        confidence: 0,
        optimalPriceAdjustment: '0%'
      }
    };
    
    // Use the recommendation if available, otherwise use defaults
    const data = recommendation || defaultRecommendation;
    const confidence = data.recommendation?.confidence || 0;
    const adjustment = data.recommendation?.optimalPriceAdjustment || '0%';
    
    // Add internal note as assistant message
    context.messages.push({
      role: 'assistant',
      content: `Generated detailed pricing recommendation with ${confidence}% confidence recommending ${adjustment} price adjustment.`,
    });
    
    return recommendation;
  } catch (error: any) {
    console.error('Error generating pricing recommendation:', error);
    
    // Check for specific error message patterns to identify error types
    const errorMessage = error.message || '';
    
    if (errorMessage.includes('credit balance too low') || errorMessage.includes('insufficient_quota')) {
      return {
        optimalPriceAdjustment: 'N/A',
        confidence: 0,
        rationale: '⚠️ API Credit Issue: The OpenAI API credit balance is too low. Please contact the administrator to add credits to the account or update the API key.',
        insights: ['Service unavailable due to API credit issues.'],
        competitorAnalysis: {
          positioningSummary: 'Analysis unavailable',
          priceGap: 'Unknown',
        },
        whatIfScenarios: [
          {
            name: 'Service Unavailable',
            priceChange: 'N/A',
            estimatedImpact: {
              revenue: 'Unknown',
              margin: 'Unknown',
              salesVolume: 'Unknown',
              totalProfit: 'Unknown',
            },
            riskLevel: 'Unknown',
          }
        ],
        error: true,
        errorType: 'credit_balance'
      };
    } else if (errorMessage.includes('Invalid API key') || errorMessage.includes('authentication issue')) {
      return {
        optimalPriceAdjustment: 'N/A',
        confidence: 0,
        rationale: '⚠️ API Authentication Error: There\'s an issue with the AI service authentication. Please contact the administrator to verify the API key.',
        insights: ['Service unavailable due to authentication issues.'],
        competitorAnalysis: {
          positioningSummary: 'Analysis unavailable',
          priceGap: 'Unknown',
        },
        whatIfScenarios: [
          {
            name: 'Service Unavailable',
            priceChange: 'N/A',
            estimatedImpact: {
              revenue: 'Unknown',
              margin: 'Unknown',
              salesVolume: 'Unknown',
              totalProfit: 'Unknown',
            },
            riskLevel: 'Unknown',
          }
        ],
        error: true,
        errorType: 'auth_error'
      };
    } else if (errorMessage.includes('Rate limit exceeded')) {
      return {
        optimalPriceAdjustment: 'N/A',
        confidence: 0,
        rationale: '⚠️ Rate Limit Exceeded: The AI service is currently experiencing high demand. Please try again in a few minutes.',
        insights: ['Service temporarily unavailable due to rate limiting.'],
        competitorAnalysis: {
          positioningSummary: 'Analysis unavailable',
          priceGap: 'Unknown',
        },
        whatIfScenarios: [
          {
            name: 'Service Unavailable',
            priceChange: 'N/A',
            estimatedImpact: {
              revenue: 'Unknown',
              margin: 'Unknown',
              salesVolume: 'Unknown',
              totalProfit: 'Unknown',
            },
            riskLevel: 'Unknown',
          }
        ],
        error: true,
        errorType: 'rate_limit'
      };
    } else if (errorMessage.includes('JSON')) {
      return {
        optimalPriceAdjustment: 'N/A',
        confidence: 0,
        rationale: 'Failed to parse AI response. The AI service returned an invalid response format.',
        insights: ['AI service response format error.'],
        competitorAnalysis: {
          positioningSummary: 'Analysis unavailable',
          priceGap: 'Unknown',
        },
        whatIfScenarios: [
          {
            name: 'Service Unavailable',
            priceChange: 'N/A',
            estimatedImpact: {
              revenue: 'Unknown',
              margin: 'Unknown',
              salesVolume: 'Unknown',
              totalProfit: 'Unknown',
            },
            riskLevel: 'Unknown',
          }
        ],
        error: true,
        errorType: 'format_error'
      };
    }
    
    // Default error handler
    return {
      optimalPriceAdjustment: 'N/A',
      confidence: 0,
      rationale: 'Failed to generate pricing recommendation. Please try again later.',
      insights: ['Service is experiencing technical difficulties.'],
      competitorAnalysis: {
        positioningSummary: 'Analysis unavailable',
        priceGap: 'Unknown',
      },
      whatIfScenarios: [
        {
          name: 'Service Unavailable',
          priceChange: 'N/A',
          estimatedImpact: {
            revenue: 'Unknown',
            margin: 'Unknown',
            salesVolume: 'Unknown',
            totalProfit: 'Unknown',
          },
          riskLevel: 'Unknown',
        }
      ],
      error: true,
      errorType: 'unknown'
    };
  }
}
