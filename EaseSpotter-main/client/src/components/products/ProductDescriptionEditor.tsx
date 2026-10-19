import { forwardRef, useRef } from "react";
import { List, ListOrdered, Pilcrow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ProductDescriptionEditorProps {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  placeholder?: string;
}

export const ProductDescriptionEditor = forwardRef<HTMLTextAreaElement, ProductDescriptionEditorProps>(({
  value = "",
  onChange,
  onBlur,
  name,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  placeholder = "Enter product description (optional)",
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const setTextareaRef = (node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;

    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  const updateValue = (nextValue: string, nextSelectionStart?: number, nextSelectionEnd?: number) => {
    onChange(nextValue);

    requestAnimationFrame(() => {
      if (textareaRef.current && nextSelectionStart !== undefined) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextSelectionStart, nextSelectionEnd ?? nextSelectionStart);
      }
    });
  };

  const getSelectionRange = () => {
    const textarea = textareaRef.current;
    return {
      start: textarea?.selectionStart ?? value.length,
      end: textarea?.selectionEnd ?? value.length,
    };
  };

  const formatSelectedLines = (formatter: (line: string, index: number) => string) => {
    const { start, end } = getSelectionRange();
    const blockStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextLineBreak = value.indexOf("\n", end);
    const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const selectedBlock = value.slice(blockStart, blockEnd);
    const formattedBlock = selectedBlock
      .split("\n")
      .map((line, index) => formatter(line, index))
      .join("\n");
    const nextValue = `${value.slice(0, blockStart)}${formattedBlock}${value.slice(blockEnd)}`;

    updateValue(nextValue, blockStart, blockStart + formattedBlock.length);
  };

  const addBullets = () => {
    formatSelectedLines((line) => {
      if (!line.trim()) return line;
      return /^[-*]\s/.test(line.trimStart()) ? line : `- ${line}`;
    });
  };

  const addNumbering = () => {
    formatSelectedLines((line, index) => {
      if (!line.trim()) return line;
      return /^\d+\.\s/.test(line.trimStart()) ? line : `${index + 1}. ${line}`;
    });
  };

  const addParagraphBreak = () => {
    const { start, end } = getSelectionRange();
    const insertion = "\n\n";
    const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
    const cursorPosition = start + insertion.length;

    updateValue(nextValue, cursorPosition);
  };

  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center gap-1 border-b bg-muted/30 p-2">
        <Button type="button" variant="ghost" size="sm" onClick={addBullets} title="Add bullet list">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={addNumbering} title="Add numbered list">
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={addParagraphBreak} title="Add paragraph break">
          <Pilcrow className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        ref={setTextareaRef}
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        placeholder={placeholder}
        className="min-h-36 resize-y border-0 focus-visible:ring-0"
      />
    </div>
  );
});

ProductDescriptionEditor.displayName = "ProductDescriptionEditor";
