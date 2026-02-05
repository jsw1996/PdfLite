export interface IPdfDest {
  pageIndex: number;
  x?: number;
  y?: number;
  zoom?: number;
}

export interface IPdfOutlineNode {
  title: string;
  dest?: IPdfDest;
  unsupported?: string;
  children?: IPdfOutlineNode[];
}

export interface IUserBookmark {
  id: string;
  title: string;
  pageIndex: number;
  anchor?: {
    x?: number;
    y?: number;
    zoom?: number;
  };
  createdAt: number;
}

// Draft controller surface for outline + bookmarks.
export interface IOutlineControllerDraft {
  getOutline(): IPdfOutlineNode[];
  goToDest(dest: IPdfDest): void;
}
