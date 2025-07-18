/**
 * Shared test utilities for the GIAS Data tests
 */
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Creates a mock Response object for testing fetch operations
 */
export const mockResponse = (status: number, contentType: string, body: string): Response => {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (header: string) => (header.toLowerCase() === 'content-type' ? contentType : null),
    },
    redirected: false,
    statusText: '',
    type: 'basic',
    url: 'https://example.com',
    clone: () => mockResponse(status, contentType, body),
    body: null,
    bodyUsed: false,
    text: async () => body,
    json: async () => JSON.parse(body),
    blob: async () => new Blob([body]),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
};

/**
 * Safe file operation with better error logging
 * Wraps fs operations with proper error handling for tests
 */
export const safeFileOps = {
  /**
   * Safely delete a file with error logging
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`Warning: Failed to delete file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Safely remove a directory with error logging
   */
  async removeDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Warning: Failed to remove directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Safely check if a file or directory exists
   */
  async exists(path: string): Promise<boolean> {
    return fs.access(path).then(() => true).catch(() => false);
  },

  /**
   * Safely write to a file with error handling
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.writeFile(filePath, content);
    } catch (error) {
      throw new Error(`Failed to write to file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};
