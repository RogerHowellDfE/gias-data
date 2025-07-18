/**
 * GIAS Data Fetcher
 *
 * Downloads educational data files from the GIAS service and validates them
 * before storing locally.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { format } from 'date-fns';

// Types
export interface FileTemplate {
  urlTemplate: string;
  outputFile: string;
}

export interface DownloadResult {
  downloadedFiles: string[];
  skippedFiles: string[];
  fileSizeWarnings: string[];
}

export interface FetcherConfig {
  outputDir: string;
  sizeChangeThresholdPercent: number;
  baseUrl: string;
  dateFormat: string;
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

// Default configuration
export const DEFAULT_CONFIG: FetcherConfig = {
  outputDir: path.join(process.cwd(), 'data'),
  sizeChangeThresholdPercent: 20,
  baseUrl: 'https://ea-edubase-backend-prod.azurewebsites.net/edubase',
  dateFormat: 'yyyyMMdd',
};

// File template definitions
export const DEFAULT_URL_TEMPLATES: FileTemplate[] = [
  { urlTemplate: '{baseUrl}/edubasealldata{0}.csv', outputFile: 'edubasealldata.csv' },
  { urlTemplate: '{baseUrl}/links_edubasealldata{0}.csv', outputFile: 'links_edubasealldata.csv' },
  { urlTemplate: '{baseUrl}/edubaseallstatefunded{0}.csv', outputFile: 'edubaseallstatefunded.csv' },
  { urlTemplate: '{baseUrl}/links_edubaseallstatefunded{0}.csv', outputFile: 'links_edubaseallstatefunded.csv' },
  { urlTemplate: '{baseUrl}/edubaseallacademiesandfree{0}.csv', outputFile: 'edubaseallacademiesandfree.csv' },
  {
    urlTemplate: '{baseUrl}/links_edubaseallacademiesandfree{0}.csv',
    outputFile: 'links_edubaseallacademiesandfree.csv'
  },
  {
    urlTemplate: '{baseUrl}/grouplinks_edubaseallacademiesandfree{0}.csv',
    outputFile: 'grouplinks_edubaseallacademiesandfree.csv'
  },
  { urlTemplate: '{baseUrl}/edubaseallchildrencentre{0}.csv', outputFile: 'edubaseallchildrencentre.csv' },
  { urlTemplate: '{baseUrl}/academiesmatmembership{0}.csv', outputFile: 'academiesmatmembership.csv' },
  { urlTemplate: '{baseUrl}/governancealldata{0}.csv', outputFile: 'governancealldata.csv' },
  { urlTemplate: '{baseUrl}/governancematdata{0}.csv', outputFile: 'governancematdata.csv' },
  { urlTemplate: '{baseUrl}/governanceacaddata{0}.csv', outputFile: 'governanceacaddata.csv' },
  { urlTemplate: '{baseUrl}/governanceladata{0}.csv', outputFile: 'governanceladata.csv' },
];

/**
 * Consolidated content validation function that checks for both HTML content
 * and validates CSV format
 */
export function validateCSVContent(content: string): ValidationResult {
  // Check for HTML indicators
  const htmlPatterns = ['<!DOCTYPE', '<html', '<body', '<head'];
  if (htmlPatterns.some(pattern => content.includes(pattern))) {
    return { isValid: false, reason: 'Content contains HTML markup' };
  }

  // Check for CSV format (at least one comma in first 3 lines)
  const lines = content.split('\n').slice(0, 3);
  if (!lines.some(line => line.includes(','))) {
    return { isValid: false, reason: 'Content lacks comma separators' };
  }

  return { isValid: true };
}

/**
 * Legacy function for HTML detection - maintained for backward compatibility
 */
export function isHtmlContent(content: string): boolean {
  const htmlPatterns = ['<!DOCTYPE', '<html', '<body', '<head'];
  return htmlPatterns.some(pattern => content.includes(pattern));
}

/**
 * Legacy function for CSV validation - maintained for backward compatibility
 */
export function isValidCsv(content: string): boolean {
  const lines = content.split('\n').slice(0, 3);
  return lines.some(line => line.includes(','));
}

/**
 * Compares file sizes and generates a warning message if the change exceeds the threshold
 */
function checkFileSizeChange(
  newSize: number,
  oldSize: number,
  threshold: number,
  fileName: string
): {changed: boolean, warning: string | null} {
  if (oldSize === 0) return { changed: false, warning: null }; // Avoid division by zero

  const sizeDifferencePercent = Math.abs((newSize - oldSize) / oldSize * 100);

  if (sizeDifferencePercent > threshold) {
    const changeDirection = newSize > oldSize ? 'increased' : 'decreased';
    const warning = `WARNING: File ${fileName} has ${changeDirection} in size by ` +
      `${sizeDifferencePercent.toFixed(2)}% (from ${oldSize} to ${newSize} bytes)`;
    return { changed: true, warning };
  }

  return { changed: false, warning: null };
}

