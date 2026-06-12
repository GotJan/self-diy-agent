interface ElectronAPI {
  getSetting: (key: string) => Promise<string | undefined>
  setSetting: (key: string, value: string) => Promise<void>
  deleteSetting: (key: string) => Promise<boolean>
  getAllSettings: () => Promise<Record<string, string>>
  getPlatform: () => string
  openFloatingSpec: (specName: string) => Promise<void>
  closeFloatingSelf: () => void
  onFloatingClosed: (callback: (specName: string) => void) => () => void
  quitApp: () => void
  minimizeWindow: () => void
  toggleMaximize: () => void
  isMaximized: () => Promise<boolean>
  moveWindowBy: (deltaX: number, deltaY: number) => void
  onMainWindowFocus: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
