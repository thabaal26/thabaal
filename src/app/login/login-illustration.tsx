"use client";

export function LoginIllustration({ isNight = false }: { isNight?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <svg
        viewBox="0 0 500 650"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Sunset Sky Gradient */}
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFAA80" />
            <stop offset="35%" stopColor="#FF976A" />
            <stop offset="65%" stopColor="#F9826C" />
            <stop offset="100%" stopColor="#E26D77" />
          </linearGradient>

          {/* Night Sky Gradient (Optional) */}
          <linearGradient id="nightSkyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0D1127" />
            <stop offset="45%" stopColor="#1B1742" />
            <stop offset="100%" stopColor="#2E1C53" />
          </linearGradient>

          {/* Terrace Water Shelf Gradients */}
          <linearGradient id="shelfGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7B69B2" />
            <stop offset="100%" stopColor="#9281C7" />
          </linearGradient>
          <linearGradient id="shelfGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9A8AC9" />
            <stop offset="100%" stopColor="#B3A4DB" />
          </linearGradient>
          <linearGradient id="shelfGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#B7A8E0" />
            <stop offset="100%" stopColor="#CFC4EC" />
          </linearGradient>
          <linearGradient id="shelfGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D5C9F2" />
            <stop offset="100%" stopColor="#E6DEF7" />
          </linearGradient>

          {/* Soft Glow Filter */}
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. SKY */}
        <rect
          width="500"
          height="650"
          fill={isNight ? "url(#nightSkyGrad)" : "url(#skyGrad)"}
        />

        {/* 2. CLOUDS (Top warm sunset puffy clouds) */}
        <g className="animate-[puff_7s_ease-in-out_infinite_alternate]">
          {/* Top-Right Large Cloud */}
          <path
            d="M 370 42 
               C 390 42, 405 52, 408 68 
               C 424 70, 436 82, 436 98 
               C 436 114, 422 126, 406 126 
               L 330 126 
               C 314 126, 302 114, 302 98 
               C 302 85, 311 74, 324 70 
               C 326 54, 345 42, 370 42 Z"
            fill="#FFFFFF"
            opacity="0.95"
          />

          {/* Top-Right Secondary Soft Cloud */}
          <path
            d="M 440 95 
               C 455 95, 468 104, 470 116 
               C 482 118, 492 127, 492 140 
               C 492 153, 481 162, 468 162 
               L 410 162 
               C 396 162, 386 153, 386 140 
               C 386 129, 394 120, 404 117 
               C 406 104, 422 95, 440 95 Z"
            fill="#FFFFFF"
            opacity="0.85"
          />

          {/* Top-Left Small Drifting Cloud */}
          <path
            d="M 40 100 
               C 55 100, 68 108, 70 120 
               C 82 122, 92 131, 92 144 
               C 92 157, 81 166, 68 166 
               L 18 166 
               C 6 166, -4 157, -4 144 
               C -4 133, 4 124, 14 121 
               C 16 108, 30 100, 40 100 Z"
            fill="#FFFFFF"
            opacity="0.88"
          />
        </g>

        {/* 3. DISTANT MOUNTAIN RANGES */}
        {/* Far Mountain 1 (Soft purple silhouette) */}
        <path
          d="M 0 320 
             Q 90 240, 190 260 
             T 360 210 
             Q 440 170, 500 200 
             L 500 450 
             L 0 450 Z"
          fill="#633194"
          opacity="0.9"
        />

        {/* Mid Mountain 2 (Rich deep purple slope) */}
        <path
          d="M 0 350 
             Q 120 280, 240 310 
             T 420 250 
             L 500 290 
             L 500 480 
             L 0 480 Z"
          fill="#4A1E73"
        />

        {/* Right Mountain Silhouette Slope with Forest/Bush accents */}
        <path
          d="M 280 270 
             Q 380 230, 500 250 
             L 500 450 
             Q 400 370, 280 430 Z"
          fill="#3B145E"
        />

        {/* Silhouette foliage / tea bushes on slope */}
        <g fill="#2A0B47">
          <path d="M 400 340 q 6 -18 14 -12 q 10 12 4 24 z" />
          <path d="M 412 335 q 8 -24 18 -15 q 10 18 2 28 z" />
          <path d="M 370 380 q 4 -14 10 -10 q 8 10 3 18 z" />
          <path d="M 350 410 q 6 -16 12 -12 q 8 12 2 20 z" />
        </g>

        {/* 4. CASCADING STEPPED TERRACES (Rice & Tea Plateaus) */}

        {/* Terrace Tier 1 (Highest / Furthest Tier) */}
        {/* Shadow Wall */}
        <path
          d="M 370 340 
             Q 450 330, 500 360 
             L 500 395 
             Q 430 360, 360 375 Z"
          fill="#2C124D"
        />
        {/* Terrace Water Bed */}
        <path
          d="M 370 340 
             Q 440 335, 500 360 
             L 500 375 
             Q 440 350, 370 355 Z"
          fill="url(#shelfGrad1)"
        />

        {/* Terrace Tier 2 */}
        {/* Shadow Wall */}
        <path
          d="M 260 370 
             Q 380 340, 500 390 
             L 500 440 
             Q 370 385, 245 420 Z"
          fill="#280E46"
        />
        {/* Water Bed */}
        <path
          d="M 255 375 
             Q 375 348, 500 395 
             L 500 415 
             Q 370 370, 250 390 Z"
          fill="url(#shelfGrad2)"
        />

        {/* Terrace Tier 3 */}
        {/* Shadow Wall */}
        <path
          d="M 130 420 
             Q 280 375, 450 430 
             L 450 490 
             Q 260 435, 115 480 Z"
          fill="#220B3D"
        />
        {/* Water Bed */}
        <path
          d="M 125 425 
             Q 275 380, 445 435 
             L 445 460 
             Q 270 410, 120 445 Z"
          fill="url(#shelfGrad3)"
        />

        {/* Terrace Tier 4 */}
        {/* Shadow Wall */}
        <path
          d="M 30 475 
             Q 180 430, 380 490 
             L 380 560 
             Q 170 500, 15 545 Z"
          fill="#1C0834"
        />
        {/* Water Bed */}
        <path
          d="M 25 480 
             Q 175 435, 375 495 
             L 375 525 
             Q 170 470, 20 510 Z"
          fill="url(#shelfGrad4)"
        />

        {/* Terrace Tier 5 (Foreground Large Mirror Tier) */}
        {/* Shadow Wall */}
        <path
          d="M -10 540 
             Q 120 495, 320 565 
             L 320 660 
             L -10 660 Z"
          fill="#150529"
        />
        {/* Water Bed */}
        <path
          d="M -10 545 
             Q 115 500, 315 570 
             L 315 620 
             Q 110 550, -10 580 Z"
          fill="#EDE6FC"
        />

        {/* 5. FINE VERTICAL SHOOTS / REEDS IN TERRACE WATER (Distinctive Texture) */}
        <g stroke="#3E246A" strokeWidth="1.2" strokeLinecap="round" opacity="0.65">
          {/* Tier 1 shoots */}
          <line x1="400" y1="345" x2="400" y2="355" />
          <line x1="420" y1="348" x2="420" y2="360" />
          <line x1="450" y1="352" x2="450" y2="365" />
          <line x1="475" y1="358" x2="475" y2="370" />

          {/* Tier 2 shoots */}
          <line x1="280" y1="380" x2="280" y2="395" />
          <line x1="310" y1="375" x2="310" y2="390" />
          <line x1="345" y1="372" x2="345" y2="390" />
          <line x1="380" y1="375" x2="380" y2="395" />
          <line x1="420" y1="385" x2="420" y2="405" />
          <line x1="460" y1="395" x2="460" y2="415" />

          {/* Tier 3 shoots */}
          <line x1="150" y1="435" x2="150" y2="452" />
          <line x1="185" y1="425" x2="185" y2="445" />
          <line x1="220" y1="415" x2="220" y2="435" />
          <line x1="260" y1="410" x2="260" y2="430" />
          <line x1="300" y1="415" x2="300" y2="438" />
          <line x1="340" y1="425" x2="340" y2="450" />
          <line x1="380" y1="438" x2="380" y2="465" />
          <line x1="410" y1="448" x2="410" y2="475" />

          {/* Tier 4 shoots */}
          <line x1="50" y1="490" x2="50" y2="512" />
          <line x1="85" y1="480" x2="85" y2="502" />
          <line x1="120" y1="465" x2="120" y2="490" />
          <line x1="160" y1="455" x2="160" y2="480" />
          <line x1="200" y1="455" x2="200" y2="482" />
          <line x1="240" y1="465" x2="240" y2="495" />
          <line x1="280" y1="480" x2="280" y2="512" />
          <line x1="320" y1="495" x2="320" y2="528" />

          {/* Tier 5 shoots (Foreground) */}
          <line x1="15" y1="555" x2="15" y2="580" />
          <line x1="50" y1="540" x2="50" y2="568" />
          <line x1="85" y1="530" x2="85" y2="558" />
          <line x1="125" y1="520" x2="125" y2="550" />
          <line x1="165" y1="522" x2="165" y2="554" />
          <line x1="205" y1="535" x2="205" y2="570" />
          <line x1="245" y1="550" x2="245" y2="588" />
        </g>

        {/* 6. THABAAL SWIFT CARRIER BIRD / POSTAL GLIDER IN FLIGHT */}
        <g
          className="animate-[float_4s_ease-in-out_infinite]"
          transform="translate(140, 180)"
        >
          {/* Subtle glow circle */}
          <circle cx="20" cy="15" r="32" fill="#FFE58F" opacity="0.3" filter="url(#softGlow)" />

          {/* Glider / Bird Silhouette in Crisp White */}
          <path
            d="M 12 10 
               C 22 2, 42 0, 52 8 
               C 38 12, 28 20, 26 30 
               C 24 22, 16 16, 8 16 
               C -2 16, -14 26, -18 34 
               C -16 22, -6 14, 12 10 Z"
            fill="#FFFFFF"
            filter="url(#softGlow)"
          />

          {/* Letter / Envelope accent attached */}
          <rect
            x="16"
            y="26"
            width="12"
            height="8"
            rx="1.5"
            fill="#FFFFFF"
            stroke="#633194"
            strokeWidth="0.8"
          />
          <path d="M 16 26 L 22 30 L 28 26" stroke="#633194" strokeWidth="0.8" fill="none" />
        </g>
      </svg>
    </div>
  );
}
