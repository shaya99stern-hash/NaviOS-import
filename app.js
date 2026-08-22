/**
 * NaviOS Import Core Logic
 * Version 1.0.1
 */

// --- UI Control Functions ---
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.style.display = 'none');
}

// --- App Update Logic (Cache Busting) ---
function updateApp() {
    const btn = document.querySelector('#settingsModal .modal-btn');
    if (btn) btn.innerText = 'Downloading Update...';
    
    if ('serviceWorker' in navigator) {
        // Clear all cached files to force fresh Vercel pull
        caches.keys().then((names) => {
            for (let name of names) caches.delete(name);
        });
        
        // Unregister current worker and reload page
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (let registration of registrations) {
                registration.unregister();
            }
            window.location.reload(true);
        });
    } else {
        window.location.reload(true);
    }
}

// --- Dynamic Service Worker Registration ---
const swScript = `
const CACHE_NAME = 'navios-core-v1.0.1';
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(['./index.html', './manifest.json', './app.js']);
    }));
});
self.addEventListener('fetch', (event) => {
    event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
});
`;
const workerBlob = new Blob([swScript], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);
if ('serviceWorker' in navigator) navigator.serviceWorker.register(workerUrl);

// --- PDF Worker Synchronization ---
window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- Download & Storage Tracking ---
function triggerDownload(url, filename) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    
    // Categorize and track the download for local app storage
    if (filename.includes('.mp4')) incrementStorage('videos');
    else if (filename.includes('.png') || filename.includes('.jpg') || filename.includes('.pdf')) incrementStorage('images');
    else if (filename.includes('.wav') || filename.includes('.mp3')) incrementStorage('audio');
}

function incrementStorage(type) {
    let count = parseInt(localStorage.getItem(type) || '0');
    localStorage.setItem(type, count + 1);
    updateStorageUI();
}

function updateStorageUI() {
    const videoCount = localStorage.getItem('videos') || '0';
    const imgCount = localStorage.getItem('images') || '0';
    const audioCount = localStorage.getItem('audio') || '0';
    
    const cards = document.querySelectorAll('.storage-card');
    if (cards.length >= 4) {
        cards[1].querySelector('p').innerText = `${videoCount} items`; // Videos
        cards[2].querySelector('p').innerText = `${audioCount} items`; // Songs
        cards[3].querySelector('p').innerText = `${imgCount} items`;   // Images
    }
}

// Populate storage numbers on app launch
document.addEventListener('DOMContentLoaded', updateStorageUI);

// --- Keyless Media Extraction (Cobalt Proxy) ---
async function extractMedia() {
    const url = document.getElementById('targetUrl').value;
    const mode = document.getElementById('mediaMode').value;
    const status = document.getElementById('extStatus'); 

    if (!url) return alert('A valid target URL is required.');
    
    if (status) {
        status.style.display = 'block';
        status.innerText = 'Connecting to proxy...';
    }

    // Configured for latest API version
    const requestPayload = {
        url: url,
        videoQuality: "max",
        youtubeVideoCodec: "h264",
        audioFormat: "wav",
        downloadMode: mode === 'audio' ? "audio" : "auto"
    };

    try {
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        const payload = await response.json();
        
        // Handle Turnstile/CAPTCHA API errors gracefully
        if (payload.error && payload.error.code === 'error.api.auth.turnstile.missing') {
            alert('The public API blocked the request due to Bot Protection. You must host your own API instance to bypass this.');
            return;
        }

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        if (payload.status === 'redirect' || payload.status === 'stream') {
            window.open(payload.url, '_blank'); 
        } else if (payload.url) {
            triggerDownload(payload.url, `media_${Date.now()}`);
        } else {
            alert('Proxy encountered an error: ' + (payload.text || 'Unknown'));
        }
    } catch (error) {
        console.error('Extraction Exception:', error);
        alert('Extraction failed. The proxy may be rate-limiting requests.');
    } finally {
        if (status) status.style.display = 'none';
    }
}

// --- Document Transformation Engine ---
async function transformDocument() {
    const fileInput = document.getElementById('docFile');
    const mode = document.getElementById('docMode').value;
    const status = document.getElementById('docStatus');

    if (!fileInput.files.length) return alert('Target file required for transformation.');
    const file = fileInput.files[0];
    if (status) status.style.display = 'block';

    try {
        if (mode === 'imgToPdf') await rasterToVector(file);
        else if (mode === 'pdfToImg') await vectorToRaster(file);
    } catch (error) {
        console.error('Transformation Exception:', error);
        alert('Binary transformation failed.');
    } finally {
        if (status) status.style.display = 'none';
        closeModals();
    }
}

function rasterToVector(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({
                    orientation: img.width > img.height ? 'l' : 'p',
                    unit: 'px',
                    format: [img.width, img.height]
                });
                doc.addImage(img, 'PNG', 0, 0, img.width, img.height);
                triggerDownload(doc.output('bloburl'), `packaged_${Date.now()}.pdf`);
                resolve();
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function vectorToRaster(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async function() {
            const binaryArray = new Uint8Array(this.result);
            const pdfDoc = await window.pdfjsLib.getDocument({data: binaryArray}).promise;
            const page = await pdfDoc.getPage(1); 
            const viewport = page.getViewport({scale: 2.5});
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({canvasContext: context, viewport: viewport}).promise;
            triggerDownload(canvas.toDataURL('image/png'), `rasterized_${Date.now()}.png`);
            resolve();
        };
        reader.readAsArrayBuffer(file);
    });
}

// --- Algorithmic Visual Enhancements ---
function enhanceVisuals() {
    const fileInput = document.getElementById('visualFile');
    const status = document.getElementById('visStatus');
    
    if (!fileInput.files.length) return alert('Visual asset required.');
    const file = fileInput.files[0];
    if (status) status.style.display = 'block';

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            
            ctx.filter = 'contrast(1.18) brightness(1.08) saturate(1.25)';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            triggerDownload(canvas.toDataURL('image/jpeg', 0.98), `enhanced_${Date.now()}.jpg`);
            if (status) status.style.display = 'none';
            closeModals();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// --- Video Processing Engine ---
function processVideo() {
    const fileInput = document.getElementById('videoFile');
    const filter = document.getElementById('videoFilter').value;
    const status = document.getElementById('vidStatus');
    
    if (!fileInput.files.length) return alert('Select a video first.');
    
    if (status) {
        status.style.display = 'block';
        status.innerText = 'Initializing processing engine...';
    }
    
    const file = fileInput.files[0];
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
        if (status) status.innerText = 'Processing frames... Do not close app.';
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const stream = canvas.captureStream(30); 
        const options = MediaRecorder.isTypeSupported('video/mp4') 
            ? { mimeType: 'video/mp4', videoBitsPerSecond: 2500000 } 
            : { mimeType: 'video/webm' };
            
        const recorder = new MediaRecorder(stream, options); 
        const chunks = [];
        
        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
            if (status) status.innerText = 'Packaging file...';
            const blob = new Blob(chunks, { type: options.mimeType });
            triggerDownload(URL.createObjectURL(blob), `edited_vid_${Date.now()}.mp4`);
            if (status) status.style.display = 'none';
            closeModals();
        };
        
        recorder.start();
        video.play();
        
        function drawFrame() {
            if (video.paused || video.ended) {
                recorder.stop();
                return;
            }
            ctx.filter = filter;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            requestAnimationFrame(drawFrame);
        }
        drawFrame();
    };
}
