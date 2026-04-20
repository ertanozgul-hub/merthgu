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
            const parser = new DxfParser();
            const dxf = parser.parseSync(fileText);
            
            // Reconstruct BOM Table from DXF Entities (TEXT/MTEXT)
            let texts = [];
            
            if (dxf.entities) {
                // Collect all texts
                dxf.entities.forEach(ent => {
                    if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
                        texts.push({ x: ent.position.x, y: ent.position.y, text: ent.text });
                    }
                });
            }

            // Since it's unstructured, group texts by Y roughly (tolerance 5 units)
            let rows = {};
            texts.forEach(t => {
                let yKey = Math.round(t.y / 5) * 5; 
                if(!rows[yKey]) rows[yKey] = [];
                rows[yKey].push(t);
            });

            // Reconstruct
            let parsedMaterials = [];
            Object.keys(rows).sort((a,b) => b - a).forEach(y => {
                let row = rows[y].sort((a,b) => a.x - b.x); // sort left to right
                if(row.length >= 3) {
                    // Assuming standard BOM: Col 1 is Index, Col 2 is Qty, Last is Name
                    let index = row[0].text;
                    let qty = row[1].text;
                    let name = row[row.length - 1].text;
                    
                    // Filter headers
                    if(!isNaN(parseInt(index))) {
                        parsedMaterials.push({ index, qty, name });
                    }
                }
            });

            // Put in UI Table
            renderMaterials(parsedMaterials);
            
            // Show placeholder in viewer (Since drawing full DXF in 2D requires a robust renderer)
            document.getElementById('viewerContainer').innerHTML = `<div class="empty-state" style="color:var(--c-green)"><i class="fas fa-check-circle"></i> DXF Ayıştırıldı. BOM Tablosu çıkartıldı.</div>`;
            
        } catch(err) {
            console.error("DXF Parse Error:", err);
            alert("DXF Okunamadı. Lütfen geçerli bir ACAD DXF formatı yükleyin.");
        }
    };
    reader.readAsText(file);
}

function renderMaterials(materials) {
   const tbody = document.getElementById('materialsBody');
   tbody.innerHTML = '';
   materials.forEach(m => {
       const tr = document.createElement('tr');
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
        progress: 10 // Mock progress explicitly when saved
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
