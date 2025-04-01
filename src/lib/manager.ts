/**
 * Selvedge Manager - Combined metadata, analytics, and CLI functionality
 * 
 * Provides a unified interface for managing stored prompts and programs,
 * including metadata tracking, version comparison, and CLI operations.
 */
import { store } from './storage';
import { selvedge } from './core';
import { ProgramBuilder } from './programs/types';
import { PromptTemplate } from './prompts/types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Metadata for tracking item usage
 */
export interface UsageMetadata {
  /** When the item was last used */
  lastUsed?: Date;
  
  /** Total number of times the item has been used */
  useCount: number;
  
  /** Performance metrics if available */
  performance?: {
    /** Average execution time in ms */
    avgExecutionTime?: number;
    /** Success rate (0-1) */
    successRate?: number;
  };
  
  /** Custom tags for organization */
  tags?: string[];
  
  /** User-provided description */
  description?: string;
}

/**
 * Result of comparing two versions
 */
export interface ComparisonResult {
  /** Older version ID */
  oldVersion: string;
  
  /** Newer version ID */
  newVersion: string;
  
  /** Differences between versions */
  differences: {
    /** Changes in structure */
    structural?: string[];
    /** Changes in metadata */
    metadata?: string[];
    /** Performance difference if available */
    performance?: {
      executionTime?: number;
      successRate?: number;
    };
  };
}

/**
 * Selvedge Manager for handling stored items with metadata and CLI
 */
export class SelvedgeManager {
  /**
   * Create a new SelvedgeManager instance
   */
  constructor() {
    // Initialize usage tracking
    this.initializeUsageTracking();
  }
  
  /**
   * Initialize usage tracking
   */
  private async initializeUsageTracking() {
    // Create metadata directory if it doesn't exist
    const metadataDir = path.join(store.getBasePath(), 'metadata');
    await fs.mkdir(metadataDir, { recursive: true });
  }
  
  /**
   * Get the path to the metadata file for an item
   */
  private getMetadataPath(type: 'prompt' | 'program', name: string): string {
    return path.join(store.getBasePath(), 'metadata', `${type}-${name}.json`);
  }
  
