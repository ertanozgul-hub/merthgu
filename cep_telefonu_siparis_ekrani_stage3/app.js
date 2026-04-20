// App Global State
let currentOrderData = {
    materials: [],
    images: [],
    stepBuffer: null,
    files: {
        excel: false,
        dxf: false,
        step: false,
        img: false
    }
};

// UI Elements (if on order page)
const isOrderPage = document.getElementById('materialsBody') !== null;
const isDashboard = document.getElementById('ordersGrid') !== null;

// IndexedDB for Heavy Files (STEP ArrayBuffer)
const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('MertFilesDB', 1);
    req.onupgradeneeded = e => { e.target.result.createObjectStore('files'); };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e);
});

async function saveFileDB(key, buffer) {
    const db = await dbPromise;
    return new Promise(r => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(buffer, key);
        tx.oncomplete = () => r();
    });
}

async function loadFileDB(key) {
    const db = await dbPromise;
    return new Promise(r => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(key);
        req.onsuccess = () => r(req.result);
        req.onerror = () => r(null);
    });
}

if (isOrderPage) {
    document.addEventListener('DOMContentLoaded', () => {
        calculateHours(); // Initialize hours based on default selection
        setupCounter();
        generateLabelNo();
        loadOrderDetails();
        
        // Stage Click Toggles
        document.querySelectorAll('.hg-item').forEach((item, index) => {
            item.addEventListener('click', (e) => {
                if(e.target.tagName !== 'INPUT') {
                    item.classList.toggle('completed');
                    
                    // Auto-fill delivery date when Montaj (Index 3) is completed
                    if (index === 3 && item.classList.contains('completed')) {
                        const now = new Date();
                        const yyyy = now.getFullYear();
                        const mm = String(now.getMonth() + 1).padStart(2, '0');
                        const dd = String(now.getDate()).padStart(2, '0');
                        
                        const deliveryEl = document.getElementById('deliveryDate');
                        if(deliveryEl) {
                            deliveryEl.value = `${yyyy}-${mm}-${dd}`;
                            deliveryEl.style.transition = 'box-shadow 0.3s, border-color 0.3s';
                            deliveryEl.style.borderColor = 'var(--c-green)';
                            deliveryEl.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.5)';
                            setTimeout(() => {
                                deliveryEl.style.borderColor = '';
                                deliveryEl.style.boxShadow = '';
                            }, 1000);
                        }
                    }
                }
            });
        });
    });
}

function getISOWeek(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

if (isDashboard) {
    document.addEventListener('DOMContentLoaded', () => {
        const weeksContainer = document.getElementById('dynamicWeeksContainer');
        if (weeksContainer) {
            const currentWeek = getISOWeek(new Date());
            let weekCaps = JSON.parse(localStorage.getItem('hg_weekCaps') || '{}');
            let html = '';
            for(let i=0; i<5; i++) {
                let w = currentWeek + i;
                let cap = weekCaps[w] !== undefined ? weekCaps[w] : 25;
                html += `
                <label style="font-size:12px; margin-bottom:2px; display:flex; justify-content:space-between; align-items:center; opacity:0; transform:translateX(-10px); animation:slideRight 0.3s forwards ${i*0.05}s">
                    <div style="display:flex; gap:4px; align-items:center;"><input type="checkbox" class="filter-week" value="${w}"> -${w}. Hafta</div>
                    <input type="number" class="week-cap-input" data-week="${w}" value="${cap}" style="width:36px; padding:2px; padding-left:4px; border:1px solid rgba(255,255,255,0.2); border-radius:3px; background:rgba(0,0,0,0.5); color:white; font-size:10px; font-weight:bold;" title="Haftalık Montaj Kapasitesi (Saat)">
                </label>`;
            }
            weeksContainer.innerHTML = html;

            document.querySelectorAll('.week-cap-input').forEach(inp => {
                inp.addEventListener('change', (e) => {
                    let w = e.target.dataset.week;
                    let v = parseInt(e.target.value) || 0;
                    let caps = JSON.parse(localStorage.getItem('hg_weekCaps') || '{}');
                    caps[w] = v;
                    localStorage.setItem('hg_weekCaps', JSON.stringify(caps));
                });
            });
        }

        renderDashboard();
        
        document.querySelectorAll('.filter-week').forEach(cb => {
            cb.addEventListener('change', renderDashboard);
        });
        
        document.querySelectorAll('.filter-status').forEach(cb => {
            cb.addEventListener('change', () => {
                const isAct = document.querySelector('input[value="active"]')?.checked;
                const dynamicCont = document.getElementById('dynamicWeeksContainer');
                if(dynamicCont) {
                    dynamicCont.style.display = isAct ? 'flex' : 'none';
                }
                renderDashboard();
            });
        });

        document.querySelectorAll('.filter-stage, .filter-branch, .filter-status').forEach(cb => {
            cb.addEventListener('change', renderDashboard);
        });
    });
}

/* ============================
   1. Drag & Drop Handlers
============================ */
function allowDrop(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('dragover');
}

document.querySelectorAll('.drop-zone').forEach(zone => {
    zone.addEventListener('dragleave', (e) => {
        e.currentTarget.classList.remove('dragover');
    });
});

function handleDrop(ev, type) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('dragover');
    
    if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
        const file = ev.dataTransfer.files[0];
        
        // Update UI
        const statusEl = ev.currentTarget.querySelector('.status');
        statusEl.classList.remove('placeholder');
        statusEl.classList.add('loaded');
        statusEl.innerHTML = ''; // managed by CSS ::before content
        
        currentOrderData.files[type] = true;
        updateFileCount();

        // Process File based on Type
        if (type === 'excel') {
            parseExcel(file);
        } else if (type === 'dxf') {
            parseDXF(file);
        } else if (type === 'step') {
            file.arrayBuffer().then(buf => {
                currentOrderData.stepBuffer = buf;
                document.getElementById('btn3D')?.click();
            });
        } else if (type === 'img') {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 1200;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) { height *= maxDim / width; width = maxDim; }
                        else { width *= maxDim / height; height = maxDim; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressed = canvas.toDataURL('image/jpeg', 0.8);
                    
                    if(!currentOrderData.images) currentOrderData.images = [];
                    currentOrderData.images.push(compressed);
                    
                    // Display it!
                    document.getElementById('btnIMG')?.click();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
}

function handleFileSelect(input, type) {
    if (input.files && input.files.length > 0) {
        const file = input.files[0];
        
        let zoneId = 'drop' + type.toUpperCase();
        if(type==='excel') zoneId = 'dropExcel';
        else if(type==='img') zoneId = 'dropIMG';

        const zoneElement = document.getElementById(zoneId);
        if(zoneElement) {
            const statusEl = zoneElement.querySelector('.status');
            if(statusEl) {
                statusEl.classList.remove('placeholder');
                statusEl.classList.add('loaded');
                statusEl.innerHTML = '';
            }
        }
        
        currentOrderData.files[type] = true;
        updateFileCount();

        if (type === 'excel') {
            parseExcel(file);
        } else if (type === 'dxf') {
            parseDXF(file);
        } else if (type === 'step') {
            file.arrayBuffer().then(buf => {
                currentOrderData.stepBuffer = buf;
                document.getElementById('btn3D')?.click();
            });
        } else if (type === 'img') {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 1200;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) { height *= maxDim / width; width = maxDim; }
                        else { width *= maxDim / height; height = maxDim; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressed = canvas.toDataURL('image/jpeg', 0.8);
                    
                    if(!currentOrderData.images) currentOrderData.images = [];
                    currentOrderData.images.push(compressed);
                    
                    document.getElementById('btnIMG')?.click();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
}

function updateFileCount() {
    let count = Object.values(currentOrderData.files).filter(v => v).length;
    document.getElementById('fileCount').innerText = `${count} dosya yüklü`;
}

/* ============================
   2. Parsers (Excel / DXF)
============================ */
function parseExcel(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        
        // Assuming first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON array of arrays (treating as vertical key-value mapping)
        const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});
        
        // The screenshot shows Key on Col A, Value on Col B or further due to merged cells
        let mappedData = {};
        json.forEach(row => {
            if (row.length >= 2 && row[0]) {
                let rawKey = row[0].toString().trim().replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
                // Strip all spaces to prevent "Sipariş  Tarih" vs "Sipariş Tarih" mismatch
                let key = rawKey.replace(/\s+/g, '');
                
                // If there are merged cells, the value might not be at index 1.
                // We scan from index 1 to the end to find the first non-empty value.
                let value = null;
                for(let i = 1; i < row.length; i++) {
                    let cellVal = row[i];
                    if(cellVal !== undefined && cellVal !== null && cellVal.toString().trim() !== "") {
                        value = cellVal;
                        break;
                    }
                }
                
                if (value !== null) {
                    mappedData[key] = value.toString().trim();
                }
            }
        });

        console.log("Parsed Excel Data (Spaceless Keys):", mappedData);

        // Map to Inputs with spaceless keywords
        const extract = (...searchKeys) => {
            for (let sk of searchKeys) {
                // sk has no spaces
                let found = Object.keys(mappedData).find(k => k.includes(sk));
                if (found) return mappedData[found];
            }
            return '';
        };

        const setValue = (id, val) => { 
            if(document.getElementById(id) && val) {
                document.getElementById(id).value = val;
            } 
        };

        setValue('customerName', extract('müşteri', 'baykar', 'aselsan')); // broad fallbacks
        setValue('projectName', extract('projeadı'));
        setValue('managerName', extract('sorumlu'));
        setValue('projectCode', extract('pcd', 'mertkodu', 'kod'));
        setValue('sysPressure', extract('basınc', 'basınç', 'basinc'));
        
        // Date Fixer
        setValue('deliveryDate', fixDate(extract('teslim')));
        setValue('orderDate', fixDate(extract('sipariştarih')));
        
        // Sipariş No (Header Update)
        let orderNoText = extract('siparişno');
        if (orderNoText && document.getElementById('orderLabel')) {
            // Strip out any '( S1 )' or similar text inside parentheses
            let cleanOrderNo = orderNoText.toString().replace(/\s*\(.*?\)\s*/g, '').trim();
            document.getElementById('orderLabel').innerText = `Sipariş (${cleanOrderNo})`;
            document.getElementById('orderLabel').dataset.orderNo = cleanOrderNo;
        }
    };
    reader.readAsArrayBuffer(file);
}

