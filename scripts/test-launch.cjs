const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  console.log("App ready event fired.");
  console.log("User data path:", app.getPath("userData"));
  console.log("Creating test window...");
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
  });
  win.loadURL("http://localhost:5173/");
  console.log("Window created and loaded URL.");
});
