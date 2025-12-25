import type { LucideProps } from 'lucide-react';
import { PdfController } from '@pdfviewer/controller';

export type GroupIndex = 0 | 1 | 2;

export interface IToolButton {
  /** Unique identifier for selection state (defaults to `name`). */
  id?: string;
  name: string;
  icon: React.ComponentType<LucideProps>;
  type: 'button' | 'toggle' | 'dropdown';
  onClick?: (pdfController: PdfController) => void;
  isEnabled?: boolean;
  groupIndex: GroupIndex;
}
