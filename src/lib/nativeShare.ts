import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.readAsDataURL(blob)
  })
}

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export type FileAction = 'save' | 'share'

/** Saves to the device by default. Sharing is an explicit, separate action. */
export async function deliverFile(blob: Blob, filename: string, action: FileAction = 'save', title = 'Share FieldNote export') {
  if (Capacitor.isNativePlatform()) {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-')
    if (action === 'save') {
      const permissions = await Filesystem.checkPermissions()
      if (permissions.publicStorage === 'prompt' || permissions.publicStorage === 'prompt-with-rationale') await Filesystem.requestPermissions()
    }
    const result = await Filesystem.writeFile({
      path: action === 'save' ? `FieldNote/${safeName}` : `exports/${Date.now()}-${safeName}`,
      data: await blobToBase64(blob),
      directory: action === 'save' ? Directory.Documents : Directory.Cache,
      recursive: true,
    })
    if (action === 'share') await Share.share({ title, text: filename, files: [result.uri], dialogTitle: title })
    return { filename, uri: result.uri, action }
  }

  const file = new File([blob], filename, { type: blob.type })
  if (action === 'share' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, files: [file] })
    return { filename, action }
  }
  browserDownload(blob, filename)
  return { filename, action: 'save' as const }
}
