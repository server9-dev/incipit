/// Write bytes to an absolute path chosen via the native save dialog.
/// Used so "Save .md" / EPUB / PDF actually land on disk in the desktop
/// webview, where the browser `<a download>` trick is a no-op.
#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
  std::fs::write(&path, &contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![write_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(desktop)]
      {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
