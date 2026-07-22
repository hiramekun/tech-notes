"use client";

import type { ComponentPropsWithoutRef } from "react";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import { common } from "lowlight";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { MermaidDiagram } from "@/components/mermaid-diagram";

type MarkdownContentProps = {
  content: string;
};

const highlightLanguages = {
  ...common,
  dockerfile,
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeSanitize,
        [
          rehypeHighlight,
          {
            detect: false,
            languages: highlightLanguages,
            plainText: ["mermaid"],
          },
        ],
      ]}
      components={{
        a: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
          <a {...props} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ className, children, ...props }) => {
          if (className === "language-mermaid") {
            return <MermaidDiagram chart={String(children).replace(/\n$/, "")} />;
          }

          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
