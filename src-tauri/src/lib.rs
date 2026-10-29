#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  use std::{path::PathBuf, sync::Mutex};
  use tauri::{Emitter, Manager};

  #[derive(Default)]
  struct OpenedCanvasFiles(Mutex<Vec<String>>);

  #[tauri::command]
  fn take_opened_canvas_files(state: tauri::State<'_, OpenedCanvasFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
  }

  fn queue_opened_files(app: &tauri::AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let contents = paths
      .into_iter()
      .filter(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("vcraft") || ext.eq_ignore_ascii_case("vcf")))
      .filter_map(|path| match std::fs::read_to_string(&path) {
        Ok(contents) => Some(contents),
        Err(error) => {
          eprintln!("Could not open {}: {error}", path.display());
          None
        }
      })
      .collect::<Vec<_>>();

    if contents.is_empty() {
      return;
    }

    app.state::<OpenedCanvasFiles>().0.lock().unwrap().extend(contents);
    let _ = app.emit("vcraft-opened", ());
  }

  tauri::Builder::default()
    .manage(OpenedCanvasFiles::default())
    .plugin(tauri_plugin_sql::Builder::default().build())
    .invoke_handler(tauri::generate_handler![take_opened_canvas_files])
    .setup(|_app| {
      #[cfg(any(target_os = "windows", target_os = "linux"))]
      queue_opened_files(_app.handle(), std::env::args_os().skip(1).map(PathBuf::from));
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building Voidcraft")
    .run(|app, event| {
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Opened { urls } = event {
        let paths = urls.into_iter().filter_map(|url| url.to_file_path().ok());
        queue_opened_files(app, paths);
      }

      #[cfg(not(target_os = "macos"))]
      let _ = (app, event);
    });
}

