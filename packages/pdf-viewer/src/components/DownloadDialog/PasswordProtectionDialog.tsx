import React, { useState, useCallback } from 'react';
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

export interface IPasswordProtectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (options: {
    enablePassword: boolean;
    password?: string;
    permissions?: {
      printing: boolean;
      copying: boolean;
      modifying: boolean;
    };
  }) => void;
  isProcessing?: boolean;
}

export const PasswordProtectionDialog: React.FC<IPasswordProtectionDialogProps> = ({
  open,
  onOpenChange,
  onDownload,
  isProcessing = false,
}) => {
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [permissions, setPermissions] = useState({
    printing: true,
    copying: true,
    modifying: false,
  });
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setEnablePassword(false);
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setPermissions({ printing: true, copying: true, modifying: false });
    onOpenChange(false);
  }, [onOpenChange]);

  const handleDownload = useCallback(() => {
    if (enablePassword) {
      if (!password) {
        setError('Please enter a password');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters');
        return;
      }
    }
    setError(null);
    onDownload({
      enablePassword,
      password: enablePassword ? password : undefined,
      permissions: enablePassword ? permissions : undefined,
    });
  }, [enablePassword, password, confirmPassword, permissions, onDownload]);

  const togglePermission = (key: keyof typeof permissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download PDF</DialogTitle>
          <DialogDescription>
            Optionally add password protection to your PDF before downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Password Protection Toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enablePassword}
              onChange={(e) => setEnablePassword(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">Add password protection</span>
          </label>

          {enablePassword && (
            <div className="space-y-4 pl-7">
              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter password"
                  autoComplete="new-password"
                />
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </div>

              {/* Permissions */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Permissions</label>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.printing}
                      onChange={() => togglePermission('printing')}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Allow printing</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.copying}
                      onChange={() => togglePermission('copying')}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Allow copying text</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.modifying}
                      onChange={() => togglePermission('modifying')}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Allow modifications</span>
                  </label>
                </div>
              </div>

              {/* Error Message */}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
