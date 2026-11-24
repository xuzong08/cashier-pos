import { useEffect, useRef, useState } from 'react'
import { toCanvas } from 'bwip-js/browser'

interface Props {
  text: string
  bcid?: 'ean13' | 'ean8' | 'upca' | 'upce' | 'code128' | 'code39' | 'qrcode'
  scale?: number
  height?: number
  className?: string
}

export function Barcode({ text, bcid = 'ean13', scale = 2, height = 14, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!ref.current) return
    try {
      toCanvas(ref.current, {
        bcid,
        text,
        scale,
        // EAN/UPC have their own human-readable layout; only free-text symbologies need centring
        ...(bcid === 'qrcode' ? {} : { height, includetext: true }),
        ...(bcid === 'code128' || bcid === 'code39' ? { textxalign: 'center' as const } : {}),
        backgroundcolor: 'FFFFFF',
        paddingwidth: 6,
        paddingheight: 6
      })
      setErr('')
    } catch (e) {
      setErr(String(e))
    }
  }, [text, bcid, scale, height])
  if (err) return <div className="text-xs text-rose-500">Cannot render {text}</div>
  return <canvas ref={ref} className={className} aria-label={`${bcid} ${text}`} />
}
