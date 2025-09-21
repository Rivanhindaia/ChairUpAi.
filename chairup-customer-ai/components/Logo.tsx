export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className="rounded-2xl"
        aria-hidden
      >
        <defs>
          <linearGradient id="cu" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#111827" />
            <stop offset="100%" stopColor="#4b5563" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#cu)" />
        {/* C */}
        <path
          d="M44,20c-3-3-7-5-12-5c-10,0-17,7-17,17s7,17,17,17c5,0,9-2,12-5l-5-5c-2,2-4,3-7,3c-6,0-10-4-10-10s4-10,10-10c3,0,5,1,7,3L44,20z"
          fill="#fff"
          opacity="0.92"
        />
        {/* Up arrow */}
        <path d="M40 28l0 18h6l0-18h5l-8-10-8 10h5z" fill="#10b981" />
      </svg>
      <div className="leading-tight">
        <div className="text-lg font-extrabold tracking-tight">ChairUp</div>
        <div className="text-[11px] text-slate-500 -mt-0.5">Book smarter</div>
      </div>
    </div>
  )
}
