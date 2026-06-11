import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { useAnnotation } from '@/providers/AnnotationContextProvider';
import type { IEditableTextObject } from '@pdfviewer/controller';
import {
  buildEditableParagraphsFromTextRects,
  buildEditorHtml,
  buildEditorHtmlFromText,
  convertRectsToBaseSpans,
  extractTextFromEditor,
  mapParagraphLinesToObjectGroups,
  normalizeEditableText,
  parseCssRgba,
  resolveParagraphEditorStyle,
  wordWrapText,
} from './TextLayerEditingUtils';

export interface ITextLayerProps {
  pageIndex: number;
  scale?: number;
}

/**
 * TextLayer component renders invisible but selectable text over the PDF canvas.
 * This enables text selection, copy/paste, and search functionality.
 * In edit mode, all paragraphs are rendered as contentEditable editors.
 */
export const TextLayer: React.FC<ITextLayerProps> = ({ pageIndex, scale = 1.5 }) => {
  const { controller, isInitialized } = usePdfController();
  const { isEditMode, renderVersion, editSessionData } = useAnnotation();
  const { savedEditorText, savedLineColors } = editSessionData;
  const layerRef = useRef<HTMLDivElement | null>(null);

  // Pre-computed commit data for all paragraphs (populated on entering edit mode)
  const paragraphObjectGroupsRef = useRef<Map<number, IEditableTextObject[][]>>(new Map());
  const originalTextsRef = useRef<Map<number, string>>(new Map());
  // Live text from each editor, updated on every input event
  const editorTextsRef = useRef<Map<number, string>>(new Map());
  // True while an IME composition is in progress so onInput doesn't stage
  // half-composed (CJK) buffers.
  const composingRef = useRef(false);
  // Debounce timer for input staging — avoids running innerText (a layout-thrashing
  // accessor) + normalization on every keystroke. Commits are deferred to exit, so
  // staging only needs to be eventually-consistent for remount rehydration.
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deferredScale = useDeferredValue(scale);

  const textContent = useMemo(() => {
    // renderVersion is a manual invalidation key for flattened-content edits.
    void renderVersion;
    if (!isInitialized) return null;

    try {
      return controller.getPageTextContent(pageIndex);
    } catch (error) {
      console.warn('Failed to load text content for page', pageIndex, error);
      return null;
    }
  }, [controller, isInitialized, pageIndex, renderVersion]);

  const baseSpans = useMemo(() => {
    if (!textContent) return [];
    return convertRectsToBaseSpans(textContent.textRects);
  }, [textContent]);

  // Paragraphs are always computed at scale=1 (page-point coordinates).
  // The edit-mode wrapper applies CSS transform: scale() for visual zoom,
  // so editor inner HTML (font-size, scaleX, width) stays valid across zoom changes.
  const editableParagraphs = useMemo(() => {
    if (!isEditMode || !textContent) return [];
    return buildEditableParagraphsFromTextRects(textContent.textRects, 1);
  }, [isEditMode, textContent]);

  const refreshParagraphObjectGroups = useCallback(() => {
    const editableObjects = controller.listEditableTextObjects(pageIndex, {
      scale: 1,
    });

    // Track claimed object indices so each page object is assigned to exactly
    // one paragraph. Without this, adjacent paragraphs with overlapping
    // expanded rects can share objects, causing double-edit or double-delete
    // during batch commits.
    const claimedIndices = new Set<number>();

    for (let i = 0; i < editableParagraphs.length; i++) {
      const paragraph = editableParagraphs[i];
      const unclaimed = editableObjects.filter((obj) => !claimedIndices.has(obj.objectIndex));
      const groups = mapParagraphLinesToObjectGroups(paragraph, unclaimed);
      paragraphObjectGroupsRef.current.set(i, groups);
      for (const group of groups) {
        for (const obj of group) {
          claimedIndices.add(obj.objectIndex);
        }
      }
      if (!originalTextsRef.current.has(i)) {
        // Store the normalized form so the commit-time equality check
        // (nextText === originalText) compares like-for-like — staged editor
        // text is always normalized. Otherwise an untouched paragraph whose raw
        // text differs only by NBSP/\r normalization would be needlessly
        // reflowed (and could corrupt text the user never edited).
        originalTextsRef.current.set(i, normalizeEditableText(paragraph.text));
      }
      if (!editorTextsRef.current.has(i)) {
        editorTextsRef.current.set(i, normalizeEditableText(paragraph.text));
      }
    }
  }, [controller, editableParagraphs, pageIndex]);

  // Pre-compute lineObjectGroups for all paragraphs when entering edit mode.
  // NOTE: We do NOT clear refs here when isEditMode becomes false — the exit-mode
  // effect below needs them to commit pending edits before clearing.
  useEffect(() => {
    if (!isEditMode) return;
    refreshParagraphObjectGroups();
    // Save original line colors on first entry (before FPDFPage_GenerateContent corrupts them)
    for (let idx = 0; idx < editableParagraphs.length; idx++) {
      const key = `${pageIndex}:${idx}`;
      if (!savedLineColors.has(key)) {
        savedLineColors.set(
          key,
          editableParagraphs[idx].lines.map((l) => l.color),
        );
      }
    }
  }, [editableParagraphs, isEditMode, pageIndex, refreshParagraphObjectGroups, savedLineColors]);

  const resolveLineObjectGroups = useCallback(
    (paragraphIndex: number): IEditableTextObject[][] | undefined => {
      const cachedGroups = paragraphObjectGroupsRef.current.get(paragraphIndex);
      const hasCached = cachedGroups?.some((group) => group.length > 0) ?? false;
      if (hasCached) return cachedGroups;

      const paragraph = editableParagraphs[paragraphIndex];
      if (!paragraph) return cachedGroups;

      try {
        const editableObjects = controller.listEditableTextObjects(pageIndex, {
          scale: 1,
        });
        const groups = mapParagraphLinesToObjectGroups(paragraph, editableObjects);
        paragraphObjectGroupsRef.current.set(paragraphIndex, groups);
        return groups;
      } catch (error) {
        console.warn('Failed to resolve editable text objects for paragraph', error);
        return cachedGroups;
      }
    },
    [controller, editableParagraphs, pageIndex],
  );

  // Commit a single paragraph with word-wrap reflow
  const commitParagraphText = useCallback(
    (paragraphIndex: number, nextText: string, skipGenerateContent = false) => {
      const lineObjectGroups = resolveLineObjectGroups(paragraphIndex);
      const originalText = originalTextsRef.current.get(paragraphIndex);
      if (!lineObjectGroups || originalText === undefined) return;
      if (nextText === originalText) return;

      const paragraph = editableParagraphs[paragraphIndex];
      if (!paragraph) return;

      try {
        const style = resolveParagraphEditorStyle(paragraph);
        const savedColors = savedLineColors.get(`${pageIndex}:${paragraphIndex}`);
        const dominantColor = savedColors?.[0] ?? style.color;

        // Effective content width (before CSS scaleX transform)
        const effectiveWidth = paragraph.rect.width / style.scaleX;

        // Split on hard newlines, then word-wrap each segment
        const hardLines = nextText.replace(/\r\n/g, '\n').split('\n');
        const wrappedLines: string[] = [];
        for (const hardLine of hardLines) {
          const subLines = wordWrapText(
            hardLine,
            effectiveWidth,
            style.fontFamily,
            style.fontSizePx,
          );
          wrappedLines.push(...subLines);
        }

        const existingObjectIndices = lineObjectGroups.flatMap((group) =>
          group.map((obj) => obj.objectIndex),
        );

        if (existingObjectIndices.length === 0) {
          console.warn('No editable text objects matched paragraph; skipping commit.');
          return;
        }

        // Build reflow line updates with per-line colors
        const reflowLines = wrappedLines.map((text, i) => {
          const colorCss = savedColors?.[Math.min(i, savedColors.length - 1)] ?? dominantColor;
          return { text, color: parseCssRgba(colorCss) };
        });

        const result = controller.reflowEditableTextObjects(pageIndex, {
          referenceObjectIndex: existingObjectIndices[0],
          lines: reflowLines,
          existingObjectIndices,
          scale: 1,
          paragraphRect: paragraph.rect,
          lineHeightDevicePx: style.lineHeightPx,
          skipGenerateContent,
        });

        if (result.usedFallbackFont) {
          console.warn(
            `[TextLayer] Page ${pageIndex + 1}: the original font was not available; ` +
              `Helvetica was used as a fallback. Some glyphs or metrics may differ.`,
          );
        }

        originalTextsRef.current.set(paragraphIndex, nextText);

        // Update saved colors to match the new line count after reflow,
        // so the render-time color override stays in sync.
        const updatedColors = reflowLines.map((rl) => {
          const { r, g, b, a } = rl.color;
          return `rgba(${r},${g},${b},${a / 255})`;
        });
        savedLineColors.set(`${pageIndex}:${paragraphIndex}`, updatedColors);

        refreshParagraphObjectGroups();
      } catch (error) {
        console.warn('Failed to edit text object', error);
      }
    },
    [
      controller,
      editableParagraphs,
      pageIndex,
      refreshParagraphObjectGroups,
      resolveLineObjectGroups,
      savedLineColors,
    ],
  );

  // Per-page commit on exit OR on unmount-during-edit (e.g., page scrolled out
  // of the virtualized viewport). The cleanup runs when isEditMode flips to
  // false, when pageIndex/controller change, or when the component unmounts —
  // any of these means "this page's edits need to land now". Doc-wide finalize
  // (releaseEditPages, bumpRenderVersion) lives on the provider so it runs
  // exactly once after every page's cleanup has flushed.
  const commitParagraphTextRef = useRef(commitParagraphText);
  useEffect(() => {
    commitParagraphTextRef.current = commitParagraphText;
  }, [commitParagraphText]);
  useEffect(() => {
    if (!isEditMode) return;
    const textsRef = editorTextsRef.current;
    const objectGroupsRef = paragraphObjectGroupsRef.current;
    const origsRef = originalTextsRef.current;
    const ctrl = controller;
    const page = pageIndex;
    return () => {
      // Cancel any pending debounced stage; blur/compositionEnd already flushed
      // the latest content synchronously on the normal exit path.
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
      // Batch all commits with skipGenerateContent, then regenerate once
      // per page. Without this, each paragraph triggers a separate
      // GenerateContent call, compounding content-stream corruption.
      for (const [idx, text] of textsRef) {
        commitParagraphTextRef.current(idx, text, true);
      }
      ctrl.generatePageContent(page);
      textsRef.clear();
      objectGroupsRef.clear();
      origsRef.clear();
    };
  }, [isEditMode, controller, pageIndex]);

  // Stage editor text without committing to PDFium. All commits are deferred
  // to the unmount-cleanup effect so GenerateContent runs at most once per
  // page per session. Only plain text is persisted across remount — we never
  // round-trip the editor's innerHTML so user-pasted markup cannot be
  // re-injected via contentEditable rehydration.
  const stageEditorContent = useCallback(
    (editor: HTMLElement, idx: number) => {
      const text = normalizeEditableText(extractTextFromEditor(editor));
      editorTextsRef.current.set(idx, text);
      savedEditorText.set(`${pageIndex}:${idx}`, text);
    },
    [pageIndex, savedEditorText],
  );

  // Stage immediately (clearing any pending debounced stage). Used on blur and
  // composition end where we want the latest content captured synchronously.
  const flushStageEditorContent = useCallback(
    (editor: HTMLElement, idx: number) => {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
      stageEditorContent(editor, idx);
    },
    [stageEditorContent],
  );

  // Debounced staging for the per-keystroke onInput path. The isConnected guard
  // prevents a late timer from reading a detached editor (innerText === '') and
  // clobbering staged text with an empty string after the editor unmounts.
  const scheduleStageEditorContent = useCallback(
    (editor: HTMLElement, idx: number) => {
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      stageTimerRef.current = setTimeout(() => {
        stageTimerRef.current = null;
        if (editor.isConnected) stageEditorContent(editor, idx);
      }, 150);
    },
    [stageEditorContent],
  );

  const handleEditorPaste = useCallback(
    (event: React.ClipboardEvent, idx: number) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      const target = event.currentTarget as HTMLElement;
      // execCommand is deprecated but widely supported and handles multi-line
      // insertion natively. Fall back to a Range-based insert if it no-ops so
      // paste never silently fails.
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const fragment = document.createDocumentFragment();
          text.split('\n').forEach((segment, i) => {
            if (i > 0) fragment.appendChild(document.createElement('br'));
            if (segment) fragment.appendChild(document.createTextNode(segment));
          });
          range.insertNode(fragment);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      queueMicrotask(() => flushStageEditorContent(target, idx));
    },
    [flushStageEditorContent],
  );

  if (!textContent) {
    return null;
  }

  return (
    <div
      ref={layerRef}
      className="text-layer absolute inset-0 overflow-hidden pointer-events-none"
      style={{
        width: `${textContent.pageWidth * deferredScale}px`,
        height: `${textContent.pageHeight * deferredScale}px`,
      }}
    >
      {/* Base text spans — invisible for selection when not in edit mode, hidden in edit mode */}
      {!isEditMode && (
        <div
          style={{
            transform: `scale(${deferredScale})`,
            transformOrigin: '0 0',
          }}
        >
          {baseSpans.map((span, index) => (
            <span
              key={`${span.left}-${span.top}-${index}`}
              className="absolute whitespace-pre select-text origin-top-left pointer-events-auto text-transparent selection:text-transparent selection:bg-[rgba(0,0,255,0.3)]"
              style={span.style}
            >
              {span.text}
            </span>
          ))}
        </div>
      )}

      {/* Edit mode — all paragraphs as contentEditable editors.
          Paragraphs are computed at scale=1; the wrapper applies CSS transform
          so editor inner HTML stays valid across zoom changes. */}
      {isEditMode && (
        <div style={{ transform: `scale(${deferredScale})`, transformOrigin: '0 0' }}>
          {editableParagraphs.map((paragraph, idx) => {
            const savedColors = savedLineColors.get(`${pageIndex}:${idx}`);
            const colorSafeParagraph = savedColors
              ? {
                  ...paragraph,
                  lines: paragraph.lines.map((line, li) => ({
                    ...line,
                    color: savedColors[Math.min(li, savedColors.length - 1)] ?? line.color,
                  })),
                }
              : paragraph;
            const style = resolveParagraphEditorStyle(colorSafeParagraph);
            const savedText = savedEditorText.get(`${pageIndex}:${idx}`);
            const html =
              savedText !== undefined
                ? buildEditorHtmlFromText(colorSafeParagraph, style.lineHeightPx, savedText)
                : buildEditorHtml(colorSafeParagraph, style.lineHeightPx);
            const firstLineFontSize = paragraph.lines[0]?.fontSizePx ?? 0;
            const halfLeading = (style.lineHeightPx - firstLineFontSize) / 2;

            // Key by a stable paragraph identity (page-space rect) rather than
            // the array index. If the paragraph set is recomputed mid-session,
            // index keys would reuse a DOM node for a different paragraph while
            // the editorInit guard blocks re-initialization, desyncing the
            // editor content from the paragraph model.
            const paraKey = `p-${Math.round(paragraph.rect.left)}-${Math.round(
              paragraph.rect.top,
            )}-${Math.round(paragraph.rect.width)}-${idx}`;

            return (
              <div
                key={paraKey}
                ref={(el) => {
                  if (el && !el.dataset.editorInit) {
                    el.innerHTML = html;
                    el.dataset.editorInit = '1';
                  }
                }}
                contentEditable
                suppressContentEditableWarning
                className="absolute z-30 pointer-events-auto outline-none"
                style={{
                  left: `${paragraph.rect.left}px`,
                  top: `${paragraph.rect.top - halfLeading}px`,
                  width: `${paragraph.rect.width}px`,
                  minHeight: `${paragraph.rect.height + halfLeading}px`,
                  padding: 0,
                  margin: 0,
                  boxSizing: 'border-box',
                  backgroundColor: 'white',
                  outline: '1px dotted rgba(0, 0, 0, 0.4)',
                }}
                onBlur={(e) => flushStageEditorContent(e.currentTarget, idx)}
                onInput={(e) => {
                  if (composingRef.current) return;
                  scheduleStageEditorContent(e.currentTarget as HTMLElement, idx);
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  composingRef.current = false;
                  flushStageEditorContent(e.currentTarget as HTMLElement, idx);
                }}
                onPaste={(e) => handleEditorPaste(e, idx)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
