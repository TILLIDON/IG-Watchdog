// content.js

const IG_DATA_STORE = {
    followers: [],
    following: [],
    pendingRequests: [],
    currentMedia: null // Stores the most recently viewed post/reel/story media
};

const originalFetch = window.fetch;
window.fetch = function() {
    const result = originalFetch.apply(this, arguments);
    
    if (arguments[0].toString().includes('graphql')) {
        return result.then(response => {
            const clonedResponse = response.clone();
            return clonedResponse.json().then(data => {
                processGraphQL(data);
            }).catch(() => {});
        }).then(response => {
            return response;
        });
    }
    return result;
};

function processGraphQL(data) {
    // --- USER DATA (FOLLOWERS/FOLLOWING) ---
    if (data.data?.user?.edge_followed_by) {
        const edges = data.data.user.edge_followed_by.edges;
        IG_DATA_STORE.followers = edges.map(edge => ({
            id: edge.node.id,
            username: edge.node.username,
            is_verified: edge.node.is_verified
        }));
        sendToBackground('FOLLOWERS', IG_DATA_STORE.followers);
    }

    if (data.data?.user?.edge_follow) {
        const edges = data.data.user.edge_follow.edges;
        IG_DATA_STORE.following = edges.map(edge => ({
            id: edge.node.id,
            username: edge.node.username
        }));
        sendToBackground('FOLLOWING', IG_DATA_STORE.following);
    }

    if (data.data?.user?.edge_follow_requests) {
        const edges = data.data.user.edge_follow_requests.edges;
        IG_DATA_STORE.pendingRequests = edges.map(edge => ({
            id: edge.node.id,
            username: edge.node.username
        }));
        sendToBackground('PENDING', IG_DATA_STORE.pendingRequests);
    }

    // --- MEDIA DATA (POSTS, REELS, STORIES) ---
    // Instagram uses different keys for different media types.
    // Common keys: 'xdt_api__v1__feed__thread__timeline', 'xdt_api__v1__media__oembed', etc.
    // But the most reliable is looking for 'shortcode_media' or 'clips_video' in the response.
    
    extractMediaFromGraphQL(data);
}

function extractMediaFromGraphQL(data) {
    let media = null;
    
    // Helper to find the actual media node in nested data
    const findMediaNode = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        
        // Check if this object looks like a media node
        if (obj.__typename && ['GraphImage', 'GraphVideo', 'GraphSidecar', 'GraphReel', 'GraphStory'].includes(obj.__typename)) {
            return obj;
        }
        
        // Recurse into child objects
        for (let key in obj) {
            if (obj[key] && typeof obj[key] === 'object') {
                const found = findMediaNode(obj[key]);
                if (found) return found;
            }
        }
        return null;
    };

    const mediaNode = findMediaNode(data);

    if (mediaNode) {
        media = {
            id: mediaNode.id,
            shortcode: mediaNode.shortcode,
            type: mediaNode.__typename,
            owner: mediaNode.owner?.username,
            timestamp: Date.now()
        };

        // Extract Video URL
        if (mediaNode.video_versions && mediaNode.video_versions.length > 0) {
            // Sort by height to get the highest quality
            const bestVideo = [...mediaNode.video_versions].sort((a, b) => b.height - a.height)[0];
            media.videoUrl = bestVideo.url;
        }

        // Extract Image URL
        if (mediaNode.display_url) {
            media.imageUrl = mediaNode.display_url;
        }
        
        // Extract Sidecar (Carousel) Items
        if (mediaNode.edge_sidecar_to_children?.edges) {
            media.sidecarItems = mediaNode.edge_sidecar_to_children.edges.map(edge => {
                const node = edge.node;
                return {
                    type: node.__typename,
                    videoUrl: node.video_versions?.[0]?.url || null,
                    imageUrl: node.display_url || null
                };
            });
        }

        // Only update if we found actual media content
        if (media.videoUrl || media.imageUrl || (media.sidecarItems && media.sidecarItems.length > 0)) {
            IG_DATA_STORE.currentMedia = media;
            sendToBackground('MEDIA', media);
        }
    }
}

function sendToBackground(type, payload) {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({
        action: 'UPDATE_DATA',
        type: type,
        payload: payload
    });
}