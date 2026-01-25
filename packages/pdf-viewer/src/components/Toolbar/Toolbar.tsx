import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { ToolGroup } from './ToolGroup';
import { Separator } from '@pdfviewer/ui/components/separator';
import { useCallback } from 'react';
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
    'flex flex-row p-[5px] bg-[#f8fafc] border border-gray-300 rounded-[14px] space-x-1',
    boardered ? '' : 'border-0 bg-transparent',
  );

  const buttonsByGroup: IToolButton[][] = buttons.reduce((groups: IToolButton[][], button) => {
    const groupIndex = button.groupIndex;
    if (!groups[groupIndex]) {
      groups[groupIndex] = [];
    }
    groups[groupIndex].push(button);
    return groups;
  }, []);

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
            <Separator orientation="vertical" className="mx-2 h-6!" />
          )}
        </div>
      ))}
    </div>
  );
};
