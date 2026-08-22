/**
 * NaviOS Import Core Logic
 */

// --- UI Control Functions ---
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.style.display = 'none');
}

// --- Dynamic Service Worker Registration ---
const swScript = `
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open('navios-core-v1').then((cache) => {
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
window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/

// --- Download & Storage Tracking ---
function triggerDownload(url, filename, statusElementId = null) {
    // Categorize and track the download for local app storage
    if (filename.includes('.mp4')) incrementStorage('videos');
    else if (filename.includes('.png') || filename.includes('.jpg') || filename.includes('.pdf')) incrementStorage('images');
    else if (filename.includes('.wav') || filename.includes('.mp3')) incrementStorage('audio');

    if (statusElementId) {
        // Fix for iOS PWA freezing: Generate a physical button instead of an automatic hidden click
        const statusEl = document.getElementById(statusElementId);
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerHTML = `<a href="${url}" download="${filename}" style="display:block; background:var(--accent); color:white; padding:14px; border-radius:10px; text-decoration:none; margin-top:15px; font-weight:600; text-align:center;">Tap to Save File</a>
            <p style="font-size:0.75rem; color:#888; margin-top:8px; text-align:center;">(If it opens on screen, long-press the file to save it to Photos/Files)</p>`;
        }
    } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    }
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
        cards[1].querySelector('p').innerText = `${videoCount} items`; 
        cards[2].querySelector('p').innerText = `${audioCount} items`; 
        cards[3].querySelector('p').innerText = `${imgCount} items`;   
    }
}

document.addEventListener('DOMContentLoaded', updateStorageUI);

// --- Keyless Media Extraction (Cobalt Proxy) ---
async function extractMedia() {
    const url = document.getElementById('targetUrl').value;
    const mode = document.getElementById('mediaMode').value;
    const status = document.getElementById('extStatus'); 

    if (!url) return alert('A valid target URL is required.');
    
    if (status) {
        status.style.display = 'block';
        status.innerHTML = 'Connecting to proxy...';
    }

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
        
        if (payload.error && payload.error.code === 'error.api.auth.turnstile.missing') {
            alert('The public API blocked the request due to Bot Protection. You must host your own API instance to bypass this.');
            if (status) status.style.display = 'none';
            return;
        }

        if (!response.ok) throw new Error(`HTTP Error`);
        
        if (payload.status === 'redirect' || payload.status === 'stream') {
            window.open(payload.url, '_blank'); 
            if (status) status.style.display = 'none';
            closeModals();
        } else if (payload.url) {
            triggerDownload(payload.url, `media_${Date.now()}`, 'extStatus');
        } else {
            alert('Proxy encountered an error.');
            if (status) status.style.display = 'none';
        }
    } catch (error) {
        console.error('Extraction Exception:', error);
        alert('Extraction failed. The proxy may be rate-limiting requests.');
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
    if (status) {
        status.style.display = 'block';
        status.innerHTML = 'Processing...';
    }

    try {
        if (mode === 'imgToPdf') await rasterToVector(file);
        else if (mode === 'pdfToImg') await vectorToRaster(file);
    } catch (error) {
        console.error('Transformation Exception:', error);
        alert('Binary transformation failed.');
        if (status) status.style.display = 'none';
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
                triggerDownload(doc.output('bloburl'), `packaged_${Date.now()}.pdf`, 'docStatus');
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
            triggerDownload(canvas.toDataURL('image/png'), `rasterized_${Date.now()}.png`, 'docStatus');
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
    if (status) {
        status.style.display = 'block';
        status.innerHTML = 'Applying filters...';
    }

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
            
            triggerDownload(canvas.toDataURL('image/jpeg', 0.98), `enhanced_${Date.now()}.jpg`, 'visStatus');
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
        status.innerHTML = 'Initializing processing engine...';
    }
    
    const file = fileInput.files[0];
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
        if (status) status.innerHTML = 'Processing frames... Do not close app.';
        
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
            const blob = new Blob(chunks, { type: options.mimeType });
            triggerDownload(URL.createObjectURL(blob), `edited_vid_${Date.now()}.mp4`, 'vidStatus');
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