  /**
   * Load metadata for an item
   */
  private async loadMetadata(type: 'prompt' | 'program', name: string): Promise<UsageMetadata> {
    const metadataPath = this.getMetadataPath(type, name);
    
    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // Return default metadata if file doesn't exist
      return {
        useCount: 0,
        tags: [],
      };
    }
  }
  
  /**
   * Save metadata for an item
   */
  private async saveMetadata(type: 'prompt' | 'program', name: string, metadata: UsageMetadata): Promise<void> {
    const metadataPath = this.getMetadataPath(type, name);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  /**
   * Track usage of an item
   */
  async trackUsage(type: 'prompt' | 'program', name: string, executionTime?: number, success?: boolean): Promise<void> {
    const metadata = await this.loadMetadata(type, name);
    
    // Update usage data
    metadata.lastUsed = new Date();
    metadata.useCount++;
    
    // Update performance metrics if provided
    if (metadata.performance === undefined) {
      metadata.performance = {};
    }
    
    if (executionTime !== undefined) {
      const avgTime = metadata.performance.avgExecutionTime || 0;
      metadata.performance.avgExecutionTime = avgTime === 0 
        ? executionTime 
        : (avgTime * (metadata.useCount - 1) + executionTime) / metadata.useCount;
    }
    
    if (success !== undefined) {
      const successRate = metadata.performance.successRate || 1;
      const successCount = Math.round(successRate * (metadata.useCount - 1)) + (success ? 1 : 0);
      metadata.performance.successRate = successCount / metadata.useCount;
    }
    
    await this.saveMetadata(type, name, metadata);
  }
  
  /**
   * Add or update metadata for an item
   */
  async updateMetadata(type: 'prompt' | 'program', name: string, updates: Partial<UsageMetadata>): Promise<void> {
    const metadata = await this.loadMetadata(type, name);
    
    // Apply updates
    Object.assign(metadata, updates);
    
    await this.saveMetadata(type, name, metadata);
  }
  
  /**
   * Compare two versions of an item
   */
  async compareVersions(type: 'prompt' | 'program', name: string, v1: string, v2: string): Promise<ComparisonResult> {
    // Load both versions
    const older = await store.load(type, name, v1);
    const newer = await store.load(type, name, v2);
    
    // Basic comparison result
    const result: ComparisonResult = {
      oldVersion: v1,
      newVersion: v2,
      differences: {
        structural: [],
        metadata: []
      }
    };
    
    // Compare structure based on type
    if (type === 'prompt') {
      // Compare variables
      if (older.variables?.length !== newer.variables?.length) {
        result.differences.structural?.push(`Variable count changed from ${older.variables?.length || 0} to ${newer.variables?.length || 0}`);
      }
      
      // Compare segments
      if (older.segments?.length !== newer.segments?.length) {
        result.differences.structural?.push(`Segment count changed from ${older.segments?.length || 0} to ${newer.segments?.length || 0}`);
      }
    } else {
      // Compare examples
      if (older.examples?.length !== newer.examples?.length) {
        result.differences.structural?.push(`Example count changed from ${older.examples?.length || 0} to ${newer.examples?.length || 0}`);
      }
      
      // Compare model
      if (older.model?.provider !== newer.model?.provider || older.model?.model !== newer.model?.model) {
        result.differences.structural?.push(`Model changed from ${older.model?.provider}/${older.model?.model} to ${newer.model?.provider}/${newer.model?.model}`);
      }
    }
    
    return result;
  }
  
  /**
   * Load a program with usage tracking
   */
  async loadProgram<T = string>(name: string, version?: string): Promise<ProgramBuilder<T>> {
    const program = await selvedge.loadProgram<T>(name, version);
    
    // Track usage
    await this.trackUsage('program', name);
    
    // Wrap the generate method to track performance
    const originalGenerate = program.generate;
    program.generate = async (variables: any, options: any) => {
      const startTime = Date.now();
      let success = true;
      
      try {
        const result = await originalGenerate.call(program, variables, options);
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const executionTime = Date.now() - startTime;
        await this.trackUsage('program', name, executionTime, success);
      }
    };
    
    return program;
  }
  
  /**
   * Load a prompt with usage tracking
   */
  async loadPrompt<T = any>(name: string, version?: string): Promise<PromptTemplate<T>> {
    const prompt = await selvedge.loadPrompt<T>(name, version);
    
    // Track usage
    await this.trackUsage('prompt', name);
    
    // Wrap the execute method to track performance
    const originalExecute = prompt.execute;
    prompt.execute = async <R = T>(variables: any, options: any): Promise<R> => {
      const startTime = Date.now();
      let success = true;
      
      try {
        // Use type assertion to ensure the return type matches R
        const result = await originalExecute.call(prompt, variables, options) as unknown as R;
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const executionTime = Date.now() - startTime;
        await this.trackUsage('prompt', name, executionTime, success);
      }
    };
    
    return prompt;
  }
  
  /**
   * Get detailed information about an item
   */
  async getItemInfo(type: 'prompt' | 'program', name: string): Promise<{
    name: string;
    type: 'prompt' | 'program';
    versions: string[];
    metadata: UsageMetadata;
  }> {
    const versions = await selvedge.listProgramVersions(name);
    const metadata = await this.loadMetadata(type, name);
    
    return {
      name,
      type,
      versions,
      metadata
    };
  }
  
  /**
   * Export an item to a file
   */
  async exportItem(type: 'prompt' | 'program', name: string, outputPath: string, version?: string): Promise<void> {
    // Load the item
    const data = await store.load(type, name, version);
    
    // Load metadata
    const metadata = await this.loadMetadata(type, name);
    
    // Combine data and metadata
    const exportData = {
      type,
      name,
      version: version || 'latest',
      data,
      metadata
    };
    
    // Write to file
    await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  }
  
  /**
   * Import an item from a file
   */
  async importItem(filePath: string): Promise<{
    type: 'prompt' | 'program';
    name: string;
    version: string;
  }> {
    // Read the file
    const content = await fs.readFile(filePath, 'utf-8');
    const importData = JSON.parse(content);
    
    // Validate the import data
    if (!importData.type || !importData.name || !importData.data) {
      throw new Error('Invalid import file format');
    }
    
    // Save the item
    const version = await store.save(
      importData.type, 
      importData.name, 
      importData.data
    );
    
    // Import metadata if available
    if (importData.metadata) {
      await this.saveMetadata(importData.type, importData.name, importData.metadata);
    }
    
    return {
      type: importData.type,
      name: importData.name,
      version
    };
  }
  
  /**
   * List all items with their metadata
   */
  async listAllItems(): Promise<Array<{
    name: string;
    type: 'prompt' | 'program';
    versionCount: number;
    metadata: UsageMetadata;
  }>> {
    const programs = await selvedge.listPrograms();
    const prompts = await selvedge.listPrompts();
    
    const items = [];
    
    // Process programs
    for (const name of programs) {
      const versions = await selvedge.listProgramVersions(name);
      const metadata = await this.loadMetadata('program', name);
      
      items.push({
        name,
        type: 'program' as const,
        versionCount: versions.length,
        metadata
      });
    }
    
    // Process prompts
    for (const name of prompts) {
      const versions = await selvedge.listPromptVersions(name);
      const metadata = await this.loadMetadata('prompt', name);
      
      items.push({
        name,
        type: 'prompt' as const,
        versionCount: versions.length,
        metadata
      });
    }
    
    return items;
  }
  
  /**
   * Add tags to an item
   */
  async addTags(type: 'prompt' | 'program', name: string, tags: string[]): Promise<void> {
    const metadata = await this.loadMetadata(type, name);
    
    // Initialize tags array if it doesn't exist
    if (!metadata.tags) {
      metadata.tags = [];
    }
    
    // Add new tags (avoiding duplicates)
    for (const tag of tags) {
      if (!metadata.tags.includes(tag)) {
        metadata.tags.push(tag);
      }
    }
    
    await this.saveMetadata(type, name, metadata);
  }
  
  /**
   * Remove tags from an item
   */
  async removeTags(type: 'prompt' | 'program', name: string, tags: string[]): Promise<void> {
    const metadata = await this.loadMetadata(type, name);
    
    // Skip if no tags exist
    if (!metadata.tags) {
      return;
    }
    
    // Remove specified tags
    metadata.tags = metadata.tags.filter(tag => !tags.includes(tag));
    
    await this.saveMetadata(type, name, metadata);
  }
  
  /**
   * Set a description for an item
   */
  async setDescription(type: 'prompt' | 'program', name: string, description: string): Promise<void> {
    const metadata = await this.loadMetadata(type, name);
    
    metadata.description = description;
    
    await this.saveMetadata(type, name, metadata);
  }
}

// Export a singleton instance
export const manager = new SelvedgeManager();
