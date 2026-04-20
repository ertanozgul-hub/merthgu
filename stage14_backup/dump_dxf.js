const fs = require('fs');
let fileText = fs.readFileSync('test1.dxf', 'utf8');
let texts = [];
let lines = fileText.split(/\r?\n/);
let inText = false;
let currentText = {};

for(let i=0; i < lines.length; i++) {
    let code = lines[i].trim();
    let value = (lines[i+1] || '').trim();
    
    if (code === '0' && (value === 'TEXT' || value === 'MTEXT' || value === 'AcDbText' || value === 'AcDbMText')) {
        if (inText && currentText.text && currentText.y !== undefined && currentText.x !== undefined) {
            texts.push(currentText);
        }
        inText = true;
        currentText = {};
        i++;
    } else if (code === '0') {
        if (inText && currentText.text && currentText.y !== undefined && currentText.x !== undefined) {
            texts.push(currentText);
        }
        inText = false;
    } else if (inText) {
        if (code === '10') currentText.x = parseFloat(value);
        else if (code === '20') currentText.y = parseFloat(value);
        else if (code === '1') {
            let cleanValue = value.replace(/\\P/g, ' ').replace(/\\[^{]*?{([^}]*?)}/g, '$1').replace(/\\[A-Za-z0-9~]+;/g, '');
            currentText.text = cleanValue;
        }
        i++;
    }
}
fs.writeFileSync('dxf_dump.json', JSON.stringify(texts, null, 2));
console.log('Dumped', texts.length, 'texts');
