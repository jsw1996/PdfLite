import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { ToolGroup } from './ToolGroup';
import { Separator } from '@pdfviewer/ui/components/separator';
import { useState } from 'react';

export interface IToobarProps {
  // Define any props needed for the Toolbar component
  buttons: IToolButton[];
}

export const ToolBar: React.FC<IToobarProps> = (props: IToobarProps) => {
  const { buttons } = props;

  const [activeToolId, setActiveToolId] = useState<string | null>(null);

  const buttonsByGroup: IToolButton[][] = buttons.reduce(
    (groups: IToolButton[][], button) => {
      const groupIndex = button.groupIndex;
      groups[groupIndex].push(button);
      return groups;
    },
    [[], [], []],
  );

  return (
    <div className="flex flex-row p-[5px]">
      {buttonsByGroup.map((groupButtons, index) => (
        <div key={index} className="flex flex-row items-center">
          <ToolGroup
            buttons={groupButtons}
            activeToolId={activeToolId}
            onActivate={setActiveToolId}
          />
          {index < buttonsByGroup.length - 1 && (
            <Separator orientation="vertical" className="mx-2 !h-6 bg-gray-300" />
          )}
        </div>
      ))}
    </div>
  );
};
