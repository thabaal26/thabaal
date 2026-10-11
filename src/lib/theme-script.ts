// Runs before first paint (in <head>), so the page never flashes the wrong theme.
// Kept outside the client component: a "use client" module can't hand a plain string to the server layout.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;
