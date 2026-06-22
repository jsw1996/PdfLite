import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import {
  useAnnotation,
  type IParagraphFormatOverride,
} from '@/providers/AnnotationContextProvider';
import type { IEditableTextObject } from '@pdfviewer/controller';
import type { IEditableParagraph } from './TextLayerEditingUtils';
import {
  applyFormatOverrideToEditor,
  buildEditableParagraphsFromTextRects,
  buildEditorHtml,
  buildEditorHtmlFromText,
  convertEditorToFlowing,
  convertRectsToBaseSpans,
  extractTextFromEditor,
  groupParagraphRuns,
  isFormatOverrideEmpty,
  mapParagraphLinesToObjectGroups,
  mapStandardFontFamily,
  normalizeEditableText,
  paragraphEditorText,
  parseCssRgba,
  resolveParagraphEditorStyle,
  wordWrapText,
} from './TextLayerEditingUtils';
import { measureTextWidthAtBaseSize } from './TextMeasurementUtils';
import { EditTextFormatToolbar, type TextAlign } from './EditTextFormatToolbar';

export interface ITextLayerProps {
  pageIndex: number;
  scale?: number;
}

/** Place the caret inside `el` at the document point (clientX/clientY), or at the end. */
function placeCaretFromPoint(el: HTMLElement, x: number, y: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (typeof doc.caretRangeFromPoint === 'function') {
    range = doc.caretRangeFromPoint(x, y);
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  if (range && el.contains(range.startContainer)) {
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  const end = document.createRange();
  end.selectNodeContents(el);
  end.collapse(false);
  sel.removeAllRanges();
  sel.addRange(end);
}

/**
 * TextLayer renders invisible but selectable text over the PDF canvas, enabling
 * selection, copy/paste, and search.
 *
 * In Edit Text mode each reconstructed paragraph is a "block": transparent and
 * subtly highlighted on hover. Clicking a block turns it into a contentEditable
 * text box with a floating formatting toolbar. A block that has been edited
 * stays rendered as a box (covering the canvas) so its changes remain visible
 * until they are committed on edit-mode exit.
 */
export const TextLayer: React.FC<ITextLayerProps> = ({ pageIndex, scale = 1.5 }) => {
  const { controller, isInitialized } = usePdfController();
  const {
    isEditMode,
    renderVersion,
    editSessionData,
    activeEditor,
    setActiveEditor,
    markPageEdited,
  } = useAnnotation();
  const { savedEditorText, savedLineColors, savedFormatOverrides } = editSessionData;
  const layerRef = useRef<HTMLDivElement | null>(null);

  // Pre-computed commit data for all paragraphs (populated on entering edit mode)
  const paragraphObjectGroupsRef = useRef<Map<number, IEditableTextObject[][]>>(new Map());
  const originalTextsRef = useRef<Map<number, string>>(new Map());
  // Live text from each editor, updated on every input event
  const editorTextsRef = useRef<Map<number, string>>(new Map());
  // Per-paragraph formatting overrides applied this session (local mirror of
  // savedFormatOverrides so commits read from a ref the provider can't clear
  // out from under them on edit-mode exit).
  const formatOverridesRef = useRef<Map<number, IParagraphFormatOverride>>(new Map());
  // Live editor DOM nodes, so the floating toolbar can mutate the focused
  // paragraph's styles directly (keeping the caret intact) and so we can focus
  // a block right after it becomes editable.
  const editorElsRef = useRef<Map<number, HTMLElement>>(new Map());
  // A block just clicked, awaiting focus/caret placement once it mounts as a box.
  const pendingFocusRef = useRef<{ idx: number; x: number; y: number } | null>(null);
  // True while an IME composition is in progress so onInput doesn't stage
  // half-composed (CJK) buffers.
  const composingRef = useRef(false);
  // Debounce timer for input staging — avoids running innerText (a layout-thrashing
  // accessor) + normalization on every keystroke. Commits are deferred to exit, so
  // staging only needs to be eventually-consistent for remount rehydration.
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditModeRef = useRef(isEditMode);
  useLayoutEffect(() => {
    isEditModeRef.current = isEditMode;
  }, [isEditMode]);

  const deferredScale = useDeferredValue(scale);

  // While the user is dragging a selection, an "end of content" backstop covers
  // the whole text layer. Absolutely-positioned glyph spans leave gaps between
  // them; when the pointer drifts into a gap the browser would otherwise resolve
  // the caret to the start of the container (selecting upward, above the anchor).
  // A transparent, user-select:none overlay makes every point fall inside the
  // layer, so the caret snaps to the nearest glyph instead. (PDF.js technique.)
  const [isSelecting, setIsSelecting] = useState(false);
  useEffect(() => {
    if (!isSelecting) return;
    const stop = () => setIsSelecting(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, [isSelecting]);

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

  // Apply saved per-line colors to a paragraph so style resolution (and the
  // toolbar's "current color") reflects the original colors even after
  // FPDFPage_GenerateContent corrupts the content stream's color data.
  const colorSafeParagraphAt = useCallback(
    (idx: number): IEditableParagraph | null => {
      const paragraph = editableParagraphs[idx];
      if (!paragraph) return null;
      const savedColors = savedLineColors.get(`${pageIndex}:${idx}`);
      if (!savedColors) return paragraph;
      return {
        ...paragraph,
        lines: paragraph.lines.map((line, li) => ({
          ...line,
          color: savedColors[Math.min(li, savedColors.length - 1)] ?? line.color,
        })),
      };
    },
    [editableParagraphs, pageIndex, savedLineColors],
  );

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
      // Baseline for the commit-time equality check (nextText === originalText).
      // Prefer the text already committed in a prior session (savedEditorText) so
      // re-entering and exiting without a change does NOT re-commit. Falls back to
      // the paragraph's clean text. Normalized so it compares like-for-like with
      // staged editor text (which is always normalized).
      const baselineKey = `${pageIndex}:${i}`;
      const committedText = savedEditorText.get(baselineKey);
      const baselineText = committedText ?? normalizeEditableText(paragraphEditorText(paragraph));
      if (!originalTextsRef.current.has(i)) {
        originalTextsRef.current.set(i, baselineText);
      }
      if (!editorTextsRef.current.has(i)) {
        editorTextsRef.current.set(i, baselineText);
      }
      if (!formatOverridesRef.current.has(i)) {
        const saved = savedFormatOverrides.get(`${pageIndex}:${i}`);
        if (saved) formatOverridesRef.current.set(i, saved);
      }
    }
  }, [controller, editableParagraphs, pageIndex, savedEditorText, savedFormatOverrides]);

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

  // Commit a single paragraph with word-wrap reflow plus any formatting override.
  const commitParagraphText = useCallback(
    (paragraphIndex: number, nextText: string, skipGenerateContent = false) => {
      const lineObjectGroups = resolveLineObjectGroups(paragraphIndex);
      const originalText = originalTextsRef.current.get(paragraphIndex);
      if (!lineObjectGroups || originalText === undefined) return;

      const override = formatOverridesRef.current.get(paragraphIndex);
      const hasFormat = !isFormatOverrideEmpty(override);
      // Skip only when neither the text nor the formatting changed.
      if (nextText === originalText && !hasFormat) return;

      const paragraph = editableParagraphs[paragraphIndex];
      if (!paragraph) return;

      try {
        const style = resolveParagraphEditorStyle(paragraph);
        const fontScale = override?.fontScale && override.fontScale > 0 ? override.fontScale : 1;
        const scaledFontSizePx = style.fontSizePx * fontScale;

        const savedColors = savedLineColors.get(`${pageIndex}:${paragraphIndex}`);
        const dominantColor = override?.color ?? savedColors?.[0] ?? style.color;

        // Effective content width (before CSS scaleX transform)
        const effectiveWidth = paragraph.rect.width / style.scaleX;

        const existingObjectIndices = lineObjectGroups.flatMap((group) =>
          group.map((obj) => obj.objectIndex),
        );

        if (existingObjectIndices.length === 0) {
          console.warn('No editable text objects matched paragraph; skipping commit.');
          return;
        }

        const align: TextAlign = override?.align ?? 'left';
        const alignFactor = align === 'center' ? 0.5 : align === 'right' ? 1 : 0;

        // Each hard line (separated by a newline in the editor) is now one
        // logical paragraph — the editor merges the source's soft-wrapped lines
        // into a single flowing run, so a newline only appears at a real
        // paragraph break. Word-wrap each paragraph at the (possibly scaled) font
        // size and build the per-line reflow updates. Each wrapped line carries
        // its color and a horizontal offset: alignment (center/right) when set,
        // otherwise the paragraph's first-line indent — preserved for
        // left-aligned text so committing doesn't flatten indented paragraphs.
        const hardLines = nextText.replace(/\r\n/g, '\n').split('\n');
        const runs = groupParagraphRuns(paragraph);
        const reflowLines: {
          text: string;
          color: ReturnType<typeof parseCssRgba>;
          xOffsetDevicePx: number;
          isParagraphEnd: boolean;
        }[] = [];
        for (let h = 0; h < hardLines.length; h++) {
          const subLines = wordWrapText(
            hardLines[h],
            effectiveWidth,
            style.fontFamily,
            scaledFontSizePx,
          );
          // The h-th hard line maps to the h-th run (clamped if the user added or
          // removed paragraph breaks). The run supplies this paragraph's indent.
          const run = runs[Math.min(h, runs.length - 1)];
          const lineIndent = alignFactor === 0 ? (run?.indent ?? 0) : 0;
          for (let si = 0; si < subLines.length; si++) {
            const text = subLines[si];
            const idx = reflowLines.length;
            const colorCss =
              override?.color ??
              savedColors?.[Math.min(idx, (savedColors?.length ?? 1) - 1)] ??
              dominantColor;
            let xOffsetDevicePx = 0;
            if (alignFactor > 0 && text) {
              const lineWidth =
                measureTextWidthAtBaseSize(text, style.fontFamily) * scaledFontSizePx;
              xOffsetDevicePx = Math.max(0, (paragraph.rect.width - lineWidth) * alignFactor);
            } else if (si === 0) {
              xOffsetDevicePx = lineIndent;
            }
            // Each hard line is a whole paragraph, so only its final sub-line
            // ends the paragraph (and stays ragged); earlier sub-lines are
            // interior and justify to the column edge.
            const isParagraphEnd = si === subLines.length - 1;
            reflowLines.push({
              text,
              color: parseCssRgba(colorCss),
              xOffsetDevicePx,
              isParagraphEnd,
            });
          }
        }

        const standardFontFamily = mapStandardFontFamily(override?.fontFamily);
        const needsFormatting =
          !!override &&
          (!!override.bold || !!override.italic || fontScale !== 1 || !!standardFontFamily);
        const formatting = needsFormatting
          ? {
              fontSizeScale: fontScale !== 1 ? fontScale : undefined,
              bold: override?.bold,
              italic: override?.italic,
              standardFontFamily,
            }
          : undefined;

        const result = controller.reflowEditableTextObjects(pageIndex, {
          referenceObjectIndex: existingObjectIndices[0],
          lines: reflowLines,
          existingObjectIndices,
          scale: 1,
          paragraphRect: paragraph.rect,
          lineHeightDevicePx: style.lineHeightPx * fontScale,
          skipGenerateContent,
          formatting,
        });

        if (result.usedFallbackFont) {
          console.warn(
            `[TextLayer] Page ${pageIndex + 1}: the original font was not available; ` +
              `a fallback was used. Some glyphs or metrics may differ.`,
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

  // Per-page commit on edit-mode exit. If a page unmounts while edit mode is
  // still active, staged plain text is preserved in editSessionData and the PDF
  // is not mutated as a side effect of virtualization. Doc-wide finalize
  // (releaseEditPages, bumpRenderVersion) lives on the provider so it runs
  // exactly once after mounted pages have flushed.
  const commitParagraphTextRef = useRef(commitParagraphText);
  useEffect(() => {
    commitParagraphTextRef.current = commitParagraphText;
  }, [commitParagraphText]);
  useEffect(() => {
    if (!isEditMode) return;
    const textsRef = editorTextsRef.current;
    const objectGroupsRef = paragraphObjectGroupsRef.current;
    const origsRef = originalTextsRef.current;
    const overridesRef = formatOverridesRef.current;
    const elsRef = editorElsRef.current;
    const ctrl = controller;
    const page = pageIndex;
    return () => {
      // Cancel any pending debounced stage; blur/compositionEnd already flushed
      // the latest content synchronously on the normal exit path.
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
      if (isEditModeRef.current) {
        return;
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
      overridesRef.clear();
      elsRef.clear();
    };
  }, [isEditMode, controller, pageIndex]);

  // Stage editor text without committing to PDFium. All commits are deferred
  // to the unmount-cleanup effect so GenerateContent runs at most once per
  // page per session. Only plain text is persisted across remount — we never
  // round-trip the editor's innerHTML so user-pasted markup cannot be
  // re-injected via contentEditable rehydration.
  const stageEditorContent = useCallback(
    (editor: HTMLElement, idx: number) => {
      // Only flowed editors carry edited text. An un-flowed editor is still in the
      // exact per-line layout the user never typed into; its innerText is the
      // per-line form (newline per visual line), which must NOT overwrite the
      // run-based baseline staged at mount or the commit would treat each soft
      // wrap as a hard paragraph break.
      if (editor.dataset.flowed !== '1') return;
      const text = normalizeEditableText(extractTextFromEditor(editor));
      editorTextsRef.current.set(idx, text);
      savedEditorText.set(`${pageIndex}:${idx}`, text);
      // Pin this page in the viewer once it has a real change, so its edits
      // still commit on exit even if it scrolls out of the virtualized window.
      const original = originalTextsRef.current.get(idx);
      if (original !== undefined && text !== original) markPageEdited(pageIndex);
    },
    [markPageEdited, pageIndex, savedEditorText],
  );

  // Convert a freshly-opened per-line editor (exact original line breaks) to the
  // flowing per-paragraph layout on the user's first edit, so subsequent typing
  // reflows naturally. The caret is preserved across the rebuild. Idempotent.
  const ensureEditorFlowed = useCallback(
    (editor: HTMLElement, idx: number) => {
      if (editor.dataset.flowed === '1') return;
      const paragraph = editableParagraphs[idx];
      if (paragraph) {
        const style = resolveParagraphEditorStyle(colorSafeParagraphAt(idx) ?? paragraph);
        convertEditorToFlowing(editor, paragraph, style.lineHeightPx);
        applyFormatOverrideToEditor(editor, formatOverridesRef.current.get(idx));
      }
      editor.dataset.flowed = '1';
    },
    [colorSafeParagraphAt, editableParagraphs],
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
      if (editor.isConnected) stageEditorContent(editor, idx);
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
      // Flow the editor before inserting so the paste lands in the flowing layout.
      ensureEditorFlowed(target, idx);
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
    [ensureEditorFlowed, flushStageEditorContent],
  );

  // ─── Block activation + floating formatting toolbar ─────────────────────────

  // Only the page holding the focused editor renders the (single) toolbar.
  const activeIdx =
    isEditMode && activeEditor?.pageIndex === pageIndex ? activeEditor.paragraphIndex : null;

  // A bump counter that forces the toolbar to re-read the active override from
  // savedFormatOverrides (a plain Map, safe to read during render) after a
  // formatting change. The override also lives in a ref for commit-time reads,
  // which the render path must never touch (react-hooks/refs).
  const [formatTick, setFormatTick] = useState(0);

  // Turn a (possibly idle) block into the active editable box. Flush the
  // previously-active editor first so its edited/idle render decision is correct.
  const activateBlock = useCallback(
    (idx: number, clientX: number, clientY: number) => {
      if (activeIdx != null && activeIdx !== idx) {
        const prevEl = editorElsRef.current.get(activeIdx);
        if (prevEl) flushStageEditorContent(prevEl, activeIdx);
      }
      pendingFocusRef.current = { idx, x: clientX, y: clientY };
      setActiveEditor({ pageIndex, paragraphIndex: idx });
    },
    [activeIdx, flushStageEditorContent, pageIndex, setActiveEditor],
  );

  // Focus + place the caret once a clicked block has mounted as a contentEditable box.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (activeIdx == null || pending?.idx !== activeIdx) return;
    pendingFocusRef.current = null;
    const el = editorElsRef.current.get(activeIdx);
    if (!el) return;
    el.focus({ preventScroll: true });
    placeCaretFromPoint(el, pending.x, pending.y);
  }, [activeIdx]);

  const updateActiveOverride = useCallback(
    (patch: Partial<IParagraphFormatOverride>) => {
      if (activeIdx == null) return;
      const key = `${pageIndex}:${activeIdx}`;
      const current = formatOverridesRef.current.get(activeIdx) ?? {};
      const next = { ...current, ...patch };
      formatOverridesRef.current.set(activeIdx, next);
      savedFormatOverrides.set(key, next);
      const el = editorElsRef.current.get(activeIdx);
      if (el) applyFormatOverrideToEditor(el, next);
      markPageEdited(pageIndex);
      setFormatTick((t) => t + 1);
    },
    [activeIdx, markPageEdited, pageIndex, savedFormatOverrides],
  );

  // Position the toolbar over the focused editor (viewport coordinates). The
  // editor box lives inside an overflow-hidden layer, so the toolbar is
  // portaled to <body> and tracked on scroll/resize instead.
  const [toolbarPos, setToolbarPos] = useState<{
    left: number;
    top: number;
    placement: 'above' | 'below';
  } | null>(null);
  useLayoutEffect(() => {
    // Measure the focused editor and place the toolbar above/below it. setState
    // is only ever invoked asynchronously (microtask for the initial measure,
    // then scroll/resize callbacks), so this effect never triggers a synchronous
    // cascading render.
    const update = () => {
      const el = activeIdx != null ? editorElsRef.current.get(activeIdx) : null;
      if (!el?.isConnected) {
        setToolbarPos(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const gap = 8;
      const estHeight = 46;
      const placeAbove = r.top - gap - estHeight > 8;
      setToolbarPos({
        left: Math.max(8, r.left),
        top: placeAbove ? r.top - gap : r.bottom + gap,
        placement: placeAbove ? 'above' : 'below',
      });
    };
    queueMicrotask(update);
    if (activeIdx == null) return;
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [activeIdx, deferredScale, renderVersion, formatTick]);

  // Derive the toolbar's "current style" from the active paragraph's resolved
  // (original) style plus its override. The override is read from
  // savedFormatOverrides (a plain Map — safe during render); formatTick forces a
  // re-read after each change.
  void formatTick;
  const activeOverride: IParagraphFormatOverride =
    activeIdx != null ? (savedFormatOverrides.get(`${pageIndex}:${activeIdx}`) ?? {}) : {};
  const activeColorSafeParagraph = activeIdx != null ? colorSafeParagraphAt(activeIdx) : null;
  const activeBaseStyle = activeColorSafeParagraph
    ? resolveParagraphEditorStyle(activeColorSafeParagraph)
    : null;
  const activeFontScale =
    activeOverride.fontScale && activeOverride.fontScale > 0 ? activeOverride.fontScale : 1;

  if (!textContent) {
    return null;
  }

  const showToolbar = activeIdx != null && activeBaseStyle != null && toolbarPos != null;

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
        <>
          {/* End-of-content backstop: during an active selection drag it covers
              the layer BEHIND the glyph spans. Pointer gaps between/around the
              absolutely-positioned spans would otherwise resolve the caret to the
              container start (selecting upward, above the anchor). This transparent
              user-select:none sink absorbs those gap points instead. It must sit
              behind the spans (rendered first) so glyphs stay selectable — a
              user-select:none overlay ON TOP blocks selection entirely. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: isSelecting ? 0 : '100%',
              bottom: 0,
              cursor: 'text',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              pointerEvents: isSelecting ? 'auto' : 'none',
            }}
          />
          <div
            style={{
              transform: `scale(${deferredScale})`,
              transformOrigin: '0 0',
            }}
            onMouseDown={(e) => {
              if (e.button === 0) setIsSelecting(true);
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
        </>
      )}

      {/* Edit mode — each paragraph is a block. Idle blocks are transparent and
          highlight on hover; clicking (or any prior edit) promotes a block to a
          contentEditable box. Paragraphs are computed at scale=1; the wrapper
          applies CSS transform so editor inner HTML stays valid across zoom. */}
      {isEditMode && (
        <div style={{ transform: `scale(${deferredScale})`, transformOrigin: '0 0' }}>
          {editableParagraphs.map((paragraph, idx) => {
            const key = `${pageIndex}:${idx}`;
            const colorSafeParagraph = colorSafeParagraphAt(idx) ?? paragraph;
            const style = resolveParagraphEditorStyle(colorSafeParagraph);
            const firstLineFontSize = paragraph.lines[0]?.fontSizePx ?? 0;
            const halfLeading = (style.lineHeightPx - firstLineFontSize) / 2;

            const isActive = activeIdx === idx;
            const original = normalizeEditableText(paragraphEditorText(paragraph));
            const savedText = savedEditorText.get(key);
            const override = savedFormatOverrides.get(key);
            const isEdited =
              (savedText !== undefined && savedText !== original) ||
              !isFormatOverrideEmpty(override);
            const asBox = isActive || isEdited;

            // Stable identity (page-space rect) keyed per render mode so a block
            // remounts when it flips between overlay and editable box.
            const paraKey = `${Math.round(paragraph.rect.left)}-${Math.round(
              paragraph.rect.top,
            )}-${Math.round(paragraph.rect.width)}-${idx}`;

            const blockTop = paragraph.rect.top - halfLeading;
            const blockHeight = paragraph.rect.height + halfLeading;

            if (!asBox) {
              // Idle block: transparent, subtle hover highlight, click to edit.
              return (
                <div
                  key={`idle-${paraKey}`}
                  role="button"
                  tabIndex={-1}
                  aria-label="Edit text block"
                  className="absolute z-30 cursor-text rounded-[2px] pointer-events-auto bg-transparent transition-colors hover:bg-[rgba(37,99,235,0.12)] hover:ring-1 hover:ring-inset hover:ring-[rgba(37,99,235,0.55)]"
                  style={{
                    left: `${paragraph.rect.left}px`,
                    top: `${blockTop}px`,
                    width: `${paragraph.rect.width}px`,
                    height: `${blockHeight}px`,
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    // Prevent starting a text selection on the transparent block;
                    // we place the caret ourselves once it becomes editable.
                    e.preventDefault();
                    activateBlock(idx, e.clientX, e.clientY);
                  }}
                />
              );
            }

            const html =
              savedText !== undefined
                ? buildEditorHtmlFromText(colorSafeParagraph, style.lineHeightPx, savedText)
                : buildEditorHtml(colorSafeParagraph, style.lineHeightPx);

            return (
              <div
                key={`box-${paraKey}`}
                ref={(el) => {
                  if (el) {
                    editorElsRef.current.set(idx, el);
                    if (!el.dataset.editorInit) {
                      el.innerHTML = html;
                      el.dataset.editorInit = '1';
                      // Rehydrated edited paragraphs are already in the flowing
                      // layout; a freshly-opened one renders per-line (exact) and
                      // flows on the first edit.
                      if (savedText !== undefined) el.dataset.flowed = '1';
                      applyFormatOverrideToEditor(el, formatOverridesRef.current.get(idx));
                    }
                  } else {
                    editorElsRef.current.delete(idx);
                  }
                }}
                contentEditable
                suppressContentEditableWarning
                className="absolute z-30 pointer-events-auto outline-none"
                style={{
                  left: `${paragraph.rect.left}px`,
                  top: `${blockTop}px`,
                  width: `${paragraph.rect.width}px`,
                  minHeight: `${blockHeight}px`,
                  padding: 0,
                  margin: 0,
                  boxSizing: 'border-box',
                  backgroundColor: 'white',
                  outline: isActive
                    ? '1.5px solid rgba(37, 99, 235, 0.9)'
                    : '1px dotted rgba(0, 0, 0, 0.4)',
                }}
                onFocus={() => setActiveEditor({ pageIndex, paragraphIndex: idx })}
                onBlur={(e) => flushStageEditorContent(e.currentTarget, idx)}
                onInput={(e) => {
                  if (composingRef.current) return;
                  const el = e.currentTarget as HTMLElement;
                  ensureEditorFlowed(el, idx);
                  scheduleStageEditorContent(el, idx);
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  composingRef.current = false;
                  const el = e.currentTarget as HTMLElement;
                  ensureEditorFlowed(el, idx);
                  flushStageEditorContent(el, idx);
                }}
                onPaste={(e) => handleEditorPaste(e, idx)}
              />
            );
          })}
        </div>
      )}

      {/* Floating formatting toolbar for the focused paragraph (portaled to
          <body> so the overflow-hidden layer doesn't clip it). */}
      {showToolbar &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: `${toolbarPos.left}px`,
              top: `${toolbarPos.top}px`,
              transform: toolbarPos.placement === 'above' ? 'translateY(-100%)' : undefined,
              zIndex: 1001,
            }}
          >
            <EditTextFormatToolbar
              fontSizePt={Math.round(activeBaseStyle.fontSizePx * activeFontScale)}
              fontFamily={activeOverride.fontFamily ?? 'original'}
              color={activeOverride.color ?? activeBaseStyle.color}
              bold={!!activeOverride.bold}
              italic={!!activeOverride.italic}
              align={activeOverride.align ?? 'left'}
              onFontSizeChange={(pt) =>
                updateActiveOverride({
                  fontScale: activeBaseStyle.fontSizePx > 0 ? pt / activeBaseStyle.fontSizePx : 1,
                })
              }
              onFontFamilyChange={(family) => updateActiveOverride({ fontFamily: family })}
              onColorChange={(color) => updateActiveOverride({ color })}
              onToggleBold={() => updateActiveOverride({ bold: !activeOverride.bold })}
              onToggleItalic={() => updateActiveOverride({ italic: !activeOverride.italic })}
              onAlignChange={(align) => updateActiveOverride({ align })}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};
