import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22]">
        {language && (
          <span className="text-xs text-[#8b949e] font-mono">{language}</span>
        )}
        <button
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="ml-auto flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-white transition-colors duration-200 cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={14} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <pre className="bg-[#0d1117] overflow-x-auto px-4 py-4 m-0">
        <code className="font-mono text-sm text-[#e6edf3] leading-relaxed whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
};
