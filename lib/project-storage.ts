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
const STORE_NAME = "projects"
const ACTIVE_PROJECT_KEY = "active"
// Keep saves and clears in invocation order, even while opening the database.
let writes: Promise<void> = Promise.resolve()

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Unable to open project storage"))
    request.onblocked = () => reject(new Error("Project storage is blocked by another tab"))
  })
}

function writeProject(project: StoredProject | null): Promise<void> {
  const operation = writes.catch(() => undefined).then(async () => {
    const database = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        if (project) store.put(project, ACTIVE_PROJECT_KEY)
        else store.delete(ACTIVE_PROJECT_KEY)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save project"))
        transaction.onabort = () => reject(transaction.error ?? new Error("Project save was aborted"))
      })
    } finally { database.close() }
  })
  writes = operation
  return operation
}

export function saveActiveProject(project: StoredProject): Promise<void> {
  return writeProject(project)
}

export async function loadActiveProject(): Promise<StoredProject | null> {
  await writes.catch(() => undefined)
  const database = await openDatabase()
  try {
    return await new Promise<StoredProject | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(ACTIVE_PROJECT_KEY)
      request.onsuccess = () => resolve((request.result as StoredProject | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error("Unable to load project"))
    })
  } finally { database.close() }
}

export function clearActiveProject(): Promise<void> {
  return writeProject(null)
}
