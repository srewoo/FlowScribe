const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Check for --all flag to package all browsers
const packageAll = process.argv.includes('--all');

// Browser configurations
const browsers = packageAll
  ? ['chrome', 'firefox', 'edge']
  : [process.env.BROWSER || 'chrome'];

// Ensure package directory exists
const packageDir = path.resolve(__dirname, '../package');
if (!fs.existsSync(packageDir)) {
  fs.mkdirSync(packageDir, { recursive: true });
  console.log('📁 Created package directory');
}

/**
 * Create a ZIP archive for a specific browser
 */
function createZip(browser) {
  return new Promise((resolve, reject) => {
    const distPath = path.resolve(__dirname, `../dist-${browser}`);
    const outputPath = path.resolve(__dirname, `../package/flowscribe-${browser}.zip`);

    // Check if dist folder exists
    if (!fs.existsSync(distPath)) {
      console.error(`❌ Error: dist-${browser} folder not found. Please run "npm run build:${browser}" first.`);
      reject(new Error(`dist-${browser} not found`));
      return;
    }

    // Remove existing ZIP file if it exists
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.log(`🗑️  Removed existing ${browser} ZIP file`);
    }

    // Create a new ZIP archive
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Listen for archive events
    output.on('close', function() {
      const sizeInKB = (archive.pointer() / 1024).toFixed(2);
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ ${browser.toUpperCase()} extension package created!`);
      console.log(`   📦 File: flowscribe-${browser}.zip`);
      console.log(`   📏 Size: ${sizeInKB} KB (${sizeInMB} MB)`);
      resolve();
    });

    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.warn('⚠️  Warning:', err);
      } else {
        reject(err);
      }
    });

    archive.on('error', function(err) {
      console.error(`❌ Archive error for ${browser}:`, err);
      reject(err);
    });

    // Pipe archive data to the file
    archive.pipe(output);

    console.log(`\n📦 Creating ${browser.toUpperCase()} extension package...`);
    console.log(`   📂 Source: dist-${browser}/`);
    console.log(`   📁 Output: package/flowscribe-${browser}.zip`);

    // Add all files from dist directory
    archive.directory(distPath, false);

    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Main function to package all browsers
 */
async function main() {
  console.log('🚀 FlowScribe Extension Packager');
  console.log('================================\n');

  if (packageAll) {
    console.log('📋 Packaging for all browsers: Chrome, Firefox, Edge\n');
  }

  try {
    for (const browser of browsers) {
      await createZip(browser);
    }

    console.log('\n================================');
    console.log('✅ All packages created successfully!');
    console.log('================================\n');

    console.log('📦 Package files ready in /package folder:');
    browsers.forEach(browser => {
      const zipPath = path.resolve(__dirname, `../package/flowscribe-${browser}.zip`);
      if (fs.existsSync(zipPath)) {
        const stats = fs.statSync(zipPath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        console.log(`   • flowscribe-${browser}.zip (${sizeKB} KB)`);
      }
    });

    console.log('\n🚀 Ready for store uploads:');
    console.log('   • Chrome Web Store: flowscribe-chrome.zip');
    console.log('   • Firefox Add-ons: flowscribe-firefox.zip');
    console.log('   • Edge Add-ons: flowscribe-edge.zip');

  } catch (error) {
    console.error('\n❌ Packaging failed:', error.message);
    process.exit(1);
  }
}

main();
