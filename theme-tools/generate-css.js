const fs = require('node:fs').promises;
const fsSync = require('node:fs');
const path = require('path');

// Configuration
const DEFAULT_THEMES = ['light', 'dark'];
const CONFIG_FILE = 'brand-config.json';

// State management
let brands = [];
let themes = [...DEFAULT_THEMES];

// Configuration
let VERBOSE_MODE = false;

// Check if verbose mode is enabled
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

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    log(`Created directory: ${dirPath}`);
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function readFileContent(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    log(`Error reading file ${filePath}: ${error.message}`, 'warning');
    return '';
  }
}

async function writeFileContent(filePath, content) {
  try {
    await ensureDirectoryExists(path.dirname(filePath));
    await fs.writeFile(filePath, content);
    return true;
  } catch (error) {
    log(`Error writing file ${filePath}: ${error.message}`, 'error');
    return false;
  }
}

// CSS combination functions
async function combineCSSFiles(basePath, brandPath, themePath, outputPath) {
  try {
    let combinedContent = '';
    let fileCount = 0;
    
    // Add base file content
    if (await fileExists(basePath)) {
      const baseContent = await readFileContent(basePath);
      combinedContent += baseContent + '\n';
      fileCount++;
      if (VERBOSE_MODE) {
        log(`Added base file: ${path.basename(basePath)}`);
      }
    } else {
      log(`Base file not found: ${basePath}`, 'warning');
    }
    
    // Add brand override content
    if (brandPath && await fileExists(brandPath)) {
      const brandContent = await readFileContent(brandPath);
      combinedContent += brandContent + '\n';
      fileCount++;
      if (VERBOSE_MODE) {
        log(`Added brand override: ${path.basename(brandPath)}`);
      }
    }
    
    // Add theme override content
    if (themePath && await fileExists(themePath)) {
      const themeContent = await readFileContent(themePath);
      combinedContent += themeContent + '\n';
      fileCount++;
      if (VERBOSE_MODE) {
        log(`Added theme override: ${path.basename(themePath)}`);
      }
    }
    
    // Write combined file
    if (fileCount > 0) {
      const success = await writeFileContent(outputPath, combinedContent);
      if (success) {
        if (VERBOSE_MODE) {
          log(`Generated: ${outputPath} (${fileCount} files combined)`);
        }
        return true;
      }
    } else {
      log(`No source files found for ${outputPath}`, 'warning');
    }
    
    return false;
  } catch (error) {
    log(`Error combining CSS files for ${outputPath}: ${error.message}`, 'error');
    return false;
  }
}

// Block CSS generation
async function generateBlockCSS(blockName, currentDir) {
  try {
    const blocksDir = path.join(currentDir, 'blocks', blockName);
    if (!fsSync.existsSync(blocksDir)) {
      log(`Block directory not found: ${blocksDir}`, 'warning');
      return 0;
    }
    
    if (VERBOSE_MODE) {
      log(`Processing block: ${blockName}`);
    }
    
    const baseCSSPath = path.join(blocksDir, `${blockName}.css`);
    let generatedCount = 0;
    
    // Generate theme-only CSS files (root level themes)
    for (const theme of themes) {
      const themeCSSPath = path.join(blocksDir, 'themes', theme, `_${blockName}.css`);
      const outputPath = path.join(blocksDir, 'themes', theme, `${blockName}.css`);
      
      const success = await combineCSSFiles(baseCSSPath, null, themeCSSPath, outputPath);
      if (success) generatedCount++;
    }
    
    // Generate brand + theme CSS files
    for (const brand of brands) {
      const brandCSSPath = path.join(blocksDir, brand, `_${blockName}.css`);
      
      // Brand-only CSS
      const brandOutputPath = path.join(blocksDir, brand, `${blockName}.css`);
      const brandSuccess = await combineCSSFiles(baseCSSPath, brandCSSPath, null, brandOutputPath);
      if (brandSuccess) generatedCount++;
      
      // Brand + theme CSS (themes within brand)
      for (const theme of themes) {
        const themeCSSPath = path.join(blocksDir, brand, 'themes', theme, `_${blockName}.css`);
        const outputPath = path.join(blocksDir, brand, 'themes', theme, `${blockName}.css`);
        
        const success = await combineCSSFiles(baseCSSPath, brandCSSPath, themeCSSPath, outputPath);
        if (success) generatedCount++;
      }
    }
    
    if (VERBOSE_MODE) {
      log(`Block ${blockName}: ${generatedCount} files generated`, 'success');
    }
    
    return generatedCount;
  } catch (error) {
    log(`Error generating CSS for block ${blockName}: ${error.message}`, 'error');
    throw error;
  }
}

