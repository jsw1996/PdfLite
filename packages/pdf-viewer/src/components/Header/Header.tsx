import { ToolBar } from '../Toolbar/Toolbar';
import { SearchBar } from '../SearchBar/SearchBar';
import type { IToolButton } from '../ToolButtons/ToolButton.type';

interface IHeaderProps {
  fileName: string;
  centerButtons?: IToolButton[];
  rightButtons?: IToolButton[];
}

export const Header: React.FC<IHeaderProps> = ({ fileName, centerButtons, rightButtons }) => {
  return (
    <div className="sticky top-0 z-50 dark:bg-sidebar-ring/15 backdrop-blur-xl border-b border-border/50 dark:border-border px-4 py-2">
      <div className="flex items-center justify-between gap-4">
        {/* Left: File info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-foreground truncate">{fileName}</h1>
        </div>

        {/* Center: Main toolbar */}
        <div className="flex-shrink-0">
          <ToolBar buttons={centerButtons ?? []} boardered />
        </div>

        {/* Right: Search and tools */}
        <div className="flex-1 flex justify-end items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0 flex justify-end">
            <SearchBar />
          </div>
          <div className="shrink-0">
            <ToolBar buttons={rightButtons ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
};
