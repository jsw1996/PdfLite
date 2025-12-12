import { ToolBar } from './Toolbar/Toolbar';
import { getButtons } from '../utils/getButtons';

export const PdfEditor: React.FC = () => {
  const buttons = getButtons();

  return (
    <div>
      <ToolBar buttons={buttons} />
    </div>
  );
};
