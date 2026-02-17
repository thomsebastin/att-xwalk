const fs = require('node:fs').promises;
const fsSync = require('node:fs');
const path = require('path');
const glob = require('glob');

// Configuration
const DEFAULT_THEMES = ['light', 'dark'];
const CONFIG_FILE = 'brand-config.json';

// State management
let brands = [];
let themes = [...DEFAULT_THEMES];

// Check if verbose mode is enabled
let VERBOSE_MODE = false;
if (process.argv.includes('--verbose') || process.argv.includes('--log')) {
  VERBOSE_MODE = true;
}

// Utility functions
function log(message, type = 'info') {
  if (!VERBOSE_MODE && type === 'info') {
    return; // Skip info messages in quiet mode
  }
  
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function logProgress(message) {
  process.stdout.write(`\r${message}`);
}

function logComplete(message) {
  process.stdout.write('\n');
  log(message, 'success');
}

async function readConfig() {
  try {
    if (!fsSync.existsSync(CONFIG_FILE)) {
      log(`Config file ${CONFIG_FILE} not found, using defaults`, 'warning');
      return { brands: [], themes: [...DEFAULT_THEMES] };
    }
    
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    return {
      brands: config.brands || [],
      themes: config.themes || [...DEFAULT_THEMES]
    };
  } catch (error) {
    log(`Error reading config file: ${error.message}`, 'warning');
    return { brands: [], themes: [...DEFAULT_THEMES] };
  }
}

async function writeConfig(config) {
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    if (VERBOSE_MODE) {
      log(`Updated ${CONFIG_FILE}`);
    }
  } catch (error) {
    log(`Error writing config file: ${error.message}`, 'error');
    throw error;
  }
}

async function removeDirectory(dirPath) {
  try {
    if (fsSync.existsSync(dirPath)) {
      await fs.rm(dirPath, { recursive: true, force: true });
      if (VERBOSE_MODE) {
        log(`Removed directory: ${dirPath}`);
      }
      return true;
    } else {
      log(`Directory not found: ${dirPath}`, 'warning');
      return false;
    }
  } catch (error) {
    log(`Error removing directory ${dirPath}: ${error.message}`, 'error');
    return false;
  }
}

async function checkAndRemoveEmptyDirectory(dirPath) {
  try {
    if (fsSync.existsSync(dirPath)) {
      const remainingItems = await fs.readdir(dirPath);
      if (remainingItems.length === 0) {
        await fs.rmdir(dirPath);
        if (VERBOSE_MODE) {
          log(`Removed empty directory: ${dirPath}`);
        }
        return true;
      }
    }
    return false;
  } catch (error) {
    log(`Error checking/removing empty directory ${dirPath}: ${error.message}`, 'warning');
    return false;
  }
}

// Brand removal functions
async function removeBrandCSSForFolder(brandCode, directory, subtree = false) {
  try {
    // For styles directory, we need to handle both the brand directory and any nested theme directories
    let patterns = [];
    if (subtree) {
      // For blocks, templates, react-app - look for nested brand directories
      patterns.push(path.join(directory, `**/${brandCode}`));
    } else {
      // For styles directory - look for brand directory and its nested theme directories
      patterns.push(path.join(directory, brandCode));
      patterns.push(path.join(directory, `${brandCode}/**`));
    }

    return new Promise((resolve, reject) => {
      // Use multiple glob patterns to catch all brand-related directories
      const allMatches = [];
      let completedPatterns = 0;
      let hasError = false;

      patterns.forEach((pattern) => {
        glob(pattern, { onlyDirectories: true }, async (err, matches) => {
          if (err) {
            log(`Error finding directories: ${err.message}`, 'error');
            hasError = true;
            completedPatterns++;
            if (completedPatterns === patterns.length) {
              if (hasError) {
                reject(new Error('Error during directory search'));
              } else {
                resolve(0);
              }
            }
            return;
          }

          // Add unique matches to the list
          matches.forEach(match => {
            if (!allMatches.includes(match)) {
              allMatches.push(match);
            }
          });

          completedPatterns++;
          if (completedPatterns === patterns.length) {
            if (hasError) {
              reject(new Error('Error during directory search'));
              return;
            }

            if (allMatches.length === 0) {
              log(`No brand directories found in ${directory}`, 'warning');
              resolve(0);
              return;
            }

            log(`Found ${allMatches.length} brand directories to remove in ${directory}`);
            if (VERBOSE_MODE) {
              allMatches.forEach(match => {
                log(`Will remove: ${match}`, 'info');
              });
            }
            let removedCount = 0;

            // Sort by path length (deepest first) to ensure proper removal order
            allMatches.sort((a, b) => b.length - a.length);

            for (const dir of allMatches) {
              const success = await removeDirectory(dir);
              if (success) removedCount++;
            }

            log(`Removed ${removedCount} brand directories from ${directory}`);
            resolve(removedCount);
          }
        });
      });
    });
  } catch (error) {
    log(`Error removing brand CSS from ${directory}: ${error.message}`, 'error');
    throw error;
  }
}