function fixDate(dateValue) {
    if (!dateValue) return '';
    
    // 1. Excel Serial Number Logic (e.g. 46135 for 24/04/2026)
    if (!isNaN(dateValue) && typeof dateValue === 'number' || (!isNaN(parseFloat(dateValue)) && dateValue > 30000 && dateValue < 60000)) {
        const start = new Date(1899, 11, 30); // Excel epoch
        const date = new Date(start.getTime() + parseFloat(dateValue) * 86400000);
        let y = date.getFullYear();
        let m = String(date.getMonth() + 1).padStart(2, '0');
        let d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // 2. Aggressive Regex Matcher for anything resembling a date (dd.mm.yyyy, mm/dd/yy, etc)
    let str = dateValue.toString().trim();
    let match = str.match(/(\d{1,2})[^\d]+(\d{1,2})[^\d]+(\d{2,4})/);
    
    if (match) {
        let num1 = parseInt(match[1]); // e.g. 27
        let num2 = parseInt(match[2]); // e.g. 03
        let num3 = parseInt(match[3]); // e.g. 2026
        
        let y = num3;
        if (y < 100) y = 2000 + y; // handle YY
        
        let d, m;
        // Determine which is Day and which is Month
        if (num1 > 12) { 
            d = num1; m = num2; // 27/03/2026
        } else if (num2 > 12) { 
            d = num2; m = num1; // 03/27/2026
        } else {
            // Both <= 12. Assume DD/MM/YYYY for Turkish standard
            d = num1; m = num2; 
        }
        
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    
    // 3. Absolute Fallback to Native JS Date parsing
    let dStr = new Date(dateValue);
    if (!isNaN(dStr.getTime())) {
        let y = dStr.getFullYear();
        let m = String(dStr.getMonth() + 1).padStart(2, '0');
        let day = String(dStr.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    
    return '';
}

function parseDXF(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const fileText = e.target.result;
        
        // Cache for 2D Canvas CAD rendering
        window.globalDxfString = fileText;
        
        try {
            // 1. Foolproof Native DXF Text Extractor
            let texts = [];
            let lines = fileText.split(/\r?\n/);
            let inText = false;
            let currentText = {};
            
            for(let i=0; i < lines.length; i++) {
                let code = lines[i].trim();
                let value = (lines[i+1] || '').trim();
                
                if (code === '0') {
                    if (inText && currentText.text && currentText.y !== undefined && currentText.x !== undefined) {
                        texts.push(currentText);
                    }
                    if (value === 'TEXT' || value === 'MTEXT' || value === 'AcDbText' || value === 'AcDbMText' || value === 'ATTDEF' || value === 'ATTRIB') {
                        inText = true;
                        currentText = {};
                    } else {
                        inText = false;
                    }
                    i++;
                } else if (inText) {
                    if (code === '10') currentText.x = parseFloat(value);
                    else if (code === '20') currentText.y = parseFloat(value);
                    else if (code === '1') {
                        // Clean MText formatting (e.g., \fHelvetica|b0...;)
                        let cleanValue = value.replace(/\\P/g, ' ')
                                              .replace(/\\[A-Za-z0-9~]+\|[b|i|c|p]\d[^;]+;/g, '') // remove \fHelvetica|b0|i0|c0|p34;
                                              .replace(/\\[A-Za-z0-9~]+;/g, '')
                                              .replace(/\\[^{]*?{([^}]*?)}/g, '$1')
                                              .replace(/^{|}$/g, ''); 
                        currentText.text = cleanValue.trim();
                    }
                    i++;
                }
            }
            if (inText && currentText.text && currentText.y !== undefined && currentText.x !== undefined) texts.push(currentText);



            // Step 1: Find the exact Master Anchor: "S. No:" text
            let headerAnchorX = null;
            let headerAnchorY = null;
            texts.forEach(t => {
                if (t.text && t.text.trim().toUpperCase() === 'S. NO:') {
                    headerAnchorX = t.x;
                    headerAnchorY = t.y;
                }
            });

            // Step 2: Slice the drawing space!
            let filteredTexts = texts;
            let headerRow = [];
            if (headerAnchorX !== null && headerAnchorY !== null) {
                // Get the exact header row items
                headerRow = texts.filter(t => Math.abs(t.y - headerAnchorY) < 1.0);
                
                // Keep ONLY texts that are located ABOVE the "S. No:" row!
                // CRUCIAL: The BOM table is vertically stacked on the RIGHT side of the paper.
                // The S. No (headerAnchorX) is the absolute LEFT boundary. 
                // Any text to the left (t.x < headerAnchorX - 25) belongs to the schematic diagram!
                filteredTexts = texts.filter(t => t.y > headerAnchorY && t.x >= headerAnchorX - 25 && t.x < headerAnchorX + 2000);
            } else {
                let adetX = null;
                texts.forEach(t => { if (t.text && t.text.trim().toUpperCase() === 'ADET') adetX = t.x; });
                if (adetX !== null) filteredTexts = texts.filter(t => Math.abs(t.x - adetX) < 1500);
            }

            // Identify Column X-Coordinates mathematically from the Header
            let colSNoX = null;
            let colAdetX = null;
            let colNameX = null;
            
            headerRow.forEach(h => {
                let upper = h.text.trim().toUpperCase();
                if (upper.includes('NO:')) colSNoX = h.x;
                if (upper === 'ADET') colAdetX = h.x;
                if (upper.includes('MALZEME AÇIKLAMASI') || upper.includes('MERT KODU')) colNameX = h.x;
            });
            
            // If header text was slightly different, just sort header row and guess
            if (headerRow.length >= 3) {
                headerRow.sort((a,b) => a.x - b.x);
                if (colSNoX === null) colSNoX = headerRow[0].x;
                if (colAdetX === null) colAdetX = headerRow[1].x;
                if (colNameX === null) colNameX = headerRow[headerRow.length - 1].x;
            }

            // 3. Y-Clustering with 1.0 Tolerance
            filteredTexts.sort((a, b) => b.y - a.y); // top to bottom
            
            let allRows = [];
            let currentRow = [];
            let currentY = null;
            
            filteredTexts.forEach(t => {
                if (currentY === null) {
                    currentY = t.y;
                    currentRow.push(t);
                } else {
                    if (Math.abs(t.y - currentY) < 1.0) {
                        currentRow.push(t);
                    } else {
                        allRows.push(currentRow);
                        currentRow = [t];
                        currentY = t.y;
                    }
                }
            });
            if (currentRow.length > 0) allRows.push(currentRow);

            // 4. Extract Data base on Strict Visual/Array Logic requested by user!
            let parsedMaterials = [];
            allRows.forEach(r => {
                let row = r.sort((a,b) => a.x - b.x); 
                if(row.length >= 2) {
                    let rowY = row[0].y; // Save the physical Y coordinate of this row
                    
                    // 1. POZ (S. NO): En soldaki ilk eleman
                    let poz = row[0].text;
                    
                    // 2. MALZEME ADI: En sağdaki son eleman
                    let name = row[row.length - 1].text;
                    
                    // 3. ADET: Poz'dan sonra sağ tarafta gelen İLK RAKAM (Yazıları alma). 
                    // Yani aradaki elemanlarda rakam arayacağız.
                    let qty = "1"; // Default
                    for (let i = 1; i < row.length - 1; i++) {
                        let cellText = row[i].text;
                        // Eğer metnin içinde en az 1 rakam varsa
                        if (/\d/.test(cellText)) {
                            // Sadece rakam kısımlarını çek (Yazıları sil)
                            let onlyDigits = cellText.replace(/\D/g, ''); 
                            if (onlyDigits.length > 0) {
                                qty = onlyDigits;
                                break; // İlk rakamı bulduğumuzda qty ayarlandı, aramayı bırak.
                            }
                        }
                    }

                    // Keep the literal string for Poz to preserve "6.1", "03", "B1" vs.
                    // Empty or header-junk filtering
                    let cleanIndex = poz.toString().trim();
                    let upperIndex = cleanIndex.toUpperCase();
                    if(cleanIndex !== '' && cleanIndex.length < 10 && !upperIndex.includes("NO:") && !upperIndex.includes("POZ")) {
                        parsedMaterials.push({ 
                            yCoord: rowY,     // Kept strictly for geometric sorting
                            index: cleanIndex, 
                            qty: qty, 
                            name: name 
                        });
                    }
                }
            });

            // 5. Geographic Sort: "İlk satır hep S. No yazısının üstündeki satır"
            // The S.No header is at the bottom. As we go up the table, Y coordinates INCREASE.
            // So we sort by Y coordinate ASCENDING (bottom to top).
            parsedMaterials.sort((a,b) => a.yCoord - b.yCoord);

            // 6. Kesin Başlangıç Filtresi: Listenin kesinlikle POZ = 1 ile başlamasını sağla
            // Araya kaynamış boşluk veya alt-başlık satırlarını kırp (Kullanıcı talebi)
            let startIndex = parsedMaterials.findIndex(m => m.index.toString().trim() === "1" || parseInt(m.index) === 1);
            if (startIndex > 0) {
                parsedMaterials = parsedMaterials.slice(startIndex);
            } else if (startIndex === -1 && parsedMaterials.length > 0) {
                // Eğer "1" yazan poz hiç yoksa ama liste doluysa, mecburen en baştan itibaren temizleyerek ver (Nadir durumlar için)
                let firstValidIdx = parsedMaterials.findIndex(m => !isNaN(parseInt(m.index)));
                if(firstValidIdx > 0) parsedMaterials = parsedMaterials.slice(firstValidIdx);
            }

            // Put in UI Table
            renderMaterials(parsedMaterials);
            
            document.getElementById('viewerContainer').innerHTML = `<div class="empty-state" style="color:var(--c-green)"><i class="fas fa-check-circle"></i> DXF Ayıştırıldı. Tablo çıkartıldı.</div>`;
            
        } catch(err) {
            console.error("DXF Parse Error:", err);
            alert("DXF Okunamadı. Beklenmeyen bir hata oluştu.");
        }
    };
    reader.readAsText(file);
}

function renderMaterials(materials) {
   const tbody = document.getElementById('materialsBody');
   if(!tbody) return;
   tbody.innerHTML = '';
   materials.forEach(m => {
       const tr = document.createElement('tr');
       if (m.missing) {
           tr.classList.add('missing');
       }
       tr.innerHTML = `
           <td>${m.index}</td>
           <td>${m.qty} Adet</td>
           <td>${m.name}</td>
       `;
       // Admin click missing toggle
       tr.addEventListener('click', () => {
           tr.classList.toggle('missing');
           updateMissingCount();
       });
       tbody.appendChild(tr);
   });
   updateMissingCount();
}

function updateMissingCount() {
    let count = document.querySelectorAll('.modern-table tr.missing').length;
    let badge = document.querySelector('.badge.red');
    badge.innerText = `${count} Eksik`;
    if(count > 0) {
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

let myOCCT = null;

async function init3DViewer() {
    if (!currentOrderData.stepBuffer) {
        alert("Lütfen önce bir STEP dosyası yükleyin.");
        return;
    }
    
    document.getElementById('btn2D')?.classList.remove('active');
    document.getElementById('btnIMG')?.classList.remove('active');
    document.getElementById('btn3D')?.classList.add('active');

    const container = document.getElementById('viewerContainer');
    container.innerHTML = `
        <div id="loading3D" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 44px; margin-bottom: 16px; color:var(--primary);"></i>
            <p>STEP Modeli Dönüştürülüyor...</p>
        </div>
    `;
    
    // Defer for UI update
    setTimeout(async () => {
        try {
            if (!myOCCT) {
                myOCCT = await occtimportjs({
                    locateFile: (file) => `https://unpkg.com/occt-import-js@0.0.22/dist/${file}`
                });
            }
            
            let result = myOCCT.ReadStepFile(new Uint8Array(currentOrderData.stepBuffer), null);
            
            container.innerHTML = `
                <div id="threeContainer" style="width:100%; height:100%; position:relative;"></div>
                <button id="btnFullscreenSTEP" class="btn-fullscreen" title="Tam Ekran" style="z-index:10;"><i class="fas fa-expand"></i></button>
            `;
            
            const threeContainer = document.getElementById('threeContainer');
            
            const scene = new THREE.Scene();
            scene.background = new THREE.Color('#0f121a');
            
            // Add lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(100, 200, 50);
            scene.add(dirLight);
            
            const root = new THREE.Object3D();
            if(result.meshes.length > 0) {
               for (let resultMesh of result.meshes) {
                   let geometry = new THREE.BufferGeometry();
                   geometry.setAttribute('position', new THREE.Float32BufferAttribute(resultMesh.attributes.position.array, 3));
                   if (resultMesh.attributes.normal) {
                       geometry.setAttribute('normal', new THREE.Float32BufferAttribute(resultMesh.attributes.normal.array, 3));
                   } else {
                       geometry.computeVertexNormals();
                   }
                   let index = Uint32Array.from(resultMesh.index.array);
                   geometry.setIndex(new THREE.BufferAttribute(index, 1));
                   
                   let color = new THREE.Color();
                   if(resultMesh.color) {
                       color.setRGB(resultMesh.color[0], resultMesh.color[1], resultMesh.color[2]);
                   } else {
                       color.setHex(0xa0a0a0);
                   }
                   
                   let material = new THREE.MeshPhongMaterial({ color: color, side: THREE.DoubleSide });
                   let mesh = new THREE.Mesh(geometry, material);
                   root.add(mesh);
               }
            } else {
               container.innerHTML = '<div class="empty-state">Bu STEP dosyasında geçerli katı model kalıbı (Mesh) bulunamadı.</div>';
               return;
            }
            
            // Center and scale model bounding box automatically
            const box = new THREE.Box3().setFromObject(root);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            // Normalize scale to fit nicely into our 100x100x100 imaginary cube
            root.scale.setScalar(100 / maxDim);
            root.position.sub(center.multiplyScalar(100 / maxDim));
            scene.add(root);
            
            const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
            camera.position.set(100, 100, 150);
            
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(container.clientWidth, container.clientHeight);
            threeContainer.appendChild(renderer.domElement);
            
            const controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            
            function animate() {
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }
            animate();
            
             const resizeObserver = new ResizeObserver(() => {
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            });
            resizeObserver.observe(container);

            document.getElementById('btnFullscreenSTEP')?.addEventListener('click', () => {
                container.classList.toggle('fullscreen');
                const icon = document.querySelector('#btnFullscreenSTEP i');
                if(container.classList.contains('fullscreen')) {
                    icon.classList.remove('fa-expand'); icon.classList.add('fa-compress');
                } else {
                    icon.classList.remove('fa-compress'); icon.classList.add('fa-expand');
                }
                setTimeout(() => {
                    camera.aspect = container.clientWidth / container.clientHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(container.clientWidth, container.clientHeight);
                }, 50);
            });

        } catch(err) {
            console.error("STEP Render Error:", err);
            container.innerHTML = `<div class="empty-state">STEP okunamadı: ${err.message}</div>`;
        }
    }, 100);
}

/* ============================
   3. Business Logic
============================ */
function calculateHours() {
    const vol = document.getElementById('volumeSelect').value;
    let hD = 0, hW = 0, hP = 0, hA = 0;
    
    switch(vol) {
        case '0-50':    hD=2; hW=2; hP=2; hA=6; break;
        case '50-100':  hD=4; hW=4; hP=4; hA=10; break;
        case '100-250': hD=8; hW=6; hP=6; hA=16; break;
        case '250-500': hD=12; hW=8; hP=8; hA=24; break;
        case '500-1000':hD=24; hW=24; hP=12; hA=40; break;
    }

    document.getElementById('h-design').value = hD;
    document.getElementById('h-welding').value = hW;
    document.getElementById('h-paint').value = hP;
    document.getElementById('h-assembly').value = hA;
}

function setupCounter() {
    document.getElementById('qtyMinus').onclick = () => {
        let v = parseInt(document.getElementById('orderQty').value);
        if(v > 1) {
            document.getElementById('orderQty').value = v - 1;
            generateLabelNo();
        }
    }
    document.getElementById('qtyPlus').onclick = () => {
        let v = parseInt(document.getElementById('orderQty').value);
        document.getElementById('orderQty').value = v + 1;
        generateLabelNo();
    }
    document.getElementById('orderQty').addEventListener('change', generateLabelNo);
}

function generateLabelNo() {
    let year = new Date().getFullYear().toString().substr(-2);
    let lastNo = parseInt(localStorage.getItem('lastOrderNo')) || 0;
    let startNo = lastNo + 1;
    
    let qty = parseInt(document.getElementById('orderQty').value) || 1;
    let endNo = startNo + qty - 1;
    
    let labelText = `Etiket No: ${year}-${startNo}`;
    if (qty > 1) {
        labelText = `Etiket No: ${year}-${startNo} ... ${year}-${endNo}`;
    }
    
    let tabEl = document.getElementById('labelNoTab');
    if(tabEl) {
        tabEl.innerText = labelText;
    }
}

function loadOrderDetails() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    if (!orderId) return;

    let orders = JSON.parse(localStorage.getItem('hg_orders') || '[]');
    let order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Hydrate form fields
    const setV = (id, val) => { if(document.getElementById(id) && val) document.getElementById(id).value = val; };
    setV('customerName', order.customer);
    setV('projectName', order.project);
    setV('branchSelect', order.branch);
    setV('orderQty', order.qty);
    setV('deliveryDate', order.deliveryDate);
    setV('orderDate', order.orderDate);
    setV('managerName', order.manager);
    setV('projectCode', order.code);
    setV('sysPressure', order.pressure);
    
    if(document.getElementById('orderLabel')) {
        let displayNo = order.orderNo || order.id;
        document.getElementById('orderLabel').innerText = `Sipariş (${displayNo})`;
        document.getElementById('orderLabel').dataset.orderNo = order.orderNo || '';
    }

    // Restore materials
    if (order.materials && order.materials.length > 0) {
        currentOrderData.materials = order.materials;
        renderMaterials(order.materials);
    }
    
    // Restore images gallery
    if (order.images && order.images.length > 0) {
        currentOrderData.images = order.images;
        currentOrderData.files.img = true;
        updateFileCount();
        const dropImg = document.getElementById('dropIMG')?.querySelector('.status');
        if (dropImg) {
            dropImg.classList.remove('placeholder');
            dropImg.classList.add('loaded');
            dropImg.innerHTML = '';
        }
    }

    // Restore STEP buffer from IndexedDB
    loadFileDB(orderId + '_step').then(buf => {
        if(buf) {
            currentOrderData.stepBuffer = buf;
            currentOrderData.files.step = true;
            updateFileCount();
            const dropStep = document.getElementById('dropSTEP')?.querySelector('.status');
            if(dropStep) {
                dropStep.classList.remove('placeholder');
                dropStep.classList.add('loaded');
                dropStep.innerHTML = '';
            }
        }
    });

    if (order.completedStages) {
        document.querySelectorAll('.hg-item').forEach((item, index) => {
            if(order.completedStages[index]) item.classList.add('completed');
        });
    }
}

document.getElementById('saveOrderBtn')?.addEventListener('click', () => {
    let year = new Date().getFullYear().toString().substr(-2);
    let lastNo = parseInt(localStorage.getItem('lastOrderNo')) || 0;
    
    let qty = parseInt(document.getElementById('orderQty').value || 1);
    
    // Check if we are updating an existing order
    const params = new URLSearchParams(window.location.search);
    let orderId = params.get('id') || `${year}-${lastNo + 1}`;
    
    // Only increment label if it's a completely NEW order
    if (!params.get('id')) {
        let newNo = lastNo + qty;
        localStorage.setItem('lastOrderNo', newNo);
    }

    // Scrape Materials Table
    let materialsList = [];
    let trs = document.querySelectorAll('#materialsBody tr');
    if(trs) {
        trs.forEach(tr => {
            let index = tr.children[0]?.innerText || '';
            let q = (tr.children[1]?.innerText || '').replace(' Adet', '').trim();
            let name = tr.children[2]?.innerText || '';
            let missing = tr.classList.contains('missing');
            materialsList.push({ index: index, qty: q, name: name, missing: missing });
        });
    }
    let totalHours = 0;
    let completedHours = 0;
    const completedStagesArray = [];
    
    document.querySelectorAll('.hg-item').forEach(item => {
        let h = parseFloat(item.querySelector('input')?.value) || 0;
        let isCompleted = item.classList.contains('completed');
        
        totalHours += h;
        if(isCompleted) completedHours += h;
        completedStagesArray.push(isCompleted);
    });
    
    let actualProgress = 10;
    if (totalHours > 0 && completedHours > 0) {
        actualProgress = Math.round((completedHours / totalHours) * 100);
    }

    // Collect all data
    let order = {
        id: orderId,
        orderNo: document.getElementById('orderLabel')?.dataset?.orderNo || '',
        customer: document.getElementById('customerName').value || 'Yeni Müşteri',
        project: document.getElementById('projectName').value || 'Bilinmeyen Proje',
        branch: document.getElementById('branchSelect').value,
        qty: qty,
        deliveryDate: document.getElementById('deliveryDate').value,
        orderDate: document.getElementById('orderDate').value,
        manager: document.getElementById('managerName').value,
        code: document.getElementById('projectCode').value,
        pressure: document.getElementById('sysPressure').value,
        materials: materialsList,
        images: currentOrderData.images || [], 
        progress: actualProgress,
        completedStages: completedStagesArray,
        montajHours: parseFloat(document.getElementById('h-assembly')?.value) || 0
    };

    let orders = JSON.parse(localStorage.getItem('hg_orders') || '[]');
    let weekCaps = JSON.parse(localStorage.getItem('hg_weekCaps') || '{}');
    
    // Auto-Scheduling Logic (Capacity Planning)
    let deliveryDateInput = document.getElementById('deliveryDate');
    if (order.progress < 100 && order.deliveryDate) {
        let isAvailable = false;
        let targetDate = new Date(order.deliveryDate);
        if(!isNaN(targetDate)) {
            let originalWeek = getISOWeek(targetDate);
            let currentWeekPointer = originalWeek;
            
            while(!isAvailable) {
                let maxCap = weekCaps[currentWeekPointer] !== undefined ? parseInt(weekCaps[currentWeekPointer]) : 25;
                
                // Sum all montaj hours of OTHER active orders sitting in this specific week
                let currentLoad = 0;
                orders.forEach(o => {
                    if(o.id !== order.id && o.progress < 100 && o.deliveryDate) {
                        if(getISOWeek(new Date(o.deliveryDate)) === currentWeekPointer) {
                            currentLoad += (parseFloat(o.montajHours) || 0);
                        }
                    }
                });
                
                if (currentLoad + order.montajHours <= maxCap) {
                    isAvailable = true;
                } else {
                    currentWeekPointer++;
                    targetDate.setDate(targetDate.getDate() + 7);
                }
            }
            
            // Did we shift?
            if(currentWeekPointer !== originalWeek) {
                let yyyy = targetDate.getFullYear();
                let mm = String(targetDate.getMonth()+1).padStart(2,'0');
                let dd = String(targetDate.getDate()).padStart(2,'0');
                order.deliveryDate = `${yyyy}-${mm}-${dd}`;
                
                // If on the edit view, update DOM too
                if (deliveryDateInput) {
                    deliveryDateInput.value = order.deliveryDate;
                }
                alert(`Dikkat: ${originalWeek}. haftadaki montaj potansiyeli (${weekCaps[originalWeek]||25} saat) dolu olduğu için, teslimat tarihi OTOMATİK olarak kapasitenin uygun olduğu ${currentWeekPointer}. haftaya (${dd}.${mm}.${yyyy}) ötelendi!`);
            }
        }
    }

    let existingIndex = orders.findIndex(o => o.id === orderId);
    if (existingIndex > -1) {
        orders[existingIndex] = order; // Update
    } else {
        orders.push(order); // Insert new
    }
    
    localStorage.setItem('hg_orders', JSON.stringify(orders));

    if (currentOrderData.stepBuffer) {
        saveFileDB(orderId + '_step', currentOrderData.stepBuffer);
    }

    alert("Sipariş Kaydedildi! ("+order.id+")");
    window.location.href = 'index.html';
});

document.getElementById('deleteBtn')?.addEventListener('click', () => {
    if(confirm('Bu siparişi kalıcı olarak silmek istediğinize emin misiniz?')) {
        const params = new URLSearchParams(window.location.search);
        let orderId = params.get('id');
        if (orderId) {
            let orders = JSON.parse(localStorage.getItem('hg_orders') || '[]');
            orders = orders.filter(o => o.id !== orderId);
            localStorage.setItem('hg_orders', JSON.stringify(orders));
        }
        window.location.href = 'index.html';
    }
});

// DXF raw content memory cache for 2D render
window.globalDxfString = "";

/* ============================
   5. Custom 2D CAD Viewer Engine
============================ */
function renderTo2DCanvas() {
    if (!window.globalDxfString) {
        alert("Lütfen önce bir DXF dosyası yükleyin.");
        return;
    }
    
    // Toggle active state
    document.getElementById('btn3D')?.classList.remove('active');
    document.getElementById('btn2D')?.classList.add('active');

    const container = document.getElementById('viewerContainer');
    container.innerHTML = `
        <canvas id="dxfCanvas" style="width:100%; height:100%; cursor:grab; display:block;"></canvas>
        <div class="canvas-controls">
            <button id="btnLockDXF" class="btn-canvas-ctrl active-lock" title="Dokunmatik Kilitle"><i class="fas fa-lock"></i></button>
            <button id="btnUnlockDXF" class="btn-canvas-ctrl" title="Dokunmatik Kilidi Aç (Zoom)"><i class="fas fa-unlock"></i></button>
            <button id="btnFullscreenDXF" class="btn-canvas-ctrl" title="Tam Ekran"><i class="fas fa-expand"></i></button>
        </div>
    `;
    
    const canvas = document.getElementById('dxfCanvas');
    const ctx = canvas.getContext('2d');
    
    // Canvas CSS bounds syncing
    canvas.width = container.clientWidth || 800;
    canvas.height = container.clientHeight || 500;

    // Fast Parse Raw Geometries
    let lines = window.globalDxfString.split('\n').map(l => l.trim());
    let entities = [];
    let inEntity = false;
    let type = '';
    let current = {};
    let pts = []; 
    let insideEntities = false;

    for (let i = 0; i < lines.length; i += 2) {
        let c = lines[i];
        let v = lines[i+1] || '';
        
        // Track ENTITIES section to ignore BLOCKS (which caused overlapping garbage at 0,0 origin)
        if (c === '0' && v === 'SECTION') {
            if (lines[i+2] === '2' && lines[i+3] === 'ENTITIES') insideEntities = true;
        } else if (c === '0' && v === 'ENDSEC') {
            insideEntities = false;
        }

        if (c === '0') {
            if (inEntity && type && insideEntities) {
                if(type === 'LWPOLYLINE') current.pts = pts;
                entities.push({type, ...current});
            }
            if (['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'TEXT', 'MTEXT'].includes(v)) {
                inEntity = true;
                type = v;
                current = {};
                pts = [];
            } else {
                inEntity = false;
            }
        } else if (inEntity) {
            if (type === 'LINE') {
                if (c==='10') current.x1 = parseFloat(v);
                if (c==='20') current.y1 = parseFloat(v);
                if (c==='11') current.x2 = parseFloat(v);
                if (c==='21') current.y2 = parseFloat(v);
            } else if (type === 'CIRCLE' || type === 'ARC') {
                if (c==='10') current.cx = parseFloat(v);
                if (c==='20') current.cy = parseFloat(v);
                if (c==='40') current.r = parseFloat(v);
                if (c==='50') current.sa = parseFloat(v);
                if (c==='51') current.ea = parseFloat(v);
            } else if (type === 'LWPOLYLINE') {
                if (c==='10') current.curX = parseFloat(v);
                if (c==='20') pts.push({x: current.curX, y: parseFloat(v)});
                if (c==='70') current.closed = parseInt(v) & 1;
            } else if (type === 'TEXT' || type === 'MTEXT') {
                if (c==='10') current.x = parseFloat(v);
                if (c==='20') current.y = parseFloat(v);
                if (c==='40') current.h = parseFloat(v);
                if (c==='1') {
                    let cleanValue = v.replace(/\\P/g, ' ')
                                      .replace(/\\[A-Za-z0-9~]+\|[b|i|c|p]\d[^;]+;/g, '')
                                      .replace(/\\[A-Za-z0-9~]+;/g, '')
                                      .replace(/\\[^{]*?{([^}]*?)}/g, '$1')
                                      .replace(/^{|}$/g, '');
                    current.text = cleanValue.trim();
                }
            }
        }
    }

    // Geometry Bounding Box processing
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const expand = (x,y) => {
        if(!isNaN(x)) { if(x<minX) minX=x; if(x>maxX) maxX=x; }
        if(!isNaN(y)) { if(y<minY) minY=y; if(y>maxY) maxY=y; }
    };
    
    entities.forEach(e => {
        if(e.type==='LINE') { expand(e.x1,e.y1); expand(e.x2,e.y2); }
        if(e.type==='CIRCLE' || e.type==='ARC') { expand(e.cx-e.r, e.cy-e.r); expand(e.cx+e.r, e.cy+e.r); }
        if(e.type==='LWPOLYLINE' && e.pts) { e.pts.forEach(p => expand(p.x, p.y)); }
        if((e.type==='TEXT' || e.type==='MTEXT') && e.x !== undefined) { expand(e.x, e.y); }
    });

    if(minX === Infinity) {
        container.innerHTML = '<div class="empty-state">Çizim Bulunamadı</div>';
        return;
    }

    let centerX = (minX + maxX)/2;
    let centerY = (minY + maxY)/2;
    let dxfWidth = (maxX - minX) || 1;
    let dxfHeight = (maxY - minY) || 1;
    
    let baseScale = Math.min(canvas.width / dxfWidth, canvas.height / dxfHeight) * 0.9;
    
    let rs = {
        panX: canvas.width/2,
        panY: canvas.height/2,
        zoom: baseScale,
        dragging: false,
        lastX: 0,
        lastY: 0
    };

    function draw() {
        ctx.clearRect(0,0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(rs.panX, rs.panY);
        ctx.scale(rs.zoom, -rs.zoom);
        ctx.translate(-centerX, -centerY);
        
        ctx.strokeStyle = '#00F0FF'; 
        ctx.lineWidth = 1 / rs.zoom; 
        ctx.lineJoin = "round";
        
        ctx.beginPath();
        entities.forEach(e => {
            if (e.type === 'LINE' && !isNaN(e.x1)) {
                ctx.moveTo(e.x1, e.y1);
                ctx.lineTo(e.x2, e.y2);
            } else if (e.type === 'CIRCLE' && !isNaN(e.cx)) {
                ctx.moveTo(e.cx+e.r, e.cy);
                ctx.arc(e.cx, e.cy, e.r, 0, Math.PI*2);
            } else if (e.type === 'ARC' && !isNaN(e.cx)) {
                let sRad = e.sa * Math.PI/180;
                let eRad = e.ea * Math.PI/180;
                ctx.moveTo(e.cx + Math.cos(sRad)*e.r, e.cy + Math.sin(sRad)*e.r);
                ctx.arc(e.cx, e.cy, e.r, sRad, eRad, false);
            } else if (e.type === 'LWPOLYLINE' && e.pts && e.pts.length > 0) {
                ctx.moveTo(e.pts[0].x, e.pts[0].y);
                for(let i=1; i<e.pts.length; i++) ctx.lineTo(e.pts[i].x, e.pts[i].y);
                if(e.closed) ctx.lineTo(e.pts[0].x, e.pts[0].y);
            } else if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.text && !isNaN(e.x)) {
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.scale(1, -1); 
                let fontSize = e.h || 2.5; 
                ctx.font = `${fontSize}px Arial`;
                ctx.fillStyle = '#00F0FF';
                ctx.fillText(e.text, 0, 0);
                ctx.restore();
            }
        });
        ctx.stroke();
        ctx.restore();
    }
    
    // First render
    draw();

    // Setup Interactive Pan & Zoom
    canvas.addEventListener('mousedown', e => {
        rs.dragging = true;
        rs.lastX = e.clientX;
        rs.lastY = e.clientY;
        canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
        rs.dragging = false;
        canvas.style.cursor = 'grab';
    });
    window.addEventListener('mousemove', e => {
        if (!rs.dragging) return;
        rs.panX += (e.clientX - rs.lastX);
        rs.panY += (e.clientY - rs.lastY);
        rs.lastX = e.clientX;
        rs.lastY = e.clientY;
        draw();
    });
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
        
        rs.panX = mouseX - (mouseX - rs.panX) * zoomFactor;
        rs.panY = mouseY - (mouseY - rs.panY) * zoomFactor;
        
        rs.zoom *= zoomFactor;
        draw();
    });

    // Mobile Touch Pan & Pinch-to-Zoom Engine
    let isCanvasActive = false; // Default: Locked (Scrolls page normally)
    let initialTouchDist = 0;
    let initialPinchZoom = rs.zoom;

    const btnLock = document.getElementById('btnLockDXF');
    const btnUnlock = document.getElementById('btnUnlockDXF');

    btnLock.addEventListener('click', (e) => {
        e.preventDefault();
        isCanvasActive = false;
        btnLock.classList.add('active-lock');
        btnUnlock.classList.remove('active-unlock');
        canvas.style.border = "none";
    });

    btnUnlock.addEventListener('click', (e) => {
        e.preventDefault();
        isCanvasActive = true;
        btnUnlock.classList.add('active-unlock');
        btnLock.classList.remove('active-lock');
        canvas.style.border = "2px solid #10b981"; // Success visible state
    });

    canvas.addEventListener('touchstart', e => {
        if (!isCanvasActive) return; // Allow normal page scroll
        e.preventDefault(); // Active: Lock page scroll
        
        if (e.touches.length === 1) {
            rs.dragging = true;
            rs.lastX = e.touches[0].clientX;
            rs.lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            rs.dragging = false; 
            initialTouchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialPinchZoom = rs.zoom;
        }
    }, {passive: false});

    canvas.addEventListener('touchmove', e => {
        if (!isCanvasActive) return;
        e.preventDefault();

        if (e.touches.length === 1 && rs.dragging) {
            rs.panX += (e.touches[0].clientX - rs.lastX);
            rs.panY += (e.touches[0].clientY - rs.lastY);
            rs.lastX = e.touches[0].clientX;
            rs.lastY = e.touches[0].clientY;
            draw();
        } else if (e.touches.length === 2) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (initialTouchDist > 0) {
                rs.zoom = initialPinchZoom * (currentDist / initialTouchDist);
                draw();
            }
        }
    }, {passive: false});

    canvas.addEventListener('touchend', e => {
        if (e.touches.length < 2) initialTouchDist = 0;
        if (e.touches.length === 0) rs.dragging = false;
    }, {passive: false});
    
    // Hook Fullscreen
    document.getElementById('btnFullscreenDXF')?.addEventListener('click', () => {   });
    
    // Hook Fullscreen
    document.getElementById('btnFullscreenDXF')?.addEventListener('click', () => {
        container.classList.toggle('fullscreen');
        const icon = document.querySelector('#btnFullscreenDXF i');
        if(container.classList.contains('fullscreen')) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
        } else {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }
        // Force canvas resize match
        setTimeout(() => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            draw();
        }, 50);
    });

    // Auto-resize listener
    window.addEventListener('resize', () => {
        if(document.getElementById('dxfCanvas')) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            draw();
        }
    });

}

