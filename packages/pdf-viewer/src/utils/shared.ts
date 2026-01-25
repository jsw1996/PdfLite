/**
 * Shared utility functions used across the application
 */

/**
 * Clamp a number to a finite value, returning a fallback if the number is not finite
 * @param n - The number to clamp
 * @param fallback - The fallback value if n is not finite (default: 0)
 */
export function clampFinite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Scale an array of points by a given scale factor
 * @param points - Array of points with x and y coordinates
 * @param scale - Scale factor to apply
 */
export function scalePoints(
  points: { x: number; y: number }[],
  scale: number,
): { x: number; y: number }[] {
  return points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
}

/**
 * Execute a callback after two requestAnimationFrame cycles.
 * Useful for ensuring React has rendered before performing DOM operations.
 * @param callback - The function to execute
 */
export function doubleRAF(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

/**
 * Validate if a URI is safe to open externally.
 * Prevents opening potentially dangerous protocols.
 * @param uri - The URI to validate
 * @returns true if the URI is safe to open
 */
export function isValidExternalUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Allow only http and https protocols
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Safe base64 decoding with error handling
 * @param base64String - The base64 string to decode
 * @returns Uint8Array of decoded bytes, or null if decoding fails
 */
export function safeBase64Decode(base64String: string): Uint8Array | null {
  try {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}
