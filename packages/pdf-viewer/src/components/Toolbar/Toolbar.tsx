import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { ToolGroup } from './ToolGroup';
import { Separator } from '@pdfviewer/ui/components/separator';
import { useCallback, useMemo } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { DrawButtonId } from '../ToolButtons/DrawButton';
import { HighlightButtonId } from '../ToolButtons/HighlightButton';
import { cn } from '@pdfviewer/ui/lib/utils';

export interface IToobarProps {
  // Define any props needed for the Toolbar component
  buttons: IToolButton[];
  boardered?: boolean;
}

export const ToolBar: React.FC<IToobarProps> = (props: IToobarProps) => {
  const { buttons, boardered } = props;

  const { selectedTool, setSelectedTool } = useAnnotation();

  const handleActivate = useCallback(
    (toolId: string | null) => {
      if (toolId === DrawButtonId) {
        setSelectedTool(selectedTool === 'draw' ? null : 'draw');
        return;
      }
      if (toolId === HighlightButtonId) {
        setSelectedTool(selectedTool === 'highlight' ? null : 'highlight');
        return;
      }
      if (toolId === 'text') {
        setSelectedTool(selectedTool === 'text' ? null : 'text');
        return;
      }
      if (toolId === 'signature') {
        setSelectedTool(selectedTool === 'signature' ? null : 'signature');
        return;
      }
      // Other tools don't enter annotation mode
      setSelectedTool(null);
    },
    [selectedTool, setSelectedTool],
  );

  const classNames = cn(
    'flex flex-row p-1.5 space-x-1 transition-all duration-200',
    boardered
      ? 'bg-secondary/60 dark:bg-muted backdrop-blur-sm border border-border/50 dark:border-foreground/25 rounded-xl shadow-sm dark:shadow-md'
      : 'bg-transparent',
  );

  // Memoize buttonsByGroup to avoid recomputing on every render
  const buttonsByGroup = useMemo(() => {
    return buttons.reduce((groups: IToolButton[][], button) => {
      const groupIndex = button.groupIndex;
      if (!groups[groupIndex]) {
        groups[groupIndex] = [];
      }
      groups[groupIndex].push(button);
      return groups;
    }, []);
  }, [buttons]);

  return (
    <div className={classNames}>
      {buttonsByGroup.map((groupButtons, index) => (
        <div key={index} className="flex flex-row items-center">
          <ToolGroup
            buttons={groupButtons}
            activeToolId={selectedTool}
            onActivate={handleActivate}
          />
          {index < buttonsByGroup.length - 1 && (
            <Separator
              orientation="vertical"
              className="mx-1.5 h-5! bg-border/50 dark:bg-foreground/25"
            />
          )}
        </div>
      ))}
    </div>
  );
};
