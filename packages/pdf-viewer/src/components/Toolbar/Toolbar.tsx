import type { AnnotationType } from '../../annotations';
import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { ToolGroup } from './ToolGroup';
import { Separator } from '@pdfviewer/ui/components/separator';
import { useCallback, useMemo } from 'react';
import { useAnnotation } from '../../providers/AnnotationContextProvider';
import { EditTextButtonId } from '../ToolButtons/EditTextButton';
import { SelectButtonId } from '../ToolButtons/SelectButton';
import { cn } from '@pdfviewer/ui/lib/utils';

const ANNOTATION_TOOL_IDS: Record<string, AnnotationType> = {
  draw: 'draw',
  highlight: 'highlight',
  text: 'text',
  signature: 'signature',
};

export interface IToobarProps {
  buttons: IToolButton[];
  boardered?: boolean;
}

export function ToolBar({ buttons, boardered }: IToobarProps) {
  const { selectedTool, setSelectedTool, isEditMode, setIsEditMode } = useAnnotation();

  const handleActivate = useCallback(
    (toolId: string | null) => {
      if (toolId === EditTextButtonId) {
        setIsEditMode(!isEditMode);
        return;
      }

      // Select is the neutral cursor: clicking it deactivates every other tool.
      if (toolId === SelectButtonId) {
        setSelectedTool(null);
        if (isEditMode) setIsEditMode(false);
        return;
      }

      const annotationType = toolId ? ANNOTATION_TOOL_IDS[toolId] : undefined;
      if (annotationType) {
        setSelectedTool(selectedTool === annotationType ? null : annotationType);
        return;
      }

      setSelectedTool(null);
      if (isEditMode) setIsEditMode(false);
    },
    [isEditMode, selectedTool, setIsEditMode, setSelectedTool],
  );

  const classNames = cn(
    'flex flex-row p-1.5 space-x-1 transition-all duration-200',
    boardered ? 'bg-transparent' : 'bg-transparent',
  );

  const buttonsByGroup = useMemo(() => {
    return buttons.reduce<IToolButton[][]>((groups, button) => {
      if (!groups[button.groupIndex]) {
        groups[button.groupIndex] = [];
      }
      groups[button.groupIndex].push(button);
      return groups;
    }, []);
  }, [buttons]);

  return (
    <div className={classNames}>
      {buttonsByGroup.map((groupButtons, index) => (
        <div key={index} className="flex flex-row items-center">
          <ToolGroup
            buttons={groupButtons}
            // Fall back to Select so the cursor tool reads as active when no
            // annotation tool or edit mode is engaged.
            activeToolId={isEditMode ? EditTextButtonId : (selectedTool ?? SelectButtonId)}
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
}
