const readline = require('node:readline');
const fs = require('node:fs').promises;
const fsSync = require('node:fs');
const path = require('path');

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
    log(`Updated ${CONFIG_FILE}`);
  } catch (error) {
    log(`Error writing config file: ${error.message}`, 'error');
    throw error;
  }
}

async function loadTemplate(templatePath, fallbackContent) {
  try {
    const template = await fs.readFile(templatePath, 'utf8');
    return template;
  } catch (error) {
    log(`Template not found at ${templatePath}, using fallback`, 'warning');
    return fallbackContent;
  }
}

// =========================
// THEME & BRAND CSS GENERATION LOGIC
// =========================
//
// - When creating a new theme at the root (styles/themes/<theme>/),
//   the import should be: @import '../../styles.css'
// - When creating a new theme inside a brand (styles/<brand>/themes/<theme>/),
//   the import should be: @import '../../../styles.css'
//
// - The script will SKIP existing files to avoid overwriting user changes.
//   (If you want to force regeneration, add a force flag in the future.)
//
// - The correct import path is determined by the generateSpecialStyleContent function
//   using the isTheme and isBrand flags.

// Theme CSS generation functions
async function generateThemeCSSForFolder(themeCode, codeDir, fileName, isStyleFolder = false) {
  try {
    // Create themes directory structure
    const themesDir = fileName
      ? path.join(codeDir, fileName, 'themes')
      : path.join(codeDir, 'themes');
    
    await ensureDirectoryExists(themesDir);
    
    const themeDir = path.join(themesDir, themeCode);
    await ensureDirectoryExists(themeDir);

    // Get source files
    const sourceDir = fileName ? path.join(codeDir, fileName) : codeDir;
    const files = await fs.readdir(sourceDir);
    
    const cssFiles = files.filter(file => 
      file.endsWith('.css') && 
      !file.startsWith('_') && 
      file !== '.css'
    );

    if (cssFiles.length === 0) {
      log(`No CSS files found in ${sourceDir}`, 'warning');
      return;
    }

    log(`Processing ${cssFiles.length} CSS files for theme ${themeCode}...`);

    for (const file of cssFiles) {
      const relativePath = fileName
        ? path.relative(codeDir, path.join(codeDir, fileName, file))
        : path.relative(codeDir, file);
      
      const dest = path.join(themeDir, `_${file}`);
      
      // SKIP existing files to avoid overwriting user changes
      if (await fileExists(dest)) {
        log(`File ${relativePath} exists  ....\t\t\t[SKIPPED]`);
        continue;
      }

      let content = '';
      
      // For theme files, generate correct import path
      if (isStyleFolder && ['styles.css', 'fonts.css', 'tokens.css'].includes(file)) {
        content = await generateSpecialStyleContent(file, themeCode, codeDir, true);
      } else {
        // Use template for regular CSS files
        content = await generateTemplateContent(file, fileName, codeDir, themeCode, true);
      }

      try {
        await fs.writeFile(dest, content);
        log(`File ${relativePath} created  ....\t\t\t[OK]`);
      } catch (error) {
        log(`File ${relativePath} created  ....\t\t\t[ERROR] - ${error.message}`, 'error');
      }
    }
  } catch (error) {
    log(`Error generating theme CSS for ${themeCode}: ${error.message}`, 'error');
    throw error;
  }
}

