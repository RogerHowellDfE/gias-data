// Import the promises API for consistency with other test files
import { promises as fs } from 'fs';
import * as path from 'path';
import { isHtmlContent, isValidCsv } from '../src/fetch-data';

// Load test fixtures
const fixturesDir = path.join(__dirname, '__fixtures__');
let htmlContent: string;
let csvContent: string;
let plainTextContent: string;

// Use async loading for consistency with other test files
beforeAll(async () => {
  htmlContent = await fs.readFile(path.join(fixturesDir, 'error.html'), 'utf8');
  csvContent = await fs.readFile(path.join(fixturesDir, 'valid.csv'), 'utf8');
  plainTextContent = await fs.readFile(path.join(fixturesDir, 'plain-text.txt'), 'utf8');
});

describe('CSV Validation Functions', () => {
  describe('isHtmlContent', () => {
    test('identifies HTML content correctly', () => {
      // Arrange - Test data is loaded in beforeAll

      // Act & Assert
      expect(isHtmlContent(htmlContent)).toBe(true);
      // Also test specific HTML patterns
      expect(isHtmlContent('<!DOCTYPE html><html>')).toBe(true);
      expect(isHtmlContent('text with <body> tag in it')).toBe(true);
      expect(isHtmlContent('text with <head> tag in it')).toBe(true);
    });

    test('excludes non-HTML content', () => {
      // Arrange - Test data is loaded in beforeAll

      // Act & Assert
      expect(isHtmlContent(csvContent)).toBe(false);
      expect(isHtmlContent(plainTextContent)).toBe(false);
    });
  });

  describe('isValidCsv', () => {
    test('identifies valid CSV content', () => {
      // Arrange - Test data is loaded in beforeAll

      // Act & Assert
      expect(isValidCsv(csvContent)).toBe(true);
      // Also test simpler CSV variations
      expect(isValidCsv('single,line,csv')).toBe(true);
      expect(isValidCsv('header1,header2\nvalue1,value2\nvalue3,value4')).toBe(true);
    });

    test('excludes invalid CSV content', () => {
      // Arrange - Test data is loaded in beforeAll

      // Act & Assert
      expect(isValidCsv(plainTextContent)).toBe(false);
      expect(isValidCsv(htmlContent)).toBe(false);
      expect(isValidCsv('')).toBe(false);
    });
  });
});
