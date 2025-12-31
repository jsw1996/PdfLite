import type { IToolButton } from './ToolButton.type';
import { PenTool } from 'lucide-react';

export const SignatureButtonId = 'signature';

export const SignatureButton: () => IToolButton = () => {
  return {
    id: SignatureButtonId,
    name: 'Signature',
    icon: PenTool,
    type: 'toggle',
    groupIndex: 1,
  };
};
