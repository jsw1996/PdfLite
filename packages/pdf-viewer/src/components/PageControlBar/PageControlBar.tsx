import { PageStepper } from './PageStepper';
import { ZoomControl } from './ZoomControl';
import { Separator } from '@pdfviewer/ui/components/separator';

export const PageControlBar: React.FC = () => {
  return (
    <div className="flex items-center justify-center space-x-4 bg-white p-2 border border-gray-300 rounded-md shadow-md  text-gray-600">
      <PageStepper />
      <Separator orientation="vertical" className="mx-2 !h-6" />
      <ZoomControl />
    </div>
  );
};
