/**
 * Storage system for Selvedge
 * 
 * Provides versioned persistence for prompts and programs
 */
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { debug } from './utils/debug';

/**
 * Store class for managing versioned persistence
 */
export class Store {
  private baseDir: string;
  private idCounter: number = 0;

  /**
   * Create a new Store instance
   * @param storePath Optional custom path for storage (defaults to ~/.selvedge)
   */
  constructor(storePath?: string) {
    // Use provided path or default to ~/.selvedge
    this.baseDir = storePath || path.join(os.homedir(), '.selvedge');
  }

  /**
   * Get the base path for storage
   * @returns The base directory path
   */
  getBasePath(): string {
    return this.baseDir;
  }

  /**
   * Set the base path for storage (primarily for testing)
   * @param path New base path
   */
  setBasePath(path: string): void {
    this.baseDir = path;
    debug('persistence', `Storage base path set to: ${path}`);
  }

  /**
   * Generate a unique ID with timestamp for versioning
   * @returns A unique version ID
   */
  generateId(): string {
    // Use timestamp as base
    const timestamp = Date.now().toString(36);

    // Add a counter to ensure uniqueness even for rapid calls
    this.idCounter++;

    // Add a random component for additional uniqueness
    const random = Math.random().toString(36).substring(2, 6);

    return `${timestamp}-${this.idCounter}-${random}`;
  }

