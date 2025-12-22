import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TooltipButton } from '@pdfviewer/ui/components/tooltipButton';

export const PageStepper = () => {
  return (
    <div className="flex m-0">
      <TooltipButton title="Previous Page" variant="ghost">
        <ChevronLeft />
      </TooltipButton>
      <span className="font-medium self-center">
        <span>1</span> <span>/</span> <span>30</span>
      </span>
      <TooltipButton title="Next Page" variant="ghost">
        <ChevronRight />
      </TooltipButton>
    </div>
  );
};
