window.addEventListener("DOMContentLoaded", () => {
    const title = document.querySelector("h2");
    const intro = document.getElementById("chuy");
    title.classList.remove("show");
    title.style.opacity = "0";
    title.style.transform = "translateX(120px)";
    intro.querySelectorAll(".fade-line").forEach((el) => {
        el.classList.remove("show");
        el.style.opacity = "0";
        el.style.transform = "translateX(120px)";
    });
    setTimeout(() => {
        showIntro();
    }, 120);
});
function wrapLines(container) {
    const elements = [...container.children];
    container.innerHTML = "";
    elements.forEach((el) => {
        const wrapper = document.createElement("div");
        wrapper.className = "fade-line";
        wrapper.appendChild(el);
        container.appendChild(wrapper);
    });
}
function hideIntro() {
    const intro = document.getElementById("chuy");
    const title = document.querySelector("h2");
    const blocks = [title, ...intro.querySelectorAll(".fade-line")];
    blocks.forEach((el, i) => {
        setTimeout(() => {
            el.classList.remove("show");
            el.classList.add("exit");
        }, i * 90);
    });
    setTimeout(
        () => {
            title.style.display = "none";
            intro.style.display = "none";
        },
        blocks.length * 90 + 600,
    );
}
function showIntro() {
    const intro = document.getElementById("chuy");
    const title = document.querySelector("h2");
    title.style.display = "block";
    intro.style.display = "block";
    const blocks = [title, ...intro.querySelectorAll(".fade-line")];
    blocks.forEach((el) => {
        el.classList.remove("exit", "show");
        el.style.transform = "translateX(120px)";
        el.style.opacity = "0";
    });
    blocks.forEach((el, i) => {
        setTimeout(() => {
            el.classList.add("show");
            el.style.transform = "";
            el.style.opacity = "";
        }, i * 90);
    });
}
wrapLines(document.getElementById("chuy"));
document.querySelector("h2").classList.add("fade-line", "show");
document
    .querySelectorAll("#chuy .fade-line")
    .forEach((el) => el.classList.add("show"));
