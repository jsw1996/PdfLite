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
    <div className="flex items-center gap-1">
      <TooltipButton
        variant="ghost"
        onClick={handleZoomOut}
        title="Zoom Out"
        className="w-8 h-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors duration-200"
      >
        <ZoomOut className="w-4 h-4" />
      </TooltipButton>
      <span className="w-12 text-center text-sm font-medium tabular-nums">
        {(scale * 100).toFixed(0)}%
      </span>
      <TooltipButton
        variant="ghost"
        onClick={handleZoomIn}
        title="Zoom In"
        className="w-8 h-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors duration-200"
      >
        <ZoomIn className="w-4 h-4" />
      </TooltipButton>
    </div>
  );
};
