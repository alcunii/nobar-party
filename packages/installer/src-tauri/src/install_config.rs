use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstallConfig {
    pub extension_path: PathBuf,
    pub installer_version: String,
}

pub fn write(path: &Path, cfg: &InstallConfig) -> Result<()> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent)?; }
    fs::write(path, serde_json::to_string_pretty(cfg)?)?;
    Ok(())
}

pub fn read(path: &Path) -> Result<Option<InstallConfig>> {
    if !path.exists() { return Ok(None); }
    let raw = fs::read_to_string(path)?;
    let cfg: InstallConfig = serde_json::from_str(&raw)?;
    Ok(Some(cfg))
}

/// Returns the platform-specific installation root, e.g.
/// `%APPDATA%\NobarParty` on Windows or `~/Library/Application Support/NobarParty` on macOS.
pub fn install_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    { std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("NobarParty")) }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| {
            PathBuf::from(h).join("Library/Application Support/NobarParty")
        })
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() -> Result<()> {
        let tmp = tempdir::TempDir::new("nobar")?;
        let file = tmp.path().join("config.json");
        let cfg = InstallConfig {
            extension_path: PathBuf::from("/x/extension"),
            installer_version: "1.2.3".into(),
        };
        write(&file, &cfg)?;
        let got = read(&file)?.expect("config present");
        assert_eq!(got, cfg);
        Ok(())
    }

    #[test]
    fn read_absent_returns_none() -> Result<()> {
        let tmp = tempdir::TempDir::new("nobar")?;
        let got = read(&tmp.path().join("missing.json"))?;
        assert!(got.is_none());
        Ok(())
    }
}
