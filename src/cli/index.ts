#!/usr/bin/env node
/**
 * Selvedge CLI - Command line interface for managing stored prompts and programs
 */
/// <reference types="commander" />
import { manager, selvedge } from '../';
import { program } from 'commander';

// Get version from package.json
let version = '0.1.0';
try {
  const packageJson = require('../../package.json');
  version = packageJson.version;
} catch (error) {
  // Ignore error, use default version
}

// Setup CLI
program
  .name('selvedge')
  .description('CLI for managing Selvedge prompts and programs')
  .version(version);

// List command
program
  .command('list')
  .description('List all saved prompts and programs')
  .option('-p, --prompts', 'List only prompts')
  .option('-g, --programs', 'List only programs')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options: { prompts?: boolean; programs?: boolean; verbose?: boolean }) => {
    try {
      if (options.verbose) {
        // Show detailed information with metadata
        const items = await manager.listAllItems();

        if (!options.programs) {
          // Show prompts
          const prompts = items.filter(item => item.type === 'prompt');
          if (prompts.length > 0) {
            console.log('\nPrompts:');
            prompts.forEach(item => {
              console.log(`- ${item.name}`);
              console.log(`  Versions: ${item.versionCount}`);
              console.log(`  Used: ${item.metadata.useCount || 0} times`);
              if (item.metadata.lastUsed) {
                console.log(`  Last used: ${new Date(item.metadata.lastUsed).toLocaleString()}`);
              }
              if (item.metadata.tags && item.metadata.tags.length > 0) {
                console.log(`  Tags: ${item.metadata.tags.join(', ')}`);
              }
              if (item.metadata.description) {
                console.log(`  Description: ${item.metadata.description}`);
              }
              console.log('');
            });
          } else {
            console.log('No prompts found');
          }
        }

        if (!options.prompts) {
          // Show programs
          const programs = items.filter(item => item.type === 'program');
          if (programs.length > 0) {
            console.log('\nPrograms:');
            programs.forEach(item => {
              console.log(`- ${item.name}`);
              console.log(`  Versions: ${item.versionCount}`);
              console.log(`  Used: ${item.metadata.useCount || 0} times`);
              if (item.metadata.lastUsed) {
                console.log(`  Last used: ${new Date(item.metadata.lastUsed).toLocaleString()}`);
              }
              if (item.metadata.tags && item.metadata.tags.length > 0) {
                console.log(`  Tags: ${item.metadata.tags.join(', ')}`);
              }
              if (item.metadata.description) {
                console.log(`  Description: ${item.metadata.description}`);
              }
              console.log('');
            });
          } else {
            console.log('No programs found');
          }
        }
      } else {
        // Simple list
        if (!options.programs) {
          const prompts = await selvedge.listPrompts();
          console.log('\nPrompts:');
          if (prompts.length > 0) {
            prompts.forEach(name => console.log(`- ${name}`));
          } else {
            console.log('No prompts found');
          }
        }

        if (!options.prompts) {
          const programs = await selvedge.listPrograms();
          console.log('\nPrograms:');
          if (programs.length > 0) {
            programs.forEach(name => console.log(`- ${name}`));
          } else {
            console.log('No programs found');
          }
        }
      }
    } catch (error) {
      console.error('Error listing items:', error);
      process.exit(1);
    }
  });

// Versions command
program
  .command('versions <type> <name>')
  .description('List all versions of a prompt or program')
  .action(async (type: 'prompt' | 'program', name: string) => {
    try {
      if (type !== 'prompt' && type !== 'program') {
        console.error('Type must be either "prompt" or "program"');
        process.exit(1);
      }

      const versions = type === 'prompt'
        ? await selvedge.listPromptVersions(name)
        : await selvedge.listProgramVersions(name);

      console.log(`\nVersions of ${type} "${name}":`);
      if (versions.length > 0) {
        versions.forEach((version, index) => {
          if (index === 0) {
            console.log(`- ${version} (latest)`);
          } else {
            console.log(`- ${version}`);
          }
        });
      } else {
        console.log(`No versions found for ${type} "${name}"`);
      }
    } catch (error) {
      console.error('Error listing versions:', error);
      process.exit(1);
    }
  });

// Info command
program
  .command('info <type> <name>')
  .description('Show detailed information about a prompt or program')
  .action(async (type: 'prompt' | 'program', name: string) => {
    try {
      if (type !== 'prompt' && type !== 'program') {
        console.error('Type must be either "prompt" or "program"');
        process.exit(1);
      }

      const info = await manager.getItemInfo(type, name);

      console.log(`\nInformation for ${type} "${name}":`);
      console.log(`Versions: ${info.versions.length}`);
      console.log(`Used: ${info.metadata.useCount || 0} times`);

      if (info.metadata.lastUsed) {
        console.log(`Last used: ${new Date(info.metadata.lastUsed).toLocaleString()}`);
      }

      if (info.metadata.performance) {
        console.log('\nPerformance:');
        if (info.metadata.performance.avgExecutionTime !== undefined) {
          console.log(`  Avg. execution time: ${info.metadata.performance.avgExecutionTime.toFixed(2)}ms`);
        }
        if (info.metadata.performance.successRate !== undefined) {
          console.log(`  Success rate: ${(info.metadata.performance.successRate * 100).toFixed(2)}%`);
        }
      }

      if (info.metadata.tags && info.metadata.tags.length > 0) {
        console.log(`\nTags: ${info.metadata.tags.join(', ')}`);
      }

      if (info.metadata.description) {
        console.log(`\nDescription: ${info.metadata.description}`);
      }

      console.log('\nVersions:');
      info.versions.forEach((version, index) => {
        if (index === 0) {
          console.log(`- ${version} (latest)`);
        } else {
          console.log(`- ${version}`);
        }
      });
    } catch (error) {
      console.error('Error getting info:', error);
      process.exit(1);
    }
  });

