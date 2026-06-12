const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const {
  initDatabase,
  closeDatabase,
  getSetting,
  setSetting,
  deleteSetting,
  getAllSettings,
} = require('./database')

// 端口配置（通过环境变量可覆盖）
const VITE_DEV_PORT = process.env.VITE_DEV_SERVER_PORT || '5173'
const BACKEND_PORT = process.env.PORT || '3001'
const VITE_DEV_URL = `http://localhost:${VITE_DEV_PORT}`
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`

let mainWindow = null
const floatingWindows = new Map()
let backendProcess = null

/**
 * 判断是否为开发模式
 */
function isDev() {
  return !app.isPackaged
}

/**
 * 获取项目根目录（开发模式 = agent-ui 根；打包后 = app.getAppPath()）
 */
function getProjectRoot() {
  if (isDev()) {
    return path.resolve(__dirname, '..')
  }
  return app.getAppPath()
}

/**
 * 启动后端 Agent 服务
 */
function startBackend() {
  const projectRoot = getProjectRoot()

  if (isDev()) {
    // 开发模式：用 tsx 直接运行 TypeScript
    const backendDir = path.join(projectRoot, 'agent-backend')
    console.log('[Main] 开发模式启动后端:', backendDir)
    backendProcess = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: backendDir,
      shell: true,
      stdio: 'pipe',
    })
  } else {
    // 生产模式：用 electron 自带的 Node.js 执行编译后的 JS
    // ELECTRON_RUN_AS_NODE=1 告知 electron 以纯 Node.js 模式运行
    const backendDir = path.join(process.resourcesPath, 'agent-backend')
    console.log('[Main] 生产模式启动后端:', backendDir)
    backendProcess = spawn(process.execPath, [path.join(backendDir, 'dist', 'index.js')], {
      cwd: backendDir,
      stdio: 'pipe',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
  }

  backendProcess.stdout?.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })
  backendProcess.stderr?.on('data', (data) => {
    console.error(`[Backend] ${data.toString().trim()}`)
  })
  backendProcess.on('exit', (code) => {
    console.log(`[Main] 后端进程退出, code=${code}`)
    backendProcess = null
  })
}

/**
 * 关闭后端服务
 */
function stopBackend() {
  if (backendProcess) {
    console.log('[Main] 正在关闭后端...')
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
}

/**
 * 创建主窗口
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Agent UI',
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('main-window:focus')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 加载页面
  if (isDev()) {
    // 开发模式：加载 Vite dev server
    mainWindow.loadURL(VITE_DEV_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的 index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

/**
 * 注册 IPC 处理器
 */
function registerIpcHandlers() {
  ipcMain.handle('settings:get', (_event, key) => {
    return getSetting(key)
  })

  ipcMain.handle('settings:set', (_event, key, value) => {
    setSetting(key, value)
  })

  ipcMain.handle('settings:delete', (_event, key) => {
    return deleteSetting(key)
  })

  ipcMain.handle('settings:getAll', () => {
    return getAllSettings()
  })

  // 打开浮动窗口
  ipcMain.handle('floating:open', (_event, specName) => {
    const existing = floatingWindows.get(specName)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return
    }

    const url = isDev()
      ? `${VITE_DEV_URL}?floating=${encodeURIComponent(specName)}`
      : `file://${path.join(__dirname, '../dist/index.html')}?floating=${encodeURIComponent(specName)}`

    const win = new BrowserWindow({
      width: 420,
      height: 360,
      minWidth: 260,
      minHeight: 200,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: true,
      alwaysOnTop: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      title: specName,
    })

    win.loadURL(url)

    win.on('closed', () => {
      floatingWindows.delete(specName)
      mainWindow?.webContents.send('floating:closed', specName)
    })

    floatingWindows.set(specName, win)
  })

  // 浮动窗口 → 关闭自身
  ipcMain.on('floating:close-self', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // 退出应用
  ipcMain.on('app:quit', async () => {
    try {
      await fetch(`${BACKEND_URL}/api/shutdown`, { method: 'POST' })
    } catch {}
    app.quit()
  })

  // 窗口控制
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize-toggle', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:move-by', (_event, deltaX, deltaY) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win) {
      const [x, y] = win.getPosition()
      win.setPosition(x + deltaX, y + deltaY)
    }
  })

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow?.isMaximized() ?? false
  })
}

// ========== 应用生命周期 ==========

app.whenReady().then(async () => {
  await initDatabase()
  startBackend()
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
  stopBackend()
})
