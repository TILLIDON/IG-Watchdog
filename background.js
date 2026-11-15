// background.js

const DEFAULT_STATE = {
    lastFollowers: [],
    lastFollowing: [],
    unfollowersLog: [],
    blockersLog: [],
    pendingRequests: [],
    currentMedia: null // Added for media downloader
};

async function getState() {
    const state = await chrome.storage.local.get(Object.keys(DEFAULT_STATE));
    return { ...DEFAULT_STATE, ...state };
}

async function saveState(state) {
    await chrome.storage.local.set(state);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'UPDATE_DATA') {
        handleDataUpdate(message.type, message.payload);
    }
    if (message.action === 'GET_STATE') {
        getState().then(state => sendResponse(state));
        return true;
    }
    if (message.action === 'RESET_STATE') {
        saveState(DEFAULT_STATE).then(() => sendResponse(true));
        return true;
    }
});

async function handleDataUpdate(type, payload) {
    const state = await getState();
    let changes = { unfollowers: [], blockers: [] };

    if (type === 'FOLLOWERS') {
        const currentIds = new Set(payload.map(p => p.id));
        const previousIds = new Set(state.lastFollowers.map(p => p.id));
        const removedIds = [...previousIds].filter(id => !currentIds.has(id));
        
        if (removedIds.length > 0) {
            const removedUsers = state.lastFollowers.filter(u => removedIds.includes(u.id));
            changes.unfollowers = removedUsers.map(u => ({...u, timestamp: Date.now()}));
        }
        state.lastFollowers = payload;
        state.unfollowersLog = [...state.unfollowersLog, ...changes.unfollowers].slice(-100);

    } else if (type === 'FOLLOWING') {
        const currentFollowingIds = new Set(payload.map(p => p.id));
        const previousFollowingIds = new Set(state.lastFollowing.map(p => p.id));
        const previousFollowerIds = new Set(state.lastFollowers.map(p => p.id));
        const removedFromFollowing = [...previousFollowingIds].filter(id => {
            return !currentFollowingIds.has(id) && !previousFollowerIds.has(id);
        });

        if (removedFromFollowing.length > 0) {
            const blockedUsers = state.lastFollowing.filter(u => removedFromFollowing.includes(u.id));
            changes.blockers = blockedUsers.map(u => ({...u, timestamp: Date.now()}));
        }
        state.lastFollowing = payload;
        state.blockersLog = [...state.blockersLog, ...changes.blockers].slice(-100);

    } else if (type === 'PENDING') {
        state.pendingRequests = payload;

    } else if (type === 'MEDIA') {
        // Store the latest media found
        state.currentMedia = payload;
    }

    await saveState(state);

    if (changes.unfollowers.length > 0 || changes.blockers.length > 0) {
        const msgParts = [];
        if (changes.unfollowers.length) msgParts.push(`${changes.unfollowers.length} Unfollowers`);
        if (changes.blockers.length) msgParts.push(`${changes.blockers.length} Potential Blockers`);
        
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "IG Watchdog Alert",
            message: msgParts.join(', ')
        });
    }
}