mod engine;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(engine::EngineState::default())
        .invoke_handler(tauri::generate_handler![
            engine::engine_start,
            engine::engine_send,
            engine::engine_stop
        ])
        .build(tauri::generate_context!())
        .expect("ошибка при запуске приложения")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                engine::engine_stop(app.state::<engine::EngineState>());
            }
        });
}
