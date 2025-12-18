import { cn } from '@pdfviewer/ui/lib/utils';
import type { IToolButton } from './ToolButton.type';
import { TooltipButton } from '@pdfviewer/ui/components/tooltipButton';

export type ToolButtonProps = IToolButton & {
  isActive: boolean;
  onActivate: (toolId: string | null) => void;
};

export const ToolButton: React.FC<ToolButtonProps> = (props: ToolButtonProps) => {
  const toolId = props.id ?? props.name;
  const className = cn(
    'hover:bg-indigo-100',
    'text-[#65758D]',
    props.isActive && 'bg-blue-100 text-[#4f46e5] bg-white border border-gray-300',
  );

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
          props.onClick?.();
        }}
      >
        <props.icon className="w-[24px] h-[24px] stroke-2" />
      </TooltipButton>
    </>
  );
};
