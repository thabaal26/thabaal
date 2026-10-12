/*
 * A face for the Thabaal bird, drawn over body.png in the same 640 × 354 space. The envelope's
 * V-flap already reads as a wide grin, so the face only adds eyes, cheeks and a mouth/tongue below
 * the V. `data-face` on the <svg> picks the expression (see mascot.css):
 *   open · joy (^ ^, laughing) · wink (😜 tongue out) · o (surprised) · dizzy · shut · peek
 */
export function BirdFace({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 354" className={`bf ${className}`} data-face="open" aria-hidden="true">
      {/* Cheeks: always a little rosy, brighter when happy. */}
      <g className="bf-cheeks" fill="#ff6b45">
        <ellipse cx="400" cy="172" rx="17" ry="9" />
        <ellipse cx="556" cy="166" rx="17" ry="9" />
      </g>

      {/* Open eyes; the group moves to look around and squashes to blink. */}
      <g className="bf-eyes">
        <g className="bf-l">
          <g className="bf-open bf-left">
            <ellipse cx="428" cy="134" rx="12.5" ry="15.5" fill="#062548" />
            <circle className="bf-shine" cx="432.5" cy="127.5" r="4.6" fill="#fff" />
          </g>
          <path className="bf-happy" d="M414 140 q14 -20 28 0" />
          <path className="bf-shut" d="M414 136 h28" />
          <path className="bf-spiral" d="M428 134 m-3 0 a3 3 0 1 1 6 0 a6 6 0 1 1 -12 0 a9 9 0 1 1 18 0 a12 12 0 1 1 -24 0" />
        </g>
        <g className="bf-r">
          <g className="bf-open bf-right">
            <ellipse cx="520" cy="130" rx="12.5" ry="15.5" fill="#062548" />
            <circle className="bf-shine" cx="524.5" cy="123.5" r="4.6" fill="#fff" />
          </g>
          <path className="bf-happy" d="M506 136 q14 -20 28 0" />
          <path className="bf-shut" d="M506 132 h28" />
          <path className="bf-wink" d="M507 126 l24 7 l-24 7" />
          <path className="bf-spiral" d="M520 130 m-3 0 a3 3 0 1 1 6 0 a6 6 0 1 1 -12 0 a9 9 0 1 1 18 0 a12 12 0 1 1 -24 0" />
        </g>
      </g>

      {/* Mouths under the V. */}
      <path className="bf-mouth bf-m-small" d="M461 211 q9 14 18 0" />
      <g className="bf-mouth bf-m-laugh">
        <path d="M452 210 q18 40 36 0 z" fill="#062548" />
        <path d="M460 226 q10 -8 20 0 q-10 12 -20 0 z" fill="#ff6b45" />
      </g>
      <path className="bf-mouth bf-m-tongue" d="M462 210 q2 22 12 22 q10 0 10 -20 z" fill="#ff6b45" stroke="#062548" strokeWidth="5" strokeLinejoin="round" />
      <ellipse className="bf-mouth bf-m-o" cx="470" cy="222" rx="8" ry="10" fill="#062548" />
      <path className="bf-mouth bf-m-wobble" d="M452 220 q6 -8 12 0 t12 0 t12 0" />
    </svg>
  );
}
