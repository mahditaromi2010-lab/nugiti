/* Transferred from the supplied Nogiti HTML baseline. These table values need technical review against the current official regulation before production use. */
function calculateVentilation() {
    const area = parseFloat(document.getElementById('area').value);
    const height = parseFloat(document.getElementById('height').value);
    const cons = parseFloat(document.getElementById('deviceConsumption').value);
    if (!area || !height || !cons || area <= 0 || height <= 0 || cons <= 0) {
        alert('لطفاً مقادیر معتبر و مثبت وارد کنید.'); return;
    }
    const V = area * height, Q = cons * 9500, threshold = Q / 178, unconfined = (V > threshold);
    let html = `<strong>🔹 مقادیر اولیه:</strong><br>
        • حجم هوا (V): ${V.toFixed(2)} m³<br>
        • ارزش حرارتی (Q): ${Q.toFixed(2)} kcal/h<br>
        • وضعیت فضا: <strong>${unconfined ? 'نامحدود (Unconfined)' : 'محدود (Confined)'}</strong><br><br><strong>🔸 ابعاد و ظرفیت‌ها:</strong><br>`;
    if (unconfined) html += `• ابعاد یک دریچه ثابت: ${(Q / 117).toFixed(2)} cm²<br>`;
    html += `• ابعاد دو دریچه ثابت: ${(Q / 156).toFixed(2)} cm²<br>
        • ابعاد یک کانال افقی: ${(Q / 78).toFixed(2)} cm²<br>
        • ابعاد یک کانال قائم: ${(Q / 156).toFixed(2)} cm²<br>
        • ظرفیت فن مکانیکی: ${(Q / 424).toFixed(2)} m³/h`;
    document.getElementById('ventResult').innerHTML = html;
    document.getElementById('ventResult').classList.add('show');
}