async function generateThemeCSSWithinBrandFolder(themeCode, brandDir, fileName, isStyleFolder = false) {
  try {
    // Create themes directory within brand folder
    const themesDir = path.join(brandDir, 'themes');
    await ensureDirectoryExists(themesDir);
    
    const themeDir = path.join(themesDir, themeCode);
    await ensureDirectoryExists(themeDir);

    // Determine what CSS files to generate based on the brand directory type
    let cssFilesToGenerate = [];
    
    if (isStyleFolder) {
      // For styles directory, generate theme-specific files
      cssFilesToGenerate = ['styles.css', 'fonts.css', 'lazy-styles.css', 'tokens.css'];
    } else {
      // For blocks directory, determine the block name and generate block-specific file
      const pathParts = brandDir.split(path.sep);
      const blocksIndex = pathParts.indexOf('blocks');
      if (blocksIndex !== -1 && blocksIndex + 1 < pathParts.length) {
        const blockName = pathParts[blocksIndex + 1];
        cssFilesToGenerate = [`${blockName}.css`];
      }
    }

    if (cssFilesToGenerate.length === 0) {
      log(`No CSS files to generate for ${brandDir}`, 'warning');
      return;
    }

    log(`Generating ${cssFilesToGenerate.length} CSS files for theme ${themeCode} within brand folder...`);

    for (const file of cssFilesToGenerate) {
      const dest = path.join(themeDir, `_${file}`);
      
      // SKIP existing files to avoid overwriting user changes
      if (await fileExists(dest)) {
        log(`File _${file} exists  ....\t\t\t[SKIPPED]`);
        continue;
      }

      let content = '';
      
      // For theme files, generate correct import path
      if (isStyleFolder && ['styles.css', 'fonts.css', 'lazy-styles.css', 'tokens.css'].includes(file)) {
        content = await generateSpecialStyleContent(file, themeCode, brandDir, true, true);
      } else {
        content = await generateTemplateContent(file, null, brandDir, themeCode, true, true);
      }

      try {
        await fs.writeFile(dest, content);
        log(`File _${file} created  ....\t\t\t[OK]`);
      } catch (error) {
        log(`File _${file} created  ....\t\t\t[ERROR] - ${error.message}`, 'error');
      }
    }
  } catch (error) {
    log(`Error generating theme CSS within brand folder for ${themeCode}: ${error.message}`, 'error');
    throw error;
  }
}

// Brand CSS generation functions
async function generateBrandCSSForFolder(brandCode, codeDir, fileName, isStyleFolder = false) {
  try {
  const brandDir = fileName
    ? path.join(codeDir, fileName, brandCode)
    : path.join(codeDir, brandCode);
    
    await ensureDirectoryExists(brandDir);

    // Get source files
    const sourceDir = fileName ? path.join(codeDir, fileName) : codeDir;
    const files = await fs.readdir(sourceDir);

    const cssFiles = files.filter(file => 
      file.endsWith('.css') && 
      !file.startsWith('_') && 
      file !== '.css'
    );

    if (cssFiles.length === 0) {
      log(`No CSS files found in ${sourceDir}`, 'warning');
      return;
    }

    log(`Processing ${cssFiles.length} CSS files for brand ${brandCode}...`);

    // Process each CSS file
    for (const file of cssFiles) {
      const relativePath = fileName
        ? path.relative(codeDir, path.join(codeDir, fileName, file))
        : path.relative(codeDir, file);
      
      const dest = path.join(brandDir, `_${file}`);
      
      if (await fileExists(dest)) {
        log(`File ${relativePath} exists  ....\t\t\t[SKIPPED]`);
        continue;
      }

      let content = '';

      if (isStyleFolder && ['styles.css', 'fonts.css', 'lazy-styles.css', 'tokens.css'].includes(file)) {
        content = await generateSpecialStyleContent(file, brandCode, codeDir, false, true);
      } else {
        content = await generateTemplateContent(file, fileName, codeDir, brandCode, false, true);
      }

      try {
        await fs.writeFile(dest, content);
        log(`File ${relativePath} created  ....\t\t\t[OK]`);
      } catch (error) {
        log(`File ${relativePath} created  ....\t\t\t[ERROR] - ${error.message}`, 'error');
      }
    }

    // Generate theme folders within brand folder
    log(`Generating theme folders within brand ${brandCode}...`);
    for (const themeCode of themes) {
      await generateThemeCSSWithinBrandFolder(themeCode, brandDir, fileName, isStyleFolder);
    }
  } catch (error) {
    log(`Error generating brand CSS for ${brandCode}: ${error.message}`, 'error');
    throw error;
  }
}