// Theme removal functions
async function removeThemeCSSForFolder(themeCode, directory, subtree = false) {
  try {
    // For theme removal, search for both root-level and brand-specific theme directories
    let patterns = [];
    if (subtree) {
      // For blocks, templates, react-app - look for nested theme directories
      patterns.push(path.join(directory, `**/themes/${themeCode}`));
    } else {
      // For styles directory - look for root-level and brand-specific theme directories
      patterns.push(path.join(directory, `themes/${themeCode}`)); // root-level
      patterns.push(path.join(directory, `*/themes/${themeCode}`)); // brand-specific
      patterns.push(path.join(directory, `*/themes/${themeCode}/**`)); // nested under brand-specific
    }

    return new Promise((resolve, reject) => {
      const allMatches = [];
      let completedPatterns = 0;
      let hasError = false;

      patterns.forEach((pattern) => {
        glob(pattern, { onlyDirectories: true }, async (err, matches) => {
          if (err) {
            log(`Error finding theme directories: ${err.message}`, 'error');
            hasError = true;
            completedPatterns++;
            if (completedPatterns === patterns.length) {
              if (hasError) {
                reject(new Error('Error during directory search'));
              } else {
                resolve(0);
              }
            }
            return;
          }

          matches.forEach(match => {
            if (!allMatches.includes(match)) {
              allMatches.push(match);
            }
          });

          completedPatterns++;
          if (completedPatterns === patterns.length) {
            if (hasError) {
              reject(new Error('Error during directory search'));
              return;
            }

            if (allMatches.length === 0) {
              log(`No theme directories found in ${directory}`, 'warning');
              resolve(0);
              return;
            }

            log(`Found ${allMatches.length} theme directories to remove in ${directory}`);
            if (VERBOSE_MODE) {
              allMatches.forEach(match => {
                log(`Will remove: ${match}`, 'info');
              });
            }
            let removedCount = 0;

            // Sort by path length (deepest first) to ensure proper removal order
            allMatches.sort((a, b) => b.length - a.length);

            for (const dir of allMatches) {
              const success = await removeDirectory(dir);
              if (success) {
                removedCount++;
                // Check if the parent themes directory is now empty and remove it
                const themesDir = path.dirname(dir);
                await checkAndRemoveEmptyDirectory(themesDir);
              }
            }

            log(`Removed ${removedCount} theme directories from ${directory}`);
            resolve(removedCount);
          }
        });
      });
    });
  } catch (error) {
    log(`Error removing theme CSS from ${directory}: ${error.message}`, 'error');
    throw error;
  }
}

