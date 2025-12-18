import { ToolBar } from '../Toolbar/Toolbar';
import type { IToolButton } from '../ToolButtons/ToolButton.type';
interface IHeaderProps {
  fileName: string;
  buttons?: IToolButton[];
}

export const Header: React.FC<IHeaderProps> = ({ fileName, buttons }) => {
  return (
    <div className="sticky top-0 z-50 w-full h-12 bg-white text-black flex items-center justify-between px-4 border-b border-gray-200 box-content py-[4px] mb-2.5">
      <h1 className="text-lg font-semibold flex-1">{fileName}</h1>
      <div className="flex-1 flex justify-center">
        <ToolBar buttons={buttons ?? []} />
      </div>
      <div className="flex-1"></div>
    </div>
  );
};
