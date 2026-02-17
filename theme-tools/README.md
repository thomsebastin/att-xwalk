# Theme Tools

This directory contains tools for managing brands and themes in the multi-brand Franklin project.

## New Path Structure

The tools now support a hierarchical structure with themes organized under a `themes/` directory:

```
eds-multi-brand/
├── blocks/
│   └── cards/
│       ├── cards.css                    # Base file
│       ├── block-config.js              # Base config
│       ├── themes/                      # Themes root directory
│       │   ├── dark/                    # Theme
│       │   │   ├── _cards.css           # Theme override
│       │   │   └── cards.css            # Generated file (base + theme)
│       │   └── light/                   # Theme
│       │       ├── _cards.css           # Theme override
│       │       └── cards.css            # Generated file (base + theme)
│       └── botox/                       # Brand
│           ├── _cards.css               # Brand override
│           ├── cards.css                # Generated file (base + brand)
│           ├── block-config.js          # Brand config
│           └── themes/                  # Themes within brand
│               ├── dark/                # Theme
│               │   ├── _cards.css       # Theme override
│               │   └── cards.css        # Generated file (base + brand + theme)
│               └── light/               # Theme
│                   ├── _cards.css       # Theme override
│                   └── cards.css        # Generated file (base + brand + theme)
└── styles/
    ├── styles.css                       # Base file
    ├── fonts.css                        # Base file
    ├── themes/                          # Themes root directory
    │   ├── dark/                        # Theme
    │   │   ├── _styles.css              # Theme override
    │   │   ├── _fonts.css               # Theme override
    │   │   ├── styles.css               # Generated file
    │   │   └── fonts.css                # Generated file
    │   └── light/                       # Theme
    │       ├── _styles.css              # Theme override
    │       ├── _fonts.css               # Theme override
    │       ├── styles.css               # Generated file
    │       └── fonts.css                # Generated file
    └── botox/                           # Brand
        ├── _styles.css                  # Brand override
        ├── _fonts.css                   # Brand override
        ├── styles.css                   # Generated file
        ├── fonts.css                    # Generated file
        └── themes/                      # Themes within brand
            ├── dark/                    # Theme
            │   ├── _styles.css          # Theme override
            │   ├── _fonts.css           # Theme override
            │   ├── styles.css           # Generated file
            │   └── fonts.css            # Generated file
            └── light/                   # Theme
                ├── _styles.css          # Theme override
                ├── _fonts.css           # Theme override
                ├── styles.css           # Generated file
                └── fonts.css            # Generated file
```

## Tools

### 1. initiate-brand.js

Creates brand and theme folders with appropriate CSS files.

**Usage:**
```bash
node theme-tools/initiate-brand.js <brand|theme> <name>
```

**Examples:**
```bash
node theme-tools/initiate-brand.js brand botox
node theme-tools/initiate-brand.js theme dark
```

**Options:**
- `brand <name>` - Creates a new brand with theme subfolders under `themes/`
- `theme <name>` - Creates a new theme at root level under `themes/`

### 2. remove-brand.js

Removes brand and theme folders.

**Usage:**
```bash
node theme-tools/remove-brand.js
```

**Options:**
- `brand` - Removes a brand and all its theme subfolders
- `theme` - Removes a theme from all locations under `themes/` directories

### 3. generate-css.js

Generates combined CSS files by merging base files with brand and theme overrides.

**Usage:**
```bash
node theme-tools/generate-css.js
```

This tool:
- Reads `brand-config.json` for brands and themes
- Combines base CSS with brand overrides
- Combines base CSS with theme overrides (from `themes/` directories)
- Combines base CSS with both brand and theme overrides
- Creates generated files in the appropriate locations

### 4. plopfile.mjs

Plop generator for creating new blocks, themes, and brands.

**Usage:**
```bash
npx plop component
```

**Options:**
- `Block` - Creates a new block with all brand/theme variations under `themes/` directories
- `Theme` - Creates a new theme
- `Brand` - Creates a new brand

## Configuration

The tools use `brand-config.json` to track brands and themes:

```json
{
  "brands": ["botox", "rinvoq"],
  "themes": ["light", "dark", "high-contrast"]
}
```

## File Naming Convention

- **Base files**: `filename.css` (e.g., `cards.css`)
- **Override files**: `_filename.css` (e.g., `_cards.css`)
- **Generated files**: `filename.css` (e.g., `cards.css` in theme/brand folders)

## Workflow

1. **Create a new brand:**
   ```bash
   node theme-tools/initiate-brand.js brand botox
   ```

2. **Create a new theme:**
   ```bash
   node theme-tools/initiate-brand.js theme dark
   ```

3. **Create a new block:**
   ```bash
   npx plop component
   # Choose "Block" and enter block name
   ```

4. **Generate combined CSS:**
   ```bash
   node theme-tools/generate-css.js
   ```

5. **Remove a brand or theme:**
   ```bash
   node theme-tools/remove-brand.js
   # Choose "brand" or "theme" and enter name
   ```

## CSS Import Order

Generated CSS files combine files in this order:
1. Base file (e.g., `cards.css`)
2. Brand override (e.g., `botox/_cards.css`)
3. Theme override (e.g., `botox/themes/dark/_cards.css`)

This ensures proper CSS cascade where theme overrides brand overrides base.

## Directory Structure Benefits

- **Organized**: All themes are grouped under `themes/` directories
- **Scalable**: Easy to add new themes without cluttering the root
- **Clear Hierarchy**: Brand → Themes → Generated files
- **Consistent**: Same structure at both root and brand levels 