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
