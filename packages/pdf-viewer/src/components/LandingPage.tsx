import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun, Upload, Lock } from 'lucide-react';

interface ILandingPageProps {
  onFileSelect: (file: File) => void;
}

const MAX_PDF_BYTES = 512 * 1024 * 1024;
const THEME_STORAGE_KEY = 'pdf-viewer-theme';

type Theme = 'light' | 'dark';

const CAPABILITIES = [
  'View',
  'Annotate',
  'Highlight',
  'Draw',
  'Add text',
  'Sign',
  'Fill forms',
  'Export',
];

function validatePdfFile(file: File): string | null {
  const isPdfType = file.type === 'application/pdf' || file.type === '';
  const hasPdfExt = file.name.toLowerCase().endsWith('.pdf');
  if (!isPdfType || !hasPdfExt) return 'That doesn’t look like a PDF. Try a .pdf file.';
  if (file.size > MAX_PDF_BYTES) {
    const mb = Math.round(MAX_PDF_BYTES / (1024 * 1024));
    return `That file is over the ${mb} MB limit.`;
  }
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/**
 * Verifies the file actually starts with the PDF magic bytes ("%PDF-").
 * Extension/MIME type are user-controlled and spoofable, so this guards against
 * feeding a non-PDF to PDFium.
 */
async function hasPdfMagicBytes(file: File): Promise<boolean> {
  try {
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    // 0x25 0x50 0x44 0x46 0x2d === "%PDF-"
    return (
      header[0] === 0x25 &&
      header[1] === 0x50 &&
      header[2] === 0x44 &&
      header[3] === 0x46 &&
      header[4] === 0x2d
    );
  } catch {
    return false;
  }
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const LandingPage: React.FC<ILandingPageProps> = ({ onFileSelect }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Landing renders outside ThemeContextProvider, so it owns the document class
  // here (using the same storage key, so the choice carries into the editor).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Entrance: flip after first paint so the settle animation runs.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Ignore drag-leave bubbling from children; only clear when leaving the zone.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const acceptFile = useCallback(
    async (file: File) => {
      const validationError = validatePdfFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      if (!(await hasPdfMagicBytes(file))) {
        setError('This file isn’t a readable PDF. It may be corrupted.');
        return;
      }
      setError(null);
      onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void acceptFile(file);
    // Reset so picking the same file again still fires change.
    e.target.value = '';
  };

  const openPicker = () => inputRef.current?.click();

  const handleZoneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  const reveal = 'transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';
  const gridLine = theme === 'dark' ? 'oklch(0.7 0.01 250 / 0.10)' : 'oklch(0.55 0.01 250 / 0.08)';

  return (
    <div className="text-foreground bg-background relative flex min-h-screen flex-col overflow-hidden">
      {/* Drafting-mat grid — a precise instrument, not a gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(115% 95% at 70% 18%, black 35%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(115% 95% at 70% 18%, black 35%, transparent 100%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary text-primary-foreground grid h-8 w-8 place-items-center rounded-[0.55rem] font-bold shadow-sm">
            {/* page-corner mark */}
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3.5 1.5h6L13 5v9.5a.9.9 0 0 1-.9.9H3.5a.9.9 0 0 1-.9-.9V2.4a.9.9 0 0 1 .9-.9Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M9.2 1.7v3.4h3.4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-[1.05rem] font-semibold tracking-tight">Pdflare</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
            v1.0 · runs locally
          </span>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring grid h-9 w-9 place-items-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-12 px-6 py-8 md:px-10 lg:grid lg:grid-cols-[1fr_minmax(340px,420px)] lg:items-center lg:gap-16">
        {/* Left — the statement */}
        <div className="max-w-xl text-center lg:text-left">
          <h1
            className={`text-foreground text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.04] ${reveal} motion-reduce:translate-y-0 motion-reduce:opacity-100 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            Your PDFs,
            <br />
            handled right here.
          </h1>

          <p
            className={`text-muted-foreground mx-auto mt-6 max-w-md text-base leading-relaxed text-pretty lg:mx-0 lg:text-lg ${reveal} delay-100 motion-reduce:translate-y-0 motion-reduce:opacity-100 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            A fast, precise workspace for reading, annotating, and signing PDFs — running entirely
            in your browser.
          </p>

          {/* Capability line — plainly stated, mono voice */}
          <ul
            className={`text-muted-foreground mt-7 flex flex-wrap justify-center gap-x-3 gap-y-1.5 font-mono text-[0.78rem] lg:justify-start ${reveal} delay-200 motion-reduce:translate-y-0 motion-reduce:opacity-100 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            {CAPABILITIES.map((cap, i) => (
              <li key={cap} className="flex items-center gap-3">
                <span className="whitespace-nowrap">{cap}</span>
                {i < CAPABILITIES.length - 1 && (
                  <span aria-hidden className="text-border select-none">
                    ·
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* Privacy — the real differentiator vs. cloud PDF tools */}
          <div
            className={`text-secondary-foreground mt-8 inline-flex items-center gap-2.5 ${reveal} delay-300 motion-reduce:translate-y-0 motion-reduce:opacity-100 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            <span className="bg-accent text-primary-emphasis grid h-7 w-7 place-items-center rounded-full">
              <Lock className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
            <span className="text-sm font-medium">
              Files never leave your device.{' '}
              <span className="text-muted-foreground font-normal">Nothing uploads.</span>
            </span>
          </div>
        </div>

        {/* Right — the paper sheet IS the drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Open a PDF — drop a file here or press Enter to browse"
          onClick={openPicker}
          onKeyDown={handleZoneKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`group focus-visible:ring-ring relative mx-auto w-full max-w-[360px] cursor-pointer rounded-[0.4rem] focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none ${reveal} motion-reduce:translate-y-0 motion-reduce:rotate-0 motion-reduce:opacity-100 ${
            mounted
              ? 'translate-y-0 rotate-[1.4deg] opacity-100'
              : 'translate-y-6 rotate-[-2deg] opacity-0'
          } ${isDragging ? '!rotate-0 -translate-y-1.5 scale-[1.015]' : 'hover:rotate-0 hover:-translate-y-1'}`}
        >
          <input
            type="file"
            ref={inputRef}
            onChange={handleInputChange}
            accept="application/pdf"
            className="hidden"
          />

          {/* The sheet */}
          <div
            className={`relative aspect-[51/66] overflow-hidden rounded-[0.4rem] border transition-[box-shadow,border-color,background-color] duration-300 ${
              isDragging ? 'border-primary' : 'border-border/70 group-hover:border-border'
            }`}
            style={{
              background: theme === 'dark' ? 'oklch(0.93 0.003 250)' : 'oklch(0.995 0 0)',
              boxShadow: isDragging
                ? '0 28px 60px -18px var(--glow-primary), 0 10px 24px -12px rgba(0,0,0,0.28)'
                : '0 22px 50px -20px rgba(0,0,0,0.32), 0 6px 14px -10px rgba(0,0,0,0.18)',
            }}
          >
            {/* Faux document content — reads as "a page" without competing */}
            <div
              aria-hidden
              className={`absolute inset-0 px-7 pt-8 transition-opacity duration-300 ${
                isDragging ? 'opacity-20' : 'opacity-100'
              }`}
              style={{ color: 'oklch(0.18 0.004 250)' }}
            >
              <div className="space-y-2.5">
                <div className="h-2 w-1/2 rounded-full bg-current opacity-[0.16]" />
                <div className="mt-5 h-1.5 w-full rounded-full bg-current opacity-[0.09]" />
                <div className="h-1.5 w-[92%] rounded-full bg-current opacity-[0.09]" />
                {/* the brand spark: one highlighted line */}
                <div className="bg-primary h-1.5 w-[78%] rounded-full opacity-90" />
                <div className="h-1.5 w-[88%] rounded-full bg-current opacity-[0.09]" />
                <div className="h-1.5 w-[60%] rounded-full bg-current opacity-[0.09]" />
              </div>
            </div>

            {/* Folded top-right corner */}
            <div
              aria-hidden
              className="absolute right-0 top-0"
              style={{
                width: '36px',
                height: '36px',
                background:
                  theme === 'dark'
                    ? 'linear-gradient(225deg, oklch(0.82 0.004 250) 0 50%, transparent 50%)'
                    : 'linear-gradient(225deg, oklch(0.9 0.004 250) 0 50%, transparent 50%)',
                clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
                boxShadow: '-2px 2px 4px -2px rgba(0,0,0,0.18)',
              }}
            />

            {/* Drop affordance — the clear focal block */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6 pb-9 text-center">
              <div
                className={`grid h-14 w-14 place-items-center rounded-2xl transition-all duration-300 ${
                  isDragging
                    ? 'bg-primary text-primary-foreground scale-110'
                    : 'bg-secondary text-secondary-foreground group-hover:bg-accent group-hover:text-primary-emphasis'
                }`}
              >
                <Upload className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div>
                <p
                  className="text-[0.95rem] font-semibold"
                  style={{ color: 'oklch(0.18 0.004 250)' }}
                >
                  {isDragging ? 'Release to open' : 'Drop your PDF here'}
                </p>
                <p
                  className="mt-0.5 font-mono text-[0.72rem]"
                  style={{ color: 'oklch(0.45 0.005 250)' }}
                >
                  {isDragging ? 'one file' : 'or click to browse · PDF up to 512 MB'}
                </p>
              </div>
            </div>
          </div>

          {/* Error — inline, never an alert() */}
          {error && (
            <p
              role="alert"
              className="text-destructive absolute -bottom-9 inset-x-0 text-center text-sm font-medium"
            >
              {error}
            </p>
          )}
        </div>
      </main>

      <footer className="text-muted-foreground relative z-10 mx-auto w-full max-w-6xl px-6 py-6 text-center font-mono text-[0.7rem] md:px-10 lg:text-left">
        Rendered with PDFium · WebAssembly · no server in the loop
      </footer>
    </div>
  );
};
