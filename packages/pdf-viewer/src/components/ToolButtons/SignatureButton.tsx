import type { IToolButton } from './ToolButton.type';
import { Signature } from 'lucide-react';

export const SignatureButtonId = 'signature';

export const SignatureButton: () => IToolButton = () => {
  return {
    id: SignatureButtonId,
    name: 'Signature',
    icon: Signature,
    type: 'toggle',
    groupIndex: 1,
  };
};
