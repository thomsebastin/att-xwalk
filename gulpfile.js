const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const postcssImport = require('postcss-import');
require('dotenv').config();

// Function to replace @import statements with the content of the imported files
function replaceImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  // use post css to process the content and replace the imports
  postcss([{
    AtRule: {
      'dynamic-import': (node, { result }) => {
        if (
          !node.params
          || typeof node.params !== 'string'
          || node.params.length < 3
        ) {
          return;
        }

        const regex = /@dynamic-import[\s\S]*@import/;

        const isInValidImport = regex.test(node?.parent?.source?.input?.css);

        // @dynamic-import should be decalred below normal @import
        if (isInValidImport) {
          throw node.error(`@import should be declared on top of the file ${filePath}`);
        }

        // move @dynamic-import file to the top of the file
        node.parent.prepend(`@import ${node.params}`);

        node.remove();
      },
    },
    postcssPlugin: 'postcss-dynamic-import',
  },
  postcssImport()]).process(content, { from: filePath }).then((result) => {
    content = result.css;
    const newFilePath = path.join(path.dirname(filePath), path.basename(filePath).replace(/^_/, ''));
    fs.writeFileSync(newFilePath, content, 'utf-8');
    // console.log(`File ${newFilePath} has been updated`);
  }).catch((error) => {
    console.error(`Error processing file ${filePath}:`, error); ``;
  });
}

// Gulp task to process CSS files
function processCSS(filePath) {
  return (done) => {
    replaceImports(filePath);
    if (typeof done === 'function') {
      done();
    }
  };
}

/**
 * Watch for changes in CSS files and process them
 * - If the file is a partial (starts with an underscore), process it
 * - If the file is not a partial it is a main file, look for the partial file in the same directory
 *  and process them
 */
function watchFiles() {
  console.log('Starting to watch CSS files in blocks directory...');
  const watchPatterns = [
    'blocks/**/_*.css',
    'styles/**/_*.css',
    'blocks/*/*.css',
    'styles/*/*.css',
  ];

  // Add templates directory to watch patterns only if it exists
  if (fs.existsSync('templates')) {
    watchPatterns.push('templates/**/_*.css', 'templates/*/*.css');
  }

  gulp.watch(watchPatterns)
    .on('change', (filePath) => {
      console.log('File changed', filePath);
      const fileName = path.basename(filePath);
      if (fileName.startsWith('_')) {
        processCSS(filePath)();
      } else {
        const dir = path.dirname(filePath);
        const directories = fs.readdirSync(dir).filter((file) => fs.statSync(path.join(dir, file)).isDirectory());

        directories.forEach((directory) => {
          const newFilePath = path.join(dir, directory, `_${fileName}`);
          if (fs.existsSync(newFilePath)) {
            processCSS(newFilePath)();
          } else {
            console.log('File does not exist:', newFilePath);
          }
        });
      }
    });
}

function createBrandCSS(done) {
  // add brands in .env file
  // BRANDS=brand1,brand2,brand3
  const brands = process.env.BRANDS ? process.env.BRANDS.split(',') : ['**']; // Default brands if not defined in .env
  // console.log('Creating brand CSS.',  process.env.BRANDS);
  // loop through the files in the path `blocks/**/_*.css` and call processCSS for each file

  const tasks = [];

  brands.forEach((brand) => {
    console.log('Processing brand:', brand);
    const srcPatterns = [
      `blocks/**/${brand}/_*.css`,
      `styles/**/${brand}/_*.css`,
    ];

    // Add templates directory to src patterns only if it exists
    if (fs.existsSync('templates')) {
      srcPatterns.push(`templates/**/${brand}/_*.css`);
    }

    tasks.push(
      new Promise((resolve, reject) => {
        gulp.src(srcPatterns)
          .pipe(gulp.dest((file) => {
            processCSS(file.path)();
            return file.base;
          }))
          .on('end', resolve)
          .on('error', reject);
      }),
    );
  });

  Promise.all(tasks).then(() => done()).catch(done);
}

// Gulp task
gulp.task('default', watchFiles);
gulp.task('createBrandCSS', createBrandCSS);