// Bind Buttons
document.getElementById('btn3D')?.addEventListener('click', init3DViewer);
document.getElementById('btn2D')?.addEventListener('click', renderTo2DCanvas);

/* ============================
   5B. Image Gallery Viewer Engine
============================ */
let galleryState = {
    idx: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0
};

document.getElementById('btnIMG')?.addEventListener('click', () => {
    if (!currentOrderData.images || currentOrderData.images.length === 0) {
        alert("Henüz fotoğraf yüklemediniz.");
        return;
    }
    
    // Toggle active state
    document.getElementById('btn3D')?.classList.remove('active');
    document.getElementById('btn2D')?.classList.remove('active');
    document.getElementById('btnIMG')?.classList.add('active');
    
    // Reset state for new view
    galleryState.zoom = 1;
    galleryState.panX = 0;
    galleryState.panY = 0;
    
    renderGalleryFrame();
});

function renderGalleryFrame() {
    const container = document.getElementById('viewerContainer');
    if(!container) return;
    
    const imgSrc = currentOrderData.images[galleryState.idx];
    const total = currentOrderData.images.length;
    
    container.innerHTML = `
        <div id="galleryWrapper" style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#0f121a;">
            <img id="galleryImg" src="${imgSrc}" style="max-width:100%; max-height:100%; object-fit:contain; transform: translate(0px, 0px) scale(1); cursor:grab;" draggable="false" />
            
            ${total > 1 ? `
            <button id="galPrev" style="position:absolute; left:20px; z-index:5; background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:50%; width:44px; height:44px; cursor:pointer; font-size:18px; backdrop-filter:blur(4px); transition:all 0.2s;"><i class="fas fa-chevron-left"></i></button>
            <button id="galNext" style="position:absolute; right:20px; z-index:5; background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:50%; width:44px; height:44px; cursor:pointer; font-size:18px; backdrop-filter:blur(4px); transition:all 0.2s;"><i class="fas fa-chevron-right"></i></button>
            <div id="galCount" style="position:absolute; bottom:20px; left:20px; color:white; background:rgba(15,18,26,0.7); padding:8px 16px; border-radius:8px; font-size:14px; z-index:5; border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(4px); font-weight:bold;">${galleryState.idx + 1} / ${total}</div>
            ` : ''}
            
            <button id="btnFullscreenIMG" class="btn-fullscreen" title="Tam Ekran"><i class="fas fa-expand"></i></button>
        </div>
    `;
    
    const imgParams = document.getElementById('galleryImg');
    const wrapper = document.getElementById('galleryWrapper');
    
    const applyTransform = () => {
        imgParams.style.transform = `translate(${galleryState.panX}px, ${galleryState.panY}px) scale(${galleryState.zoom})`;
    };

    wrapper.addEventListener('mousedown', e => {
        if(e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        galleryState.dragging = true;
        galleryState.lastX = e.clientX;
        galleryState.lastY = e.clientY;
        imgParams.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
        galleryState.dragging = false;
        if(imgParams) imgParams.style.cursor = 'grab';
    });
    window.addEventListener('mousemove', e => {
        if (!galleryState.dragging) return;
        galleryState.panX += (e.clientX - galleryState.lastX);
        galleryState.panY += (e.clientY - galleryState.lastY);
        galleryState.lastX = e.clientX;
        galleryState.lastY = e.clientY;
        applyTransform();
    });
    
    wrapper.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        galleryState.zoom *= zoomFactor;
        if(galleryState.zoom < 0.2) galleryState.zoom = 0.2;
        applyTransform();
    });
    
    document.getElementById('galPrev')?.addEventListener('click', () => {
        galleryState.idx = (galleryState.idx - 1 + total) % total;
        galleryState.zoom = 1; galleryState.panX = 0; galleryState.panY = 0;
        renderGalleryFrame();
    });
    document.getElementById('galNext')?.addEventListener('click', () => {
        galleryState.idx = (galleryState.idx + 1) % total;
        galleryState.zoom = 1; galleryState.panX = 0; galleryState.panY = 0;
        renderGalleryFrame();
    });
    
    document.getElementById('btnFullscreenIMG')?.addEventListener('click', () => {
        container.classList.toggle('fullscreen');
        const icon = document.querySelector('#btnFullscreenIMG i');
        if(container.classList.contains('fullscreen')) {
            icon.classList.remove('fa-expand'); icon.classList.add('fa-compress');
        } else {
            icon.classList.remove('fa-compress'); icon.classList.add('fa-expand');
        }
    });
}