function calculatePipeSize() {
    const length = parseFloat(document.getElementById('pipeLength').value);
    const cons = parseFloat(document.getElementById('consumption').value);
    if (!length || !cons || length <= 0 || cons <= 0) { alert('لطفاً مقادیر معتبر و مثبت وارد کنید.'); return; }
    const table = {
        2: { 5.9: '1/2"', 12.3: '3/4"', 23.3: '1"', 47.9: '1 1/4"', 72.0: '1 1/2"', 138.3: '2"', 220.0: '2 1/2"', 390.7: '3"', 801.9: '4"' },
        4: { 4.0: '1/2"', 8.5: '3/4"', 16.0: '1"', 32.9: '1 1/4"', 49.4: '1 1/2"', 95.1: '2"', 151.2: '2 1/2"', 268.5: '3"', 551.1: '4"' },
        6: { 3.2: '1/2"', 6.8: '3/4"', 12.9: '1"', 26.4: '1 1/4"', 39.7: '1 1/2"', 76.4: '2"', 121.5: '2 1/2"', 215.7: '3"', 442.8: '4"' },
        8: { 2.8: '1/2"', 5.8: '3/4"', 11.0: '1"', 22.6: '1 1/4"', 34.0: '1 1/2"', 65.4: '2"', 104.0: '2 1/2"', 184.7: '3"', 379.1: '4"' },
        10: { 2.4: '1/2"', 5.0: '3/4"', 9.6: '1"', 19.7: '1 1/4"', 29.6: '1 1/2"', 56.9: '2"', 90.4: '2 1/2"', 160.6: '3"', 329.7: '4"' },
        15: { 2.0: '1/2"', 4.2: '3/4"', 7.9: '1"', 16.2: '1 1/4"', 24.3: '1 1/2"', 46.8: '2"', 74.4: '2 1/2"', 132.1: '3"', 271.2: '4"' },
        20: { 1.7: '1/2"', 3.5: '3/4"', 6.7: '1"', 13.8: '1 1/4"', 20.7: '1 1/2"', 39.8: '2"', 63.3: '2 1/2"', 112.5: '3"', 231.0: '4"' },
        25: { 1.5: '1/2"', 3.1: '3/4"', 5.9: '1"', 12.2: '1 1/4"', 18.3: '1 1/2"', 35.2: '2"', 56.0: '2 1/2"', 99.5: '3"', 204.3: '4"' },
        30: { 1.3: '1/2"', 2.8: '3/4"', 5.3: '1"', 11.0: '1 1/4"', 16.6: '1 1/2"', 31.9: '2"', 50.8: '2 1/2"', 90.2: '3"', 185.1: '4"' },
        40: { 1.1: '1/2"', 2.4: '3/4"', 4.6: '1"', 9.4: '1 1/4"', 14.1: '1 1/2"', 27.1: '2"', 43.3: '2 1/2"', 76.9: '3"', 157.9: '4"' },
        50: { 1.0: '1/2"', 2.1: '3/4"', 4.1: '1"', 8.4: '1 1/4"', 12.6: '1 1/2"', 24.3: '2"', 38.6: '2 1/2"', 68.7: '3"', 141.0: '4"' },
        55: { 0.99: '1/2"', 2.0: '3/4"', 3.9: '1"', 8.0: '1 1/4"', 12.0: '1 1/2"', 23.1: '2"', 36.7: '2 1/2"', 65.2: '3"', 133.9: '4"' },
        60: { 0.94: '1/2"', 1.9: '3/4"', 3.7: '1"', 7.6: '1 1/4"', 11.5: '1 1/2"', 22.1: '2"', 35.1: '2 1/2"', 62.4: '3"', 128.1: '4"' },
        70: { 0.85: '1/2"', 1.8: '3/4"', 3.3: '1"', 6.9: '1 1/4"', 10.4: '1 1/2"', 20.0: '2"', 31.8: '2 1/2"', 56.5: '3"', 116.1: '4"' },
        80: { 0.8: '1/2"', 1.6: '3/4"', 3.1: '1"', 6.5: '1 1/4"', 9.7: '1 1/2"', 18.8: '2"', 29.8: '2 1/2"', 53.1: '3"', 108.9: '4"' },
        90: { 0.75: '1/2"', 1.5: '3/4"', 2.9: '1"', 6.1: '1 1/4"', 9.1: '1 1/2"', 17.6: '2"', 28.0: '2 1/2"', 49.7: '3"', 102: '4"' },
        100: { 0.71: '1/2"', 1.4: '3/4"', 2.8: '1"', 5.7: '1 1/4"', 8.6: '1 1/2"', 16.6: '2"', 26.4: '2 1/2"', 47.0: '3"', 96.5: '4"' },
        120: { 0.64: '1/2"', 1.3: '3/4"', 2.5: '1"', 5.2: '1 1/4"', 7.8: '1 1/2"', 15.0: '2"', 23.9: '2 1/2"', 42.5: '3"', 87.3: '4"' },
        150: { 0.57: '1/2"', 1.2: '3/4"', 2.2: '1"', 4.6: '1 1/4"', 6.9: '1 1/2"', 13.3: '2"', 21.2: '2 1/2"', 37.7: '3"', 77.5: '4"' },
        200: { 0.49: '1/2"', 1.0: '3/4"', 1.9: '1"', 3.9: '1 1/4"', 5.9: '1 1/2"', 11.4: '2"', 18.1: '2 1/2"', 32.2: '3"', 66.2: '4"' },
        250: { 0.43: '1/2"', 0.91: '3/4"', 1.7: '1"', 3.5: '1 1/4"', 5.2: '1 1/2"', 10.1: '2"', 16.1: '2 1/2"', 28.6: '3"', 58.8: '4"' },
        300: { 0.39: '1/2"', 0.82: '3/4"', 1.5: '1"', 3.1: '1 1/4"', 4.7: '1 1/2"', 9.2: '2"', 14.6: '2 1/2"', 25.9: '3"', 53.2: '4"' }
    };
    const lengths = Object.keys(table).map(Number).sort((a, b) => a - b);
    let selLength = lengths.find(l => l >= length) || lengths[lengths.length - 1];
    const capMap = table[selLength];
    const caps = Object.keys(capMap).map(Number).sort((a, b) => a - b);
    let selCap = caps.find(c => c >= cons) || caps[caps.length - 1];
    document.getElementById('pipeResult').innerHTML = `قطر لوله مورد نیاز: <strong>${capMap[selCap]}</strong><br>(بر اساس طول ${selLength} متر و ظرفیت ${selCap} m³/h)`;
    document.getElementById('pipeResult').classList.add('show');
}

