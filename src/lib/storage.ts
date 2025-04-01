/**
 * Storage system for Selvedge
 * 
 * Provides versioned persistence for prompts and programs
 */
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';

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
    try {
      await fsPromises.mkdir(dirPath, { recursive: true });
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to create directory ${dirPath}: ${err.message}`);
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
    
    // Create directories if needed
    const typeDir = path.join(this.baseDir, type + 's');
    const itemDir = path.join(typeDir, name);
    await this.ensureDir(itemDir);
    
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
    try {
      await fsPromises.writeFile(versionPath, JSON.stringify(itemData, null, 2));
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to save ${type} "${name}": ${err.message}`);
    }
    
    // Update latest pointer
    const latestPath = path.join(itemDir, 'latest.json');
    try {
      await fsPromises.writeFile(latestPath, JSON.stringify({ version: versionId }, null, 2));
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to update latest pointer for ${type} "${name}": ${err.message}`);
    }
    
    return versionId;
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
    
    const itemDir = path.join(this.baseDir, type + 's', name);
    
    try {
      // Read latest pointer
      const latestPath = path.join(itemDir, 'latest.json');
      const latestContent = await fsPromises.readFile(latestPath, 'utf-8');
      const latest = JSON.parse(latestContent);
      
      // Load that version
      return await this.loadVersion(type, name, latest.version);
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to load ${type} "${name}": ${err.message}`);
    }
  }
  
  /**
   * Load a specific version of an item
   * @param type Type of item ('prompt' or 'program')
   * @param name Name of the item
   * @param version Version ID to load
   * @returns The loaded item data
   */
  async loadVersion(type: 'prompt' | 'program', name: string, version: string): Promise<any> {
    const versionPath = path.join(this.baseDir, type + 's', name, `${version}.json`);
    
    try {
      const content = await fsPromises.readFile(versionPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to load ${type} "${name}" version "${version}": ${err.message}`);
    }
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
