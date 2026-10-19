import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Bot, User, SendHorizontal, Loader2, ArrowDown, ArrowRight, Command, ShieldAlert, Settings, Package, DollarSign, ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useCurrency } from '@/hooks/use-currency';
import { getCurrencySymbol } from '@/lib/currency-utils';

interface Product {
  id: number;
  name: string;
  currentPrice: string;
  basePrice: string;
  category: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PricingRecommendation {
  optimalPriceAdjustment: string;
  confidence: number;
  rationale: string;
  insights: string[];
  competitorAnalysis: {
    positioningSummary: string;
    priceGap: string;
  };
  whatIfScenarios: {
    name: string;
    priceChange: string;
    estimatedImpact: {
      revenue: string;
      margin: string;
      salesVolume: string;
      totalProfit: string;
    };
    riskLevel: string;
  }[];
}

export default function PricingAssistant() {
  const { toast } = useToast();
  const { currency } = useCurrency();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [targetMargin, setTargetMargin] = useState(30);
  const [competitorFocus, setCompetitorFocus] = useState(true);
  const [demandElasticity, setDemandElasticity] = useState(5);
  const [marketShare, setMarketShare] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    id: '1',
    role: 'assistant',
    content: "Hi there! I'm your AI Pricing Assistant. How can I help optimize your pricing strategy today?",
    timestamp: new Date()
  }]);
  const [inputMessage, setInputMessage] = useState('');
  const [isFirstInteraction, setIsFirstInteraction] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Fetch products
  const { data: products } = useQuery<Product[]>({
    queryKey: ['/api/products'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
  });

  // AI Chat Mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', '/api/pricing/ai-chat', {
        message,
        productId: selectedProduct?.id || null,
        parameters: {
          targetMargin,
          competitorFocus,
          demandElasticity,
          marketShare,
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      return response.json();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to get AI response: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  // Pricing Recommendation Mutation
  const recommendationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) {
        throw new Error('Please select a product first');
      }
      
      const response = await apiRequest('POST', '/api/pricing/ai-recommendation', {
        productId: selectedProduct.id,
        category: selectedProduct.category,
        targetMargin,
        competitorFocus,
        demandElasticity,
        marketShare,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      return response.json();
    },
    onSuccess: (data: PricingRecommendation & { error?: boolean; errorType?: string }) => {
      // Check if this is an error response
      if (data.error) {
        // For API credit issues and other errors, display as an error message
        addMessage('assistant', `ERROR_MESSAGE: ${data.rationale}`);
        
        // Show toast for credit balance issues
        if (data.errorType === 'credit_balance') {
          toast({
            title: 'API Credit Issue',
            description: 'The AI service is unavailable due to insufficient API credits. Please contact your administrator.',
            variant: 'destructive',
          });
        }
        
        setIsFirstInteraction(false);
        return;
      }
      
      // Format and display the recommendation as an assistant message
      let content = `**Pricing Recommendation for ${selectedProduct?.name}**\n\n`;
      content += `**Optimal Price Adjustment:** ${data.optimalPriceAdjustment} (${data.confidence}% confidence)\n\n`;
      content += `**Rationale:**\n${data.rationale}\n\n`;
      
      content += `**Key Insights:**\n`;
      data.insights.forEach((insight, i) => {
        content += `${i + 1}. ${insight}\n`;
      });
      content += '\n';
      
      content += `**Competitor Analysis:**\n`;
      content += `- Positioning: ${data.competitorAnalysis.positioningSummary}\n`;
      content += `- Price Gap: ${data.competitorAnalysis.priceGap}\n\n`;
      
      content += `**What-if Scenarios:**\n`;
      data.whatIfScenarios.forEach(scenario => {
        content += `${scenario.name} (${scenario.priceChange}):\n`;
        content += `  - Revenue: ${scenario.estimatedImpact.revenue}\n`;
        content += `  - Margin: ${scenario.estimatedImpact.margin}\n`;
        content += `  - Sales Volume: ${scenario.estimatedImpact.salesVolume}\n`;
        content += `  - Total Profit: ${scenario.estimatedImpact.totalProfit}\n`;
        content += `  - Risk Level: ${scenario.riskLevel}\n\n`;
      });
      
      addMessage('assistant', content);
      setIsFirstInteraction(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to get AI recommendation: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date()
    }]);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMessage = inputMessage;
    setInputMessage('');
    addMessage('user', userMessage);

    try {
      const response = await chatMutation.mutateAsync(userMessage);
      
      // Add message with error formatting if needed
      if (response.error) {
        // Apply direct formatting rather than HTML tags
        if (response.errorType === 'credit_balance') {
          // Add a special marker for error messages
          addMessage('assistant', `ERROR_MESSAGE: ${response.content}`);
          
          toast({
            title: 'API Credit Issue',
            description: 'The AI service is unavailable due to insufficient API credits. Please contact your administrator.',
            variant: 'destructive',
          });
        } else {
          // Other error types
          addMessage('assistant', `ERROR_MESSAGE: ${response.content}`);
        }
      } else {
        // Normal message
        addMessage('assistant', response.content);
      }
      
      setIsFirstInteraction(false);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const generateRecommendation = async () => {
    if (!selectedProduct) {
      toast({
        title: 'Select a Product',
        description: 'Please select a product before generating recommendations.',
        variant: 'default',
      });
      return;
    }
    
    try {
      addMessage('user', `Generate a pricing recommendation for ${selectedProduct.name} with the current parameters.`);
      await recommendationMutation.mutateAsync();
    } catch (error) {
      console.error('Error generating recommendation:', error);
    }
  };

  const renderMessageContent = (content: string) => {
    // Check if this is an error message
    if (content.startsWith('ERROR_MESSAGE:')) {
      // Extract the error content without the prefix
      const errorContent = content.substring('ERROR_MESSAGE:'.length).trim();
      
      // Split the error content by lines for rendering
      return errorContent.split('\n').map((line, i) => {
        // Apply special styling for error messages
        return <p key={i} className="text-red-500 font-medium">{line}</p>;
      });
    }
    
    // Process the content to remove/replace markdown characters
    let processedContent = content;
    
    // Regular Markdown-like rendering for normal messages
    return processedContent.split('\n').map((line, i) => {
      // Handle section headers (### Heading)
      if (line.startsWith('### ')) {
        return <h3 key={i} className="text-lg font-bold mt-3 mb-1">{line.slice(4)}</h3>;
      }
      // Handle subsection headers (## Heading)
      else if (line.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-bold mt-4 mb-2">{line.slice(3)}</h2>;
      }
      // Handle main headers (# Heading)
      else if (line.startsWith('# ')) {
        return <h1 key={i} className="text-2xl font-bold mt-4 mb-2">{line.slice(2)}</h1>;
      }
      // Handle bold text wrapped in ** (both start and end)
      else if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="font-bold">{line.slice(2, -2)}</p>;
      }
      // Handle bold text with ** in the middle of text
      else if (line.includes('**')) {
        // Split by ** markers
        const segments = line.split('**');
        // If odd number of elements, we have proper pairing
        const elements = segments.map((segment, index) => {
          // Even indexes are regular text, odd indexes are bold
          return index % 2 === 0 ? 
            <span key={`${i}-${index}`}>{segment}</span> : 
            <strong key={`${i}-${index}`}>{segment}</strong>;
        });
        return <p key={i}>{elements}</p>;
      }
      // Handle bullet points
      else if (line.startsWith('- ')) {
        return <p key={i} className="ml-4">• {line.slice(2)}</p>;
      }
      // Handle numbered lists
      else if (/^\d+\.\s/.test(line)) {
        return <p key={i} className="ml-4">{line}</p>;
      }
      // Handle nested bullet points
      else if (line.startsWith('  - ')) {
        return <p key={i} className="ml-8">• {line.slice(4)}</p>;
      }
      // Handle empty lines
      else if (line === '') {
        return <br key={i} />;
      }
      // Default case for regular text
      else {
        return <p key={i}>{line}</p>;
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-6 xl:flex-row xl:space-y-0 xl:space-x-6">
        {/* Chat panel */}
        <div className="flex-1 space-y-4">
          <Card className="flex flex-col h-[calc(100vh-170px)]">
            <CardHeader className="border-b">              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Avatar>
                    <AvatarImage src="/images/ai-assistant.png" />
                    <AvatarFallback><Bot size={16} /></AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-xl">AI Pricing Assistant</CardTitle>
                    <CardDescription>Powered by OpenAI</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Online
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div 
                  key={message.id} 
                  className={cn(
                    "flex gap-3 p-3 rounded-lg",
                    message.role === 'assistant' ? "bg-muted/50" : "bg-primary/5"
                  )}
                >
                  <Avatar className="h-8 w-8">
                    {message.role === 'assistant' ? (
                      <>
                        <AvatarImage src="/images/ai-assistant.png" />
                        <AvatarFallback><Bot size={16} /></AvatarFallback>
                      </>
                    ) : (
                      <>
                        <AvatarImage src="/images/user-avatar.png" />
                        <AvatarFallback><User size={16} /></AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  <div className="space-y-1.5 w-full text-sm">
                    <div className="font-medium">
                      {message.role === 'assistant' ? 'AI Assistant' : 'You'}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {renderMessageContent(message.content)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </CardContent>

            <CardFooter className="border-t p-3">
              <div className="flex items-center w-full space-x-2">
                <Textarea
                  placeholder="Ask about pricing strategies or generate recommendations..."
                  className="flex-1 resize-none"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button 
                  size="icon" 
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || chatMutation.isPending}
                >
                  {chatMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>

        {/* Settings panel */}
        <div className="xl:w-80 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Settings className="mr-2 h-4 w-4" /> 
                Assistant Settings
              </CardTitle>
              <CardDescription>
                Configure parameters for AI recommendations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="product-selector">Select Product</Label>
                <Select 
                  value={selectedProduct?.id?.toString() || ''} 
                  onValueChange={(value) => {
                    const product = products?.find(p => p.id === Number(value)) || null;
                    setSelectedProduct(product);
                  }}
                >
                  <SelectTrigger id="product-selector">
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.name} - {
                          new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
                            Number(product.currentPrice)
                          )
                        }
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label htmlFor="target-margin">Target Profit Margin</Label>
                  <span className="text-sm text-muted-foreground">{targetMargin}%</span>
                </div>
                <Slider
                  id="target-margin"
                  min={5}
                  max={60}
                  step={1}
                  value={[targetMargin]}
                  onValueChange={(values) => setTargetMargin(values[0])}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label htmlFor="elasticity">Demand Elasticity</Label>
                  <span className="text-sm text-muted-foreground">{demandElasticity}/10</span>
                </div>
                <Slider
                  id="elasticity"
                  min={1}
                  max={10}
                  step={1}
                  value={[demandElasticity]}
                  onValueChange={(values) => setDemandElasticity(values[0])}
                />
                <p className="text-xs text-muted-foreground">How sensitive buyers are to price changes (10 = highly sensitive)</p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="competitor-focus"
                  checked={competitorFocus}
                  onCheckedChange={setCompetitorFocus}
                />
                <Label htmlFor="competitor-focus">Prioritize competitor positioning</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="market-share"
                  checked={marketShare}
                  onCheckedChange={setMarketShare}
                />
                <Label htmlFor="market-share">Focus on gaining market share</Label>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={generateRecommendation}
                disabled={!selectedProduct || recommendationMutation.isPending}
              >
                {recommendationMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <span className="mr-2 font-medium">{getCurrencySymbol(currency)}</span>
                )}
                Generate Recommendation
              </Button>
            </CardFooter>
          </Card>

          {isFirstInteraction && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Getting Started</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="bg-primary/10 p-1 rounded">
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </div>
                    <p>Select a product and adjust settings</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="bg-primary/10 p-1 rounded">
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </div>
                    <p>Click "Generate Recommendation" for detailed pricing advice</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="bg-primary/10 p-1 rounded">
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </div>
                    <p>Or chat directly with the AI for specific questions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
