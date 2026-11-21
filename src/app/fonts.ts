import { DM_Sans, Geist, Geist_Mono, Inter, Noto_Sans_Tamil, Nunito, Poppins } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme-script";

export const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap", preload: false });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false });
export const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap", preload: false });
export const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
export const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap", preload: false });
export const tamil = Noto_Sans_Tamil({ variable: "--font-tamil", subsets: ["tamil"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });

export const fontClassNames = `${dmSans.variable} ${geistSans.variable} ${geistMono.variable} ${tamil.variable} ${nunito.variable} ${inter.variable} ${poppins.variable} h-full antialiased`;

export const INIT_SCRIPT = `${THEME_SCRIPT}\n(function(){try{var l=localStorage.getItem("thabaal-lang");if(l==="ta"||l==="en"){document.documentElement.lang=l;}}catch(e){}\ntry{var origSet=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(typeof n==="string"&&(n.indexOf("bis_")===0||n==="data-darkreader-inline-stroke"||n==="data-darkreader-inline-fill"))return;return origSet.apply(this,arguments);};}catch(e){}\ntry{var mo=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var m=muts[i];if(m.type==="attributes"&&m.attributeName&&m.attributeName.indexOf("bis_")===0){m.target.removeAttribute(m.attributeName);}}});mo.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:["bis_skin_checked","bis_register"]});}catch(e){}})();`;
