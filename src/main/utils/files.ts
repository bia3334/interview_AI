import * as fs from 'fs';

// Track files that couldn't be deleted for cleanup later
const pendingDeletes = new Set<string>();

/**
 * Check if file is in use
 */
export const isFileInUse = (filePath: string): boolean => {
  try {
    if (!fs.existsSync(filePath)) return false;
    
    const fd = fs.openSync(filePath, 'r+');
    fs.closeSync(fd);
    return false;
  } catch (error) {
    return true;
  }
};

/**
 * Safely delete file on Windows with retries
 */
export const safeDeleteFile = (filePath: string, retryCount = 0, log?: any) => {
  try {
    if (fs.existsSync(filePath)) {
      if (isFileInUse(filePath)) {
        if (retryCount < 3) {
          const delay = (retryCount + 1) * 1000;
          if (log) log.warn(`File is in use (attempt ${retryCount + 1}), retrying in ${delay}ms...`);
          setTimeout(() => {
            safeDeleteFile(filePath, retryCount + 1, log);
          }, delay);
          return;
        } else {
          if (log) log.error(`File still in use after ${retryCount + 1} attempts: ${filePath}`);
          pendingDeletes.add(filePath);
          return;
        }
      }
      
      fs.unlinkSync(filePath);
      if (log) log.info(`Successfully deleted file: ${filePath}`);
    }
  } catch (error) {
    if (retryCount < 3) {
      const delay = (retryCount + 1) * 1000;
      if (log) log.warn(`Failed to delete file (attempt ${retryCount + 1}), retrying in ${delay}ms...`);
      setTimeout(() => {
        safeDeleteFile(filePath, retryCount + 1, log);
      }, delay);
    } else {
      if (log) log.error(`Failed to delete file after ${retryCount + 1} attempts: ${filePath}`);
      pendingDeletes.add(filePath);
    }
  }
};

/**
 * Get pending deletes
 */
export const getPendingDeletes = () => pendingDeletes;

/**
 * Convert image to base64
 */
export function imageToBase64(imagePath: string): string {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Read document content based on file type
 */
export async function readDocumentContent(filePath: string): Promise<string> {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  
  if (ext === 'pdf') {
    // Use pdf-parse for PDF files
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.text || '';
  }
  
  if (ext === 'docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (e: any) {
      return `[DOCX file: ${filePath}] - Unable to extract text content: ${e.message}`;
    }
  }
  
  if (ext === 'xlsx') {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      let text = '';
      workbook.SheetNames.forEach((sheetName: string) => {
        text += `--- Sheet: ${sheetName} ---\n`;
        const sheet = workbook.Sheets[sheetName];
        text += XLSX.utils.sheet_to_csv(sheet, { FS: '\t' }) + '\n';
      });
      return text || '';
    } catch (e: any) {
      return `[XLSX file: ${filePath}] - Unable to extract text content: ${e.message}`;
    }
  }
  
  if (ext === 'pptx') {
    // For PPTX, we'll read it as text (basic extraction)
    // Note: For better PPTX support, you might want to use a library like officegen or pptx-parser
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      let text = '';
      
      for (const entry of entries) {
        if (entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')) {
          const content = entry.getData().toString('utf8');
          // Extract text from XML (basic approach)
          const matches = content.match(/<a:t>([^<]*)<\/a:t>/g);
          if (matches) {
            text += matches.map((m: string) => m.replace(/<\/?a:t>/g, '')).join(' ') + '\n';
          }
        }
      }
      return text || 'Could not extract text from PPTX';
    } catch (e) {
      // Fallback: just return file info
      return `[PPTX file: ${filePath}] - Unable to extract text content`;
    }
  }
  
  // For text-based files (txt, md, csv, json, log)
  return fs.readFileSync(filePath, 'utf8');
}