/**
 * Downloads and validates a single file
 */
export async function downloadFile(
  url: string,
  outputPath: string,
  tempPath: string,
  sizeChangeThreshold: number = DEFAULT_CONFIG.sizeChangeThresholdPercent,
  fetchFn = fetch
): Promise<{ success: boolean; warning: string | null }> {
  console.log(`Attempting to download ${url}`);

  let response;
  try {
    response = await fetchFn(url);

    if (!response.ok) {
      console.error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
      return { success: false, warning: null };
    }

    const content = await response.text();

    const validation = validateCSVContent(content);
    if (!validation.isValid) {
      console.error(validation.reason || 'Content validation failed');
      return { success: false, warning: null };
    }

    await fs.writeFile(tempPath, content);

    const newFileSize = (await fs.stat(tempPath)).size;
    let sizeWarning: string | null = null;

    if (await fs.access(outputPath).then(() => true).catch(() => false)) {
      const existingFileSize = (await fs.stat(outputPath)).size;
      const sizeChange = checkFileSizeChange(
        newFileSize,
        existingFileSize,
        sizeChangeThreshold,
        path.basename(outputPath)
      );

      if (sizeChange.warning) {
        console.log(sizeChange.warning);
        sizeWarning = sizeChange.warning;
      }
    }

    await fs.rename(tempPath, outputPath);
    console.log(`Successfully validated and saved ${path.basename(outputPath)}`);

    if (sizeWarning) {
      console.log(sizeWarning);
    }

    return { success: true, warning: sizeWarning };
  } catch (error) {
    console.log(`Skipping file - not available or invalid: ${error}`);

    try {
      if (await fs.access(tempPath).then(() => true).catch(() => false)) {
        await fs.unlink(tempPath);
      }
    } catch (cleanupError: unknown) {
      if (cleanupError instanceof Error) {
        console.error(`Error cleaning up temp file: ${cleanupError.message}`);
      } else {
        console.error('Unknown error during cleanup');
      }
      // Return false when cleanup fails
      return { success: false, warning: null };
    }

    return { success: false, warning: null };
  }
}

/**
 * Fetches all data files based on the provided configuration
 */
export async function fetchData(
  options: {
    date?: Date;
    config?: Partial<FetcherConfig>;
    urlTemplates?: FileTemplate[];
    fetchFn?: typeof fetch;
  } = {}
): Promise<DownloadResult> {
  const date = options.date || new Date();
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const templates = options.urlTemplates || DEFAULT_URL_TEMPLATES;
  const fetchFn = options.fetchFn || fetch;

  // Ensure output directory exists
  try {
    await fs.access(config.outputDir);
  } catch {
    await fs.mkdir(config.outputDir, { recursive: true });
  }

  const dateStr = format(date, config.dateFormat);
  const downloadedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const fileSizeWarnings: string[] = [];

  // Process each file template
  for (const template of templates) {
    const outputPath = path.join(config.outputDir, template.outputFile);
    const tempPath = `${outputPath}.tmp`;
    // Replace baseUrl placeholder in template
    const urlWithBase = template.urlTemplate.replace('{baseUrl}', config.baseUrl);
    // Replace date placeholder
    const url = urlWithBase.replace('{0}', dateStr);

    const result = await downloadFile(
      url,
      outputPath,
      tempPath,
      config.sizeChangeThresholdPercent,
      fetchFn
    );

    if (result.success) {
      downloadedFiles.push(outputPath);
      if (result.warning) {
        fileSizeWarnings.push(result.warning);
      }
    } else {
      skippedFiles.push(template.outputFile);
    }
  }

  // Output summary
  console.log('=== Download Summary ===');
  console.log(`Successfully downloaded: ${downloadedFiles.length} files`);
  console.log(`Skipped files: ${skippedFiles.length} files`);

  console.log('=== Successfully Downloaded Files ===');
  downloadedFiles.forEach(file => console.log(`Downloaded: ${file}`));

  // Ensure file size warnings are logged
  if (fileSizeWarnings.length > 0) {
    console.log('=== File Size Change Warnings ===');
    fileSizeWarnings.forEach(warning => {
      console.log(warning);
    });
  }

  console.log('=== Skipped Files ===');
  skippedFiles.forEach(file => console.log(`Skipped: ${file}`));

  return { downloadedFiles, skippedFiles, fileSizeWarnings };
}

// If this file is being run directly
// In ESM, we can't use require.main === module, so we check if import.meta.url ends with the current file
const isMainModule = require.main === module;
if (isMainModule) {
  fetchData()
    .then(_results => {
      console.log('Data fetch completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error in data fetch:', error);
      process.exit(1);
    });
}
