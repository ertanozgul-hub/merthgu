// App Global State
let currentOrderData = {
    materials: [],
    files: {
        excel: false,
        dxf: false,
        step: false,
        img: false
    }
};

// UI Elements (if on order page)
const isOrderPage = document.getElementById('volumeSelect') !== null;
const isDashboard = document.getElementById('ordersGrid') !== null;

if (isOrderPage) {
    document.addEventListener('DOMContentLoaded', () => {
        calculateHours(); // Initialize hours based on default selection
        setupCounter();
        generateLabelNo();
        loadOrderDetails();
    });
}

if (isDashboard) {
    document.addEventListener('DOMContentLoaded', () => {
        renderDashboard();
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
            init3DViewer(file);
        } else if (type === 'img') {
            // Setup photo compare placeholder
            document.getElementById('viewerContainer').innerHTML = `<img src="${URL.createObjectURL(file)}" style="max-width:100%; max-height:100%; border-radius:8px;">`;
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

function init3DViewer(file) {
    // Advanced 3D rendering setup is omitted for brevity but Three.js skeleton goes here
    document.getElementById('viewerContainer').innerHTML = `
        <div style="color:var(--primary); text-align:center;">
           <i class="fas fa-cube" style="font-size:48px; margin-bottom:16px;"></i><br>
           <b>${file.name}</b><br>
           Yerel 3D WebGL Görüntüleyici Aktif
        </div>
    `;
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
        materials: materialsList, // Added material saving
        progress: 10 
    };

    let orders = JSON.parse(localStorage.getItem('hg_orders') || '[]');
    let existingIndex = orders.findIndex(o => o.id === orderId);
    if (existingIndex > -1) {
        orders[existingIndex] = order; // Update
    } else {
        orders.push(order); // Insert new
    }
    
    localStorage.setItem('hg_orders', JSON.stringify(orders));

    alert("Sipariş Kaydedildi! ("+order.id+")");
    window.location.href = 'index.html';
});

/* ============================
   4. Dashboard Logic
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

    grid.innerHTML = '';
    orders.forEach(o => {
        
        let pColor = 'var(--c-red)';
        if(o.progress > 25) pColor = 'var(--c-yellow)';
        if(o.progress > 50) pColor = 'var(--c-orange)';
        if(o.progress >= 100) pColor = 'var(--c-green)';

        grid.innerHTML += `
            <div class="order-card" onclick="window.location.href='order.html?id=${o.id}'">
                <div class="card-header">
                    <span class="card-branch">${o.branch}</span>
                    <span><i class="fas fa-ellipsis-h"></i></span>
                </div>
                <div class="card-img"></div>
                <h3 class="card-title">${o.project}</h3>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${o.progress}%; background: ${pColor}"></div>
                </div>
                <div class="card-footer">
                    <span>${o.id} / ${o.customer}</span>
                    <span>%${o.progress}</span>
                </div>
            </div>
        `;
    });
}
