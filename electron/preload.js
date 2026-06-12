const { contextBridge, ipcRenderer } = require('electron')

/**
 * preload 脚本
 * 通过 contextBridge 暴露安全的 API 给渲染进程
 * 渲染进程通过 window.electronAPI 访问这些方法
 */

const electronAPI = {
  // 设置相关 - 通过 IPC 调用主进程的数据库操作
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  deleteSetting: (key) => ipcRenderer.invoke('settings:delete', key),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // 平台信息
  getPlatform: () => process.platform,

  // 浮动窗口
  openFloatingSpec: (specName) => ipcRenderer.invoke('floating:open', specName),
  closeFloatingSelf: () => ipcRenderer.send('floating:close-self'),
  quitApp: () => ipcRenderer.send('app:quit'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:maximize-toggle'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  moveWindowBy: (dx, dy) => ipcRenderer.send('window:move-by', dx, dy),
  onFloatingClosed: (callback) => {
    const handler = (_event, specName) => callback(specName)
    ipcRenderer.on('floating:closed', handler)
    return () => {
      ipcRenderer.removeListener('floating:closed', handler)
    }
  },

  // 事件监听
  onMainWindowFocus: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('main-window:focus', handler)
    return () => {
      ipcRenderer.removeListener('main-window:focus', handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
