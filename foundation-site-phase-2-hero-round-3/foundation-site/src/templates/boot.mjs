// Runs in <head> before first paint so the menu never flashes open on a phone.
// The server's Content-Security-Policy allows exactly this snippet by hash.
export const BOOT_SNIPPET = "document.documentElement.classList.add('js')";
