export class FileStorageService {
  private static instance: FileStorageService;

  private constructor() {}

  public static getInstance(): FileStorageService {
    if (!FileStorageService.instance) {
      FileStorageService.instance = new FileStorageService();
    }
    return FileStorageService.instance;
  }

  public async saveFile(file: File): Promise<string> {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileId, { create: true });
    
    // @ts-ignore - createWritable is available in modern browsers
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    
    return fileId;
  }

  public async getFileAsBase64(fileId: string): Promise<string> {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileId);
    const file = await fileHandle.getFile();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data URL prefix if present (e.g., data:image/png;base64,)
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  public async deleteFile(fileId: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(fileId);
    } catch (e) {
      console.warn(`Failed to delete file ${fileId} from OPFS`, e);
    }
  }
}
