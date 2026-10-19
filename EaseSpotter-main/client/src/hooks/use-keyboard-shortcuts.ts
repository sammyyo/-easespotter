import { useEffect } from 'react';

type ShortcutHandler = (e: KeyboardEvent) => void;

interface ShortcutMap {
  [key: string]: ShortcutHandler;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Get modifiers
      const ctrlOrCmd = e.metaKey || e.ctrlKey;
      
      // Only proceed if Ctrl/Cmd is pressed
      if (!ctrlOrCmd) return;

      // Create the shortcut key (e.g., 'ctrl+n')
      const shortcutKey = `ctrl+${e.key.toLowerCase()}`;

      // Check if we have a handler for this shortcut
      const handler = shortcuts[shortcutKey];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
