'use client';

import type { IPdfOutlineNode } from '@pdfviewer/controller';

interface IOutlinePanelProps {
  outline: IPdfOutlineNode[];
  onGoToPage: (pageIndex: number) => void;
}

export function OutlinePanel({ outline, onGoToPage }: IOutlinePanelProps) {
  if (!outline.length) {
    return <div className="px-3 py-4 text-sm text-slate-500">No outline.</div>;
  }

  const renderNode = (node: IPdfOutlineNode, depth: number, key: string) => {
    const hasDest = !!node.dest;
    const title = node.title?.trim() || 'Untitled';
    return (
      <div key={key}>
        <button
          type="button"
          className={`w-full text-left text-sm py-1.5 rounded-md hover:bg-primary/20 ${
            hasDest ? 'text-primary-background' : 'text-primary-background cursor-not-allowed'
          }`}
          style={{ paddingLeft: 12 + depth * 12, paddingRight: 12 }}
          onClick={() => {
            if (node.dest) onGoToPage(node.dest.pageIndex);
          }}
          disabled={!hasDest}
        >
          {title}
        </button>
        {node.children?.length
          ? node.children.map((child, index) => renderNode(child, depth + 1, `${key}-${index}`))
          : null}
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto custom-scrollbar py-2">
      {outline.map((node, index) => renderNode(node, 0, `outline-${index}`))}
    </div>
  );
}
