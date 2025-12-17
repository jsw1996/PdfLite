import { ZoomControl } from './ZoomControl';

export const PageControlBar: React.FC = () => {
  return (
    <div className="flex items-center justify-center space-x-4 bg-white p-2 border border-gray-300 rounded-md shadow-md">
      <ZoomControl />
    </div>
  );
};