// Helper functions for content generation
async function generateSpecialStyleContent(file, code, codeDir, isTheme = false, isBrand = false) {
  // Determine the correct import path for styles.css:
  // - For root themes: '../../styles.css'
  // - For brand themes: '../../styles.css' (same as root for styles folder)
  // - For brand CSS files: '../styles.css'
  const importLevels = isTheme ? '../../' : '../';
  
  switch (file) {
    case 'styles.css':
      return `\n@import '${importLevels}styles.css';\n\n/* ${code} specific style goes here */`;
    case 'fonts.css':
      return `/* ${code} specific fonts go here */`;
    case 'lazy-styles.css':
      return `\n@import '${importLevels}lazy-styles.css';\n\n/* ${code} specific lazy styles go here */`;
    case 'tokens.css':
      try {
        return await fs.readFile(path.join(codeDir, file), 'utf8');
      } catch (error) {
        log(`Error reading tokens.css: ${error.message}`, 'warning');
        return `/* ${code} specific tokens go here */`;
      }
    default:
      return `/* ${code} specific code goes here */\n`;
  }
}

async function generateTemplateContent(file, fileName, codeDir, code, isTheme = false, isWithinBrand = false) {
  const templatePath = path.join(__dirname, 'plop-templates', 'index.css.template');
  const fallbackContent = `/* ${code} specific code goes here */\n`;
  try {
    let template = await loadTemplate(templatePath, fallbackContent);

    // Determine block/theme name
    let blockOrThemeName = fileName || path.basename(codeDir);
    if (blockOrThemeName.endsWith('.css')) {
      blockOrThemeName = blockOrThemeName.replace(/\.css$/, '');
    }

    // Always extract blockName from the path for both root and brand themes
    let blockName = blockOrThemeName;
    if (codeDir.includes('blocks')) {
      const pathParts = codeDir.split(path.sep);
      const blocksIndex = pathParts.indexOf('blocks');
      if (blocksIndex !== -1 && blocksIndex + 1 < pathParts.length) {
        blockName = pathParts[blocksIndex + 1];
      }
    }

    // Replace template variables
    let content = template.replace(/\{\{name\}\}/g, blockOrThemeName)
      .replace(/\{\{blockName\}\}/g, blockName);

    // Handle the three different import path scenarios:
    // 1. Root theme files: ../../{{blockName}}.css
    // 2. Brand CSS files: ../{{blockName}}.css  
    // 3. Brand theme files: ../../../{{blockName}}.css
    if (isWithinBrand && isTheme) {
      // Brand theme files (e.g., blocks/cards/roy/themes/bright/_cards.css)
      content = content.replace(/\{\{#if isBrandTheme\}\}(.*?)\{\{else if isBrandCSS\}\}(.*?)\{\{else\}\}(.*?)\{\{\/if\}\}/gs, '$1');
    } else if (isWithinBrand && !isTheme) {
      // Brand CSS files (e.g., blocks/cards/roy/_cards.css)
      content = content.replace(/\{\{#if isBrandTheme\}\}(.*?)\{\{else if isBrandCSS\}\}(.*?)\{\{else\}\}(.*?)\{\{\/if\}\}/gs, '$2');
    } else {
      // Root theme files (e.g., blocks/cards/themes/bright/_cards.css)
      content = content.replace(/\{\{#if isBrandTheme\}\}(.*?)\{\{else if isBrandCSS\}\}(.*?)\{\{else\}\}(.*?)\{\{\/if\}\}/gs, '$3');
    }

    return content;
  } catch (error) {
    log(`Error generating template content: ${error.message}`, 'warning');
    return fallbackContent;
  }
}

// Subfolder processing functions
async function generateThemeCSSForFolderWithSubFolders(themeCode, codeDir, isStyleFolder = false) {
  try {
    if (!fsSync.existsSync(codeDir)) {
      log(`Directory ${codeDir} does not exist, skipping...`, 'warning');
      return;
    }

    const files = await fs.readdir(codeDir);
    const validDirectories = [];
    
    for (const file of files) {
      // Skip hidden files and system files
      if (file.startsWith('.') || file === '.DS_Store' || file === 'Thumbs.db') {
        continue;
      }
      
      const filePath = path.join(codeDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          validDirectories.push(file);
        }
      } catch (error) {
        log(`Error checking file ${file}: ${error.message}`, 'warning');
        continue;
      }
    }

    if (validDirectories.length === 0) {
      log(`No valid subdirectories found in ${codeDir}`, 'warning');
    return;
  }

    log(`Processing ${validDirectories.length} subdirectories for theme ${themeCode}...`);
    
    for (const fileName of validDirectories) {
      await generateThemeCSSForFolder(themeCode, codeDir, fileName, isStyleFolder);
    }
  } catch (error) {
    log(`Error processing subfolders for theme ${themeCode}: ${error.message}`, 'error');
    throw error;
  }
}

async function generateBrandCSSForFolderWithSubFolders(brandCode, codeDir, isStyleFolder = false) {
  try {
    if (!fsSync.existsSync(codeDir)) {
      log(`Directory ${codeDir} does not exist, skipping...`, 'warning');
      return;
  }

    const files = await fs.readdir(codeDir);
    const validDirectories = [];
    
    for (const file of files) {
      // Skip hidden files and system files
      if (file.startsWith('.') || file === '.DS_Store' || file === 'Thumbs.db') {
        continue;
      }
      
      const filePath = path.join(codeDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          validDirectories.push(file);
    }
      } catch (error) {
        log(`Error checking file ${file}: ${error.message}`, 'warning');
        continue;
      }
    }

    if (validDirectories.length === 0) {
      log(`No valid subdirectories found in ${codeDir}`, 'warning');
      return;
    }

    log(`Processing ${validDirectories.length} subdirectories for brand ${brandCode}...`);
    
    for (const fileName of validDirectories) {
      await generateBrandCSSForFolder(brandCode, codeDir, fileName, isStyleFolder);
    }
  } catch (error) {
    log(`Error processing subfolders for brand ${brandCode}: ${error.message}`, 'error');
    throw error;
  }
}

// Block config generation
async function generateBlockConfigFiles(brandCode, blocksDir) {
  try {
    log(`Generating block-config.js files for ${brandCode}...`);
    
    const templatePath = path.join(__dirname, 'plop-templates', 'index.block-config.js');
    const fallbackTemplate = `// import { beforeDecorate, decorateBlock, afterDecorate } from './{{blockName}}.js';

export default async function getBlockConfigs() {
  return {
    flags: {
      // flag: true,
    },
    variations: [
      // { variation: 'multi-column-category-banner', module: 'multi-column-cat-banner.js' },
    ],
    decorations: {
    //   beforeDecorate: async (ctx, blockConfig) => beforeDecorate(ctx, blockConfig),
    //   decorate: async (ctx, blockConfig) => decorateBlock(ctx, blockConfig),
    //   afterDecorate: async (ctx, blockConfig) => afterDecorate(ctx, blockConfig),
    },
  };
}`;

    const templateContent = await loadTemplate(templatePath, fallbackTemplate);

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

    if (validBlockFolders.length === 0) {
      log(`No block directories found in ${blocksDir}`, 'warning');
      return;
    }

    log(`Processing ${validBlockFolders.length} block directories...`);

    for (const blockName of validBlockFolders) {
      const brandBlockDir = path.join(blocksDir, blockName, brandCode);
      const blockConfigPath = path.join(brandBlockDir, 'block-config.js');
      
      await ensureDirectoryExists(brandBlockDir);
      
      if (await fileExists(blockConfigPath)) {
        log(`block-config.js exists in ${blockName}/${brandCode}  ....\t\t\t[SKIPPED]`);
        continue;
      }

      const content = templateContent.replace(/\{\{blockName\}\}/g, blockName);

      try {
        await fs.writeFile(blockConfigPath, content);
        log(`block-config.js created in ${blockName}/${brandCode}  ....\t\t\t[OK]`);
      } catch (error) {
        log(`block-config.js creation failed in ${blockName}/${brandCode}  ....\t\t\t[ERROR] - ${error.message}`, 'error');
      }
    }
  } catch (error) {
    log(`Error generating block config files for ${brandCode}: ${error.message}`, 'error');
    throw error;
  }
}

// Main generation functions
async function generateBrandCSS(brandCode) {
  try {
    if (VERBOSE_MODE) {
      log(`Generating Brand CSS for ${brandCode}...`);
      log(`Working directory: ${process.cwd()}`);
    }

    // Load and update config
    const config = await readConfig();
    brands = config.brands;
    themes = config.themes;
    
    if (!brands.includes(brandCode)) {
      brands.push(brandCode);
      await writeConfig({ ...config, brands, themes });
      if (VERBOSE_MODE) {
        log(`Added brand ${brandCode} to configuration`);
      }
    }

    let totalDirectories = 0;

    // Process blocks directory
    const blocksDir = path.join(process.cwd(), 'blocks');
    if (fsSync.existsSync(blocksDir)) {
      await generateBrandCSSForFolderWithSubFolders(brandCode, blocksDir);
      await generateBlockConfigFiles(brandCode, blocksDir);
      totalDirectories++;
    } else {
      log(`Blocks directory ${blocksDir} does not exist, skipping...`, 'warning');
    }

    // Process templates directory
    const templatesDir = path.join(process.cwd(), 'templates');
    if (fsSync.existsSync(templatesDir)) {
      await generateBrandCSSForFolderWithSubFolders(brandCode, templatesDir);
      totalDirectories++;
    } else {
      log(`Templates directory ${templatesDir} does not exist, skipping...`, 'warning');
    }

    // Process styles directory
    const stylesDir = path.join(process.cwd(), 'styles');
    if (fsSync.existsSync(stylesDir)) {
      await generateBrandCSSForFolder(brandCode, stylesDir, null, true);
      totalDirectories++;
    } else {
      log(`Styles directory ${stylesDir} does not exist, skipping...`, 'warning');
    }

    if (VERBOSE_MODE) {
      logComplete(`Brand CSS generation completed for ${brandCode}`);
    } else {
      log(`✅ Brand CSS generation completed for ${brandCode}. Processed ${totalDirectories} directories.`, 'success');
    }
  } catch (error) {
    log(`Brand CSS generation failed for ${brandCode}: ${error.message}`, 'error');
    throw error;
  }
}

async function generateThemeCSS(themeCode) {
  try {
    if (VERBOSE_MODE) {
      log(`Generating Theme CSS for ${themeCode}...`);
      log(`Working directory: ${process.cwd()}`);
    }

    // Load and update config
    const config = await readConfig();
    themes = config.themes;
    
    if (!themes.includes(themeCode)) {
      themes.push(themeCode);
      await writeConfig({ ...config, themes });
      if (VERBOSE_MODE) {
        log(`Added theme ${themeCode} to configuration`);
      }
    }

    let totalDirectories = 0;

    // Process blocks directory
    const blocksDir = path.join(process.cwd(), 'blocks');
    if (fsSync.existsSync(blocksDir)) {
      await generateThemeCSSForFolderWithSubFolders(themeCode, blocksDir);
      totalDirectories++;
    } else {
      log(`Blocks directory ${blocksDir} does not exist, skipping...`, 'warning');
    }

    // Process templates directory
    const templatesDir = path.join(process.cwd(), 'templates');
    if (fsSync.existsSync(templatesDir)) {
      await generateThemeCSSForFolderWithSubFolders(themeCode, templatesDir);
      totalDirectories++;
    } else {
      log(`Templates directory ${templatesDir} does not exist, skipping...`, 'warning');
    }

    // Process styles directory
    const stylesDir = path.join(process.cwd(), 'styles');
    if (fsSync.existsSync(stylesDir)) {
      await generateThemeCSSForFolder(themeCode, stylesDir, null, true);
      totalDirectories++;
    } else {
      log(`Styles directory ${stylesDir} does not exist, skipping...`, 'warning');
    }

    // Add theme to existing brands
    log(`Adding theme ${themeCode} to existing brands...`);
    const existingBrands = config.brands || [];
    for (const brandCode of existingBrands) {
      log(`Adding theme ${themeCode} to brand ${brandCode}...`);
      
      // Process blocks directory for brand (iterate over all blocks)
      const blocksDir = path.join(process.cwd(), 'blocks');
      if (fsSync.existsSync(blocksDir)) {
        const blockFolders = fsSync.readdirSync(blocksDir).filter(f => fsSync.statSync(path.join(blocksDir, f)).isDirectory());
        for (const blockName of blockFolders) {
          const brandBlockDir = path.join(blocksDir, blockName, brandCode);
          if (fsSync.existsSync(brandBlockDir)) {
            await generateThemeCSSWithinBrandFolder(themeCode, brandBlockDir, null, false);
          }
        }
      }
      
      // Process templates directory for brand
      const templatesDir = path.join(process.cwd(), 'templates');
      if (fsSync.existsSync(templatesDir)) {
        await generateThemeCSSWithinBrandFolder(themeCode, path.join(templatesDir, brandCode), null, false);
      }
      
      // Process styles directory for brand
      const stylesDir = path.join(process.cwd(), 'styles');
      if (fsSync.existsSync(stylesDir)) {
        await generateThemeCSSWithinBrandFolder(themeCode, path.join(stylesDir, brandCode), null, true);
      }
    }

    if (VERBOSE_MODE) {
      logComplete(`Theme CSS generation completed for ${themeCode}`);
    } else {
      log(`✅ Theme CSS generation completed for ${themeCode}. Processed ${totalDirectories} directories and added to ${existingBrands.length} existing brands.`, 'success');
    }
  } catch (error) {
    log(`Theme CSS generation failed for ${themeCode}: ${error.message}`, 'error');
    throw error;
  }
}

// CLI interface
async function promptUser(question) {
  return new Promise((resolve) => {
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    const type = args[0];
    const name = args[1];

    if (!type || !name) {
      log('Usage: node initiate-brand.js <brand|theme> <name>', 'error');
      log('Example: node initiate-brand.js brand royal', 'info');
      log('Example: node initiate-brand.js theme dark', 'info');
      process.exit(1);
    }

    const normalizedType = type.toLowerCase();
    
    if (!['brand', 'theme'].includes(normalizedType)) {
      log(`Invalid type: ${type}. Please use "brand" or "theme".`, 'error');
      process.exit(1);
    }

    log(`${normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)} code entered: ${name}`);

    const question = `Generate ${normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)} CSS (y/n): `;
    const agree = await promptUser(question);

    if (agree.toLowerCase() === 'y') {
      log(`Generating ${normalizedType} CSS...`);
      
      if (normalizedType === 'brand') {
        await generateBrandCSS(name);
      } else {
        await generateThemeCSS(name);
      }
      
      logComplete(`${normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)} CSS generation completed successfully!`);
    } else {
      log(`${normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)} CSS not generated.`, 'warning');
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
  generateBrandCSS,
  generateThemeCSS,
  readConfig,
  writeConfig
};
