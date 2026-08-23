"use client"

let pdfModulePromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null

async function getPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      return pdfjs
    })
  }
  return pdfModulePromise
}

async function openPdf(file: File) {
  const pdfjs = await getPdfModule()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data: bytes })
  const pdf = await loadingTask.promise
  return { pdf, loadingTask }
}

function pdfErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes("password")) {
    return "PDF นี้มีรหัสผ่าน กรุณาปลดรหัสผ่านก่อนอัปโหลด"
  }
  if (normalized.includes("invalid") || normalized.includes("corrupt")) {
    return "ไฟล์ PDF เสียหายหรือรูปแบบไม่ถูกต้อง"
  }
  return "ไม่สามารถเปิดไฟล์ PDF ในเบราว์เซอร์ได้"
}

export async function getPdfPageCountInBrowser(file: File) {
  let opened: Awaited<ReturnType<typeof openPdf>> | null = null
  try {
    opened = await openPdf(file)
    return opened.pdf.numPages
  } catch (error) {
    throw new Error(pdfErrorMessage(error))
  } finally {
    if (opened) {
      await opened.pdf.cleanup()
      await opened.loadingTask.destroy()
    }
  }
}

export async function renderPdfPageInBrowser(
  file: File,
  pageNumber: number,
  maxDimension = 2000,
) {
  let opened: Awaited<ReturnType<typeof openPdf>> | null = null

  try {
    opened = await openPdf(file)
    const { pdf } = opened

    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`PDF มีทั้งหมด ${pdf.numPages} หน้า`)
    }

    const page = await pdf.getPage(pageNumber)
    const baseViewport = page.getViewport({ scale: 1 })
    const longestSide = Math.max(baseViewport.width, baseViewport.height)
    const scale = Math.max(0.25, Math.min(3, maxDimension / Math.max(1, longestSide)))
    const viewport = page.getViewport({ scale })

    const canvas = window.document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))

    await page.render({
      canvas,
      viewport,
      background: "rgb(255, 255, 255)",
    }).promise

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result: Blob | null) => {
        if (result) resolve(result)
        else reject(new Error("ไม่สามารถแปลงหน้า PDF เป็นรูปภาพได้"))
      }, "image/png")
    })

    const stem = file.name.replace(/\.pdf$/i, "") || "floor-plan"
    return new File([blob], `${stem}-page-${pageNumber}.png`, {
      type: "image/png",
      lastModified: Date.now(),
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PDF มีทั้งหมด")) {
      throw error
    }
    throw new Error(pdfErrorMessage(error))
  } finally {
    if (opened) {
      await opened.pdf.cleanup()
      await opened.loadingTask.destroy()
    }
  }
}
