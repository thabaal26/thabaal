// Runs before first paint (in <head>), so the page never flashes the wrong theme.
// Kept outside the client component: a "use client" module can't hand a plain string to the server layout.
// The warm light theme is the default; "dark" or "system" (follow the device) only when chosen.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#0B1E2D":"#FFF9F0");}catch(e){}`;
