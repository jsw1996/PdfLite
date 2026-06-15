import { cn } from '@pdfviewer/ui/lib/utils';
import type { IToolButton } from './ToolButton.type';
import { TooltipButton } from '@pdfviewer/ui/components/tooltipButton';
import { usePdfController } from '@/providers/PdfControllerContextProvider';
import { useAnnotation } from '@/providers/AnnotationContextProvider';

export type ToolButtonProps = IToolButton & {
  isActive: boolean;
  onActivate: (toolId: string | null) => void;
};

export const ToolButton: React.FC<ToolButtonProps> = (props: ToolButtonProps) => {
  const toolId = props.id ?? props.name;
  const className = cn(
    // Base styles
    'text-muted-foreground relative overflow-hidden rounded-lg transition-all duration-200',
    // Hover state - deep-green accent text (bright green is illegible as text on light)
    'hover:bg-primary/10 hover:text-primary-emphasis',
    // Active state - green fill + ink icon + defining edge so it pops on light chrome
    props.isActive &&
      'bg-primary text-primary-foreground! border border-primary-border shadow-md shadow-primary/25',
    // Disabled state
    props.isEnabled === false && 'opacity-50 cursor-not-allowed',
  );
  const { controller } = usePdfController();
  const { commitAnnotations } = useAnnotation();

  return (
    <>
      <TooltipButton
        title={props.name}
        className={className}
        variant="ghost"
        size="icon"
        aria-pressed={props.isActive}
        disabled={props.isEnabled === false}
        onClick={() => {
          if (props.isActive) {
            props.onActivate(null);
            return;
          }
          if (props.type === 'toggle') {
            props.onActivate(toolId);
          }
          props.onClick?.(controller, commitAnnotations);
        }}
      >
        <props.icon className="w-5 h-5 stroke-[1.75]" />
      </TooltipButton>
    </>
  );
};
