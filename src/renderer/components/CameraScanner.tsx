import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Camera, CameraOff, Check, Flashlight, FlashlightOff } from 'lucide-react'
import { dispatchScan } from '@/lib/scanBus'
import { useApp } from '@/store/app'
import { Modal } from './Modal'
import { tNow, useT } from '@/lib/i18n'

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
const ZX_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE
]
const DEBOUNCE_MS = 1500

interface NativeDetector {
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>
}
type DetectorCtor = { new (o: { formats: string[] }): NativeDetector; getSupportedFormats(): Promise<string[]> }

async function makeDetector(): Promise<NativeDetector | null> {
  const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (!BD) return null
  try {
    const supported = await BD.getSupportedFormats()
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f))
    return formats.length ? new BD({ formats }) : null
  } catch {
    return null
  }
}

interface Props {
  onClose: () => void
  /** single-shot mode (e.g. filling a barcode field); default is continuous add-to-cart */
  onCode?: (code: string) => void
}

export function CameraScanner({ onClose, onCode }: Props) {
  const t = useT()
  const savedId = useApp((s) => s.settings.cameraDeviceId)
  const lowPower = useApp((s) => s.settings.lowPower)
  const saveSettings = useApp((s) => s.saveSettings)
  const video = useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState(savedId)
  const [error, setError] = useState('')
  const [engine, setEngine] = useState('')
  const [torch, setTorch] = useState<boolean | null>(null) // null = unsupported
  const [flash, setFlash] = useState(0)
  const [last, setLast] = useState('')
  const track = useRef<MediaStreamTrack | null>(null)
  const recent = useRef({ code: '', at: 0 })
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let stream: MediaStream | null = null

    const hit = (code: string): void => {
      const now = Date.now()
      if (code === recent.current.code && now - recent.current.at < DEBOUNCE_MS) return
      recent.current = { code, at: now }
      setLast(code)
      setFlash((f) => f + 1)
      if (onCodeRef.current) {
        onCodeRef.current(code)
        closeRef.current()
      } else dispatchScan(code, 'camera')
    }

    ;(async () => {
      setError('')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        })
      } catch (e) {
        const name = (e as DOMException).name
        setError(
          name === 'NotAllowedError'
            ? tNow('Camera permission was denied. Allow camera access for Cashier in your system privacy settings, then reopen this panel.')
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? tNow('No camera found. Plug in a USB camera, or connect your phone as a webcam, then pick it above.')
              : tNow('Camera could not start: {why}', { why: (e as Error).message })
        )
        return
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop())
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => undefined)
      track.current = stream.getVideoTracks()[0]
      const caps = (track.current.getCapabilities?.() ?? {}) as { torch?: boolean }
      setTorch(caps.torch ? false : null)
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'))

      const native = await makeDetector()
      setEngine(native ? 'BarcodeDetector' : 'ZXing')
      const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, ZX_FORMATS]])
      const reader = new BrowserMultiFormatReader(hints)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!

      const loop = async (): Promise<void> => {
        if (stopped) return
        if (v.readyState >= 2 && v.videoWidth) {
          try {
            if (native) {
              const found = await native.detect(v)
              if (found[0]?.rawValue) hit(found[0].rawValue)
            } else {
              // scan the centre band at reduced size: faster and matches the on-screen frame
              const w = Math.min(lowPower ? 640 : 960, v.videoWidth)
              const h = Math.round((w / v.videoWidth) * v.videoHeight)
              canvas.width = w
              canvas.height = h
              ctx.drawImage(v, 0, 0, w, h)
              const r = reader.decodeFromCanvas(canvas)
              if (r) hit(r.getText())
            }
          } catch {
            // NotFoundException on frames without a code is normal
          }
        }
        timer = setTimeout(loop, lowPower ? 300 : 110) // ~3 vs ~9 decodes per second
      }
      void loop()
    })()

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      track.current = null
    }
  }, [deviceId, lowPower])

  const pickDevice = (id: string): void => {
    setDeviceId(id)
    void saveSettings({ cameraDeviceId: id }).catch(() => undefined)
  }

  const toggleTorch = async (): Promise<void> => {
    if (!track.current || torch === null) return
    try {
      await track.current.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  return (
    <Modal title={onCode ? t('Scan a barcode') : t('Camera scanner')} onClose={onClose} width="max-w-3xl">
      <div className="flex items-center gap-3 mb-3">
        <select className="field flex-1" value={deviceId} onChange={(e) => pickDevice(e.target.value)} aria-label={t('Camera')}>
          <option value="">{t('Default camera')}</option>
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || t('Camera {n}', { n: i + 1 })}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={toggleTorch} disabled={torch === null} title={torch === null ? t('Torch not supported by this camera') : t('Toggle torch')}>
          {torch ? <FlashlightOff size={18} /> : <Flashlight size={18} />} {t('Torch')}
        </button>
      </div>
      <div className="relative rounded-2xl overflow-hidden bg-ink aspect-video">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white/85 p-8 gap-3">
            <CameraOff size={40} />
            <p className="max-w-md">{error}</p>
          </div>
        ) : (
          <>
            <video ref={video} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[62%] h-[46%] rounded-2xl border-4 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] relative overflow-hidden">
                <div className="absolute left-0 right-0 h-0.5 bg-yellow/90 top-1/2 animate-pulse" />
              </div>
            </div>
            {flash > 0 && (
              <div key={flash} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-24 h-24 rounded-full bg-emerald-500 text-white flex items-center justify-center animate-flash shadow-lg">
                  <Check size={56} strokeWidth={3} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 text-sm text-muted">
        <span className="flex items-center gap-2">
          <Camera size={16} /> {engine ? t('Engine: {name}', { name: engine }) : t('Starting camera…')} · EAN-13/8, UPC-A/E, Code 128/39, QR
        </span>
        <span>
          {t('Last:')} <b className="text-ink font-mono">{last || '—'}</b>
        </span>
      </div>
      {!onCode && <p className="text-xs text-muted mt-2">{t('Continuous mode: each scan adds one item. The same code is ignored for 1.5 s.')}</p>}
    </Modal>
  )
}
