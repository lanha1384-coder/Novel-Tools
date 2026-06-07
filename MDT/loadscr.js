function wrapAppDetails() {
    document.querySelectorAll("#app > details").forEach((details) => {
        if (details.dataset.slideWrapped) return;
        details.dataset.slideWrapped = "1";
        const wrapper = document.createElement("div");
        wrapper.className = "slide-item";
        details.parentNode.insertBefore(wrapper, details);
        wrapper.appendChild(details);
    });
}
function slideInDetails() {
    wrapAppDetails();
    document.querySelectorAll("#app .slide-item").forEach((el, i) => {
        el.classList.remove("exit", "show");
        el.style.transform = "translateX(120px)";
        el.style.opacity = "0";
        setTimeout(() => {
            el.classList.add("show");
            el.style.transform = "";
            el.style.opacity = "";
        }, i * 80);
    });
}
function slideOutDetails() {
    document.querySelectorAll("#app .slide-item").forEach((el, i) => {
        setTimeout(() => {
            el.classList.remove("show");
            el.classList.add("exit");
        }, i * 70);
    });
}
