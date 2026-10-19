// Script to update the ChannelManagement.tsx file to handle array checks
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the file
const filePath = path.join(__dirname, 'client', 'src', 'pages', 'ChannelManagement.tsx');

// Read the file
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err}`);
    return;
  }

  // Replace all instances of channels?.map with Array.isArray check
  const updatedContent = data.replace(
    /channels\?\.(map\(\(channel\) =>\s*\()/g, 
    'Array.isArray(channels) && channels.$1'
  );

  // Write the updated content back to the file
  fs.writeFile(filePath, updatedContent, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing file: ${err}`);
      return;
    }
    console.log('ChannelManagement.tsx updated successfully');
  });
});