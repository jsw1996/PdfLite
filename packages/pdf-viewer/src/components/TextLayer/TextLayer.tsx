import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { useAnnotation } from '@/providers/AnnotationContextProvider';
import type { IEditableTextObject } from '@pdfviewer/controller';
import {
  buildEditableParagraphsFromTextRects,
  buildEditorHtml,
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
  const { isEditMode, renderVersion, bumpRenderVersion, editSessionData } = useAnnotation();
  const { savedEditorHtml, savedLineColors } = editSessionData;
  const layerRef = useRef<HTMLDivElement | null>(null);

  // Pre-computed commit data for all paragraphs (populated on entering edit mode)
  const paragraphObjectGroupsRef = useRef<Map<number, IEditableTextObject[][]>>(new Map());
  const originalTextsRef = useRef<Map<number, string>>(new Map());
  // Live text from each editor, updated on every input event
  const editorTextsRef = useRef<Map<number, string>>(new Map());

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
        originalTextsRef.current.set(i, paragraph.text);
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

  // Commit all pending edits when exiting edit mode.
  // We read from editorTextsRef (not the DOM) because React unmounts editors before effects run.
  const wasEditModeRef = useRef(false);
  useEffect(() => {
    if (isEditMode) {
      wasEditModeRef.current = true;
      return;
    }
    if (!wasEditModeRef.current) return;
    wasEditModeRef.current = false;

    // Commit all pending edits with skipGenerateContent so we batch all
    // text mutations first, then regenerate the content stream once.
    for (const [idx, text] of editorTextsRef.current) {
      commitParagraphText(idx, text, true);
    }
    // Single GenerateContent call for the entire page
    controller.generatePageContent(pageIndex);
    // Bump render version once after all commits so the canvas re-renders
    bumpRenderVersion();
    // Release cached edit-mode page pointers. After GenerateContent the
    // changes are persisted to the content stream, so a fresh page load
    // (triggered by bumpRenderVersion) will render the updated content.
    controller.releaseEditPages();
    // Clean up component-level refs (context-level maps are cleared by setIsEditMode)
    editorTextsRef.current.clear();
    paragraphObjectGroupsRef.current.clear();
    originalTextsRef.current.clear();
  }, [bumpRenderVersion, commitParagraphText, controller, isEditMode, pageIndex]);

  // Commit pending edits when the component unmounts during edit mode
  // (e.g., page scrolled out of the virtualized viewport).
  const commitParagraphTextRef = useRef(commitParagraphText);
  useEffect(() => {
    commitParagraphTextRef.current = commitParagraphText;
  }, [commitParagraphText]);
  useEffect(() => {
    if (!isEditMode) return;
    const textsRef = editorTextsRef.current;
    const ctrl = controller;
    const page = pageIndex;
    return () => {
      // Batch all commits with skipGenerateContent, then regenerate once.
      // Without this, each paragraph triggers a separate GenerateContent
      // call, compounding content-stream corruption.
      for (const [idx, text] of textsRef) {
        commitParagraphTextRef.current(idx, text, true);
      }
      ctrl.generatePageContent(page);
    };
  }, [isEditMode, controller, pageIndex]);

  // Stage editor text and HTML without committing to PDFium.
  // All commits are deferred to the exit-mode effect so that GenerateContent
  // is called only once per page, avoiding content-stream corruption.
  const stageEditorContent = useCallback(
    (editor: HTMLElement, idx: number) => {
      const text = normalizeEditableText(extractTextFromEditor(editor));
      editorTextsRef.current.set(idx, text);
      savedEditorHtml.set(`${pageIndex}:${idx}`, editor.innerHTML);
    },
    [pageIndex, savedEditorHtml],
  );

  const handleEditorPaste = useCallback(
    (event: React.ClipboardEvent, idx: number) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
      const target = event.currentTarget as HTMLElement;
      queueMicrotask(() => stageEditorContent(target, idx));
    },
    [stageEditorContent],
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
            const html = buildEditorHtml(colorSafeParagraph, style.lineHeightPx);
            const firstLineFontSize = paragraph.lines[0]?.fontSizePx ?? 0;
            const halfLeading = (style.lineHeightPx - firstLineFontSize) / 2;

            return (
              <div
                key={idx}
                ref={(el) => {
                  if (el && !el.dataset.editorInit) {
                    const savedKey = `${pageIndex}:${idx}`;
                    const saved = savedEditorHtml.get(savedKey);
                    el.innerHTML = saved ?? html;
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
                onBlur={(e) => stageEditorContent(e.currentTarget, idx)}
                onInput={(e) => stageEditorContent(e.currentTarget as HTMLElement, idx)}
                onCompositionEnd={(e) => stageEditorContent(e.currentTarget as HTMLElement, idx)}
                onPaste={(e) => handleEditorPaste(e, idx)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
