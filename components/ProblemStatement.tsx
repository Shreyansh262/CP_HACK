'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function ProblemStatement({ markdown }: { markdown: string }) {
  const normalizedMarkdown = markdown.replace(/∗/g, '*');

  return (
    <article className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    </article>
  );
}