import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { downloadFile } from '../src/fetch-data';
import { mockResponse, safeFileOps } from './test-utils';

// Define constants and global variables at the top
const fixturesDir = path.join(__dirname, '__fixtures__');
let htmlContent: string;
let csvContent: string;
let plainTextContent: string;
let mockFetchFn: jest.MockedFunction<typeof fetch>;

// Setup before all tests
beforeAll(async () => {
  // Load test fixtures
  htmlContent = await fs.readFile(path.join(fixturesDir, 'error.html'), { encoding: 'utf8' });
  csvContent = await fs.readFile(path.join(fixturesDir, 'valid.csv'), { encoding: 'utf8' });
  plainTextContent = await fs.readFile(path.join(fixturesDir, 'plain-text.txt'), { encoding: 'utf8' });

  // Setup mock fetch globally
  mockFetchFn = jest.fn() as jest.MockedFunction<typeof fetch>;
  globalThis.fetch = mockFetchFn;
});

describe('downloadFile function', () => {
  let tempDir: string;

  // Setup before all tests in this describe block
  beforeAll(async () => {
    // The trailing dash is intentional for mkdtemp - it indicates where random characters are appended
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'test-download-'));
  });

  // Clean up after each test
  afterEach(async () => {
    // Reset mocks
    mockFetchFn.mockReset();

    // Clean up temporary files with improved error handling
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      await safeFileOps.deleteFile(path.join(tempDir, file));
    }
  });

  // Final cleanup
  afterAll(async () => {
    await safeFileOps.removeDir(tempDir);
  });

  test('successfully downloads and validates CSV file', async () => {
    // Arrange
    const tempFilePath = path.join(tempDir, 'output.csv.tmp');
    const outputFilePath = path.join(tempDir, 'output.csv');
    mockFetchFn.mockResolvedValue(mockResponse(200, 'text/csv', 'header1,header2\nvalue1,value2'));

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.warning).toBeNull();
    const content = await fs.readFile(outputFilePath, 'utf8');
    expect(content).toBe('header1,header2\nvalue1,value2');
  });

  test('detects file size warning when size changes significantly', async () => {
    // Arrange
    const tempFilePath = path.join(tempDir, 'output.csv.tmp');
    const outputFilePath = path.join(tempDir, 'output.csv');
    await safeFileOps.writeFile(outputFilePath, 'header1,header2\nvalue1,value2');
    mockFetchFn.mockResolvedValue(
      mockResponse(200, 'text/csv', 'header1,header2\nvalue1,value2,value3')
    );

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.warning).toContain('increased in size by');
  });

  test('ignores file size changes within threshold', async () => {
    // Arrange
    const tempFilePath = path.join(tempDir, 'output.csv.tmp');
    const outputFilePath = path.join(tempDir, 'output.csv');
    await safeFileOps.writeFile(outputFilePath, 'header1,header2\nvalue1,value2');
    mockFetchFn.mockResolvedValue(
      mockResponse(200, 'text/csv', 'header1,header2\nvalue1,value2')
    );

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(true);
    expect(result.warning).toBeNull();
  });

  test('rejects HTML content', async () => {
    // Arrange
    const tempFilePath = path.join(tempDir, 'output.csv.tmp');
    const outputFilePath = path.join(tempDir, 'output.csv');
    mockFetchFn.mockResolvedValue(mockResponse(200, 'text/html', htmlContent));

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(false);
  });

  test('handles HTTP errors gracefully', async () => {
    // Arrange
    const tempFilePath = path.join(tempDir, 'output.csv.tmp');
    const outputFilePath = path.join(tempDir, 'output.csv');
    mockFetchFn.mockResolvedValue(mockResponse(404, 'text/plain', 'Not Found'));

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(false);
  });

  test('rejects invalid CSV content', async () => {
    // Arrange
    const tempFilePath = path.join(tempDir, 'output.csv.tmp');
    const outputFilePath = path.join(tempDir, 'output.csv');
    mockFetchFn.mockResolvedValue(mockResponse(200, 'text/plain', plainTextContent));

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(false);
  });

  test('handles file system errors gracefully', async () => {
    // Arrange
    // Use a non-existent subdir to simulate file system errors
    const nonExistentDir = path.join(tempDir, 'non-existent-dir');
    const tempFilePath = path.join(nonExistentDir, 'output.csv.tmp');
    const outputFilePath = path.join(nonExistentDir, 'output.csv');
    mockFetchFn.mockResolvedValue(mockResponse(200, 'text/csv', csvContent));

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(false);
  });

  test('handles cleanup failure gracefully', async () => {
    // Arrange
    const tempFilePath = path.join(tempDir, 'output.csv.tmp');
    const outputFilePath = path.join(tempDir, 'output.csv');
    // Create a spy for console.error to verify it's called
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    // We need to write something to the temp file so the cleanup tries to delete it
    await safeFileOps.writeFile(tempFilePath, 'test content');
    // Mock fetch to throw an error
    mockFetchFn.mockImplementation(() => {
      // Throw an error to trigger the catch block where cleanup happens
      throw new Error('Network error');
    });
    // Mock fs.unlink to simulate a failure during cleanup
    const unlinkSpy = jest.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('Disk error'));

    // Act
    const result = await downloadFile(
      'https://example.com/data.csv',
      outputFilePath,
      tempFilePath,
      20,
      mockFetchFn
    );

    // Assert
    expect(result.success).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error cleaning up temp file'));

    // Restore the original methods
    consoleErrorSpy.mockRestore();
    unlinkSpy.mockRestore();
  });
});
