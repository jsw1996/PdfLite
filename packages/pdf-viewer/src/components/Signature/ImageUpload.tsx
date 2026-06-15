import React, { useState, useCallback, useEffect } from 'react';
import { safeBase64Decode } from '@/utils/shared';

// Limits to keep the embedded signature reasonable and avoid blowing up the
// PDF / WASM memory on accidentally-huge phone-camera uploads.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_DIMENSION = 2048; // px on the longer side

export interface IImageUploadProps {
  onSignatureReady: (args: {
    pngDataUrl: string;
    pngBytes: Uint8Array;
    rgbaBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }) => void;
}

export const ImageUpload: React.FC<IImageUploadProps> = ({ onSignatureReady }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{
    dataUrl: string;
    bytes: Uint8Array;
    rgbaBytes: Uint8Array;
    width: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Cap raw upload size
    if (file.size > MAX_FILE_BYTES) {
      setError(`Image is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
      return;
    }

    setError(null);

    // Use an object URL for the preview instead of a base64 data URL. A 10 MB
    // upload becomes a small handle rather than a ~13 MB string held in state.
    // The previous URL (if any) is revoked by the cleanup effect below.
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Load image to get dimensions
    const img = new Image();
    img.onerror = () => {
      setError('Failed to load the image');
    };
    img.onload = () => {
      // Downscale to MAX_IMAGE_DIMENSION on the longer side, preserving aspect ratio.
      const scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
      const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Failed to create canvas context');
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const pngDataUrl = canvas.toDataURL('image/png');

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgbaBytes = new Uint8Array(imageData.data);

      // Safe base64 decoding
      const base64Data = pngDataUrl.split(',')[1];
      const pngBytes = safeBase64Decode(base64Data);

      if (!pngBytes) {
        setError('Failed to process the image');
        return;
      }

      setImageData({
        dataUrl: pngDataUrl,
        bytes: pngBytes,
        rgbaBytes,
        width: targetWidth,
        height: targetHeight,
      });
    };
    img.src = objectUrl;
  }, []);

  // Revoke the object URL when it changes or the component unmounts so the
  // browser releases the backing blob.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Auto-update signature when image is loaded
  React.useEffect(() => {
    if (imageData) {
      onSignatureReady({
        pngDataUrl: imageData.dataUrl,
        pngBytes: imageData.bytes,
        rgbaBytes: imageData.rgbaBytes,
        widthPx: imageData.width,
        heightPx: imageData.height,
      });
    }
  }, [imageData, onSignatureReady]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium mb-2">Upload signature image</label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={(e) => {
            handleFileChange(e);
          }}
          className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-foreground hover:file:bg-primary/15"
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      {previewUrl && (
        <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white p-4">
          <img
            src={previewUrl}
            alt="Signature preview"
            className="max-w-full max-h-64 mx-auto"
            style={{ objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  );
};
