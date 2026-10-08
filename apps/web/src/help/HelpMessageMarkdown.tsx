import { Fragment, type ReactNode } from "react";

type ListBlock = {
  type: "ordered-list" | "unordered-list";
  items: string[];
  /** The number the model gave the first item, when it is not 1, so numbering survives a break. */
  start?: number;
  /** Indented bullets under an item, by item index. */
  nested?: Record<number, string[]>;
};
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

    const ordered = line.match(/^(\d+)[.)]\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const indented = /^(\s{2,}|\t)/.test(rawLine);
    const previous = blocks.at(-1);

    // An indented bullet under a list item belongs to that item, even after a blank line.
    if (unordered != null && indented && previous != null && previous.type !== "paragraph") {
      const index = previous.items.length - 1;
      previous.nested = { ...previous.nested, [index]: [...(previous.nested?.[index] ?? []), unordered[1]!] };
      separated = false;
      continue;
    }

    const item = ordered?.[2] ?? unordered?.[1];
    if (item != null) {
      const type = ordered == null ? "unordered-list" as const : "ordered-list" as const;
      const number = ordered == null ? null : Number(ordered[1]);
      // Same list when it follows directly, or when the model's numbering says it continues.
      const continues = previous?.type === type && (!separated || (number != null && number === previous.items.length + (previous.start ?? 1)));
      if (continues) {
        previous.items.push(item);
      } else {
        blocks.push({ type, items: [item], ...(number != null && number !== 1 ? { start: number } : {}) });
      }
      separated = false;
      continue;
    }

    const text = line.replace(/^#{1,3}\s+/, "");
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
      return <code key={index} className="rounded-sm border border-foreground/15 bg-card px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
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
          <List key={index} start={block.start} className={`${block.type === "ordered-list" ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:font-semibold marker:text-ocean-primary`}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-1">
                {inlineMarkdown(item)}
                {block.nested?.[itemIndex] != null && (
                  <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-muted-foreground">
                    {block.nested[itemIndex].map((child, childIndex) => <li key={childIndex} className="pl-1">{inlineMarkdown(child)}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
