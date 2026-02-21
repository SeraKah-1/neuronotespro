
import { KnowledgeFile, KnowledgeSource } from '../types';

/**
 * MOCK DRIVE SERVICE
 * 
 * In a real application, this would use the Google Drive API v3.
 * Since we cannot expose a real GCP Client ID/Secret in this demo environment,
 * we simulate the auth flow and file retrieval to demonstrate the UX.
 */

export class DriveService {
  private static instance: DriveService;

  private constructor() {}

  public static getInstance(): DriveService {
    if (!DriveService.instance) {
      DriveService.instance = new DriveService();
    }
    return DriveService.instance;
  }

  // Simulate Auth Window
  public async connectDrive(): Promise<{ email: string; token: string }> {
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        resolve({
          email: 'student@university.edu',
          token: 'mock-oauth-token-' + Date.now()
        });
      }, 1500);
    });
  }

  // Simulate Fetching Folders
  public async listFolders(): Promise<any[]> {
    return new Promise(resolve => {
       setTimeout(() => {
           resolve([
               { id: 'folder-1', name: 'Internal Medicine 2024' },
               { id: 'folder-2', name: 'Cardiology Lectures' },
               { id: 'folder-3', name: 'Pharmacology Slides' },
               { id: 'folder-4', name: 'Research Papers' }
           ]);
       }, 800);
    });
  }

  // Simulate Syncing Files from a Folder
  public async syncFolder(folderId: string): Promise<KnowledgeFile[]> {
    return new Promise(resolve => {
        setTimeout(() => {
            // Generate mock files based on folder ID to look consistent
            const count = Math.floor(Math.random() * 5) + 3;
            const files: KnowledgeFile[] = [];
            
            const types = ['pdf', 'pptx', 'docx'];
            const names = ['Lecture_01_Intro', 'Lecture_02_Pathology', 'Case_Study_Review', 'Treatment_Guidelines', 'Exam_Review'];
            
            for(let i=0; i<count; i++) {
                const type = types[Math.floor(Math.random() * types.length)];
                files.push({
                    id: `file-${folderId}-${i}`,
                    sourceId: `drive-${folderId}`,
                    name: `${names[i]}.${type}`,
                    type: type,
                    size: Math.floor(Math.random() * 5000000) + 100000,
                    indexed: true,
                    contentSnippet: "Lorem ipsum dolor sit amet, medical content extracted from drive..."
                });
            }
            resolve(files);
        }, 2000); // 2 second sync simulation
    });
  }
}
