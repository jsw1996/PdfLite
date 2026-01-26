import { PageStepper } from './PageStepper';
import { ZoomControl } from './ZoomControl';
import { Separator } from '@pdfviewer/ui/components/separator';

export interface IPageControlBarProps {
  pageCount: number;
  onJumpToPage: (pageIndex: number) => void;
}

export const PageControlBar: React.FC<IPageControlBarProps> = ({ pageCount, onJumpToPage }) => {
  return (
    <div className="flex items-center justify-center space-x-4 bg-background p-2 border border-border rounded-md shadow-md text-muted-foreground">
      <PageStepper pageCount={pageCount} onJumpToPage={onJumpToPage} />
      <Separator orientation="vertical" className="mx-2 h-6!" />
      <ZoomControl />
    </div>
  );
};
