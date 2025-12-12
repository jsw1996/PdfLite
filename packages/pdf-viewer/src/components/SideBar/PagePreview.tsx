import { CanvasLayer } from '../CanvasLayer/CanvasLayer';

export const PagePreview = ({
  page,
  currentPage,
  onPageClick,
}: {
  page: number;
  currentPage: number;
  onPageClick: (page: number) => void;
}) => {
  return (
    <div
      key={`page-preview-${page}`}
      onClick={() => onPageClick(page)}
      className={`cursor-pointer group flex flex-col items-center space-y-2 rounded-lg p-2 transition-colors ${
        currentPage === page ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
      }`}
    >
      <div
        className={`w-full aspect-[1/1.4] bg-white border shadow-sm rounded flex items-center justify-center text-slate-200 overflow-hidden ${
          currentPage === page ? 'border-indigo-300' : 'border-slate-200'
        }`}
      >
        <CanvasLayer pageIndex={page - 1} scale={0.25} />
      </div>
      <span
        className={`text-xs font-medium ${
          currentPage === page ? 'text-indigo-600' : 'text-slate-500'
        }`}
      >
        Page {page}
      </span>
    </div>
  );
};
