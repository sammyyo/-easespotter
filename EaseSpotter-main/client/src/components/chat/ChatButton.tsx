import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ChatDrawer } from './ChatDrawer';
import { useWebSocket } from '@/hooks/use-websocket';

export function ChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  useWebSocket({
    onMessage: (data) => {
      if (data.type === 'chat_message') {
        // Handle incoming chat messages
        console.log('Received chat message:', data);
      }
    },
  });

  return (
    <>
      <Button
        className="fixed bottom-4 right-4 rounded-full h-12 w-12 p-0"
        onClick={() => setIsOpen(true)}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
      <ChatDrawer open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
