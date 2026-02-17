/**
 * This file is used to create a plop generator for creating a new theme, block or react component
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function readConfig() {
  try {
    const configPath = path.resolve(__dirname, '../brand-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        brands: config.brands || [],
        themes: config.themes || ['light', 'dark']
      };
    }
    return { brands: [], themes: ['light', 'dark'] };
  } catch (error) {
    log(`Error reading brand-config.json: ${error.message}`, 'warning');
    return { brands: [], themes: ['light', 'dark'] };
  }
}

export default function (plop) {
  // run command action to run commands in the terminal
  plop.setActionType('runCommand', (answers, config) => new Promise((resolve, reject) => {
    try {
      if (VERBOSE_MODE) {
        log(`Running command: ${config.command}`);
      }
      execSync(config.command, { stdio: 'inherit' });
      if (VERBOSE_MODE) {
        log(`Command completed successfully`, 'success');
      }
      resolve();
    } catch (error) {
      log(`Error running command: ${error.message}`, 'error');
      reject(error);
    }
  }));

  // remove command action to run remove commands
  plop.setActionType('removeCommand', (answers, config) => new Promise((resolve, reject) => {
    try {
      if (VERBOSE_MODE) {
        log(`Running remove command: ${config.command}`);
      }
      execSync(config.command, { stdio: 'inherit' });
      if (VERBOSE_MODE) {
        log(`Remove command completed successfully`, 'success');
      }
      resolve();
    } catch (error) {
      log(`Error running remove command: ${error.message}`, 'error');
      reject(error);
    }
  }));

  // summary action to show completion message
  plop.setActionType('showSummary', (answers, config) => {
    if (!VERBOSE_MODE) {
      const action = config.action || 'created';
      log(`✅ ${config.summaryType} "${answers.name}" ${action} successfully!`, 'success');
    }
    return 'Summary shown';
  });

  // controller generator
  plop.setGenerator('component', {
    description: 'Create a theme, block, or brand',
    prompts: [
      {
        type: 'list',
        name: 'type',
        message: 'What do you want to create?',
        choices: ['Block', 'Theme', 'Brand'],
      },
      {
        type: 'input',
        name: 'name',
        message: (answers) => `Enter ${answers.type} name:`,
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'Name cannot be empty';
          }
          if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
            return 'Name can only contain letters, numbers, hyphens, and underscores';
          }
          return true;
        },
      },
    ],
    actions: (data) => {
      const ext = data.type === 'Block' ? 'js' : 'jsx';
      let actions = [
        {
          type: 'add',
          path: data.type === 'Block' ? `../blocks/{{name}}/{{name}}.${ext}` : `react-app/app/{{name}}/{{name}}.${ext}`,
          templateFile: `plop-templates/${ext}-template/index.${ext}.template`,
        },
      ];
      
      switch (data.type) {
        case 'Block':
          actions.push({
            type: 'add',
            path: '../blocks/{{name}}/{{name}}.css',
            template: '/* {{name}} specific code goes here */',
            data: { name: data.name },
            skipIfExists: true,
          });
          actions.push({
            type: 'add',
            path: '../blocks/{{name}}/block-config.js',
            templateFile: 'plop-templates/index.block-config.js',
          });

          // Read brands and themes from brand-config.json
          const config = readConfig();
          const brands = config.brands;
          const themes = config.themes;

          if (VERBOSE_MODE) {
            log(`Found ${brands.length} brands and ${themes.length} themes in configuration`);
          }

          // Generate theme folders at root level under themes/ directory
          themes.forEach((theme) => {
            actions.push({
              type: 'add',
              path: `../blocks/{{name}}/themes/${theme}/_{{name}}.css`,
              templateFile: 'plop-templates/index.css.template',
              skipIfExists: true,
              data: { name: data.name },
            });
          });

          // Generate brand folders with theme subfolders under themes/ directory
          brands.forEach((brand) => {
            actions.push({
              type: 'add',
              path: `../blocks/{{name}}/${brand}/_{{name}}.css`,
              templateFile: 'plop-templates/index.css.template',
              skipIfExists: true,
              data: { name: data.name },
            });
            actions.push({
              type: 'add',
              path: `../blocks/{{name}}/${brand}/block-config.js`,
              templateFile: 'plop-templates/index.block-config.js',
              skipIfExists: true,
            });
            
            // Generate theme folders within brand folders under themes/ directory
            themes.forEach((theme) => {
              actions.push({
                type: 'add',
                path: `../blocks/{{name}}/${brand}/themes/${theme}/_{{name}}.css`,
                templateFile: 'plop-templates/index.css.template',
                skipIfExists: true,
                data: { name: data.name },
              });
            });
          });
          
          // Add summary action for Block
          actions.push({
            type: 'showSummary',
            summaryType: 'Block',
          });
          break;
        case 'React Component':
          actions.push(
            {
              type: 'add',
              path: `react-app/app/{{name}}/components/app.${ext}`,
              templateFile: `theme-tools/plop-templates/${ext}-template/components/app.${ext}.template`,
            },
            {
              type: 'add',
              path: 'react-app/app/{{name}}/index.css',
              templateFile: 'theme-tools/plop-templates/index.css.template',
            },
          );
          break;
        case 'Theme':
          actions = [
            {
              type: 'runCommand',
              command: `node theme-tools/initiate-brand.js theme ${data.name}${VERBOSE_MODE ? ' --verbose' : ''}`,
            },
            {
              type: 'showSummary',
              summaryType: 'Theme',
            }
          ];
          break;
        case 'Brand':
          actions = [
            {
              type: 'runCommand',
              command: `node theme-tools/initiate-brand.js brand ${data.name}${VERBOSE_MODE ? ' --verbose' : ''}`,
            },
            {
              type: 'showSummary',
              summaryType: 'Brand',
            }
          ];
          break;
        default: 
          log(`Unknown type: ${data.type}`, 'error');
          break;
      }
      return actions;
    },
  });

  // remove generator
  plop.setGenerator('remove', {
    description: 'Remove a theme, brand, or block',
    prompts: [
      {
        type: 'list',
        name: 'type',
        message: 'What do you want to remove?',
        choices: ['Block', 'Theme', 'Brand'],
      },
      {
        type: 'input',
        name: 'name',
        message: (answers) => `Enter ${answers.type} name to remove:`,
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'Name cannot be empty';
          }
          return true;
        },
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: (answers) => `Are you sure you want to remove ${answers.type} "${answers.name}"? This action cannot be undone.`,
        default: false,
      },
    ],
    actions: (data) => {
      if (!data.confirm) {
        log('Operation cancelled by user', 'warning');
        return [];
      }

      const actions = [];
      switch (data.type) {
        case 'Brand':
          actions.push({
            type: 'removeCommand',
            command: `node theme-tools/remove-brand.js brand ${data.name}${VERBOSE_MODE ? ' --verbose' : ''}`,
          });
          actions.push({
            type: 'showSummary',
            summaryType: 'Brand',
            action: 'removed',
          });
          break;
        case 'Theme':
          actions.push({
            type: 'removeCommand',
            command: `node theme-tools/remove-brand.js theme ${data.name}${VERBOSE_MODE ? ' --verbose' : ''}`,
          });
          actions.push({
            type: 'showSummary',
            summaryType: 'Theme',
            action: 'removed',
          });
          break;
        case 'Block':
          actions.push({
            type: 'removeCommand',
            command: `node theme-tools/remove-brand.js block ${data.name}${VERBOSE_MODE ? ' --verbose' : ''}`,
          });
          actions.push({
            type: 'showSummary',
            summaryType: 'Block',
            action: 'removed',
          });
          break;
        default:
          log(`Unknown type: ${data.type}`, 'error');
          break;
      }
      return actions;
    },
  });
}
