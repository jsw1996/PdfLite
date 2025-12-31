import React, { useState, useCallback } from 'react';

export interface IImageUploadProps {
  onSignatureReady: (args: {
    pngDataUrl: string;
    pngBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }) => void;
}

export const ImageUpload: React.FC<IImageUploadProps> = ({ onSignatureReady }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{
    dataUrl: string;
    bytes: Uint8Array;
    width: number;
    height: number;
  } | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setPreviewUrl(dataUrl);

        // Load image to get dimensions
        const img = new Image();
        img.onload = () => {
          // Convert to PNG bytes
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.drawImage(img, 0, 0);
          const pngDataUrl = canvas.toDataURL('image/png');
          const pngBytes = new Uint8Array(
            atob(pngDataUrl.split(',')[1])
              .split('')
              .map((c) => c.charCodeAt(0)),
          );

          setImageData({
            dataUrl: pngDataUrl,
            bytes: pngBytes,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error loading image:', error);
      alert('加载图片失败');
    }
  }, []);

  // Auto-update signature when image is loaded
  React.useEffect(() => {
    if (imageData) {
      onSignatureReady({
        pngDataUrl: imageData.dataUrl,
        pngBytes: imageData.bytes,
        widthPx: imageData.width,
        heightPx: imageData.height,
      });
    }
  }, [imageData, onSignatureReady]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium mb-2">上传签名图片</label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={(e) => {
            handleFileChange(e);
          }}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
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
