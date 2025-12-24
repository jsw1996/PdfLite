import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { ToolGroup } from './ToolGroup';
import { Separator } from '@pdfviewer/ui/components/separator';
import { useCallback, useMemo, useState } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { AnnotationType } from '../../types/annotation';
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
  // Active tool for non-annotation tools. Annotation tools are derived from selectedTool.
  const [activeToolId, setActiveToolId] = useState<string | null>(null);

  const derivedAnnotActiveToolId = useMemo(() => {
    if (selectedTool === AnnotationType.DRAW) return DrawButtonId;
    if (selectedTool === AnnotationType.HIGHLIGHT) return HighlightButtonId;
    return null;
  }, [selectedTool]);

  const effectiveActiveToolId = derivedAnnotActiveToolId ?? activeToolId;

  const handleActivate = useCallback(
    (toolId: string | null) => {
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
      setActiveToolId(toolId);
      // 其它工具不进入 annotation 模式
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
            activeToolId={effectiveActiveToolId}
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
