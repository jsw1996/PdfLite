import { ToolBar } from '../Toolbar/Toolbar';
import { SearchBar } from '../SearchBar/SearchBar';
import type { IToolButton } from '../ToolButtons/ToolButton.type';
import { FileText } from 'lucide-react';

interface IHeaderProps {
  fileName: string;
  centerButtons?: IToolButton[];
  rightButtons?: IToolButton[];
}

export const Header: React.FC<IHeaderProps> = ({ fileName, centerButtons, rightButtons }) => {
  return (
    <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-2">
      <div className="flex items-center justify-between gap-4">
        {/* Left: File info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-sm font-semibold text-foreground truncate">{fileName}</h1>
        </div>

        {/* Center: Main toolbar */}
        <div className="flex-shrink-0">
          <ToolBar buttons={centerButtons ?? []} boardered />
        </div>

        {/* Right: Search and tools */}
        <div className="flex-1 flex justify-end items-center gap-2">
          <SearchBar />
          <ToolBar buttons={rightButtons ?? []} />
        </div>
      </div>
    </div>
  );
};
