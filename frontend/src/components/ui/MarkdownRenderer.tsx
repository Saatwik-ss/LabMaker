import React, { useState } from 'react';
import { IconCopy, IconCheck } from './Icons';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg border border-gray-800 bg-gray-950 overflow-hidden font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/80 border-b border-gray-800 text-gray-400 select-none">
        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Copy code to clipboard"
        >
          {copied ? <IconCheck /> : <IconCopy />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-gray-200 leading-relaxed scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Split into code blocks and normal markdown segments
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(renderTextSegment(textBefore, `text-${lastIndex}`));
    }

    const language = match[1] || 'text';
    const code = match[2].trimEnd();
    parts.push(
      <CodeBlock key={`code-${match.index}`} language={language} code={code} />
    );

    lastIndex = match.index + match[0].length;
  }

  const remaining = content.substring(lastIndex);
  if (remaining) {
    parts.push(renderTextSegment(remaining, `text-${lastIndex}`));
  }

  return (
    <div className={`text-sm text-gray-200 space-y-2 leading-relaxed ${className}`}>
      {parts}
    </div>
  );
};

function renderTextSegment(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = (idx: number) => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-ul-${idx}`} className="list-disc pl-5 my-2 space-y-1 text-gray-300">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Bullet list item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(
        <li key={`${keyPrefix}-li-${idx}`}>
          {renderInlineFormatting(trimmed.substring(2))}
        </li>
      );
      return;
    }

    // Numbered list item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      inList = true;
      listItems.push(
        <li key={`${keyPrefix}-li-${idx}`}>
          {renderInlineFormatting(numMatch[2])}
        </li>
      );
      return;
    }

    // Flush any pending list
    flushList(idx);

    // Empty line
    if (!trimmed) {
      elements.push(<div key={`${keyPrefix}-br-${idx}`} className="h-2" />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`${keyPrefix}-h4-${idx}`} className="text-sm font-semibold text-gray-100 mt-3 mb-1">
          {renderInlineFormatting(trimmed.substring(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`${keyPrefix}-h3-${idx}`} className="text-base font-bold text-white mt-4 mb-1.5 border-b border-gray-800 pb-1">
          {renderInlineFormatting(trimmed.substring(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`${keyPrefix}-h2-${idx}`} className="text-lg font-bold text-white mt-4 mb-2">
          {renderInlineFormatting(trimmed.substring(2))}
        </h2>
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote key={`${keyPrefix}-quote-${idx}`} className="border-l-2 border-blue-500 pl-3 py-1 my-2 text-gray-400 bg-gray-900/50 rounded-r text-xs">
          {renderInlineFormatting(trimmed.substring(2))}
        </blockquote>
      );
      return;
    }

    // Regular paragraph line
    elements.push(
      <p key={`${keyPrefix}-p-${idx}`} className="my-1">
        {renderInlineFormatting(line)}
      </p>
    );
  });

  flushList(lines.length);

  return <React.Fragment key={keyPrefix}>{elements}</React.Fragment>;
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Regex pattern for inline formatting: `code`, **bold**, *italic*
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-gray-800/90 text-blue-300 font-mono text-[11px] border border-gray-700/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={i} className="italic text-gray-300">
          {token.slice(1, -1)}
        </em>
      );
    }
    return token;
  });
}
