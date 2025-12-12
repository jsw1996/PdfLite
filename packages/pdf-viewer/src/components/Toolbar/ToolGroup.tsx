import React from 'react';
import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { ToolButton } from '../ToolButtons/Button';

interface IToolGroupProps {
  buttons: IToolButton[];
  activeToolId: string | null;
  onActivate: (toolId: string) => void;
}
export const ToolGroup: React.FC<IToolGroupProps> = (props) => {
  const { buttons, activeToolId, onActivate } = props;
  return (
    <div className="tool-group">
      {buttons.map((button) => (
        <ToolButton
          key={button.id ?? button.name}
          {...button}
          isActive={(button.id ?? button.name) === activeToolId}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
};