// ========== قطر لوله گاز (فشار قوی) - جدول پ-4-4 ==========
const hpTable = [
    { length: 15, caps: [16, 30, 62, 93, 180, 276, 418, 725, 1657] },
    { length: 20, caps: [11, 21, 43, 64, 124, 217, 375, 725, 1657] },
    { length: 45, caps: [9, 17, 34, 52, 99, 175, 301, 620, 1657] },
    { length: 60, caps: [8, 14, 30, 44, 85, 150, 258, 531, 1569] },
    { length: 75, caps: [7, 13, 26, 39, 75, 132, 229, 470, 1390] },
    { length: 90, caps: [6, 12, 24, 35, 68, 120, 207, 426, 1260] },
    { length: 120, caps: [5, 10, 20, 30, 58, 103, 177, 365, 1078] },
    { length: 150, caps: [4.6, 9, 18, 27, 52, 91, 157, 323, 956] },
    { length: 200, caps: [4, 7, 15, 23, 44, 78, 134, 277, 818] },
    { length: 250, caps: [3.5, 6.5, 13, 20, 39, 69, 119, 245, 725] },
    { length: 300, caps: [3.2, 6, 12, 18.5, 36, 63, 108, 222, 657] },
    { length: 350, caps: [2.9, 5.5, 11, 17, 33, 58, 99, 204, 606] },
    { length: 400, caps: [2.7, 5.1, 10.5, 15.5, 31, 54, 92, 190, 562] },
    { length: 450, caps: [2.5, 4.8, 10, 14.5, 29, 50, 87, 179, 527] },
    { length: 500, caps: [2.4, 4.5, 9.5, 14, 27, 47, 82, 169, 498] },
    { length: 550, caps: [2.3, 4.3, 9, 13.5, 26, 45, 78, 160, 473] },
    { length: 600, caps: [2.2, 4.1, 8, 13, 25, 43, 74, 153, 451] }
];
const hpDiameters = ['¾"', '1"', '1¼"', '1½"', '2"', '2½"', '3"', '4"', '6"'];

function calculateHighPressurePipe() {
    const length = parseFloat(document.getElementById('hpPipeLength').value);
    const cons = parseFloat(document.getElementById('hpConsumption').value);
    const res = document.getElementById('hpPipeResult');

    if (!length || !cons || length <= 0 || cons <= 0) {
        alert('لطفاً مقادیر معتبر و مثبت وارد کنید.');
        return;
    }

    let selRow;
    if (length <= 15) {
        selRow = hpTable[0];
    } else {
        selRow = hpTable.find(r => r.length >= length);
        if (!selRow) {
            res.innerHTML = `⚠️ طول لوله (${length} متر) از حداکثر طول جدول (۶۰۰ متر) بیشتر است.`;
            res.classList.add('show');
            return;
        }
    }

    let selDiameter = null;
    let selCapacity = null;
    for (let i = 0; i < selRow.caps.length; i++) {
        if (selRow.caps[i] >= cons) {
            selDiameter = hpDiameters[i];
            selCapacity = selRow.caps[i];
            break;
        }
    }

    if (selDiameter === null) {
        const maxCap = selRow.caps[selRow.caps.length - 1];
        res.innerHTML = `❌ مصرف وارد شده (${cons} m³/h) بیشتر از حداکثر ظرفیت مجاز جدول (${maxCap} m³/h) برای طول ${selRow.length} متر می‌باشد.`;
        res.classList.add('show');
        return;
    }

    res.innerHTML = `
        ✅ قطر لوله مورد نیاز: <strong>${selDiameter}</strong><br>
        <small>(بر اساس طول ${selRow.length} متر و ظرفیت ${selCapacity} m³/h)</small>
    `;
    res.classList.add('show');
}