// Main removal functions
async function removeBrandCSS(brandCode) {
  try {
    if (VERBOSE_MODE) {
      log(`Removing Brand CSS for ${brandCode}...`);
      log(`Working directory: ${process.cwd()}`);
    }

    let totalRemoved = 0;

    // Remove from blocks directory
    const blocksDir = path.join(process.cwd(), 'blocks');
    if (fsSync.existsSync(blocksDir)) {
      const removed = await removeBrandCSSForFolder(brandCode, blocksDir, true);
      totalRemoved += removed;
    } else {
      log(`Blocks directory not found: ${blocksDir}`, 'warning');
    }

    // Remove from templates directory
    const templatesDir = path.join(process.cwd(), 'templates');
    if (fsSync.existsSync(templatesDir)) {
      const removed = await removeBrandCSSForFolder(brandCode, templatesDir, true);
      totalRemoved += removed;
    } else {
      log(`Templates directory not found: ${templatesDir}`, 'warning');
    }

    // Remove from styles directory
    const stylesDir = path.join(process.cwd(), 'styles');
    if (fsSync.existsSync(stylesDir)) {
      const removed = await removeBrandCSSForFolder(brandCode, stylesDir);
      totalRemoved += removed;
    } else {
      log(`Styles directory not found: ${stylesDir}`, 'warning');
    }

    // Remove from react-app directory
    const reactDir = path.join(process.cwd(), 'react-app');
    if (fsSync.existsSync(reactDir)) {
      const removed = await removeBrandCSSForFolder(brandCode, reactDir, true);
      totalRemoved += removed;
    } else {
      log(`React-app directory not found: ${reactDir}`, 'warning');
    }

    // Update configuration
    const config = await readConfig();
    brands = config.brands;
    
    if (brands.includes(brandCode)) {
      brands = brands.filter((b) => b !== brandCode);
      await writeConfig({ ...config, brands });
      if (VERBOSE_MODE) {
        log(`Removed brand ${brandCode} from configuration`);
      }
    } else {
      log(`Brand ${brandCode} not found in configuration`, 'warning');
    }

    if (VERBOSE_MODE) {
      logComplete(`Brand CSS removal completed for ${brandCode}`);
      log(`Total directories removed: ${totalRemoved}`, 'info');
    } else {
      log(`✅ Brand removal completed for ${brandCode}. Removed ${totalRemoved} directories.`, 'success');
    }
  } catch (error) {
    log(`Brand CSS removal failed for ${brandCode}: ${error.message}`, 'error');
    throw error;
  }
}

async function removeThemeCSS(themeCode) {
  try {
    if (VERBOSE_MODE) {
      log(`Removing Theme CSS for ${themeCode}...`);
      log(`Working directory: ${process.cwd()}`);
    }

    let totalRemoved = 0;

    // Remove from blocks directory
    const blocksDir = path.join(process.cwd(), 'blocks');
    if (fsSync.existsSync(blocksDir)) {
      const removed = await removeThemeCSSForFolder(themeCode, blocksDir, true);
      totalRemoved += removed;
    } else {
      log(`Blocks directory not found: ${blocksDir}`, 'warning');
    }

    // Remove from templates directory
    const templatesDir = path.join(process.cwd(), 'templates');
    if (fsSync.existsSync(templatesDir)) {
      const removed = await removeThemeCSSForFolder(themeCode, templatesDir, true);
      totalRemoved += removed;
    } else {
      log(`Templates directory not found: ${templatesDir}`, 'warning');
    }

    // Remove from styles directory
    const stylesDir = path.join(process.cwd(), 'styles');
    if (fsSync.existsSync(stylesDir)) {
      const removed = await removeThemeCSSForFolder(themeCode, stylesDir);
      totalRemoved += removed;
    } else {
      log(`Styles directory not found: ${stylesDir}`, 'warning');
    }

    // Remove from react-app directory
    const reactDir = path.join(process.cwd(), 'react-app');
    if (fsSync.existsSync(reactDir)) {
      const removed = await removeThemeCSSForFolder(themeCode, reactDir, true);
      totalRemoved += removed;
    } else {
      log(`React-app directory not found: ${reactDir}`, 'warning');
    }

    // Update configuration
    const config = await readConfig();
    themes = config.themes;
    
    if (themes.includes(themeCode)) {
      themes = themes.filter((t) => t !== themeCode);
      await writeConfig({ ...config, themes });
      if (VERBOSE_MODE) {
        log(`Removed theme ${themeCode} from configuration`);
      }
    } else {
      log(`Theme ${themeCode} not found in configuration`, 'warning');
    }

    if (VERBOSE_MODE) {
      logComplete(`Theme CSS removal completed for ${themeCode}`);
      log(`Total directories removed: ${totalRemoved}`, 'info');
    } else {
      log(`✅ Theme removal completed for ${themeCode}. Removed ${totalRemoved} directories.`, 'success');
    }
  } catch (error) {
    log(`Theme CSS removal failed for ${themeCode}: ${error.message}`, 'error');
    throw error;
  }
}

