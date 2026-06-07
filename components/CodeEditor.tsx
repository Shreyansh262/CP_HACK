'use client';

import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';

export default function CodeEditor({
  language,
  value,
  onChange,
}: {
  language: 'cpp' | 'python';
  value: string;
  onChange: (v: string) => void;
}) {
  // Follow the app theme (data-theme on <html>, controlled by the header toggle)
  // so the editor matches the rest of the UI. Dark stays 'vs-dark' as before.
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  useEffect(() => {
    const apply = () =>
      setTheme(
        document.documentElement.dataset.theme === 'light' ? 'light' : 'vs-dark',
      );
    apply();
    window.addEventListener('themechange', apply);
    return () => window.removeEventListener('themechange', apply);
  }, []);

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      theme={theme}
      options={{
        fontSize: 14,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        renderLineHighlight: 'gutter',
        tabSize: 4,
        insertSpaces: true,
        automaticLayout: true,
        wordWrap: 'on',
      }}
    />
  );
}