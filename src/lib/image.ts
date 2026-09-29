const MAX_EDGE = 2000

/** Downscales a camera photo to a JPEG that fits comfortably within Claude's image limits. */
export async function prepareScanImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Foto verwerken mislukt"))), "image/jpeg", 0.85),
  )
  return new File([blob], "scan.jpg", { type: "image/jpeg" })
}
