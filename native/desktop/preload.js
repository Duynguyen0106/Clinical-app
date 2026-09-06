// Preload stays minimal — clinic UI talks to its own HTTPS API.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.treowDesktop = "1";
});
