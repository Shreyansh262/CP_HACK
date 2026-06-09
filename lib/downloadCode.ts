// Save the current editor code to a file on disk.
//
// Two paths, picked at runtime:
//   1. File System Access API — native "Save As" dialog so the user chooses the
//      folder. Chromium-only (Chrome/Edge).
//   2. Fallback anchor download — drops the file into the browser's Downloads
//      folder. Works everywhere.

type Lang = 'cpp' | 'python';

const EXT: Record<Lang, string> = { cpp: 'cpp', python: 'py' };

// Minimal shape of the bits of File System Access we touch — avoids `any` while
// not depending on the lib.dom typings being present.
type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

/** Turn a problem title into a safe-ish file stem. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'solution'
  );
}

export async function downloadCode(
  code: string,
  language: Lang,
  baseName = 'solution',
): Promise<void> {
  const ext = EXT[language];
  const filename = `${slug(baseName)}.${ext}`;
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });

  // Preferred: native save dialog, user picks the location.
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: language === 'cpp' ? 'C++ source' : 'Python source',
            accept: { 'text/plain': [`.${ext}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User dismissed the dialog → done, nothing to save. Any other failure
      // falls through to the anchor download below.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }

  // Fallback: anchor download into the default Downloads folder.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
