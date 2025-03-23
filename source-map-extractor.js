const fs = require('fs');
const path = require('path');
const sourceMap = require('source-map');

async function extractSourceFromMap(jsFilePath, mapFilePath, outputDir) {
  console.log(`Processing ${jsFilePath}...`);
  
  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Read the source map file
    const mapFileContent = fs.readFileSync(mapFilePath, 'utf8');
    const consumer = await new sourceMap.SourceMapConsumer(mapFileContent);
    
    // Get all the original sources
    const sources = consumer.sources;
    
    console.log(`Found ${sources.length} original source files`);
    
    // Extract each source
    sources.forEach(source => {
      const content = consumer.sourceContentFor(source);
      if (content) {
        // Create a normalized path for the output
        let outputPath = path.join(outputDir, source);
        
        // Handle relative paths that start with ../
        if (source.startsWith('../')) {
          outputPath = path.join(outputDir, source.replace(/^\.\.\//, ''));
        }
        
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write the content
        fs.writeFileSync(outputPath, content);
        console.log(`Extracted: ${outputPath}`);
      } else {
        console.warn(`No content found for ${source}`);
      }
    });
    
    consumer.destroy();
    console.log(`Completed processing ${jsFilePath}`);
  } catch (error) {
    console.error(`Error processing ${jsFilePath}:`, error);
  }
}

async function main() {
  const assetsDir = path.join(__dirname, 'dist', 'assets');
  const outputDir = path.join(__dirname, 'extracted-sources');
  
  // Get all .js files in the assets directory
  const jsFiles = fs.readdirSync(assetsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(assetsDir, file));
  
  for (const jsFile of jsFiles) {
    const mapFile = `${jsFile}.map`;
    if (fs.existsSync(mapFile)) {
      await extractSourceFromMap(jsFile, mapFile, outputDir);
    } else {
      console.warn(`No source map found for ${jsFile}`);
    }
  }
  
  console.log('Extraction complete. Check the extracted-sources directory.');
}

main().catch(error => {
  console.error('Error in main process:', error);
}); 