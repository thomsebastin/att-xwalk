// import { beforeDecorate, decorateBlock, afterDecorate } from '../{{name}}.js';

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
}