// Tag command
program
  .command('tag <type> <name>')
  .description('Add tags to a prompt or program')
  .option('-a, --add <tags>', 'Add tags (comma-separated)')
  .option('-r, --remove <tags>', 'Remove tags (comma-separated)')
  .action(async (type: 'prompt' | 'program', name: string, options: { add?: string; remove?: string }) => {
    try {
      if (type !== 'prompt' && type !== 'program') {
        console.error('Type must be either "prompt" or "program"');
        process.exit(1);
      }

      if (options.add) {
        const tags = options.add.split(',').map((tag: string) => tag.trim());
        await manager.addTags(type, name, tags);
        console.log(`Added tags to ${type} "${name}": ${tags.join(', ')}`);
      }

      if (options.remove) {
        const tags = options.remove.split(',').map((tag: string) => tag.trim());
        await manager.removeTags(type, name, tags);
        console.log(`Removed tags from ${type} "${name}": ${tags.join(', ')}`);
      }

      // Show current tags
      const info = await manager.getItemInfo(type, name);
      if (info.metadata.tags && info.metadata.tags.length > 0) {
        console.log(`Current tags: ${info.metadata.tags.join(', ')}`);
      } else {
        console.log('No tags set');
      }
    } catch (error) {
      console.error('Error managing tags:', error);
      process.exit(1);
    }
  });

// Describe command
program
  .command('describe <type> <name> <description>')
  .description('Set a description for a prompt or program')
  .action(async (type: 'prompt' | 'program', name: string, description: string) => {
    try {
      if (type !== 'prompt' && type !== 'program') {
        console.error('Type must be either "prompt" or "program"');
        process.exit(1);
      }

      await manager.setDescription(type, name, description);
      console.log(`Set description for ${type} "${name}"`);
    } catch (error) {
      console.error('Error setting description:', error);
      process.exit(1);
    }
  });

// Compare command
program
  .command('compare <type> <name> <version1> <version2>')
  .description('Compare two versions of a prompt or program')
  .action(async (type: 'prompt' | 'program', name: string, version1: string, version2: string) => {
    try {
      if (type !== 'prompt' && type !== 'program') {
        console.error('Type must be either "prompt" or "program"');
        process.exit(1);
      }

      const comparison = await manager.compareVersions(type, name, version1, version2);

      console.log(`\nComparison of ${type} "${name}" versions:`);
      console.log(`- ${comparison.oldVersion} → ${comparison.newVersion}`);

      if (comparison.differences.structural && comparison.differences.structural.length > 0) {
        console.log('\nStructural differences:');
        comparison.differences.structural.forEach(diff => {
          console.log(`- ${diff}`);
        });
      } else {
        console.log('\nNo structural differences found');
      }

      if (comparison.differences.metadata && comparison.differences.metadata.length > 0) {
        console.log('\nMetadata differences:');
        comparison.differences.metadata.forEach(diff => {
          console.log(`- ${diff}`);
        });
      }

      if (comparison.differences.performance) {
        console.log('\nPerformance differences:');
        if (comparison.differences.performance.executionTime !== undefined) {
          const change = comparison.differences.performance.executionTime;
          const sign = change >= 0 ? '+' : '';
          console.log(`- Execution time: ${sign}${change.toFixed(2)}ms`);
        }
        if (comparison.differences.performance.successRate !== undefined) {
          const change = comparison.differences.performance.successRate;
          const sign = change >= 0 ? '+' : '';
          console.log(`- Success rate: ${sign}${(change * 100).toFixed(2)}%`);
        }
      }
    } catch (error) {
      console.error('Error comparing versions:', error);
      process.exit(1);
    }
  });

// Export command
program
  .command('export <type> <name> [output]')
  .description('Export a prompt or program to a file')
  .option('-v, --version <version>', 'Specific version to export')
  .action(async (type: 'prompt' | 'program', name: string, output: string, options: { version?: string }) => {
    try {
      if (type !== 'prompt' && type !== 'program') {
        console.error('Type must be either "prompt" or "program"');
        process.exit(1);
      }

      // Default output path if not provided
      const outputPath = output || `./${name}-${type}-export.json`;

      await manager.exportItem(type, name, outputPath, options.version);
      console.log(`Exported ${type} "${name}" to ${outputPath}`);
    } catch (error) {
      console.error('Error exporting item:', error);
      process.exit(1);
    }
  });

// Import command
program
  .command('import <file>')
  .description('Import a prompt or program from a file')
  .action(async (file: string) => {
    try {
      const imported = await manager.importItem(file);
      console.log(`Imported ${imported.type} "${imported.name}" (version: ${imported.version})`);
    } catch (error) {
      console.error('Error importing item:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// If no arguments, show help
if (process.argv.length === 2) {
  program.help();
}