// ========== جدول دقیق 17-4-5 (قطر دودکش) ==========
const chimneyTable = [
    { height: 3, length: 0, capacities: [21.20, 51.00, 93.90, 153.00, 230.30] },
    { height: 3, length: 0.6, capacities: [16.90, 42.40, 78.50, 127.50, 191.90] },
    { height: 3, length: 1.5, capacities: [15.40, 38.60, 72.95, 121.20, 182.80] },
    { height: 4.5, length: 0, capacities: [23.00, 56.30, 106.10, 172.70, 262.60] },
    { height: 4.5, length: 0.6, capacities: [18.20, 47.00, 88.40, 143.90, 218.40] },
    { height: 4.5, length: 1.5, capacities: [16.91, 42.90, 82.10, 136.40, 208.30] },
    { height: 4.5, length: 3, capacities: [14.60, 39.90, 77.80, 129.80, 200.75] },
    { height: 6, length: 0, capacities: [25.50, 63.60, 118.70, 194.40, 300.50] },
    { height: 6, length: 0.6, capacities: [20.20, 53.00, 100.00, 161.90, 250.00] },
    { height: 6, length: 1.5, capacities: [18.70, 48.50, 91.90, 154.00, 238.60] },
    { height: 6, length: 3, capacities: [16.40, 44.90, 87.10, 144.20, 229.80] },
    { height: 6, length: 4.5, capacities: [13.90, 41.20, 82.30, 138.90, 219.70] },
    { height: 9, length: 0, capacities: [27.30, 69.70, 133.60, 221.70, 340.60] },
    { height: 9, length: 0.6, capacities: [21.20, 58.10, 111.40, 184.30, 287.90] },
    { height: 9, length: 1.5, capacities: [19.70, 53.00, 103.50, 175.25, 272.70] },
    { height: 9, length: 3, capacities: [17.17, 49.50, 98.00, 165.65, 265.15] },
    { height: 9, length: 4.5, capacities: [null, 44.70, 92.40, 157.80, 252.50] },
    { height: 9, length: 6, capacities: [null, 41.20, 86.90, 150.50, 242.40] },
    { height: 15, length: 0, capacities: [30.30, 78.30, 149.00, 247.50, 391.40] },
    { height: 15, length: 0.6, capacities: [24.00, 65.65, 124.20, 207.10, 325.75] },
    { height: 15, length: 1.5, capacities: [null, 59.10, 119.70, 197.00, 310.60] },
    { height: 15, length: 3, capacities: [null, 55.80, 115.15, 184.30, 300.50] },
    { height: 15, length: 4.5, capacities: [null, 50.50, 102.80, 178.00, 285.35] },
    { height: 15, length: 6, capacities: [null, 47.00, 97.00, 169.20, 272.70] },
    { height: 15, length: 9, capacities: [null, null, 83.30, 152.80, 255.10] }
];

const chimneyDiameters = ["10 سانتی‌متر", "15 سانتی‌متر", "20 سانتی‌متر", "25 سانتی‌متر", "30 سانتی‌متر"];

