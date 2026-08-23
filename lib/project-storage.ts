export type StoredProject = {
  fileName: string
  fileType: string
  previewDataUrl: string
  imageSize: { width: number; height: number } | null
  detections: unknown[]
  metersPerPixel: number | null
  floorMaterialId?: string
  updatedAt: number
}

const DB_NAME = "sketch2spec"
const DB_VERSION = 1
const STORE_NAME = "projects"
const ACTIVE_PROJECT_KEY = "active"

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Unable to open project storage"))
  })
}

export async function saveActiveProject(project: StoredProject): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put(project, ACTIVE_PROJECT_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save project"))
    transaction.onabort = () => reject(transaction.error ?? new Error("Project save was aborted"))
  })
  database.close()
}

export async function loadActiveProject(): Promise<StoredProject | null> {
  const database = await openDatabase()
  const result = await new Promise<StoredProject | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).get(ACTIVE_PROJECT_KEY)
    request.onsuccess = () => resolve((request.result as StoredProject | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error("Unable to load project"))
  })
  database.close()
  return result
}

export async function clearActiveProject(): Promise<void> {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).delete(ACTIVE_PROJECT_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear project"))
  })
  database.close()
}
