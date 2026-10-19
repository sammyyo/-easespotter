import Anthropic from '@anthropic-ai/sdk';

// Check if API key is available
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY is not set. AI recommendation features will fall back to simulated responses.');
}

// Initialize Anthropic client if API key is available
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = 'claude-3-7-sonnet-20250219';

interface PricingParams {
  targetMargin: number;
  competitorFocus: boolean;
  demandElasticity: number;
  marketShare: boolean;
  avgProductPrice: number;
  avgCompetitorPrice: number;
  priceTrend: number;
  category: string;
  productData: any;
  competitorData: any;
  marketData: any;
  prompt?: string;
}

export async function generateAIRecommendation(params: PricingParams) {
  if (!anthropic) {
    console.log('Anthropic client not initialized, using fallback response generation');
    return null;
  }

  try {
    // Structured data for the AI to work with
    const structuredData = {
      inputs: {
        targetMargin: params.targetMargin,
        competitorFocus: params.competitorFocus,
        demandElasticity: params.demandElasticity,
        marketShare: params.marketShare,
        category: params.category,
        averageProductPrice: params.avgProductPrice || 'unknown',
        averageCompetitorPrice: params.avgCompetitorPrice || 'unknown',
        priceTrend: params.priceTrend || 'unknown',
      },
      productData: params.productData || {},
      competitorData: params.competitorData || {},
      marketData: params.marketData || {},
      additionalPrompt: params.prompt || ''
    };

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

Please provide a structured response with:
1. A recommended price adjustment percentage (positive for increase, negative for decrease)
2. A confidence level (50-95%)
3. A detailed rationale explaining the recommendation
4. 3-5 insights about the pricing strategy
5. A competitor analysis with positioning summary and price gap percentage
6. Three what-if scenarios (conservative, recommended, aggressive) with estimated impacts on revenue, margin, sales volume, and total profit`;

    console.log('Sending request to Anthropic API for pricing recommendation');
    
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemMessage,
      messages: [
        { 
          role: 'user', 
          content: `Based on the following pricing data and parameters, provide a detailed pricing recommendation:\n\n${JSON.stringify(structuredData, null, 2)}`
        }
      ],
    });
    
    console.log('Received response from Anthropic API');
    
    // Parse the AI response
    try {
      // Extract structured data from the response
      const contentBlock = response.content[0];
      // Make sure we have a text block
      if (contentBlock.type !== 'text') {
        console.log('Unexpected response format from Anthropic API');
        return null;
      }
      
      const content = contentBlock.text;
      
      // Let's extract the key sections using regex patterns
      const extractRecommendation = () => {
        // Try to find a price adjustment percentage
        const percentageMatch = content.match(/recommended price adjustment[:\s]+([+-]?\d+\.?\d*)%/i) || 
                               content.match(/price adjustment of[:\s]+([+-]?\d+\.?\d*)%/i) ||
                               content.match(/adjust prices by[:\s]+([+-]?\d+\.?\d*)%/i);
        
        const confidenceMatch = content.match(/confidence[:\s]+(\d+)%/i) ||
                               content.match(/(\d+)% confidence/i);
        
        const rationale = content.match(/rationale[:\s]+([\s\S]+?)(?=\n\n|insights|competitor analysis|what-if scenarios|$)/i)?.[1]?.trim();
        
        return {
          optimalPriceAdjustment: percentageMatch?.[1] 
            ? `${percentageMatch[1].startsWith('+') ? percentageMatch[1] : (percentageMatch[1].startsWith('-') ? percentageMatch[1] : `+${percentageMatch[1]}`)}%` 
            : "0.0%",
          confidence: confidenceMatch?.[1] ? parseInt(confidenceMatch[1]) : 85,
          rationale: rationale || "Based on the analysis of your pricing parameters, the current pricing appears optimal."
        };
      };
      
      const extractInsights = () => {
        // Try to find the insights section
        const insightsSection = content.match(/insights[:\s]+([\s\S]+?)(?=\n\n|competitor analysis|what-if scenarios|$)/i)?.[1];
        
        if (insightsSection) {
          // Extract bullet points
          const bulletPoints = insightsSection.match(/[-•*]\s+([^\n]+)/g);
          if (bulletPoints) {
            return bulletPoints.map((point: string) => point.replace(/^[-•*]\s+/, '').trim());
          }
        }
        
        // Fallback insights
        return [
          "Regular price testing can help optimize your pricing strategy over time.",
          "Consider implementing bundle pricing to increase average order value.",
          "Monitor competitor pricing trends closely to maintain optimal positioning."
        ];
      };
      
      const extractCompetitorAnalysis = () => {
        const competitorSection = content.match(/competitor analysis[:\s]+([\s\S]+?)(?=\n\n|what-if scenarios|$)/i)?.[1];
        
        const positioningMatch = competitorSection?.match(/positioning[:\s]+([^\n]+)/i) ||
                                competitorSection?.match(/positioning summary[:\s]+([^\n]+)/i);
        
        const priceGapMatch = competitorSection?.match(/price gap[:\s]+([+-]?\d+\.?\d*)%/i) ||
                             competitorSection?.match(/price difference[:\s]+([+-]?\d+\.?\d*)%/i);
        
        const trendMatch = competitorSection?.match(/trend[:\s]+([^\n]+)/i) ||
                           competitorSection?.match(/trend summary[:\s]+([^\n]+)/i);
        
        return {
          positioningSummary: positioningMatch?.[1] || "Insufficient competitor data to determine market positioning.",
          priceGap: priceGapMatch?.[1] ? `${priceGapMatch[1]}%` : "0%",
          trendSummary: trendMatch?.[1] || "Insufficient historical data to determine pricing trends."
        };
      };
      
      const extractWhatIfScenarios = () => {
        const scenariosSection = content.match(/what-if scenarios[:\s]+([\s\S]+?)(?=\n\n|$)/i)?.[1];
        
        if (!scenariosSection) {
          // Default scenarios if none are found
          return generateDefaultScenarios(parseFloat(extractRecommendation().optimalPriceAdjustment), params.demandElasticity);
        }
        
        // Try to extract conservative scenario
        const conservativeMatch = scenariosSection.match(/conservative[^:]*:[^\n]*([\s\S]+?)(?=moderate|recommended|aggressive|$)/i);
        const recommendedMatch = scenariosSection.match(/recommended[^:]*:[^\n]*([\s\S]+?)(?=conservative|aggressive|$)/i);
        const aggressiveMatch = scenariosSection.match(/aggressive[^:]*:[^\n]*([\s\S]+?)(?=conservative|recommended|$)/i);
        
        const extractScenario = (scenarioText: string | undefined, name: string) => {
          if (!scenarioText) return null;
          
          const priceChangeMatch = scenarioText.match(/price change[:\s]+([+-]?\d+\.?\d*)%/i) ||
                                  scenarioText.match(/adjustment[:\s]+([+-]?\d+\.?\d*)%/i);
          
          const revenueMatch = scenarioText.match(/revenue[:\s]+([+-]?\d+\.?\d*)%/i);
          const marginMatch = scenarioText.match(/margin[:\s]+([+-]?\d+\.?\d*)%/i);
          const volumeMatch = scenarioText.match(/volume[:\s]+([+-]?\d+\.?\d*)%/i) ||
                              scenarioText.match(/sales volume[:\s]+([+-]?\d+\.?\d*)%/i);
          const profitMatch = scenarioText.match(/profit[:\s]+([+-]?\d+\.?\d*)%/i) ||
                             scenarioText.match(/total profit[:\s]+([+-]?\d+\.?\d*)%/i);
          
          const riskMatch = scenarioText.match(/risk[:\s]+([^\n,]+)/i) ||
                           scenarioText.match(/risk level[:\s]+([^\n,]+)/i);
          
          return {
            name,
            priceChange: priceChangeMatch?.[1] ? `${priceChangeMatch[1]}%` : "0.0%",
            estimatedImpact: {
              revenue: revenueMatch?.[1] ? `${revenueMatch[1]}%` : "0.0%",
              margin: marginMatch?.[1] ? `${marginMatch[1]}%` : "0.0%",
              salesVolume: volumeMatch?.[1] ? `${volumeMatch[1]}%` : "0.0%",
              totalProfit: profitMatch?.[1] ? `${profitMatch[1]}%` : "0.0%"
            },
            riskLevel: riskMatch?.[1] || "Medium"
          };
        };
        
        const scenarios = [];
        
        const conservative = extractScenario(conservativeMatch?.[1], "Conservative Adjustment");
        const recommended = extractScenario(recommendedMatch?.[1], "Recommended Adjustment");
        const aggressive = extractScenario(aggressiveMatch?.[1], "Aggressive Adjustment");
        
        if (conservative) scenarios.push(conservative);
        if (recommended) scenarios.push(recommended);
        if (aggressive) scenarios.push(aggressive);
        
        // If we couldn't extract any scenarios, use the default generator
        if (scenarios.length === 0) {
          return generateDefaultScenarios(parseFloat(extractRecommendation().optimalPriceAdjustment), params.demandElasticity);
        }
        
        return scenarios;
      };
      
      return {
        recommendation: extractRecommendation(),
        insights: extractInsights(),
        competitorAnalysis: extractCompetitorAnalysis(),
        whatIfScenarios: extractWhatIfScenarios()
      };
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return null;
    }
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    return null;
  }
}

// Default scenario generator as a fallback
function generateDefaultScenarios(recommendedAdjustment: number, demandElasticity: number) {
  // Define three different price change scenarios: conservative, recommended, and aggressive
  const scenarios = [];
  
  // Factor to convert price elasticity to estimated volume changes
  const elasticityImpact = demandElasticity / 5;
  
  // Conservative scenario (smaller change)
  const conservativeChange = recommendedAdjustment / 2;
  scenarios.push({
    name: "Conservative Adjustment",
    priceChange: `${conservativeChange > 0 ? '+' : ''}${conservativeChange.toFixed(1)}%`,
    estimatedImpact: {
      revenue: `${(conservativeChange - (conservativeChange * elasticityImpact * 0.5)).toFixed(1)}%`,
      margin: `${(conservativeChange * 0.8).toFixed(1)}%`,
      salesVolume: `${(-conservativeChange * elasticityImpact * 0.5).toFixed(1)}%`,
      totalProfit: `${(conservativeChange - (conservativeChange * elasticityImpact * 0.3)).toFixed(1)}%`
    },
    riskLevel: Math.abs(conservativeChange) < 3 ? "Very Low" : "Low"
  });
  
  // Recommended scenario
  scenarios.push({
    name: "Recommended Adjustment",
    priceChange: `${recommendedAdjustment > 0 ? '+' : ''}${recommendedAdjustment.toFixed(1)}%`,
    estimatedImpact: {
      revenue: `${(recommendedAdjustment - (recommendedAdjustment * elasticityImpact * 0.7)).toFixed(1)}%`,
      margin: `${(recommendedAdjustment * 1.2).toFixed(1)}%`,
      salesVolume: `${(-recommendedAdjustment * elasticityImpact * 0.7).toFixed(1)}%`,
      totalProfit: `${(recommendedAdjustment - (recommendedAdjustment * elasticityImpact * 0.4)).toFixed(1)}%`
    },
    riskLevel: Math.abs(recommendedAdjustment) < 3 ? "Low" : (Math.abs(recommendedAdjustment) < 7 ? "Medium" : "High")
  });
  
  // Aggressive scenario (larger change)
  const aggressiveChange = recommendedAdjustment * 1.5;
  scenarios.push({
    name: "Aggressive Adjustment",
    priceChange: `${aggressiveChange > 0 ? '+' : ''}${aggressiveChange.toFixed(1)}%`,
    estimatedImpact: {
      revenue: `${(aggressiveChange - (aggressiveChange * elasticityImpact)).toFixed(1)}%`,
      margin: `${(aggressiveChange * 1.7).toFixed(1)}%`,
      salesVolume: `${(-aggressiveChange * elasticityImpact).toFixed(1)}%`,
      totalProfit: `${(aggressiveChange - (aggressiveChange * elasticityImpact * 0.6)).toFixed(1)}%`
    },
    riskLevel: Math.abs(aggressiveChange) < 5 ? "Medium" : (Math.abs(aggressiveChange) < 10 ? "High" : "Very High")
  });
  
  return scenarios;
}