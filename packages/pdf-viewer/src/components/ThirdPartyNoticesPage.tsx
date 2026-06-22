import { ArrowLeft, ExternalLink } from 'lucide-react';

import { Button } from '@pdfviewer/ui/components/button';

interface IThirdPartyNoticesPageProps {
  onBack: () => void;
}

const PDFIUM_LICENSE_TEXT = `Copyright 2014 The PDFium Authors

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name of Google Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

export function ThirdPartyNoticesPage({ onBack }: IThirdPartyNoticesPageProps) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-border/70 bg-background/95 sticky top-0 z-10 border-b">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-4 md:px-10">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground grid h-8 w-8 place-items-center rounded-[0.55rem] font-bold shadow-sm">
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

          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-14">
        <div className="max-w-2xl">
          <p className="text-muted-foreground font-mono text-xs">Legal notices</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Open source licenses
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed text-pretty">
            Pdflare includes third-party open source software. The notices below are provided for
            attribution and license compliance.
          </p>
        </div>

        <section className="border-border bg-card mt-10 rounded-lg border p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">PDFium</h2>
              <p className="text-muted-foreground mt-1 text-sm">BSD 3-Clause License</p>
            </div>
            <a
              href="https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="text-primary-emphasis hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Upstream license
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <pre className="text-foreground mt-5 whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed md:text-[0.8rem]">
            {PDFIUM_LICENSE_TEXT}
          </pre>
        </section>
      </main>
    </div>
  );
}
