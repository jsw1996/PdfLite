import { PDFDocument } from 'pdf-lib-with-encrypt';

export interface IEncryptPdfOptions {
  userPassword: string;
  ownerPassword?: string;
  permissions?: {
    printing?: boolean;
    modifying?: boolean;
    copying?: boolean;
    annotating?: boolean;
  };
}

/**
 * Encrypts a PDF with password protection.
 * Uses RC4 128-bit encryption (widely compatible).
 *
 * @param pdfBytes - The original PDF as a Uint8Array
 * @param options - Encryption options including passwords and permissions
 * @returns The encrypted PDF as a Uint8Array
 */
export async function encryptPdf(
  pdfBytes: Uint8Array,
  options: IEncryptPdfOptions,
): Promise<Uint8Array> {
  const { userPassword, ownerPassword, permissions } = options;

  // Load the existing PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Build permissions flags
  // Default: all permissions granted
  const permissionFlags = {
    printing: permissions?.printing ?? true,
    modifying: permissions?.modifying ?? false,
    copying: permissions?.copying ?? true,
    annotating: permissions?.annotating ?? true,
  };

  // Encrypt the document with the provided passwords
  // pdf-lib-with-encrypt adds the encrypt method to PDFDocument
  await (
    pdfDoc as PDFDocument & {
      encrypt: (options: {
        userPassword: string;
        ownerPassword: string;
        permissions: {
          printing?: boolean;
          modifying?: boolean;
          copying?: boolean;
          annotating?: boolean;
        };
      }) => Promise<void>;
    }
  ).encrypt({
    userPassword,
    ownerPassword: ownerPassword ?? userPassword,
    permissions: permissionFlags,
  });

  // Save and return the encrypted PDF
  const encryptedPdfBytes = await pdfDoc.save();

  return encryptedPdfBytes;
}