// Styles CSS generation
async function generateStylesCSS(currentDir) {
  try {
    const stylesDir = path.join(currentDir, 'styles');
    if (!fsSync.existsSync(stylesDir)) {
      log(`Styles directory not found: ${stylesDir}`, 'warning');
      return 0;
    }
    
    if (VERBOSE_MODE) {
      log(`Processing styles directory`);
    }
    
    const styleFiles = ['styles.css', 'fonts.css', 'tokens.css'];
    let totalGenerated = 0;
    
    for (const fileName of styleFiles) {
      if (VERBOSE_MODE) {
        log(`Processing style file: ${fileName}`);
      }
      let fileGeneratedCount = 0;
      
      if (fileName === 'tokens.css') {
        // Special handling for tokens.css - use only override files, not base file
        // Generate theme-only CSS files (root level themes)
        for (const theme of themes) {
          const themeCSSPath = path.join(stylesDir, 'themes', theme, `_${fileName}`);
          const outputPath = path.join(stylesDir, 'themes', theme, fileName);
          
          const success = await combineCSSFiles(null, null, themeCSSPath, outputPath);
          if (success) fileGeneratedCount++;
        }
        
        // Generate brand + theme CSS files
        for (const brand of brands) {
          const brandCSSPath = path.join(stylesDir, brand, `_${fileName}`);
          
          // Brand-only CSS
          const brandOutputPath = path.join(stylesDir, brand, fileName);
          const brandSuccess = await combineCSSFiles(null, brandCSSPath, null, brandOutputPath);
          if (brandSuccess) fileGeneratedCount++;
          
          // Brand + theme CSS (themes within brand)
          for (const theme of themes) {
            const themeCSSPath = path.join(stylesDir, brand, 'themes', theme, `_${fileName}`);
            const outputPath = path.join(stylesDir, brand, 'themes', theme, fileName);
            
            const success = await combineCSSFiles(null, brandCSSPath, themeCSSPath, outputPath);
            if (success) fileGeneratedCount++;
          }
        }
      } else {
        // Standard handling for other CSS files
        const basePath = path.join(stylesDir, fileName);
        if (!fsSync.existsSync(basePath)) {
          log(`Style file not found: ${basePath}`, 'warning');
          continue;
        }
        
        // Generate theme-only CSS files (root level themes)
        for (const theme of themes) {
          const themeCSSPath = path.join(stylesDir, 'themes', theme, `_${fileName}`);
          const outputPath = path.join(stylesDir, 'themes', theme, fileName);
          
          const success = await combineCSSFiles(basePath, null, themeCSSPath, outputPath);
          if (success) fileGeneratedCount++;
        }
        
        // Generate brand + theme CSS files
        for (const brand of brands) {
          const brandCSSPath = path.join(stylesDir, brand, `_${fileName}`);
          
          // Brand-only CSS
          const brandOutputPath = path.join(stylesDir, brand, fileName);
          const brandSuccess = await combineCSSFiles(basePath, brandCSSPath, null, brandOutputPath);
          if (brandSuccess) fileGeneratedCount++;
          
          // Brand + theme CSS (themes within brand)
          for (const theme of themes) {
            const themeCSSPath = path.join(stylesDir, brand, 'themes', theme, `_${fileName}`);
            const outputPath = path.join(stylesDir, brand, 'themes', theme, fileName);
            
            const success = await combineCSSFiles(basePath, brandCSSPath, themeCSSPath, outputPath);
            if (success) fileGeneratedCount++;
          }
        }
      }
      
      totalGenerated += fileGeneratedCount;
      if (VERBOSE_MODE) {
        log(`Style file ${fileName}: ${fileGeneratedCount} files generated`);
      }
    }
    
    if (VERBOSE_MODE) {
      log(`Styles directory: ${totalGenerated} files generated`, 'success');
    }
    
    return totalGenerated;
  } catch (error) {
    log(`Error generating styles CSS: ${error.message}`, 'error');
    throw error;
  }
}

