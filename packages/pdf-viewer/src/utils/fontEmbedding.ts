/**
 * Embedded-font subsetting for the "Add Text" feature.
 *
 * The standard PDF base-14 fonts cover only Latin, so CJK (and other non-Latin)
 * text added to a PDF would not render once the file is downloaded and reopened.
 * To support it we embed a real font — but the full font is large, so we subset
 * it down to just the glyphs actually used (via HarfBuzz's hb-subset, compiled
 * to WASM) before embedding. The subset is typically a few KB.
 *
 * The source MUST be a glyf-outline (TrueType) font: the vendored
 * `harfbuzz-subset.wasm` (from `harfbuzzjs` v1.3.0, MIT) is built without the
 * CFF subsetter, so subsetting a CFF/OTF font (e.g. Noto Sans CJK OTF) silently
 * drops the outlines. Noto Sans SC ships as a glyf variable font; we pin its
 * axes to the default at subset time to emit a clean static instance.
 */
import notoFontUrl from '@/assets/fonts/NotoSansSC.ttf?url';
import hbSubsetWasmUrl from '@/assets/fonts/harfbuzz-subset.wasm?url';

interface IHbSubsetExports {
  memory: WebAssembly.Memory;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(
    data: number,
    length: number,
    mode: number,
    userData: number,
    destroy: number,
  ): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, lengthPtr: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_set_add(set: number, codepoint: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_input_pin_axis_location(
    input: number,
    face: number,
    axisTag: number,
    value: number,
  ): number;
  hb_subset_or_fail(face: number, input: number): number;
}

const HB_MEMORY_MODE_DUPLICATE = 0;
/** OpenType 'wght' axis tag, as a big-endian packed hb_tag_t. */
const HB_TAG_WGHT = 0x77676874;
/**
 * Weight to instance the variable font to. 400 = true Regular. (Note:
 * pin_all_axes_to_default collapses to the lightest master, so the weight must
 * be pinned explicitly.) Tunable — raise toward 500-700 for a heavier look.
 */
const EMBEDDED_FONT_WEIGHT = 400;

let hbPromise: Promise<IHbSubsetExports> | null = null;
let fontPromise: Promise<Uint8Array> | null = null;

async function getHbSubset(): Promise<IHbSubsetExports> {
  hbPromise ??= (async () => {
    const res = await fetch(hbSubsetWasmUrl);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    return instance.exports as unknown as IHbSubsetExports;
  })();
  return hbPromise;
}

async function getSourceFont(): Promise<Uint8Array> {
  fontPromise ??= fetch(notoFontUrl)
    .then((r) => r.arrayBuffer())
    .then((b) => new Uint8Array(b));
  return fontPromise;
}

/** True if any character is outside ASCII — i.e. the embedded font is required. */
export function textNeedsEmbeddedFont(text: string): boolean {
  for (const ch of text) {
    if (ch.codePointAt(0)! > 0x7f) return true;
  }
  return false;
}

/** Collect the unique Unicode code points used across the given strings. */
export function collectCodepoints(texts: string[]): number[] {
  const set = new Set<number>();
  for (const t of texts) {
    for (const ch of t) set.add(ch.codePointAt(0)!);
  }
  return [...set];
}

// CJK code-point ranges (kept in sync with the controller's reflow detection):
// symbols/kana/ideographs, Hangul, compatibility ideographs, fullwidth forms.
const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x3000, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
];

/** True if the text contains any CJK character. */
export function textHasCjk(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (CJK_RANGES.some(([a, b]) => cp >= a && cp <= b)) return true;
  }
  return false;
}

/**
 * Code points to subset+embed so edited paragraphs that contain CJK render. Only
 * the texts that actually contain CJK contribute (so a pure-Latin edit needs no
 * embedding); returns [] when none do.
 */
export function collectCjkSubsetCodepoints(texts: string[]): number[] {
  const cjkTexts = texts.filter(textHasCjk);
  return cjkTexts.length > 0 ? collectCodepoints(cjkTexts) : [];
}

/**
 * Produce a subset of the bundled CJK font containing the given code points
 * (plus printable ASCII), suitable for PdfController.loadEmbeddedFont(). Using
 * HB_MEMORY_MODE_DUPLICATE makes HarfBuzz copy the input font, so our temporary
 * buffer can be freed immediately.
 */
export async function subsetEmbeddedFont(codepoints: number[]): Promise<Uint8Array> {
  const [hb, font] = await Promise.all([getHbSubset(), getSourceFont()]);
  const heap = () => new Uint8Array(hb.memory.buffer);

  const fontPtr = hb.malloc(font.length);
  heap().set(font, fontPtr);
  const blob = hb.hb_blob_create(fontPtr, font.length, HB_MEMORY_MODE_DUPLICATE, 0, 0);
  hb.free(fontPtr);

  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);

  const input = hb.hb_subset_input_create_or_fail();
  if (!input) {
    hb.hb_face_destroy(face);
    throw new Error('hb_subset_input_create_or_fail failed');
  }

  // The bundled Noto Sans SC is a variable font; pin its weight axis to a fixed
  // value so the subset is a clean static instance. NOTE: pin_all_axes_to_default
  // collapses to the lightest master here (renders ~half the ink), so we pin the
  // 'wght' axis explicitly instead.
  hb.hb_subset_input_pin_axis_location(input, face, HB_TAG_WGHT, EMBEDDED_FONT_WEIGHT);

  const unicodeSet = hb.hb_subset_input_unicode_set(input);
  // Always include printable ASCII so a single font serves mixed Latin/CJK text.
  for (let cp = 0x20; cp <= 0x7e; cp++) hb.hb_set_add(unicodeSet, cp);
  for (const cp of codepoints) hb.hb_set_add(unicodeSet, cp);

  const subsetFace = hb.hb_subset_or_fail(face, input);
  try {
    if (!subsetFace) throw new Error('hb_subset_or_fail failed');
    const resultBlob = hb.hb_face_reference_blob(subsetFace);
    const lenPtr = hb.malloc(4);
    try {
      const dataPtr = hb.hb_blob_get_data(resultBlob, lenPtr);
      const len = new Uint32Array(hb.memory.buffer, lenPtr, 1)[0];
      // Copy out immediately (before any further allocation can grow/detach memory).
      const out = heap().slice(dataPtr, dataPtr + len);
      hb.hb_blob_destroy(resultBlob);
      return out;
    } finally {
      hb.free(lenPtr);
    }
  } finally {
    if (subsetFace) hb.hb_face_destroy(subsetFace);
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
  }
}
