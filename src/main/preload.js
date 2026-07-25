'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function on(channel, handler) {
  const wrapped = (_e, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('sparky', {
  ui: {
    setIgnoreMouse: (v) => ipcRenderer.send('ui:setIgnoreMouse', v),
    setExpanded: (v) => ipcRenderer.send('ui:setExpanded', v),
    dragStart: () => ipcRenderer.send('ui:dragStart'),
    dragEnd: () => ipcRenderer.send('ui:dragEnd'),
    hide: () => ipcRenderer.send('ui:hide'),
    quit: () => ipcRenderer.send('ui:quit'),
    openPanel: (tab) => ipcRenderer.send('ui:openPanel', tab),
    orbMenu: () => ipcRenderer.send('ui:orbMenu'),
    panelWindow: (action) => ipcRenderer.send('panel:window', action)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    patch: (partial) => ipcRenderer.invoke('settings:patch', partial),
    reset: () => ipcRenderer.invoke('settings:reset')
  },

  providers: {
    catalog: () => ipcRenderer.invoke('providers:catalog'),
    models: (id) => ipcRenderer.invoke('providers:models', id),
    probe: () => ipcRenderer.invoke('providers:probe'),
    test: (id) => ipcRenderer.invoke('providers:test', id)
  },

  secrets: {
    status: () => ipcRenderer.invoke('secrets:status'),
    set: (provider, value) => ipcRenderer.invoke('secrets:set', { provider, value })
  },

  gen: {
    start: (payload) => ipcRenderer.invoke('gen:start', payload),
    abort: () => ipcRenderer.send('gen:abort')
  },

  meta: {
    styles: () => ipcRenderer.invoke('meta:styles'),
    languages: () => ipcRenderer.invoke('meta:languages'),
    app: () => ipcRenderer.invoke('meta:app')
  },

  clipboard: {
    write: (text) => ipcRenderer.invoke('clipboard:write', text),
    read: () => ipcRenderer.invoke('clipboard:read')
  },

  history: {
    list: () => ipcRenderer.invoke('history:list'),
    update: (id, patch) => ipcRenderer.invoke('history:update', { id, patch }),
    remove: (id) => ipcRenderer.invoke('history:remove', id),
    clear: () => ipcRenderer.invoke('history:clear'),
    reuse: (id) => ipcRenderer.invoke('history:reuse', id),
    export: (format) => ipcRenderer.invoke('history:export', format)
  },

  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    getActive: () => ipcRenderer.invoke('projects:getActive'),
    setActive: (id) => ipcRenderer.invoke('projects:setActive', id),
    create: (payload) => ipcRenderer.invoke('projects:create', payload),
    update: (id, partial) => ipcRenderer.invoke('projects:update', { id, partial }),
    remove: (id) => ipcRenderer.invoke('projects:remove', id),
    addText: (projectId, item) => ipcRenderer.invoke('projects:addText', { projectId, item }),
    updateText: (projectId, textId, partial) => ipcRenderer.invoke('projects:updateText', { projectId, textId, partial }),
    removeText: (projectId, textId) => ipcRenderer.invoke('projects:removeText', { projectId, textId }),
    addImage: (projectId, item) => ipcRenderer.invoke('projects:addImage', { projectId, item }),
    removeImage: (projectId, imageId) => ipcRenderer.invoke('projects:removeImage', { projectId, imageId })
  },

  shell: {
    openUserData: () => ipcRenderer.invoke('shell:openUserData')
  },

  on: {
    status: (cb) => on('gen:status', cb),
    stage: (cb) => on('gen:stage', cb),
    token: (cb) => on('gen:token', cb),
    done: (cb) => on('gen:done', cb),
    playSound: (cb) => on('gen:playSound', cb),
    error: (cb) => on('gen:error', cb),
    questions: (cb) => on('gen:questions', cb),
    suggestions: (cb) => on('gen:suggestions', cb),
    busy: (cb) => on('gen:busy', cb),
    expanded: (cb) => on('ui:expanded', cb),
    focusInput: (cb) => on('ui:focusInput', cb),
    fillInput: (cb) => on('ui:fillInput', cb),
    loadEntry: (cb) => on('ui:loadEntry', cb),
    settingsChanged: (cb) => on('settings:changed', cb),
    secretsChanged: (cb) => on('secrets:changed', cb),
    historyChanged: (cb) => on('history:changed', cb),
    projectsChanged: (cb) => on('projects:changed', cb),
    panelTab: (cb) => on('panel:tab', cb)
  }
});
