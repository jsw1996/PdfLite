import { ZoomOut, ZoomIn } from 'lucide-react';
import { TooltipButton } from '@pdfviewer/ui/components/tooltipButton';
import { usePdfState } from '@/providers/PdfStateContextProvider';
import { VIEWER_CONFIG } from '@/utils/config';

export const ZoomControl: React.FC = () => {
  const { scale, setScale } = usePdfState();
  const zoomStep = VIEWER_CONFIG.WHEEL_ZOOM_STEP;
  const minScale = VIEWER_CONFIG.MIN_SCALE;
  const maxScale = VIEWER_CONFIG.MAX_SCALE;

  const handleZoomIn = () => {
    setScale(Math.min(maxScale, scale + zoomStep));
  };
  const handleZoomOut = () => {
    setScale(Math.max(minScale, scale - zoomStep));
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
