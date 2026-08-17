import { Fragment, type ReactNode } from "react";

type ListBlock = { type: "ordered-list" | "unordered-list"; items: string[] };
type MarkdownBlock = { type: "paragraph"; text: string } | ListBlock;

export function parseHelpMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let separated = true;

  for (const rawLine of source.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      separated = true;
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const item = ordered?.[1] ?? unordered?.[1];
    if (item != null) {
      const type = ordered == null ? "unordered-list" as const : "ordered-list" as const;
      const previous = blocks.at(-1);
      if (!separated && previous?.type === type) {
        previous.items.push(item);
      } else {
        blocks.push({ type, items: [item] });
      }
      separated = false;
      continue;
    }

    const text = line.replace(/^#{1,3}\s+/, "");
    const previous = blocks.at(-1);
    if (!separated && previous?.type === "paragraph") {
      previous.text += ` ${text}`;
    } else {
      blocks.push({ type: "paragraph", text });
    }
    separated = false;
  }
  return blocks;
}

function inlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="border border-foreground/15 bg-white px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default function HelpMessageMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-relaxed">
      {parseHelpMarkdown(text).map((block, index) => {
        if (block.type === "paragraph") {
          return <p key={index} className="whitespace-pre-wrap">{inlineMarkdown(block.text)}</p>;
        }
        const List = block.type === "ordered-list" ? "ol" : "ul";
        return (
          <List key={index} className={`${block.type === "ordered-list" ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:font-semibold marker:text-ocean-primary`}>
            {block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{inlineMarkdown(item)}</li>)}
          </List>
        );
      })}
    </div>
  );
}