// Main generation function
async function generateAllCSS() {
  try {
    if (VERBOSE_MODE) {
      log('Starting CSS generation...');
      log(`Working directory: ${process.cwd()}`);
    }
    
    // Load configuration
    const config = await readConfig();
    brands = config.brands;
    themes = config.themes;
    
    if (VERBOSE_MODE) {
      log(`Brands: ${brands.length > 0 ? brands.join(', ') : 'none'}`);
      log(`Themes: ${themes.join(', ')}`);
    }
    
    let totalBlocks = 0;
    let totalStyles = 0;
    let totalFilesGenerated = 0;
    
    // Generate block CSS files
    const blocksDir = path.join(process.cwd(), 'blocks');
    if (fsSync.existsSync(blocksDir)) {
      const blockFolders = await fs.readdir(blocksDir);
      const validBlockFolders = [];
      
      for (const file of blockFolders) {
        // Skip hidden files and system files
        if (file.startsWith('.') || file === '.DS_Store' || file === 'Thumbs.db') {
          continue;
        }
        
        const filePath = path.join(blocksDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            validBlockFolders.push(file);
          }
        } catch (error) {
          log(`Error checking block folder ${file}: ${error.message}`, 'warning');
          continue;
        }
      }
      
      if (validBlockFolders.length > 0) {
        if (VERBOSE_MODE) {
          log(`Found ${validBlockFolders.length} block directories`);
        }
        
        for (const blockName of validBlockFolders) {
          const filesGenerated = await generateBlockCSS(blockName, process.cwd());
          totalFilesGenerated += filesGenerated;
          totalBlocks++;
        }
      } else {
        log('No block directories found', 'warning');
      }
    } else {
      log(`Blocks directory not found: ${blocksDir}`, 'warning');
    }
    
    // Generate styles CSS files
    const stylesFilesGenerated = await generateStylesCSS(process.cwd());
    totalFilesGenerated += stylesFilesGenerated;
    totalStyles++;
    
    // Summary
    if (VERBOSE_MODE) {
      logComplete(`CSS generation completed successfully!`);
      log(`Summary:`, 'info');
      log(`  - Blocks processed: ${totalBlocks}`, 'info');
      log(`  - Styles processed: ${totalStyles}`, 'info');
      log(`  - Total files generated: ${totalFilesGenerated}`, 'info');
      log(`  - Brands: ${brands.length}`, 'info');
      log(`  - Themes: ${themes.length}`, 'info');
    } else {
      log(`✅ CSS generation completed successfully! Generated ${totalFilesGenerated} files from ${totalBlocks} blocks and ${totalStyles} style directories.`, 'success');
    }
    
  } catch (error) {
    log(`CSS generation failed: ${error.message}`, 'error');
    throw error;
  }
}

// CLI interface
async function main() {
  try {
    await generateAllCSS();
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
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
  generateAllCSS,
  generateBlockCSS,
  generateStylesCSS,
  combineCSSFiles,
  readConfig
}; 