function calculateChimney() {
    const height = parseFloat(document.getElementById('chimneyHeight').value);
    const length = parseFloat(document.getElementById('chimneyLength').value);
    const cons = parseFloat(document.getElementById('chimneyConsumption').value);

    if (!Number.isFinite(height) || !Number.isFinite(length) || !Number.isFinite(cons) || height <= 0 || cons <= 0 || length < 0) {
        alert('لطفاً مقادیر معتبر وارد کنید (ارتفاع و مصرف مثبت، طول می‌تواند صفر باشد).');
        return;
    }

    const requiredCapacity = cons * 9.5;

    const heights = [...new Set(chimneyTable.map(r => r.height))].sort((a, b) => a - b);
    if (height > heights[heights.length - 1]) {
        document.getElementById('chimneyResult').innerHTML = `⚠️ ارتفاع وارد شده از حداکثر مجاز (${heights[heights.length - 1]} متر) بیشتر است.`;
        document.getElementById('chimneyResult').classList.add('show');
        return;
    }
    let selHeight = heights.find(h => h >= height);
    if (!selHeight) selHeight = heights[heights.length - 1];

    const rows = chimneyTable.filter(r => r.height === selHeight);
    const lengths = [...new Set(rows.map(r => r.length))].sort((a, b) => a - b);
    let selLength = lengths.find(l => l >= length);

    if (selLength === undefined) {
        document.getElementById('chimneyResult').innerHTML = `⚠️ طول لوله ${length} متر برای دودکش با ارتفاع ${selHeight} متر غیرمجاز است. لطفاً طول کوتاه‌تری وارد کنید (حداکثر: ${lengths[lengths.length - 1]} متر).`;
        document.getElementById('chimneyResult').classList.add('show');
        return;
    }

    const row = rows.find(r => r.length === selLength);

    let selectedDiameter = null;
    for (let i = 0; i < row.capacities.length; i++) {
        if (row.capacities[i] !== null && row.capacities[i] >= requiredCapacity) {
            selectedDiameter = chimneyDiameters[i];
            break;
        }
    }

    const res = document.getElementById('chimneyResult');
    if (selectedDiameter) {
        res.innerHTML = `
            ✅ قطر دودکش مورد نیاز: <strong>${selectedDiameter}</strong><br>
            <small>(ارتفاع دودکش: ${selHeight} متر | طول لوله رابط: ${selLength} متر | ظرفیت محاسبه‌شده: ${requiredCapacity.toFixed(1)} هزار kcal/h)</small>
        `;
    } else {
        let suggestion = '';
        const shorterLengths = lengths.filter(l => l < selLength).reverse();
        for (let len of shorterLengths) {
            const checkRow = rows.find(r => r.length === len);
            if (checkRow && checkRow.capacities.some(cap => cap !== null && cap >= requiredCapacity)) {
                suggestion = ` پیشنهاد می‌شود لوله رابط ${len} متری یا کوتاه‌تر را امتحان کنید.`;
                break;
            }
        }
        if (!suggestion) suggestion = ' لطفاً مصرف دستگاه را کاهش دهید.';
        res.innerHTML = `❌ با ارتفاع ${selHeight} متر و طول لوله ${selLength} متر، هیچ قطری جوابگو نیست. این ترکیب مجاز نمی‌باشد.${suggestion}`;
    }
    res.classList.add('show');
}

const fuelSelect = document.getElementById('fuelType');
const gasInput = document.getElementById('gasInput');
const liquidInput = document.getElementById('liquidInput');
function updateFactorDisplay() {
    const f = parseFloat(fuelSelect.value);
    document.getElementById('factorDisplay').textContent = f;
    document.getElementById('factorDisplay2').textContent = f;
    document.getElementById('liquidUnit').textContent = fuelSelect.value === '1.0' ? 'kg/h' : 'lit/h';
}
fuelSelect.addEventListener('change', () => {
    updateFactorDisplay();
    if (gasInput.value !== '') convertFromGas();
    else if (liquidInput.value !== '') convertFromLiquid();
});
function convertFromGas() {
    const g = parseFloat(gasInput.value);
    if (isNaN(g) || g < 0) { liquidInput.value = ''; return; }
    liquidInput.value = (g / parseFloat(fuelSelect.value)).toFixed(2);
}
function convertFromLiquid() {
    const l = parseFloat(liquidInput.value);
    if (isNaN(l) || l < 0) { gasInput.value = ''; return; }
    gasInput.value = (l * parseFloat(fuelSelect.value)).toFixed(2);
}
updateFactorDisplay();

