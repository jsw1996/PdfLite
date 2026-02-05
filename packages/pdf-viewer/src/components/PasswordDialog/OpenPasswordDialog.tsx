import React, { useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pdfviewer/ui/components/dialog';
import { Button } from '@pdfviewer/ui/components/button';
import { Input } from '@pdfviewer/ui/components/input';

export interface IOpenPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (password: string) => void;
  error?: string | null;
  isProcessing?: boolean;
  onClearError?: () => void;
}

export const OpenPasswordDialog: React.FC<IOpenPasswordDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  error = null,
  isProcessing = false,
  onClearError,
}) => {
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setPassword('');
      setLocalError(null);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (isProcessing) return;
    setPassword('');
    setLocalError(null);
    onOpenChange(false);
  }, [isProcessing, onOpenChange]);

  const handleSubmit = useCallback(() => {
    if (!password) {
      setLocalError('Please enter a password');
      return;
    }
    setLocalError(null);
    onSubmit(password);
  }, [onSubmit, password]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      if (localError) setLocalError(null);
      if (error && onClearError) onClearError();
    },
    [error, localError, onClearError],
  );

  const displayError = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock PDF</DialogTitle>
          <DialogDescription>Enter the password to open this PDF.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4">
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            value={password}
            onChange={handleChange}
            placeholder="Enter password"
            autoComplete="current-password"
            disabled={isProcessing}
          />
          {displayError && <p className="text-sm text-red-500">{displayError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? 'Unlocking...' : 'Unlock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
