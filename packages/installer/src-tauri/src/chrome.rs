use std::path::{Path, PathBuf};

/// Candidate filesystem paths where Chrome may live on the current OS.
pub fn candidate_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(pf) = std::env::var("PROGRAMFILES") {
            out.push(PathBuf::from(pf).join("Google/Chrome/Application/chrome.exe"));
        }
        if let Ok(pf) = std::env::var("PROGRAMFILES(X86)") {
            out.push(PathBuf::from(pf).join("Google/Chrome/Application/chrome.exe"));
        }
        if let Ok(laa) = std::env::var("LOCALAPPDATA") {
            out.push(PathBuf::from(laa).join("Google/Chrome/Application/chrome.exe"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        out.push(PathBuf::from("/Applications/Google Chrome.app"));
        if let Ok(home) = std::env::var("HOME") {
            out.push(PathBuf::from(home).join("Applications/Google Chrome.app"));
        }
    }
    out
}

/// Returns the first candidate that exists on disk, or None.
pub fn detect<F: Fn(&Path) -> bool>(exists: F, candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| exists(p)).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_returns_first_existing() {
        let a = PathBuf::from("/tmp/nonexistent-chrome-a");
        let b = PathBuf::from("/tmp/nonexistent-chrome-b");
        let c = PathBuf::from("/tmp/exists");
        let got = detect(|p| p == c.as_path(), &[a, b, c.clone()]);
        assert_eq!(got, Some(c));
    }

    #[test]
    fn detect_returns_none_when_nothing_exists() {
        let got = detect(|_| false, &[PathBuf::from("/x")]);
        assert_eq!(got, None);
    }

    #[test]
    fn candidate_paths_is_nonempty_on_supported_os() {
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        assert!(!candidate_paths().is_empty());
    }
}
