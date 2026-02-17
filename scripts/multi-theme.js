/* eslint-disable no-console */
import {
  sampleRUM, loadCSS, getMetadata, buildBlock, decorateBlock,
} from './aem.js';

export function getBrandCode() {
  return getMetadata('brand') || '';
}

const brandCode = getBrandCode();

export function getBrandPath() {
  if (brandCode) {
    document.body.classList.add(brandCode);
    return `${brandCode}/`;
  }
  return '';
}

const brandPath = getBrandPath();

export function getTheme() {
  return getMetadata('theme') || '';
}

const theme = getTheme();

export function getThemePath() {
  return theme ? `themes/${theme}/` : '';
}

const themePath = getThemePath();

let pageShowEventRegistered = false;

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
async function loadBlock(block) {
  const status = block.dataset.blockStatus;
  if (status !== 'loading' && status !== 'loaded') {
    block.dataset.blockStatus = 'loading';
    const { blockName } = block.dataset;
    try {
      const cssLoaded = loadCSS(`${window.hlx.codeBasePath}/blocks/${blockName}/${brandPath}${themePath}${blockName}.css`);
      const decorationComplete = new Promise((resolve) => {
        (async () => {
          try {
            const mod = await import(
              `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.js`
            );
            if (mod.default) {
              await mod.default(block);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log(`failed to load module for ${blockName}`, error);
          }
          resolve();
        })();
      });
      await Promise.all([cssLoaded, decorationComplete]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(`failed to load block ${blockName}`, error);
    }
    block.dataset.blockStatus = 'loaded';
  }
  return block;
}

/**
 * Loads all blocks in a section.
 * @param {Element} section The section element
 */

async function loadSection(section, loadCallback) {
  const status = section.dataset.sectionStatus;
  if (!status || status === 'initialized') {
    section.dataset.sectionStatus = 'loading';
    const blocks = [...section.querySelectorAll('div.block')];
    for (let i = 0; i < blocks.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await loadBlock(blocks[i]);
    }
    if (loadCallback) await loadCallback(section);
    section.dataset.sectionStatus = 'loaded';
    section.style.display = null;
  }
}

/**
   * Loads all sections.
   * @param {Element} element The parent element of sections to load
   */

async function loadSections(element) {
  const sections = [...element.querySelectorAll('div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadSection(sections[i]);
    if (i === 0 && sampleRUM.enhance) {
      sampleRUM.enhance();
    }
  }
}

/**
 * Load a block and execute its decorate methods
 * in the order of beforeDecorate, decorate, and afterDecorate
 * Sends blockDOM reference and blockConfig as arguments
 * @param { Object } decorations
 * @param { DOM } ctx
 */
async function executeDecorate(ctx, blockConfig) {
  try {
    const { beforeDecorate, decorate, afterDecorate } = blockConfig.decorations;
    if (typeof beforeDecorate === 'function') {
      await beforeDecorate(ctx, blockConfig);
    }
    if (typeof decorate === 'function') {
      await decorate(ctx, blockConfig);
    }
    if (typeof afterDecorate === 'function') {
      await afterDecorate(ctx, blockConfig);
    }
  } catch (error) {
    console.debug('Error executing method:', error);
  }
}
/**
   * Merge global and brand config for a block and return the merged config object
   * If global config is not available, return brand config and vice versa
   * Replace the variation in the global config with the brand config
   * Merge decorations from both global and brand config, brand config taking precedence
   * @param {Object} globalConfig
   * @param {Object} brandConfig
   * @returns {Object} merged config
   */
function mergeConfig(globalConfig, brandConfig) {
  if (!globalConfig) {
    return brandConfig;
  }
  if (!brandConfig) {
    return globalConfig;
  }
  const mergedConfig = { ...globalConfig };
  mergedConfig.flags = { ...globalConfig.flags, ...brandConfig.flags };
  mergedConfig.variations = [...(globalConfig.variations || []), ...(brandConfig.variations || [])];
  mergedConfig.cacheResetHandlers = [
    ...(globalConfig.cacheResetHandlers || []),
    ...(brandConfig.cacheResetHandlers || []),
  ];
  mergedConfig.decorations = { ...globalConfig.decorations, ...brandConfig.decorations };
  return mergedConfig;
}

export async function loadBlockConfig(blockName) {
  const configCache = window.configCache || {};

  if (!configCache[blockName]) {
    configCache[blockName] = {};
  }

  const [globalConfig, brandConfig] = await Promise.all([
    configCache[blockName].globalConfig || import(`/blocks/${blockName}/block-config.js`).catch((e) => {
      console.debug('Error loading global config:', e);
      return null;
    }),
    configCache[blockName].brandConfig || import(`/blocks/${blockName}/${brandPath}block-config.js`).catch((e) => {
      console.debug('Error loading brand config:', e);
      return null;
    }),
  ]);

  configCache[blockName].globalConfig = globalConfig;
  configCache[blockName].brandConfig = brandConfig;

  return mergeConfig(await globalConfig?.default(), await brandConfig?.default());
}

/**
 * Render a block with the given DOM context
 * Handle global and brand config for the block
 * @param {DOM} ctx
 */
export async function renderBlock(ctx) {
  const { blockName } = ctx.dataset;
  const blockConfig = await loadBlockConfig(blockName);
  // Execute the block's decorations, decorations are optional
  if (blockConfig?.decorations) {
    await executeDecorate(ctx, blockConfig);
  }
  // Execute the block's variations, variations are also optional
  blockConfig?.variations?.forEach(({ variation, module, method }) => {
    const condition = ctx.classList.contains(variation);
    if (condition) {
      if (typeof method === 'function') {
        method(ctx, blockConfig);
      } else if (module) {
        import(`/blocks/${blockName}/${module}`).then((mod) => {
          mod.default(ctx, blockConfig);
        });
      }
    }
  });

  // check if blockConfig has cacheResetHandlers configured
  // and merge them to window.cacheResetHandlers
  if (blockConfig?.cacheResetHandlers) {
    window.cacheResetHandlers = [
      ...(window.cacheResetHandlers || []),
      ...blockConfig.cacheResetHandlers.map((method) => () => method(ctx, blockConfig)),
    ];
  }

  // check if cacheResetStack is not empty and call the functions upon pageshow event
  if (!pageShowEventRegistered && window.cacheResetHandlers?.length) {
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        window.cacheResetHandlers.forEach((fn) => fn());
      }
    });
    pageShowEventRegistered = true;
  }
}

/**
 * Loads a block named 'header' into header
 * @param {Element} header header element
 * @returns {Promise}
 */
async function loadHeader(header) {
  const headerBlock = buildBlock('header', '');
  header.append(headerBlock);
  decorateBlock(headerBlock);
  return loadBlock(headerBlock);
}

/**
   * Loads a block named 'footer' into footer
   * @param footer footer element
   * @returns {Promise}
   */
async function loadFooter(footer) {
  const footerBlock = buildBlock('footer', '');
  footer.append(footerBlock);
  decorateBlock(footerBlock);
  return loadBlock(footerBlock);
}

export {
  loadSections,
  loadSection,
  loadBlock,
  loadHeader,
  loadFooter,
};
