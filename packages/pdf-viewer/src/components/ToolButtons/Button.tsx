import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { IToolButton } from './ToolButton.type';

export type ToolButtonProps = IToolButton & {
  isActive: boolean;
  onActivate: (toolId: string) => void;
};

export const ToolButton: React.FC<ToolButtonProps> = (props: ToolButtonProps) => {
  const toolId = props.id ?? props.name;
  const className = cn('hover:bg-indigo-100', props.isActive && 'bg-blue-100 text-indigo-700');

  return (
    <>
      <Button
        className={className}
        variant="ghost"
        size="icon"
        aria-pressed={props.isActive}
        disabled={props.isEnabled === false}
        onClick={() => {
          props.onActivate(toolId);
          props.onClick?.();
        }}
      >
        {props.icon}
      </Button>
    </>
  );
};
