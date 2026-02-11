'use client';

import { useCallback, useState } from 'react';
import type { IPdfOutlineNode } from '@pdfviewer/controller';
import { ChevronRight, ChevronsDown, ChevronsUp } from 'lucide-react';
import { Button } from '@pdfviewer/ui/components/button';

interface IOutlinePanelProps {
  outline: IPdfOutlineNode[];
  onGoToPage: (pageIndex: number) => void;
}

export function OutlinePanel({ outline, onGoToPage }: IOutlinePanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  if (!outline.length) {
    return <div className="px-3 py-4 text-sm text-slate-500">No outline.</div>;
  }

  const allKeys: string[] = [];
  const collectKeys = (nodes: IPdfOutlineNode[], prefix: string) => {
    nodes.forEach((node, index) => {
      const key = `${prefix}${index}`;
      if (node.children?.length) {
        allKeys.push(key);
        collectKeys(node.children, `${key}-`);
      }
    });
  };
  collectKeys(outline, 'outline-');
  const allExpanded = allKeys.length > 0 && allKeys.every((key) => expanded.has(key));

  const renderNode = (node: IPdfOutlineNode, depth: number, key: string) => {
    const hasDest = !!node.dest;
    const title = node.title?.trim() || 'Untitled';
    const hasChildren = !!node.children?.length;
    const isExpanded = expanded.has(key);
    return (
      <div key={key} className="text-left">
        <div
          className="flex items-center gap-1 py-1.5 rounded-md hover:bg-muted"
          style={{ paddingLeft: 8 + depth * 12, paddingRight: 12 }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground text-left"
              onClick={() => toggle(key)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronRight
                className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="size-6" />
          )}
          <Button
            size="xs"
            variant="ghost"
            className={`min-w-0 flex-1 justify-start text-sm ${
              hasDest ? 'text-foreground' : 'text-muted-foreground'
            }`}
            onClick={() => {
              if (node.dest) onGoToPage(node.dest.pageIndex);
            }}
            disabled={!hasDest}
          >
            <span className="block truncate">{title}</span>
          </Button>
        </div>
        {hasChildren && isExpanded
          ? node.children!.map((child, index) => renderNode(child, depth + 1, `${key}-${index}`))
          : null}
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto custom-scrollbar py-2">
      <div className="flex items-center justify-end px-3 pb-2">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="cursor-pointer"
          aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          title={allExpanded ? 'Collapse all' : 'Expand all'}
          onClick={() => {
            if (allExpanded) {
              setExpanded(new Set());
              return;
            }
            setExpanded(new Set(allKeys));
          }}
        >
          {allExpanded ? (
            <ChevronsUp className="size-3.5" />
          ) : (
            <ChevronsDown className="size-3.5" />
          )}
        </Button>
      </div>
      {outline.map((node, index) => renderNode(node, 0, `outline-${index}`))}
    </div>
  );
}
