import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { Button } from './button';
import type { ComponentProps } from 'react';

interface ITooltipButtonProps extends ComponentProps<typeof Button> {
  title?: string;
}

export const TooltipButton: React.FC<ITooltipButtonProps> = (props) => {
  const { title, children, ...buttonProps } = props;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent className="[&_svg]:invisible">{title}</TooltipContent>
    </Tooltip>
  );
};
