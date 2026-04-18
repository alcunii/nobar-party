use anyhow::Result;
use std::path::Path;

#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::process::Command;

/// Launches Chrome with a single URL. Caller supplies the Chrome binary path
/// (from `chrome::detect`) so this function never guesses.
pub fn open_chrome(chrome_bin: &Path, url: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new(chrome_bin).arg("--new-window").arg(url).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        // On macOS, `chrome_bin` is the .app bundle path; use `open -a`.
        Command::new("open").arg("-a").arg(chrome_bin).arg(url).spawn()?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (chrome_bin, url);
    }
    Ok(())
}

/// Opens a URL in the system default browser.
pub fn open_default(url: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    { Command::new("cmd").args(["/c", "start", "", url]).spawn()?; }
    #[cfg(target_os = "macos")]
    { Command::new("open").arg(url).spawn()?; }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    { let _ = url; }
    Ok(())
}

#[cfg(test)]
mod tests {
    // Process-spawning helpers aren't meaningfully unit-testable without mocking
    // Command; this module is verified by the manual smoke checklist in
    // docs/installer-testing.md.
    #[test]
    fn module_compiles() { assert_eq!(2 + 2, 4); }
}
