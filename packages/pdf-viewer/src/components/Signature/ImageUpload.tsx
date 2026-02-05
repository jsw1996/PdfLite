import React, { useState, useCallback } from 'react';
import { safeBase64Decode } from '@/utils/shared';

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

    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onerror = () => {
      setError('Failed to read the file');
    };
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPreviewUrl(dataUrl);

      // Load image to get dimensions
      const img = new Image();
      img.onerror = () => {
        setError('Failed to load the image');
      };
      img.onload = () => {
        // Convert to PNG bytes
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setError('Failed to create canvas context');
          return;
        }

        ctx.drawImage(img, 0, 0);
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
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

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
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
