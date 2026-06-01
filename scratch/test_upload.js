const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'backend', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

function saveBase64Image(base64) {
  if (!base64 || !base64.startsWith('data:image/')) return base64;
  
  try {
    const matches = base64.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64;
    
    let extension = matches[1].toLowerCase();
    
    if (extension.includes('svg')) {
      extension = 'svg';
    } else if (extension === 'jpeg' || extension === 'pjpeg') {
      extension = 'jpg';
    } else if (extension.includes('icon') || extension.includes('x-icon')) {
      extension = 'ico';
    } else {
      extension = extension.split('+')[0].split('.')[0].split('/')[0];
    }
    
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');
    const filename = `test_img_${Date.now()}.${extension}`;
    const filepath = path.join(uploadsDir, filename);
    
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving image:', err);
    return base64;
  }
}

const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const result = saveBase64Image(testBase64);
console.log('Result:', result);
const files = fs.readdirSync(uploadsDir);
console.log('Files in uploads:', files);
