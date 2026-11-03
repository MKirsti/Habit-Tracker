// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStoragePersisted, requestPersistentStorage } from './persistentStorage'

/** Setzt `navigator.storage` für einen Test (jsdom kennt die StorageManager-API nicht). */
function mockStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage })
}

afterEach(() => {
  // Zurück zum jsdom-Standard: kein navigator.storage.
  delete (navigator as { storage?: StorageManager }).storage
})

describe('requestPersistentStorage', () => {
  it('ist ohne StorageManager-API (z. B. jsdom, alte Browser) ein No-op', async () => {
    expect('storage' in navigator).toBe(false)
    await expect(requestPersistentStorage()).resolves.toBeUndefined()
    await expect(isStoragePersisted()).resolves.toBeUndefined()
  })

  it('bittet um dauerhaften Speicher, wenn er noch nicht geschützt ist', async () => {
    const persist = vi.fn(async () => true)
    mockStorage({ persisted: vi.fn(async () => false), persist })
    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('meldet false, wenn der Browser die Bitte ablehnt', async () => {
    mockStorage({ persisted: vi.fn(async () => false), persist: vi.fn(async () => false) })
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })

  it('fragt nicht erneut, wenn der Speicher schon dauerhaft ist', async () => {
    const persist = vi.fn(async () => true)
    mockStorage({ persisted: vi.fn(async () => true), persist })
    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('wirft nie – auch nicht, wenn die API fehlschlägt', async () => {
    mockStorage({
      persisted: vi.fn(async () => false),
      persist: vi.fn(async () => {
        throw new DOMException('denied', 'SecurityError')
      }),
    })
    await expect(requestPersistentStorage()).resolves.toBeUndefined()

    mockStorage({
      persisted: vi.fn(async () => {
        throw new Error('kaputt')
      }),
    })
    await expect(requestPersistentStorage()).resolves.toBeUndefined()
    await expect(isStoragePersisted()).resolves.toBeUndefined()
  })

  it('lässt die Statusabfrage eine laufende Bitte abwarten', async () => {
    let granted = false
    let grant: (value: boolean) => void = () => {}
    mockStorage({
      persisted: vi.fn(async () => granted),
      persist: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            grant = (value) => {
              granted = value
              resolve(value)
            }
          }),
      ),
    })
    const request = requestPersistentStorage()
    const status = isStoragePersisted()
    await vi.waitFor(() => expect(navigator.storage.persist).toHaveBeenCalled())
    grant(true)
    await expect(request).resolves.toBe(true)
    await expect(status).resolves.toBe(true)
  })

  it('kommt mit einem StorageManager ohne persist() aus', async () => {
    mockStorage({ persisted: vi.fn(async () => false) })
    await expect(requestPersistentStorage()).resolves.toBeUndefined()
    await expect(isStoragePersisted()).resolves.toBe(false)
  })
})
