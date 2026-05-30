const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("licenseGenerator", {
  selectRequest: () => ipcRenderer.invoke("license-generator:select-request"),
  selectPrivateKey: () => ipcRenderer.invoke("license-generator:select-private-key"),
  selectOutputDir: () => ipcRenderer.invoke("license-generator:select-output-dir"),
  generateLicense: (input) => ipcRenderer.invoke("license-generator:generate-license", input),
  showLicenseInFolder: (filePath) =>
    ipcRenderer.invoke("license-generator:show-license-in-folder", filePath),
});
