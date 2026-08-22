export function showLoader(show, text = "Cargando...") {
    const overlay = document.getElementById("loader-overlay");
    if (!overlay) return;
    const textEl = overlay.querySelector("p");
    if (textEl) textEl.textContent = text;

    if (show) {
        overlay.classList.remove("hidden");
    } else {
        overlay.classList.add("hidden");
    }
}
