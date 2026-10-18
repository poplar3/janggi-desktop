//! Мост к движку Fairy-Stockfish: запускает процесс, пересылает команды UCI
//! и отдаёт строки вывода во фронтенд событием `engine-line`.

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(windows)]
const ENGINE_FILE: &str = "fairy-stockfish.exe";
#[cfg(not(windows))]
const ENGINE_FILE: &str = "fairy-stockfish";

#[derive(Default)]
pub struct EngineState(Mutex<Option<EngineProcess>>);

pub struct EngineProcess {
    child: Child,
    stdin: ChildStdin,
}

impl Drop for EngineProcess {
    fn drop(&mut self) {
        let _ = self.stdin.write_all(b"quit\n");
        let _ = self.child.kill();
    }
}

fn engine_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("JANGGI_ENGINE") {
        return Some(PathBuf::from(p));
    }
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("engine").join(ENGINE_FILE));
    }
    // Режим разработки: файл лежит в src-tauri/engine
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("engine").join(ENGINE_FILE));
    candidates.into_iter().find(|p| p.is_file())
}

#[tauri::command]
pub fn engine_start(app: AppHandle, state: State<'_, EngineState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None; // перезапуск, если движок уже работал

    let path = engine_path(&app).ok_or("Файл движка Fairy-Stockfish не найден")?;
    let mut cmd = Command::new(&path);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    if let Some(dir) = path.parent() {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить движок {}: {e}", path.display()))?;
    let stdin = child.stdin.take().ok_or("Нет stdin у движка")?;
    let stdout = child.stdout.take().ok_or("Нет stdout у движка")?;

    let handle = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(l) => {
                    let _ = handle.emit("engine-line", l);
                }
                Err(_) => break,
            }
        }
        let _ = handle.emit("engine-exit", ());
    });

    *guard = Some(EngineProcess { child, stdin });
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn engine_send(state: State<'_, EngineState>, line: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let proc = guard.as_mut().ok_or("Движок не запущен")?;
    proc.stdin
        .write_all(format!("{line}\n").as_bytes())
        .and_then(|_| proc.stdin.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_stop(state: State<'_, EngineState>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
}
