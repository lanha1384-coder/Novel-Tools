(function () {
    function slugify(text) {
        return text
            .normalize("NFC")
            .trim()
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-");
    }
    function getCurrentSlug() {
        if (!location.hash) return "";
        return decodeURIComponent(location.hash.slice(1));
    }
    function cleanUrlAndReload() {
        history.replaceState(null, "", location.pathname);
        location.reload();
    }
    function syncUrlWithTitle() {
        const h1 = document.querySelector("#app h1");
        if (!h1) return;
        const realSlug = slugify(h1.textContent.trim());
        const currentSlug = getCurrentSlug();
        if (!currentSlug) {
            history.replaceState(
                null,
                "",
                location.pathname + "#" + encodeURIComponent(realSlug),
            );
            return;
        }
        if (currentSlug !== realSlug) {
            cleanUrlAndReload();
        }
    }
    function waitForTitleAndSync() {
        const observer = new MutationObserver(() => {
            const h1 = document.querySelector("#app h1");
            if (!h1) return;
            observer.disconnect();
            syncUrlWithTitle();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }
    window.addEventListener("DOMContentLoaded", () => {
        waitForTitleAndSync();
        window.addEventListener("hashchange", () => {
            syncUrlWithTitle();
        });
    });
})();
