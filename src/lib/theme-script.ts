// Runs before first paint (in <head>), so the page never flashes the wrong theme.
// Default for all new clients & visits is the warm light theme; dark mode activates only when explicitly chosen.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");var d=t==="dark";document.documentElement.classList.toggle("dark",d);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#0B1724":"#FFFDF6");}catch(e){}`;
