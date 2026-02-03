// Import the utility functions directly for testing
import { fetchData } from '../src/fetch-data';
import { promises as fs } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import http from 'http';
import { safeFileOps } from './test-utils';

// Define constants and variables at the top
const TEST_SERVER_PORT = 8080;
const tempDir = path.join(tmpdir(), 'test-fetch-data-');
let server: http.Server;
let consoleLogSpy: jest.SpyInstance;

// Setup before all tests
beforeAll(async () => {
  // Create HTTP server for testing
  server = http.createServer((req, res) => {
    if (req.url === '/test1.csv') {
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      res.end('header,value\n1,2');
    } else if (req.url === '/404.csv') {
      res.writeHead(404);
      res.end();
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });
  server.listen(TEST_SERVER_PORT);
});

// Clean up after all tests
afterAll(() => {
  server.close();
});

// Integration tests for fetchData function
describe('fetchData function integration', () => {
  // Setup before each test
  beforeEach(async () => {
    // Arrange - common setup
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    // Clean up and recreate the temporary directory to ensure clean state
    await safeFileOps.removeDir(tempDir);
    await fs.mkdir(tempDir, { recursive: true });
  });

  // Clean up after each test
  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('creates output directory when it does not exist', async () => {
    // Arrange
    const newDirPath = path.join(tempDir, 'new-subdir');

    // Verify the directory doesn't exist before the test
    const dirExistsBeforeTest = await safeFileOps.exists(newDirPath);
    expect(dirExistsBeforeTest).toBe(false);

    // Act
    await fetchData({
      urlTemplates: [
        { urlTemplate: `http://localhost:${TEST_SERVER_PORT}/test1.csv`, outputFile: 'test1.csv' },
      ],
      config: {
        outputDir: newDirPath,
      },
    });

    // Assert
    const dirExistsAfterTest = await safeFileOps.exists(newDirPath);
    expect(dirExistsAfterTest).toBe(true);
    const files = await fs.readdir(newDirPath);
    expect(files).toContain('test1.csv');
  });

  test('FetchData_WhenSingleDownloadFails_ThrowsError', async () => {
    // Arrange - Setup to request a file that will return 404
    // Note: When ALL downloads fail, fetchData now throws an error

    // Act & Assert
    await expect(fetchData({
      urlTemplates: [
        { urlTemplate: `http://localhost:${TEST_SERVER_PORT}/404.csv`, outputFile: '404.csv' },
      ],
      config: {
        outputDir: tempDir,
      },
    })).rejects.toThrow('All file downloads failed');
  });

  test('FetchData_WhenAllDownloadsFail_ThrowsError', async () => {
    // Arrange - all URLs return 404
    server.removeAllListeners('request');
    server.on('request', (_req, res) => {
      res.writeHead(404);
      res.end();
    });

    // Act & Assert
    await expect(fetchData({
      urlTemplates: [
        { urlTemplate: `http://localhost:${TEST_SERVER_PORT}/file1.csv`, outputFile: 'file1.csv' },
        { urlTemplate: `http://localhost:${TEST_SERVER_PORT}/file2.csv`, outputFile: 'file2.csv' },
      ],
      config: {
        outputDir: tempDir,
      },
    })).rejects.toThrow('All file downloads failed - check if the data source is available');
  });

  test('FetchData_WhenSomeDownloadsSucceed_ReturnsResultWithoutError', async () => {
    // Arrange - one URL succeeds, one fails
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      if (req.url === '/success.csv') {
        res.writeHead(200, { 'Content-Type': 'text/csv' });
        res.end('header,value\n1,2');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Act
    const result = await fetchData({
      urlTemplates: [
        { urlTemplate: `http://localhost:${TEST_SERVER_PORT}/success.csv`, outputFile: 'success.csv' },
        { urlTemplate: `http://localhost:${TEST_SERVER_PORT}/fail.csv`, outputFile: 'fail.csv' },
      ],
      config: {
        outputDir: tempDir,
      },
    });

    // Assert
    expect(result.downloadedFiles.length).toBe(1);
    expect(result.skippedFiles).toContain('fail.csv');
  });

  test('logs warnings for file size changes', async () => {
    // Arrange
    // Create a test response with a much larger file size
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      if (req.url === '/test1.csv') {
        res.writeHead(200, { 'Content-Type': 'text/csv' });
        // Create a much larger response content
        const largerContent = 'header1,header2,header3\n' +
          Array(100).fill('value1,value2,value3').join('\n');
        res.end(largerContent);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    try {
      // Simulate an existing file with a smaller size
      const existingFilePath = path.join(tempDir, 'test1.csv');
      await safeFileOps.writeFile(existingFilePath, 'header,value\n1,2');

      // Act
      const result = await fetchData({
        urlTemplates: [
          { urlTemplate: `http://localhost:${TEST_SERVER_PORT}/test1.csv`, outputFile: 'test1.csv' },
        ],
        config: {
          outputDir: tempDir,
          sizeChangeThresholdPercent: 1, // Set a very low threshold for testing
        },
      });

      // Assert
      expect(result.fileSizeWarnings.length).toBeGreaterThan(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: File test1.csv has increased in size')
      );
    } catch (error) {
      // Explicitly fail the test with a clear message if setup fails
      fail(`Test setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});
