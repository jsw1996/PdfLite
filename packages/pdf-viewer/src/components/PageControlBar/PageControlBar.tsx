import { PageStepper } from './PageStepper';
import { ZoomControl } from './ZoomControl';
import { Separator } from '@pdfviewer/ui/components/separator';

export interface IPageControlBarProps {
  pageCount: number;
  onJumpToPage: (pageIndex: number) => void;
}

export const PageControlBar: React.FC<IPageControlBarProps> = ({ pageCount, onJumpToPage }) => {
  return (
    <div className="flex items-center justify-center gap-3 bg-card/80 dark:bg-card/70 backdrop-blur-xl px-4 py-2.5 border border-border/50 rounded-2xl shadow-lg shadow-primary/5 text-muted-foreground transition-all duration-200 hover:shadow-xl hover:shadow-primary/10">
      <PageStepper pageCount={pageCount} onJumpToPage={onJumpToPage} />
      <Separator orientation="vertical" className="mx-1 h-5! bg-border/50 dark:bg-foreground/25" />
      <ZoomControl />
    </div>
  );
};
