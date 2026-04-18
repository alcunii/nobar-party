#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;
use nobar_installer::{chrome, extract, launch, install_config};
use install_config::{InstallConfig, install_root};
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;

const INSTALLER_VERSION: &str = env!("CARGO_PKG_VERSION");

#[tauri::command]
fn detect_chrome() -> Option<String> {
    let cands = chrome::candidate_paths();
    chrome::detect(|p| p.exists(), &cands).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn extract_extension(handle: tauri::AppHandle) -> Result<String, String> {
    let zip_path = handle
        .path()
        .resolve("resources/extension.zip", tauri::path::BaseDirectory::Resource)
        .map_err(err)?;
    let root = install_root().ok_or_else(|| "unsupported OS".to_string())?;
    let dest = root.join("extension");

    extract::unzip_to(&zip_path, &dest).map_err(err)?;
    install_config::write(
        &root.join("config.json"),
        &InstallConfig {
            extension_path: dest.clone(),
            installer_version: INSTALLER_VERSION.to_string(),
        },
    ).map_err(err)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_chrome_extensions(chrome_bin: String) -> Result<(), String> {
    launch::open_chrome(Path::new(&chrome_bin), "chrome://extensions").map_err(err)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    launch::open_default(&url).map_err(err)
}

#[tauri::command]
fn copy_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

fn err<E: std::fmt::Display>(e: E) -> String { e.to_string() }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            detect_chrome,
            extract_extension,
            open_chrome_extensions,
            open_url,
            copy_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
