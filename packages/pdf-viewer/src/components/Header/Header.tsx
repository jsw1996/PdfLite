import { ToolBar } from '../Toolbar/Toolbar';
import type { IToolButton } from '../ToolButtons/ToolButton.type';
interface IHeaderProps {
  fileName: string;
  buttons?: IToolButton[];
}

export const Header: React.FC<IHeaderProps> = ({ fileName, buttons }) => {
  return (
    <div className="sticky top-0 z-50 w-full h-12 bg-white text-black flex items-center px-4 border-b border-gray-200">
      <h1 className="text-lg font-semibold">{fileName}</h1>
      <div className="ml-auto">
        <ToolBar buttons={buttons ?? []} />
      </div>
    </div>
  );
};
