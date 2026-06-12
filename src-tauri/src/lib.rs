/// Write bytes to an absolute path chosen via the native save dialog.
/// Used so "Save .md" / EPUB / PDF actually land on disk in the desktop
/// webview, where the browser `<a download>` trick is a no-op.
#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
  std::fs::write(&path, &contents).map_err(|e| e.to_string())
}

// Text-to-speech via the OS voice — the WebView's Web Speech API silently fails
// in the desktop runtime, so "Read aloud" routes through the native synthesizer.
// We keep a handle to the speaking process so it can be stopped mid-sentence.
static TTS_CHILD: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

fn kill_tts() {
  if let Ok(mut guard) = TTS_CHILD.lock() {
    if let Some(mut child) = guard.take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}

/// Speak `text` aloud using the platform voice (macOS `say`, Windows SAPI via
/// PowerShell, Linux `spd-say`/`espeak`). Replaces any in-progress speech.
#[tauri::command]
fn speak(text: String) -> Result<(), String> {
  use std::io::Write;
  use std::process::{Command, Stdio};
  kill_tts();
  let mut child = if cfg!(target_os = "macos") {
    Command::new("say").stdin(Stdio::piped()).spawn().map_err(|e| e.to_string())?
  } else if cfg!(target_os = "windows") {
    Command::new("powershell")
      .args([
        "-NoProfile",
        "-Command",
        "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak([Console]::In.ReadToEnd())",
      ])
      .stdin(Stdio::piped())
      .spawn()
      .map_err(|e| e.to_string())?
  } else {
    // Linux: spd-say takes the text as an argument; fall back to espeak (stdin).
    match Command::new("spd-say").arg("--").arg(&text).spawn() {
      Ok(c) => c,
      Err(_) => Command::new("espeak").stdin(Stdio::piped()).spawn().map_err(|e| e.to_string())?,
    }
  };
  // Where we opened a stdin pipe, feed the text and close it (EOF) so the reader runs.
  if let Some(mut stdin) = child.stdin.take() {
    let _ = stdin.write_all(text.as_bytes());
  }
  if let Ok(mut guard) = TTS_CHILD.lock() {
    *guard = Some(child);
  }
  Ok(())
}

/// Stop any in-progress "Read aloud" speech.
#[tauri::command]
fn stop_speak() {
  kill_tts();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![write_file, speak, stop_speak])
    // Builds up to 0.1.25 registered a precaching service worker. The webview
    // keeps it in its own profile across app updates, so it serves the original
    // cached shell forever — the dictionary and other lazy chunks then never load
    // until a manual hard-refresh. Desktop builds no longer ship a worker, but
    // that alone can't remove one that's already registered (the stale worker
    // keeps serving the old page, and with no new sw.js the browser's own update
    // check can't tear it down). So tear it down natively as each page starts
    // loading: unregister every worker, wipe its caches, and reload once if we
    // removed anything. This runs in the page even while the stale worker is
    // serving it — the one channel the worker can't block. Once gone, no worker
    // is ever registered again, so later loads find none and skip the reload.
    .on_page_load(|webview, payload| {
      if payload.event() == tauri::webview::PageLoadEvent::Started {
        let _ = webview.eval(
          r#"(function () {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    if (!regs.length) return;
    Promise.all(regs.map(function (r) { return r.unregister(); }))
      .then(function () { return ('caches' in window) ? caches.keys() : []; })
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { location.reload(); });
  });
})();"#,
        );
      }
    })
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
