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
 * Generates a cryptographically-random password (used as the owner password when
 * the caller doesn't supply one). A random owner password means the document's
 * permission flags can't be removed by anyone who only knows the open password.
 */
function generateRandomPassword(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  // Base64 is fine for an owner password the user never types.
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Encrypts a PDF with password protection.
 *
 * NOTE: This uses RC4 128-bit (via pdf-lib-with-encrypt), which is broadly
 * compatible but cryptographically weak and removed in PDF 2.0. Treat this as
 * "compatibility-grade" protection, not strong confidentiality. Prefer AES-256
 * if/when the encryption library supports it.
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
    // Default to a random owner password (NOT the user password) so permission
    // restrictions aren't trivially removable by anyone who can open the file.
    ownerPassword: ownerPassword ?? generateRandomPassword(),
    permissions: permissionFlags,
  });

  // Save and return the encrypted PDF
  const encryptedPdfBytes = await pdfDoc.save();

  return encryptedPdfBytes;
}
