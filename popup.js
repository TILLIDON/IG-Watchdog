// popup.js

function renderList(containerId, data, emptyText) {
    const container = document.getElementById(containerId);
    if (!data || data.length === 0) {
        container.innerHTML = `<em class="small">${emptyText}</em>`;
        return;
    }
    const items = data.slice(-10).reverse();
    container.innerHTML = items.map(item => `
        <div class="item">@${item.username} <span class="small">(${new Date(item.timestamp).toLocaleDateString()})</span></div>
    `).join('');
}

function renderMedia(media) {
    const infoDiv = document.getElementById('mediaInfo');
    const typeSpan = document.getElementById('mediaType');
    const downloadDiv = document.getElementById('mediaDownloads');

    if (!media) {
        infoDiv.innerText = "No media detected. View a post, reel, or story.";
        typeSpan.innerText = "None";
        downloadDiv.innerHTML = "";
        return;
    }

    typeSpan.innerText = media.type.replace('Graph', '');
    infoDiv.innerText = `@${media.owner || 'Unknown'} | ${media.shortcode || media.id}`;

    let html = '';

    // Single Video
    if (media.videoUrl) {
        const filename = `ig_video_${media.shortcode || media.id}.mp4`;
        html += `<a href="${media.videoUrl}" download="${filename}" class="download-btn">⬇️ Download Video (MP4)</a>`;
    }

    // Single Image
    if (media.imageUrl && !media.sidecarItems) {
        const filename = `ig_image_${media.shortcode || media.id}.jpg`;
        html += `<a href="${media.imageUrl}" download="${filename}" class="download-btn">⬇️ Download Image (JPG)</a>`;
    }

    // Carousel (Sidecar)
    if (media.sidecarItems && media.sidecarItems.length > 0) {
        html += `<div class="small" style="margin-top:5px;">Carousel Items:</div>`;
        media.sidecarItems.forEach((item, index) => {
            if (item.videoUrl) {
                const filename = `ig_reel_${media.shortcode || media.id}_part${index+1}.mp4`;
                html += `<a href="${item.videoUrl}" download="${filename}" class="download-btn">⬇️ Video Part ${index + 1}</a>`;
            }
            if (item.imageUrl) {
                const filename = `ig_image_${media.shortcode || media.id}_part${index+1}.jpg`;
                html += `<a href="${item.imageUrl}" download="${filename}" class="download-btn">⬇️ Image Part ${index + 1}</a>`;
            }
        });
    }

    if (html === '') {
        html = `<em class="small">No downloadable media found.</em>`;
    }

    downloadDiv.innerHTML = html;
}

async function loadData() {
    const state = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
    
    document.getElementById('unfCount').innerText = state.unfollowersLog.length;
    document.getElementById('blkCount').innerText = state.blockersLog.length;
    document.getElementById('pndCount').innerText = state.pendingRequests.length;

    renderList('unfList', state.unfollowersLog, 'No unfollowers detected.');
    renderList('blkList', state.blockersLog, 'No blockers detected.');
    renderList('pndList', state.pendingRequests, 'No pending requests.');
    
    renderMedia(state.currentMedia);
}

document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm('This will clear all logs and reset the follower baseline. Continue?')) {
        await chrome.runtime.sendMessage({ action: 'RESET_STATE' });
        alert('Baseline reset. Next time you load your profile, a new baseline will be set.');
        loadData();
    }
});

// Refresh media when popup opens (in case user viewed a post while popup was closed)
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'MEDIA_UPDATED') {
        loadData();
    }
});

loadData();