function calculateMeter() {
    const c = parseFloat(document.getElementById('meterConsumption').value);
    const res = document.getElementById('meterResult');
    if (isNaN(c) || c <= 0) { res.innerHTML = 'لطفاً یک مصرف معتبر وارد کنید.'; res.classList.add('show'); return; }

    let meter, wall, length, diam;
    if (c >= 0.1 && c <= 6) {
        meter = 'G4'; wall = '10 cm'; length = '15.5 cm'; diam = '1"';
    } else if (c >= 6.1 && c <= 10) {
        meter = 'G6'; wall = '10 cm'; length = '22.5 cm'; diam = '1"';
    } else if (c >= 10.1 && c <= 16) {
        meter = 'G10'; wall = '15 cm'; length = '28 cm'; diam = '1½"';
    } else if (c >= 16.1 && c <= 25) {
        meter = 'G16'; wall = '15 cm'; length = '28 cm'; diam = '1½"';
    } else if (c >= 25.1 && c <= 40) {
        meter = 'G25'; wall = '25 cm'; length = '33.5 cm'; diam = '2"';
    } else if (c >= 40.1 && c <= 65) {
        meter = 'G40'; wall = '30 cm'; length = '68 cm'; diam = '2"';
    } else if (c >= 65.1 && c <= 100) {
        meter = 'G65'; wall = '30 cm'; length = '68 cm'; diam = '2"';
    } else {
        res.innerHTML = '⚠️ مصرف باید بین ۰.۱ تا ۱۰۰ مترمکعب بر ساعت باشد.';
        res.classList.add('show'); return;
    }

    res.innerHTML = `
        <strong>رده کنتور:</strong> ${meter}<br>
        <strong>فاصله کنتور از دیوار:</strong> ${wall}<br>
        <strong>طول جانشین کنتور:</strong> ${length}<br>
        <strong>قطر لوله جانشین کنتور:</strong> ${diam}<br>
        <strong>ارتفاع کنتور:</strong> 180 cm الی 220 cm
    `;
    res.classList.add('show');
}


// Accessible button and live conversion bindings (no inline JavaScript required).
document.querySelectorAll('[data-calc]').forEach(button => {
  button.addEventListener('click', () => {
    const actions = { vent: calculateVentilation, pipe: calculatePipeSize, high: calculateHighPressurePipe, chimney: calculateChimney, meter: calculateMeter };
    actions[button.dataset.calc]?.();
  });
});
const gasEl = document.getElementById('gasInput');
const liquidEl = document.getElementById('liquidInput');
if (gasEl) gasEl.addEventListener('input', convertFromGas);
if (liquidEl) liquidEl.addEventListener('input', convertFromLiquid);

// Never silently return the largest table diameter when entered demand is above capacity.
const oldCalculatePipeSize = calculatePipeSize;
calculatePipeSize = function () {
  const length = parseFloat(document.getElementById('pipeLength').value);
  const cons = parseFloat(document.getElementById('consumption').value);
  if (!Number.isFinite(length) || !Number.isFinite(cons) || length <= 0 || cons <= 0) {
    alert('لطفاً طول و مصرف معتبر و مثبت وارد کنید.'); return;
  }
  if (length > 300) {
    const result = document.getElementById('pipeResult');
    result.textContent = 'طول واردشده از بیشینهٔ طول جدول موجود در فایل پایه (۳۰۰ متر) بیشتر است؛ محاسبه‌ای ارائه نمی‌شود.';
    result.classList.add('show'); return;
  }
  oldCalculatePipeSize();
  const result = document.getElementById('pipeResult');
  if (result && result.textContent.includes('بر اساس طول')) {
    const match = result.textContent.match(/ظرفیت ([0-9.]+) m³\/h/);
    if (match && cons > Number(match[1])) { result.innerHTML = 'مصرف واردشده از ظرفیت بیشینهٔ موجود در جدول برای طول انتخابی بیشتر است؛ قطر را نمی‌توان از این جدول تعیین کرد.'; }
  }
};