/* ============================
   6. Dashboard Logic
============================ */
function renderDashboard() {
    const grid = document.getElementById('ordersGrid');
    if (!grid) return;

    let orders = JSON.parse(localStorage.getItem('hg_orders') || '[]');
    
    // Add mock data if empty
    if(orders.length === 0) {
        orders = [
            { id: "26-31", customer: "BAYKAR", project: "MHTA", branch: "Dudullu", progress: 25 },
            { id: "26-32", customer: "ASELSAN", project: "Tank Güç Ünitesi", branch: "İkitelli", progress: 75 },
            { id: "26-33", customer: "ROKETSAN", project: "Platform KHS", branch: "İzmir", progress: 100 }
        ];
        localStorage.setItem('hg_orders', JSON.stringify(orders));
    }
    
    // Get active filter states from Sidebar
    const stageCheckboxes = document.querySelectorAll('.filter-stage:checked');
    const activeStages = Array.from(stageCheckboxes).map(cb => cb.value);
    
    const branchCheckboxes = document.querySelectorAll('.filter-branch:checked');
    const activeBranches = Array.from(branchCheckboxes).map(cb => cb.value);

    grid.innerHTML = '';
    orders.forEach(o => {
        let pColor = 'var(--c-red)';
        let stageName = 'Tasarım';
        
        if(o.progress > 25) { pColor = 'var(--c-yellow)'; stageName = 'Kaynak'; }
        if(o.progress > 50) { pColor = 'var(--c-orange)'; stageName = 'Boya'; }
        if(o.progress >= 100) { pColor = 'var(--c-green)'; stageName = 'Montaj'; }

        // Apply Filters
        if (activeStages.length > 0 && !activeStages.includes(stageName)) return;
        if (activeBranches.length > 0 && o.branch && !activeBranches.includes(o.branch)) return;
        
        const statusFilter = document.querySelector('.filter-status:checked')?.value || 'active';
        if (statusFilter === 'active' && o.progress === 100) return;
        if (statusFilter === 'completed' && o.progress < 100) return;
        
        if (statusFilter === 'active') {
            const activeWeeks = Array.from(document.querySelectorAll('.filter-week:checked')).map(cb => parseInt(cb.value));
            if (activeWeeks.length > 0) {
                if (o.deliveryDate) {
                    const orderWeek = getISOWeek(new Date(o.deliveryDate));
                    if (!activeWeeks.includes(orderWeek)) return;
                } else {
                    return; // Hide if order lacks a delivery date but timeframe filtering is active
                }
            }
        }

        let missingBadgesHTML = '';
        if (o.materials && Array.isArray(o.materials)) {
            let missingItems = o.materials.filter(m => m.missing);
            if (missingItems.length > 0) {
                // Numerik s.no sıralaması
                missingItems.sort((a,b) => parseFloat(a.index) - parseFloat(b.index));
                
                let limit = Math.min(5, missingItems.length);
                let boxes = [];
                for(let i=0; i<limit; i++) {
                    let words = (missingItems[i].name || '').split(' ');
                    let shortName = words.slice(0, 2).join(' '); 
                    if (shortName.length > 18) shortName = shortName.substring(0, 18);

                    boxes.push(`
                        <div style="background: white; color: black; width: 44px; height: 44px; font-size: 8px; padding: 4px; line-height: 1.1; overflow: hidden; word-break: break-word; box-shadow: 0 4px 6px rgba(0,0,0,0.4);">
                            <span style="font-weight: 700; font-size: 9px; display:block; margin-bottom:1px; border-bottom:1px solid #ddd; padding-bottom:1px;">Eksik</span>
                            ${shortName}
                        </div>
                    `);
                }
                
                if (missingItems.length > 5) {
                    boxes.push(`
                        <div style="color: white; font-size: 16px; margin-left: 4px; display: flex; align-items: center; justify-content: center; font-weight:bold; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">...</div>
                    `);
                }
                
                missingBadgesHTML = `
                    <div style="position: absolute; top: 12px; left: 16px; display: flex; flex-direction: row; gap: 8px; align-items: center; z-index: 5;">
                        ${boxes.join('')}
                    </div>
                `;
            }
        }

        // Feature: Use First Uploaded Photo as Card Thumbnail
        let thumbHTML = '';
        if (o.images && o.images.length > 0) {
            thumbHTML = `<img src="${o.images[0]}" style="width:100%; height:100%; object-fit:cover; border-radius:6px; opacity:0.6; mix-blend-mode: luminosity;" />`;
        }

        grid.innerHTML += `
            <div class="order-card" onclick="window.location.href='order.html?id=${o.id}'">
                <div class="card-header">
                    <span class="card-branch">${o.branch}</span>
                    <span><i class="fas fa-ellipsis-h"></i></span>
                </div>
                <div class="card-img" style="position:relative;">
                    ${thumbHTML}
                    ${missingBadgesHTML}
                </div>
                <h3 class="card-title">${o.customer}</h3>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${o.progress}%; background: ${pColor}"></div>
                </div>
                <div class="card-footer">
                    <span>${o.id} / ${o.project}</span>
                    <span>%${o.progress}</span>
                </div>
            </div>
        `;
    });
}
