const STORY_BOOKMARK_KEY = "story-last-chapters";
function getStoryTitle() {
    const h1 = document.querySelector("#app h1");
    if (!h1) return null;
    return h1.textContent.trim();
}
function loadStoryBookmarks() {
    const raw = localStorage.getItem(STORY_BOOKMARK_KEY);
    return raw ? JSON.parse(raw) : {};
}
function saveStoryBookmarks(data) {
    localStorage.setItem(STORY_BOOKMARK_KEY, JSON.stringify(data));
}
function saveCurrentChapter(index) {
    const title = getStoryTitle();
    if (!title) return;
    const data = loadStoryBookmarks();
    data[title] = index;
    saveStoryBookmarks(data);
}
function getSavedChapter() {
    const title = getStoryTitle();
    if (!title) return null;
    const data = loadStoryBookmarks();
    return data[title] ?? null;
}