  /**
   * Ensure a directory exists
   * @param dirPath Path to ensure exists
   */
  private async ensureDir(dirPath: string): Promise<void> {
    debug('persistence', `Ensuring directory exists: ${dirPath}`);

    // Implement retry logic to handle file system timing issues
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 50; // ms

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Make sure the base directory exists first
        await fsPromises.mkdir(this.baseDir, { recursive: true });

        // Verify the base directory was created successfully
        const baseExists = await fsPromises.access(this.baseDir).then(() => true).catch(() => false);
        if (!baseExists) {
          debug('persistence', `Base directory access failed: ${this.baseDir} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Failed to access base directory ${this.baseDir}`);
        }

        // Create all parent directories if needed
        const parentDir = path.dirname(dirPath);
        await fsPromises.mkdir(parentDir, { recursive: true });

        // Verify parent directory exists
        const parentExists = await fsPromises.access(parentDir).then(() => true).catch(() => false);
        if (!parentExists) {
          debug('persistence', `Parent directory access failed: ${parentDir} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Failed to access parent directory ${parentDir}`);
        }

        // Then create the requested directory
        await fsPromises.mkdir(dirPath, { recursive: true });

        // Verify the directory was created
        const dirExists = await fsPromises.access(dirPath).then(() => true).catch(() => false);
        if (!dirExists) {
          debug('persistence', `Directory access failed after creation: ${dirPath} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Failed to access directory after creation ${dirPath}`);
        }

        debug('persistence', `Successfully created/verified directory: ${dirPath}`);
        return; // Success - exit the function
      } catch (error: unknown) {
        const err = error as Error;
        debug('persistence', `Error ensuring directory ${dirPath} (attempt ${attempt + 1}/${MAX_RETRIES}): ${err.message}`);

        if (attempt < MAX_RETRIES - 1) {
          // Retry after a delay
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }

        throw new Error(`Failed to create directory ${dirPath} after ${MAX_RETRIES} attempts: ${err.message}`);
      }
    }
  }

  /**
   * Save an item with metadata
   * @param type Type of item ('prompt' or 'program')
   * @param name Name of the item
   * @param data Data to save
   * @returns The version ID of the saved item
   */
  async save(type: 'prompt' | 'program', name: string, data: any): Promise<string> {
    if (!name || typeof name !== 'string') {
      throw new Error('Item name must be a non-empty string');
    }

    debug('persistence', `Saving ${type} with name: ${name}`);

    // Create directories if needed
    const typeDir = path.join(this.baseDir, type + 's');
    const itemDir = path.join(typeDir, name);

    // Use the enhanced ensureDir method to create all necessary directories
    try {
      // First ensure the base directory exists
      await this.ensureDir(this.baseDir);

      // Then ensure the type directory exists
      await this.ensureDir(typeDir);

      // Finally ensure the item directory exists
      await this.ensureDir(itemDir);

      debug('persistence', `All directories created successfully for ${type} ${name}`);
    } catch (error) {
      const err = error as Error;
      debug('persistence', `Failed to create directories for ${type} ${name}: ${err.message}`);
      throw new Error(`Failed to create directories for ${type} "${name}": ${err.message}`);
    }

    // Generate version ID
    const versionId = this.generateId();

    // Add metadata
    const itemData = {
      ...data,
      _metadata: {
        version: versionId,
        timestamp: new Date().toISOString(),
        type: type,
        name: name
      }
    };

    // Save version
    const versionPath = path.join(itemDir, `${versionId}.json`);
    debug('persistence', `Saving ${type} "${name}" version "${versionId}" to ${versionPath}`);

    // Implement retry logic for save operations
    const MAX_SAVE_RETRIES = 3;
    const SAVE_RETRY_DELAY = 50; // ms

    try {
      // Phase 1: Save the version file with retry logic
      for (let saveAttempt = 0; saveAttempt < MAX_SAVE_RETRIES; saveAttempt++) {
        try {
          // Save version file
          await fsPromises.writeFile(versionPath, JSON.stringify(itemData, null, 2));

          // Always add a small delay after write to ensure filesystem sync
          await new Promise(resolve => setTimeout(resolve, 20));

          // Verify it was saved correctly
          const versionExists = await fsPromises.access(versionPath).then(() => true).catch(() => false);
          if (!versionExists) {
            debug('persistence', `Failed to verify version file was created: ${versionPath} (attempt ${saveAttempt + 1}/${MAX_SAVE_RETRIES})`);
            if (saveAttempt < MAX_SAVE_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, SAVE_RETRY_DELAY));
              continue;
            }
            throw new Error(`Failed to create version file after ${MAX_SAVE_RETRIES} attempts`);
          }

          // Check that we can actually read the file back - this ensures file system sync
          try {
            const content = await fsPromises.readFile(versionPath, 'utf8');
            const parsed = JSON.parse(content);
            if (!parsed || !parsed._metadata || parsed._metadata.version !== versionId) {
              debug('persistence', `File was created but content verification failed (attempt ${saveAttempt + 1}/${MAX_SAVE_RETRIES})`);
              if (saveAttempt < MAX_SAVE_RETRIES - 1) {
                // Try to rewrite it
                await fsPromises.writeFile(versionPath, JSON.stringify(itemData, null, 2));
                await new Promise(resolve => setTimeout(resolve, SAVE_RETRY_DELAY));
                continue;
              }
              throw new Error(`File content verification failed after ${MAX_SAVE_RETRIES} attempts`);
            }

            // Success! File was saved and content verified
            debug('persistence', `File content verified successfully after ${saveAttempt + 1} attempt(s)`);
            break;
          } catch (readErr) {
            debug('persistence', `Warning: Could not verify file contents: ${(readErr as Error).message} (attempt ${saveAttempt + 1}/${MAX_SAVE_RETRIES})`);
            if (saveAttempt < MAX_SAVE_RETRIES - 1) {
              // Try to rewrite it
              await fsPromises.writeFile(versionPath, JSON.stringify(itemData, null, 2));
              await new Promise(resolve => setTimeout(resolve, SAVE_RETRY_DELAY));
              continue;
            }
            throw new Error(`Failed to verify file contents after ${MAX_SAVE_RETRIES} attempts: ${(readErr as Error).message}`);
          }
        } catch (error) {
          if (saveAttempt < MAX_SAVE_RETRIES - 1) {
            debug('persistence', `Error saving version file (attempt ${saveAttempt + 1}/${MAX_SAVE_RETRIES}): ${(error as Error).message}. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, SAVE_RETRY_DELAY));
            continue;
          }
          throw error;
        }
      }

      debug('persistence', `Successfully saved ${type} "${name}" version "${versionId}"`);

      // Phase 2: Update the latest pointer after successfully saving the version file
      const latestPath = path.join(itemDir, 'latest.json');
      debug('persistence', `Updating latest pointer for ${type} "${name}" to ${versionId}`);

      // Implement retry logic for latest pointer update
      const MAX_LATEST_RETRIES = 3;
      const LATEST_RETRY_DELAY = 50; // ms

      for (let latestAttempt = 0; latestAttempt < MAX_LATEST_RETRIES; latestAttempt++) {
        try {
          // Create the latest pointer
          const latestData = JSON.stringify({ version: versionId }, null, 2);
          await fsPromises.writeFile(latestPath, latestData);

          // Add a small delay after write to ensure filesystem sync
          await new Promise(resolve => setTimeout(resolve, 20));

          // Verify it was saved correctly
          const latestExists = await fsPromises.access(latestPath).then(() => true).catch(() => false);
          if (!latestExists) {
            debug('persistence', `Failed to verify latest pointer was created: ${latestPath} (attempt ${latestAttempt + 1}/${MAX_LATEST_RETRIES})`);
            if (latestAttempt < MAX_LATEST_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, LATEST_RETRY_DELAY));
              continue;
            }
            throw new Error(`Failed to create latest pointer after ${MAX_LATEST_RETRIES} attempts`);
          }

          // Double-check content
          try {
            const content = await fsPromises.readFile(latestPath, 'utf-8');
            const latest = JSON.parse(content);
            if (latest.version !== versionId) {
              debug('persistence', `Latest pointer mismatch: ${latest.version} != ${versionId}`);
              // Try to fix it
              await fsPromises.writeFile(latestPath, latestData);
              await new Promise(resolve => setTimeout(resolve, 20)); // Small delay after rewrite

              if (latestAttempt < MAX_LATEST_RETRIES - 1) {
                continue;
              }
            }

            // Success!
            debug('persistence', `Successfully updated latest pointer for ${type} "${name}"`);
            break;
          } catch (parseErr) {
            debug('persistence', `Warning: Could not verify latest pointer contents: ${(parseErr as Error).message} (attempt ${latestAttempt + 1}/${MAX_LATEST_RETRIES})`);
            if (latestAttempt < MAX_LATEST_RETRIES - 1) {
              // Try to rewrite it
              await fsPromises.writeFile(latestPath, latestData);
              await new Promise(resolve => setTimeout(resolve, LATEST_RETRY_DELAY));
              continue;
            }
            throw new Error(`Failed to verify latest pointer contents after ${MAX_LATEST_RETRIES} attempts: ${(parseErr as Error).message}`);
          }
        } catch (error) {
          if (latestAttempt < MAX_LATEST_RETRIES - 1) {
            debug('persistence', `Error updating latest pointer (attempt ${latestAttempt + 1}/${MAX_LATEST_RETRIES}): ${(error as Error).message}. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, LATEST_RETRY_DELAY));
            continue;
          }
          debug('persistence', `Failed to update latest pointer after ${MAX_LATEST_RETRIES} attempts: ${(error as Error).message}`);
          // Continue even if latest pointer update fails - we still saved the version successfully
          break;
        }
      }

      // Return the version ID even if latest pointer update failed
      return versionId;
    } catch (error: unknown) {
      const err = error as Error;
      debug('persistence', `Error saving ${type} "${name}": ${err.message}`);
      throw new Error(`Failed to save ${type} "${name}": ${err.message}`);
    }

  }

  /**
   * Load the latest version of an item, or a specific version if provided
   * @param type Type of item ('prompt' or 'program')
   * @param name Name of the item
   * @param version Optional version ID to load
   * @returns The loaded item data
   */
  async load(type: 'prompt' | 'program', name: string, version?: string): Promise<any> {
    // If version is provided, load that specific version
    if (version) {
      return this.loadVersion(type, name, version);
    }

    const typeDir = path.join(this.baseDir, type + 's');
    const itemDir = path.join(typeDir, name);

    debug('persistence', `Loading latest ${type} "${name}" from ${itemDir}`);

    // Implement retry logic to handle potential race conditions with filesystem
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 100; // ms

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Verify directories exist
        const typeDirExists = await fsPromises.access(typeDir).then(() => true).catch(() => false);
        const itemDirExists = await fsPromises.access(itemDir).then(() => true).catch(() => false);

        if (!typeDirExists) {
          debug('persistence', `Type directory does not exist: ${typeDir} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`${type}s directory not found`);
        }

        if (!itemDirExists) {
          debug('persistence', `Item directory does not exist: ${itemDir} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`${type} "${name}" not found`);
        }

        // Read latest pointer
        const latestPath = path.join(itemDir, 'latest.json');
        const latestExists = await fsPromises.access(latestPath).then(() => true).catch(() => false);

        if (!latestExists) {
          debug('persistence', `Latest pointer does not exist: ${latestPath} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Latest pointer for ${type} "${name}" not found`);
        }

        // Read and parse the latest pointer file with robust error handling
        try {
          // Implement multiple read attempts for the latest pointer file
          let latestContent: string | null = null;
          let readError: Error | null = null;

          // Try multiple read attempts in case of temporary file system issues
          for (let readAttempt = 0; readAttempt < 3; readAttempt++) {
            try {
              latestContent = await fsPromises.readFile(latestPath, 'utf-8');
              if (latestContent) break;
            } catch (err) {
              readError = err as Error;
              debug('persistence', `Read attempt ${readAttempt + 1}/3 failed for latest pointer: ${readError.message}`);
              await new Promise(resolve => setTimeout(resolve, 50)); // Short delay between read attempts
            }
          }

          if (!latestContent) {
            debug('persistence', `Could not read latest pointer after multiple attempts: ${readError?.message || 'Unknown error'} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw new Error(`Could not read latest pointer after multiple attempts: ${readError?.message || 'Unknown error'}`);
          }

          // Check for empty content
          if (!latestContent.trim()) {
            debug('persistence', `Latest pointer file is empty: ${latestPath} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw new Error(`Latest pointer file is empty for ${type} "${name}"`);
          }

          // Parse JSON data
          const latest = JSON.parse(latestContent);

          // Validate the pointer structure
          if (!latest || typeof latest !== 'object') {
            debug('persistence', `Latest pointer is not a valid object: ${JSON.stringify(latest)} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw new Error(`Latest pointer is not a valid object for ${type} "${name}"`);
          }

          // Check for version field
          if (!latest.version || typeof latest.version !== 'string') {
            debug('persistence', `Invalid latest pointer (missing/invalid version): ${JSON.stringify(latest)} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw new Error(`Invalid latest pointer (missing version) for ${type} "${name}"`);
          }

          // Verify the version file exists before attempting to load it
          const versionPath = path.join(itemDir, `${latest.version}.json`);
          const versionExists = await fsPromises.access(versionPath).then(() => true).catch(() => false);

          if (!versionExists) {
            debug('persistence', `Latest pointer references non-existent version file: ${versionPath} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw new Error(`Latest pointer references non-existent version ${latest.version} for ${type} "${name}"`);
          }

          debug('persistence', `Found latest version ${latest.version} for ${type} "${name}"`);

          // Load that version
          return await this.loadVersion(type, name, latest.version);
        } catch (parseError) {
          debug('persistence', `Error parsing latest pointer: ${(parseError as Error).message} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Failed to parse latest pointer for ${type} "${name}": ${(parseError as Error).message}`);
        }
      } catch (error) {
        if (attempt < MAX_RETRIES - 1) {
          debug('persistence', `Error loading ${type} "${name}": ${(error as Error).message} (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        debug('persistence', `Error loading ${type} "${name}": ${(error as Error).message}. All retries failed.`);
        throw new Error(`Failed to load ${type} "${name}": ${(error as Error).message}`);
      }
    }

    // This should never be reached due to the throws in the loop, but TypeScript needs a return
    throw new Error(`Failed to load ${type} "${name}" after ${MAX_RETRIES} attempts`);
  }

  /**
   * Load a specific version of an item
   * @param type Type of item ('prompt' or 'program')
   * @param name Name of the item
   * @param version Version ID to load
   * @returns The loaded item data
   */
  async loadVersion(type: 'prompt' | 'program', name: string, version: string): Promise<any> {
    const typeDir = path.join(this.baseDir, type + 's');
    const itemDir = path.join(typeDir, name);
    const versionPath = path.join(itemDir, `${version}.json`);

    debug('persistence', `Loading ${type} "${name}" version "${version}" from ${versionPath}`);

    // Implement retry logic to handle potential race conditions with filesystem
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 100; // ms

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Verify directories and file exist
        const typeDirExists = await fsPromises.access(typeDir).then(() => true).catch(() => false);
        const itemDirExists = await fsPromises.access(itemDir).then(() => true).catch(() => false);
        const versionExists = await fsPromises.access(versionPath).then(() => true).catch(() => false);

        if (!typeDirExists) {
          debug('persistence', `Type directory does not exist: ${typeDir} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`${type}s directory not found`);
        }

        if (!itemDirExists) {
          debug('persistence', `Item directory does not exist: ${itemDir} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`${type} "${name}" not found`);
        }

        if (!versionExists) {
          debug('persistence', `Version file does not exist: ${versionPath} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Version ${version} of ${type} "${name}" not found`);
        }

        try {
          // Read the file with a retry mechanism for potential read errors
          let content: string | null = null;
          let readError: Error | null = null;

          // Try multiple read attempts in case of temporary file system issues
          for (let readAttempt = 0; readAttempt < 3; readAttempt++) {
            try {
              content = await fsPromises.readFile(versionPath, 'utf-8');
              if (content) break;
            } catch (err) {
              readError = err as Error;
              debug('persistence', `Read attempt ${readAttempt + 1}/3 failed: ${readError.message}`);
              await new Promise(resolve => setTimeout(resolve, 50)); // Short delay between read attempts
            }
          }

          if (!content) {
            throw new Error(`Could not read file after multiple attempts: ${readError?.message || 'Unknown error'}`);
          }

          // Validate file content
          if (!content.trim()) {
            debug('persistence', `File appears to be empty: ${versionPath} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw new Error(`Empty file for ${type} "${name}" version "${version}"`);
          }

          // Parse the JSON data
          const data = JSON.parse(content);

          // Verify the data has the expected structure
          if (!data || !data._metadata || data._metadata.version !== version) {
            debug('persistence', `Invalid data structure in ${versionPath} (attempt ${attempt + 1}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              continue;
            }
            throw new Error(`Invalid data structure for ${type} "${name}" version "${version}"`);
          }

          debug('persistence', `Successfully loaded ${type} "${name}" version "${version}"`);
          return data;
        } catch (parseError) {
          debug('persistence', `Error parsing file content: ${(parseError as Error).message} (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
          throw new Error(`Failed to parse ${type} "${name}" version "${version}": ${(parseError as Error).message}`);
        }
      } catch (error) {
        if (attempt < MAX_RETRIES - 1) {
          debug('persistence', `Error loading ${type} "${name}" version "${version}": ${(error as Error).message} (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        debug('persistence', `Error loading ${type} "${name}" version "${version}": ${(error as Error).message}. All retries failed.`);
        throw new Error(`Failed to load ${type} "${name}" version "${version}": ${(error as Error).message}`);
      }
    }

    // This should never be reached due to the throws in the loop, but TypeScript needs a return
    throw new Error(`Failed to load ${type} "${name}" version "${version}" after ${MAX_RETRIES} attempts`);
  }

  /**
   * List all versions of an item
   * @param type Type of item ('prompt' or 'program')
   * @param name Name of the item
   * @returns Array of version IDs, sorted by creation time (newest first)
   */
  async listVersions(type: 'prompt' | 'program', name: string): Promise<string[]> {
    const itemDir = path.join(this.baseDir, type + 's', name);

    try {
      const files = await fsPromises.readdir(itemDir);
      return files
        .filter(file => file !== 'latest.json' && file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
        .sort((a, b) => {
          // Extract the timestamp part (before the first dash)
          const timestampA = a.split('-')[0];
          const timestampB = b.split('-')[0];

          // If timestamps are the same, use the counter part
          if (timestampA === timestampB) {
            const counterA = parseInt(a.split('-')[1], 10);
            const counterB = parseInt(b.split('-')[1], 10);
            return counterB - counterA; // Descending order
          }

          // Compare timestamps (as integers in base 36)
          return parseInt(timestampB, 36) - parseInt(timestampA, 36);
        });
    } catch (error: unknown) {
      const err = error as { code?: string, message: string };
      if (err.code === 'ENOENT') {
        return []; // Directory doesn't exist, return empty array
      }
      throw new Error(`Failed to list versions for ${type} "${name}": ${err.message}`);
    }
  }

  /**
   * List all items of a type
   * @param type Type of item ('prompt' or 'program')
   * @returns Array of item names
   */
  async list(type: 'prompt' | 'program'): Promise<string[]> {
    const typeDir = path.join(this.baseDir, type + 's');

    try {
      await this.ensureDir(typeDir);
      return await fsPromises.readdir(typeDir);
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to list ${type}s: ${err.message}`);
    }
  }

  /**
   * Delete a specific version of an item
   * @param type Type of item ('prompt' or 'program')
   * @param name Name of the item
   * @param version Version ID to delete
   * @returns True if deleted successfully
   */
  async deleteVersion(type: 'prompt' | 'program', name: string, version: string): Promise<boolean> {
    const versionPath = path.join(this.baseDir, type + 's', name, `${version}.json`);

    try {
      await fsPromises.unlink(versionPath);

      // If this was the latest version, update the latest pointer
      const latestPath = path.join(this.baseDir, type + 's', name, 'latest.json');
      const latestContent = await fsPromises.readFile(latestPath, 'utf-8');
      const latest = JSON.parse(latestContent);

      if (latest.version === version) {
        // Find the next most recent version
        const versions = await this.listVersions(type, name);
        if (versions.length > 0) {
          // Update latest pointer to the most recent remaining version
          await fsPromises.writeFile(latestPath, JSON.stringify({ version: versions[0] }, null, 2));
        } else {
          // No versions left, delete the latest pointer
          await fsPromises.unlink(latestPath);
        }
      }

      return true;
    } catch (error: unknown) {
      const err = error as { code?: string, message: string };
      if (err.code === 'ENOENT') {
        return false; // File doesn't exist
      }
      throw new Error(`Failed to delete ${type} "${name}" version "${version}": ${err.message}`);
    }
  }

  /**
   * Delete an item and all its versions
   * @param type Type of item ('prompt' or 'program')
   * @param name Name of the item
   * @returns True if deleted successfully, false if item doesn't exist
   */
  async delete(type: 'prompt' | 'program', name: string): Promise<boolean> {
    const itemDir = path.join(this.baseDir, type + 's', name);

    try {
      // Check if directory exists first
      await fsPromises.access(itemDir);

      // Recursively delete the directory
      await fsPromises.rm(itemDir, { recursive: true, force: true });
      return true;
    } catch (error: unknown) {
      const err = error as { code?: string, message: string };
      if (err.code === 'ENOENT') {
        return false; // Directory doesn't exist
      }
      throw new Error(`Failed to delete ${type} "${name}": ${err.message}`);
    }
  }
}

// Export a singleton instance
export const store = new Store();
