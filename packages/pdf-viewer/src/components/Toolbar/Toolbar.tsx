import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { ToolGroup } from './ToolGroup';
import { Separator } from '@pdfviewer/ui/components/separator';
import { useCallback, useState } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { AnnotationType } from '../../types/annotation';
import { DrawButtonId } from '../ToolButtons/DrawButton';
import { HighlightButtonId } from '../ToolButtons/HighlightButton';

export interface IToobarProps {
  // Define any props needed for the Toolbar component
  buttons: IToolButton[];
}

export const ToolBar: React.FC<IToobarProps> = (props: IToobarProps) => {
  const { buttons } = props;

  const { selectedTool, setSelectedTool } = useAnnotation();
  const [activeToolId, setActiveToolId] = useState<string | null>(null);

  const handleActivate = useCallback(
    (toolId: string | null) => {
      setActiveToolId(toolId);
      if (toolId === DrawButtonId) {
        setSelectedTool(selectedTool === AnnotationType.DRAW ? null : AnnotationType.DRAW);
        return;
      }
      if (toolId === HighlightButtonId) {
        setSelectedTool(
          selectedTool === AnnotationType.HIGHLIGHT ? null : AnnotationType.HIGHLIGHT,
        );
        return;
      }
      // 其它工具不进入 annotation 模式
      setSelectedTool(null);
    },
    [selectedTool, setSelectedTool],
  );

  const buttonsByGroup: IToolButton[][] = buttons.reduce(
    (groups: IToolButton[][], button) => {
      const groupIndex = button.groupIndex;
      groups[groupIndex].push(button);
      return groups;
    },
    [[], [], []],
  );

  return (
    <div className="flex flex-row p-[5px] bg-[#f8fafc] border border-gray-300 rounded-[14px] space-x-1">
      {buttonsByGroup.map((groupButtons, index) => (
        <div key={index} className="flex flex-row items-center">
          <ToolGroup
            buttons={groupButtons}
            activeToolId={activeToolId}
            onActivate={handleActivate}
          />
          {index < buttonsByGroup.length - 1 && (
            <Separator orientation="vertical" className="mx-2 !h-6" />
          )}
        </div>
      ))}
    </div>
  );
};
