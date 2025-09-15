const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const distPath = path.resolve(__dirname, '../dist');
const outputPath = path.resolve(__dirname, '../package/flowscribe-extension.zip');

// Check if dist folder exists
if (!fs.existsSync(distPath)) {
  console.error('❌ Error: dist folder not found. Please run "npm run build" first.');
  process.exit(1);
}

// Remove existing ZIP file if it exists
if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath);
  console.log('🗑️  Removed existing ZIP file');
}

// Create a new ZIP archive
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Listen for archive events
output.on('close', function() {
  const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log('✅ Chrome extension package created successfully!');
  console.log(`📦 File: flowscribe-extension.zip`);
  console.log(`📏 Size: ${sizeInMB} MB (${archive.pointer()} bytes)`);
  console.log('🚀 Ready for Chrome Web Store upload!');
});

output.on('end', function() {
  console.log('📝 Data has been drained');
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('⚠️  Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  console.error('❌ Archive error:', err);
  throw err;
});

// Pipe archive data to the file
archive.pipe(output);

console.log('📦 Creating Chrome extension package...');
console.log(`📂 Source: ${distPath}`);
console.log(`📁 Output: ${outputPath}`);

// Add all files from dist directory
archive.directory(distPath, false);

// Finalize the archive
archive.finalize();
