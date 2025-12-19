import { ZoomOut, ZoomIn } from 'lucide-react';
import { TooltipButton } from '@pdfviewer/ui/components/tooltipButton';
import { usePdfState } from '@/providers/PdfStateContextProvider';

export const ZoomControl: React.FC = () => {
  const { scale, setScale } = usePdfState();
  const zoomStep = 0.25;
  const maxScale = 2.5;

  const handleZoomIn = () => {
    setScale(Math.min(maxScale, scale + zoomStep));
  };
  const handleZoomOut = () => {
    setScale(Math.max(zoomStep, scale - zoomStep));
  };
  return (
    <div className="bg-white flex items-center">
      <TooltipButton variant="ghost" onClick={handleZoomOut} title="Zoom Out">
        <ZoomOut />
      </TooltipButton>
      <span className="mx-2">{(scale * 100).toFixed(0)}%</span>
      <TooltipButton variant="ghost" onClick={handleZoomIn} title="Zoom In">
        <ZoomIn />
      </TooltipButton>
    </div>
  );
};
