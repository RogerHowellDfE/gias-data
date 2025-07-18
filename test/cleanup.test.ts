import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { downloadFile } from '../src/fetch-data';
import { safeFileOps } from './test-utils';

// Define constants and variables at the top
const tempDir = path.join(tmpdir(), 'test-cleanup-');

// Create a simplified test focused just on cleanup error handling
describe('downloadFile cleanup handling', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let unlinkSpy: jest.SpyInstance;

  // Setup before all tests
  beforeAll(async () => {
    // Create the temporary directory
    await fs.mkdir(tempDir, { recursive: true });
  });

  // Setup before each test
  beforeEach(() => {
    // Create console and fs spies
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    unlinkSpy = jest.spyOn(fs, 'unlink');
  });

  // Clean up after each test
  afterEach(() => {
    // Restore original methods
    consoleErrorSpy.mockRestore();
    unlinkSpy.mockRestore();
  });

  // Final cleanup
  afterAll(async () => {
    await safeFileOps.removeDir(tempDir);
  });

  test('handles cleanup failures correctly', async () => {
    // Arrange
    const outputPath = path.join(tempDir, 'output.csv');
    const tempPath = path.join(tempDir, 'output.csv.tmp');

    try {
      // Create a temp file that we'll actually try to clean up
      await safeFileOps.writeFile(tempPath, 'test content');

      // Mock unlink to simulate a failure
      unlinkSpy.mockRejectedValueOnce(new Error('Disk error'));

      // Create a custom fetch function that will fail
      const fetchThatFails = () => {
        throw new Error('Network error');
      };

      // Act
      const result = await downloadFile(
        'https://example.com/data.csv',
        outputPath,
        tempPath,
        20,
        fetchThatFails
      );

      // Assert
      expect(result.success).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up temp file')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Disk error')
      );
    } catch (error) {
      fail(`Test failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});