async function removeBlockCSS(blockCode) {
  try {
    if (VERBOSE_MODE) {
      log(`Removing Block CSS for ${blockCode}...`);
      log(`Working directory: ${process.cwd()}`);
    }

    let totalRemoved = 0;

    // Remove the entire block directory
    const blockDir = path.join(process.cwd(), 'blocks', blockCode);
    if (fsSync.existsSync(blockDir)) {
      const success = await removeDirectory(blockDir);
      if (success) totalRemoved++;
      if (VERBOSE_MODE) {
        log(`Block ${blockCode} removed successfully.`);
      }
    } else {
      log(`Block directory not found: ${blockDir}`, 'warning');
    }

    // Also remove from templates if it exists
    const templatesDir = path.join(process.cwd(), 'templates');
    if (fsSync.existsSync(templatesDir)) {
      const templateBlockDir = path.join(templatesDir, blockCode);
      if (fsSync.existsSync(templateBlockDir)) {
        const success = await removeDirectory(templateBlockDir);
        if (success) totalRemoved++;
      }
    } else {
      log(`Templates directory not found: ${templatesDir}`, 'warning');
    }

    // Also remove from react-app if it exists
    const reactDir = path.join(process.cwd(), 'react-app');
    if (fsSync.existsSync(reactDir)) {
      const reactBlockDir = path.join(reactDir, blockCode);
      if (fsSync.existsSync(reactBlockDir)) {
        const success = await removeDirectory(reactBlockDir);
        if (success) totalRemoved++;
      }
    } else {
      log(`React-app directory not found: ${reactDir}`, 'warning');
    }

    if (VERBOSE_MODE) {
      logComplete(`Block CSS removal completed for ${blockCode}`);
      log(`Total directories removed: ${totalRemoved}`, 'info');
    } else {
      log(`✅ Block removal completed for ${blockCode}. Removed ${totalRemoved} directories.`, 'success');
    }
  } catch (error) {
    log(`Block CSS removal failed for ${blockCode}: ${error.message}`, 'error');
    throw error;
  }
}

// CLI interface
async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      log('Usage: node remove-brand.js <type> <name>', 'error');
      log('  type: brand, theme, or block', 'info');
      log('  name: name of the brand, theme, or block to remove', 'info');
      log('Example: node remove-brand.js brand royal', 'info');
      log('Example: node remove-brand.js theme dark', 'info');
      log('Example: node remove-brand.js block hero', 'info');
      process.exit(1);
    }

    const type = args[0].toLowerCase();
    const name = args[1];

    if (!['brand', 'theme', 'block'].includes(type)) {
      log(`Invalid type: ${type}. Please use "brand", "theme", or "block".`, 'error');
      process.exit(1);
    }

    if (!name || name.trim() === '') {
      log('Name cannot be empty', 'error');
      process.exit(1);
    }

    log(`Removing ${type}: ${name}`);

    switch (type) {
      case 'brand':
        await removeBrandCSS(name);
        break;
      case 'theme':
        await removeThemeCSS(name);
        break;
      case 'block':
        await removeBlockCSS(name);
        break;
      default:
        log(`Unknown type: ${type}`, 'error');
        process.exit(1);
    }
  } catch (error) {
    log(`An error occurred: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = {
  removeBrandCSS,
  removeThemeCSS,
  removeBlockCSS,
  readConfig,
  writeConfig
};
