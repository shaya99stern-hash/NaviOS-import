// --- UI Control Functions ---
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.style.display = 'none');
}
/**
 * Media Engine PWA Core Logic
 * Orchestrates proxy networking, binary parsing, and mathematical canvas manipulation.
 */

// -----------------------------------------------------------------------------
// Phase 1: Dynamic Service Worker Registration
// -----------------------------------------------------------------------------
// To maintain a strict three-file structure, the Service Worker is generated
// as an inline Blob and registered dynamically. This satisfies browser
// offline requirements for PWA installation prompts.
const swScript = `
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open('media-core-v1').then((cache) => {
        return cache.addAll(['./index.html', './manifest.json', './app.js']);
    }));
});
self.addEventListener('fetch', (event) => {
    event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
});
`;
const workerBlob = new Blob([swScript], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(workerUrl)
        .then(() => console.log('Service Worker successfully bound to scope.'))
        .catch((err) => console.error('Service Worker registration failed:', err));
}

// -----------------------------------------------------------------------------
// Phase 2: PDF Worker Synchronization
// -----------------------------------------------------------------------------
// The worker URL must exactly match the API version initialized in the HTML.
window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Utility function to force browser downloads of local Blobs or Data URLs
function triggerDownload(url, filename) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

// -----------------------------------------------------------------------------
// Phase 3: Keyless Media Extraction (Cobalt Proxy)
// -----------------------------------------------------------------------------
async function extractMedia() {
    const url = document.getElementById('targetUrl').value;
    const mode = document.getElementById('mediaMode').value;
    const status = document.getElementById('extStatus');
    
    if (!url) return alert('A valid target URL is required.');
    status.style.display = 'block';

    // Construct the RESTful JSON payload for the Cobalt proxy endpoint
    const requestPayload = {
        url: url,
        vQuality: "max",       // Enforce maximum available video resolution
        vCodec: "h264",        // Prioritize iOS-native decoding compatibility
        aFormat: "wav",        // Request lossless audio for enhancement
        isAudioOnly: mode === 'audio'
    };

    try {
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        });

        // Evaluate HTTP status codes (e.g., 429 Rate Limit, 200 OK)
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const payload = await response.json();
        
        if (payload.status === 'redirect' || payload.status === 'stream') {
            window.open(payload.url, '_blank'); 
        } else if (payload.url) {
            triggerDownload(payload.url, `media_payload_${Date.now()}`);
        } else {
            alert('Proxy encountered a systemic error: ' + (payload.text || 'Unknown'));
        }
    } catch (error) {
        console.error('Extraction Exception:', error);
        alert('Extraction failed. Verify CORS policies or rate-limiting thresholds.');
    } finally {
        status.style.display = 'none';
    }
}

// -----------------------------------------------------------------------------
// Phase 4: Document Transformation Orchestration
// -----------------------------------------------------------------------------
async function transformDocument() {
    const fileInput = document.getElementById('docFile');
    const mode = document.getElementById('docMode').value;
    const status = document.getElementById('docStatus');

    if (!fileInput.files.length) return alert('Target file required for transformation.');
    const file = fileInput.files[0];
    status.style.display = 'block';

    try {
        if (mode === 'imgToPdf') {
            await rasterToVector(file);
        } else if (mode === 'pdfToImg') {
            await vectorToRaster(file);
        }
    } catch (error) {
        console.error('Transformation Exception:', error);
        alert('Binary transformation failed.');
    } finally {
        status.style.display = 'none';
    }
}

function rasterToVector(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Instantiate jsPDF perfectly mapped to the image's bounding box
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({
                    orientation: img.width > img.height ? 'l' : 'p',
                    unit: 'px',
                    format: [img.width, img.height]
                });
                
                // Embed the raster array into the PDF binary dictionary
                doc.addImage(img, 'PNG', 0, 0, img.width, img.height);
                doc.save(`packaged_${Date.now()}.pdf`);
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
            // Cast the raw ArrayBuffer to Uint8Array for the worker thread
            const binaryArray = new Uint8Array(this.result);
            
            const pdfDoc = await window.pdfjsLib.getDocument({data: binaryArray}).promise;
            const page = await pdfDoc.getPage(1); 
            
            // Multiply the viewport scale to generate an HD raster grid
            const scaleFactor = 2.5; 
            const viewport = page.getViewport({scale: scaleFactor});
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Paint the vector instructions onto the canvas matrix
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            triggerDownload(canvas.toDataURL('image/png'), `rasterized_${Date.now()}.png`);
            resolve();
        };
        reader.readAsArrayBuffer(file);
    });
}

// -----------------------------------------------------------------------------
// Phase 5: Algorithmic Visual Enhancements
// -----------------------------------------------------------------------------
function enhanceVisuals() {
    const fileInput = document.getElementById('visualFile');
    const status = document.getElementById('visStatus');
    
    if (!fileInput.files.length) return alert('Visual asset required.');
    const file = fileInput.files[0];
    status.style.display = 'block';

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Apply GPU-accelerated algorithmic filters via Canvas Context
            // This pushes pixel luminance and saturation values aggressively.
            ctx.filter = 'contrast(1.18) brightness(1.08) saturate(1.25)';
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Export the manipulated pixel array as a heavily optimized JPEG
            triggerDownload(canvas.toDataURL('image/jpeg', 0.98), `enhanced_${Date.now()}.jpg`);
            status.style.display = 'none';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
