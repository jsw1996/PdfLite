import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pdfviewer/ui/components/dialog';
import { HandwritingCanvas } from './HandwritingCanvas';
import { ImageUpload } from './ImageUpload';
import { Button } from '@pdfviewer/ui/components/button';

export interface ISignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignatureReady: (args: {
    pngDataUrl: string;
    pngBytes: Uint8Array;
    rgbaBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }) => void;
}

type TabType = 'handwriting' | 'upload';

export const SignatureDialog: React.FC<ISignatureDialogProps> = ({
  open,
  onOpenChange,
  onSignatureReady,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('handwriting');
  const [signatureData, setSignatureData] = useState<{
    pngDataUrl: string;
    pngBytes: Uint8Array;
    rgbaBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  } | null>(null);

  const handleSignatureReady = (args: {
    pngDataUrl: string;
    pngBytes: Uint8Array;
    rgbaBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }) => {
    setSignatureData(args);
  };

  const handleApply = () => {
    if (signatureData) {
      onSignatureReady(signatureData);
      setSignatureData(null);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setSignatureData(null);
    setActiveTab('handwriting');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Signature</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Please select a signature method and draw or upload your signature.
        </DialogDescription>
        <div>
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('handwriting')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'handwriting'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Handwriting
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'upload'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Upload Image
            </button>
          </div>

          {/* Tab Content */}
          <div className="mt-4">
            {activeTab === 'handwriting' && (
              <HandwritingCanvas onSignatureReady={handleSignatureReady} />
            )}
            {activeTab === 'upload' && <ImageUpload onSignatureReady={handleSignatureReady} />}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleApply} disabled={!signatureData}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
