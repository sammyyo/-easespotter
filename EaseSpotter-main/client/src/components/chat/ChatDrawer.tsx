import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWebSocket } from '@/hooks/use-websocket';
import { MessageCircle } from 'lucide-react';

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
}

interface ChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatDrawer({ open, onOpenChange }: ChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { sendMessage } = useWebSocket({
    onMessage: (data) => {
      console.log('Chat received message:', data);
      if (data.type === 'chat_message') {
        setMessages(prev => [...prev, {
          id: data.data.id,
          sender: data.data.sender,
          content: data.data.content,
          timestamp: data.data.timestamp
        }]);
      } else if (data.type === 'typing_indicator') {
        setIsTyping(data.data.isTyping && data.data.sender === 'support');
      }
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const message = {
      id: crypto.randomUUID(),
      sender: 'user',
      content: newMessage,
      timestamp: new Date().toISOString(),
    };

    sendMessage({
      type: 'chat_message',
      ...message
    });

    setNewMessage('');
  };

  const handleTyping = () => {
    sendMessage({
      type: 'typing_indicator',
      sender: 'user',
      isTyping: true
    });

    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    const timeout = setTimeout(() => {
      sendMessage({
        type: 'typing_indicator',
        sender: 'user',
        isTyping: false
      });
    }, 1000);

    setTypingTimeout(timeout);
  };

  useEffect(() => {
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [typingTimeout]);

  return (
    <div
      className={`fixed bottom-20 right-4 w-[400px] h-[500px] rounded-lg border shadow-lg bg-background transition-all duration-300 ease-in-out ${
        open ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex h-full w-full flex-col">
        <div className="p-6 flex-none">
          <h2 className="font-semibold text-lg">Live Chat Support</h2>
          <p className="text-sm text-muted-foreground">Chat with our support team</p>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              } items-end space-x-2`}
            >
              {message.sender !== 'user' && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.sender === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-muted rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-line">{message.content}</div>
                <span className="text-[10px] opacity-70 block mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start items-end space-x-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2 rounded-bl-none">
                <div className="flex space-x-1">
                  <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t mt-auto p-4">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              onInput={handleTyping}
              placeholder="Type your message..."
              className="flex-1"
            />
            <Button onClick={handleSendMessage}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}