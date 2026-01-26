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
    'text-muted-foreground',
    'hover:bg-indigo-100 hover:text-muted-foreground!',
    props.isActive && 'bg-accent text-primary! border border-border',
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
        <props.icon className="w-[24px] h-[24px] stroke-2" />
      </TooltipButton>
    </>
  );
};
