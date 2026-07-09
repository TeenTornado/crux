"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code relative my-2">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(children).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          });
        }}
        className="absolute right-2 top-2 rounded border border-ink-500 bg-ink-800/90 p-1 text-paper-faint opacity-0 transition-opacity hover:text-paper group-hover/code:opacity-100"
        title="Copy code"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <pre className="overflow-x-auto rounded-lg border border-ink-600 bg-ink-900/80 p-3 font-mono text-[12px] leading-relaxed text-paper-dim">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/** Markdown rendered with the app's dark editorial styling. */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[13.5px] leading-relaxed text-paper-dim [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-paper">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-paper-dim">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-gold-soft underline decoration-gold-dim/50 underline-offset-2 hover:decoration-gold-soft"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-1 list-none space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-5 list-decimal space-y-1 marker:text-paper-faint">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="relative pl-4 before:absolute before:left-0 before:top-[9px] before:h-1 before:w-1 before:rounded-full before:bg-gold-dim [ol_&]:pl-1 [ol_&]:before:hidden">
              {children}
            </li>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 font-serif text-[16px] font-semibold text-paper">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-3 font-serif text-[15px] font-semibold text-paper">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 font-serif text-[14px] font-semibold text-paper">
              {children}
            </h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-gold-dim/60 pl-3 text-paper-faint">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-paper/10" />,
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className || "");
            if (isBlock) return <CodeBlock>{String(children)}</CodeBlock>;
            return (
              <code className="rounded bg-ink-700/70 px-1 py-0.5 font-mono text-[12px] text-gold-soft">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-ink-600 bg-ink-800/60 px-2 py-1 text-left font-medium text-paper-dim">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-ink-600 px-2 py-1 text-paper-dim">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
