'use client';

import { useEffect, useMemo, useState } from 'react';

function utcStamp(d = new Date()) {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/**
 * Forensic watermark: candidate username, candidate ID, attempt reference and a live timestamp,
 * tiled diagonally across the whole screen. Subtle enough to read through, but present in any
 * screenshot, recording or phone photo so leaked material can be traced to the attempt.
 */
export function Watermark({ candidateCode, candidateRef, referenceCode }: { candidateCode: string; candidateRef: string; referenceCode: string }) {
  const [stamp, setStamp] = useState(utcStamp());
  useEffect(() => {
    const t = setInterval(() => setStamp(utcStamp()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tile = useMemo(() => {
    const l1 = escapeXml(`LIBRA RP • ${candidateCode}`);
    const l2 = escapeXml(`CONFIDENTIAL • ATTEMPT #${referenceCode}`);
    const l3 = escapeXml(`ID ${candidateRef} • ${stamp}`);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='250'><g transform='rotate(-22 230 125)' font-family='ui-monospace,Menlo,monospace' fill='%23F2EEE6' fill-opacity='0.055'><text x='40' y='105' font-size='15' font-weight='700' letter-spacing='3'>${l1}</text><text x='40' y='128' font-size='12' letter-spacing='2'>${l2}</text><text x='40' y='148' font-size='11' letter-spacing='1.5'>${l3}</text></g></svg>`;
    return `url("data:image/svg+xml;utf8,${svg.replace(/#/g, '%23').replace(/"/g, "'")}")`;
  }, [candidateCode, candidateRef, referenceCode, stamp]);

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] select-none" style={{ backgroundImage: tile, backgroundRepeat: 'repeat' }} />
      <div aria-hidden className="pointer-events-none fixed bottom-3 right-4 z-[46] select-none font-mono text-[10.5px] tracking-[0.08em] text-fg/25">
        {candidateCode} · #{referenceCode} · {stamp}
      </div>
      <div aria-hidden className="pointer-events-none fixed left-4 top-1/2 z-[46] -translate-y-1/2 -rotate-90 select-none font-mono text-[10px] tracking-[0.3em] text-fg/[0.12] [transform-origin:left_center]">
        CONFIDENTIAL · {referenceCode}
      </div>
    </>
  );
}
