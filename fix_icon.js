const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function fixIcon(inputPath, outputPath) {
  try {
    const metadata = await sharp(inputPath).metadata();
    const width = metadata.width;
    const height = metadata.height;
    
    // Create an SVG with a rounded rectangle matching the image dimensions
    // Using 18% border radius as mentioned in previous changelog
    const r = Math.round(width * 0.18);
    const roundedCorners = Buffer.from(
      `<svg><rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" /></svg>`
    );

    await sharp(inputPath)
      // Remove any existing alpha channel (if the black corners are somehow in a flat image)
      .ensureAlpha()
      // Use the SVG as a mask
      .composite([{
        input: roundedCorners,
        blend: 'dest-in'
      }])
      .toFormat('png')
      .toFile(outputPath);
      
    console.log(`Successfully rounded corners for ${inputPath} and saved to ${outputPath}`);
  } catch (err) {
    console.error('Error fixing icon:', err);
  }
}

async function main() {
  const rootIcon = path.join(__dirname, 'icon.png');
  const docsIcon = path.join(__dirname, 'docs', 'assets', 'icon.png');
  
  // We will process the root icon and save it over itself
  // First, backup
  fs.copyFileSync(rootIcon, rootIcon + '.bak');
  
  await fixIcon(rootIcon + '.bak', rootIcon);
  await fixIcon(rootIcon + '.bak', docsIcon);
  
  // Then we will run electron-builder again!
}

main();
