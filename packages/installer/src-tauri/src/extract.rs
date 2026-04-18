use anyhow::{anyhow, Result};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Unpacks a zip archive into `dest`. If `dest` exists, it is removed first
/// so a reinstall starts clean. Returns the final `dest` path on success.
pub fn unzip_to(zip_path: &Path, dest: &Path) -> Result<PathBuf> {
    if dest.exists() {
        fs::remove_dir_all(dest)?;
    }
    fs::create_dir_all(dest)?;

    let file = fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let rel = entry
            .enclosed_name()
            .ok_or_else(|| anyhow!("zip entry has unsafe path"))?
            .to_owned();
        let target = dest.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut out = fs::File::create(&target)?;
            io::copy(&mut entry, &mut out)?;
        }
    }
    Ok(dest.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_zip(path: &Path) -> Result<()> {
        let file = fs::File::create(path)?;
        let mut zip = zip::ZipWriter::new(file);
        let opts: zip::write::FileOptions = zip::write::FileOptions::default();
        zip.start_file("manifest.json", opts)?;
        zip.write_all(b"{\"manifest_version\":3}")?;
        zip.start_file("icons/icon.png", opts)?;
        zip.write_all(b"imgbytes")?;
        zip.finish()?;
        Ok(())
    }

    #[test]
    fn extracts_entries_into_dest() -> Result<()> {
        let tmp = tempdir::TempDir::new("nobar")?;
        let zip_path = tmp.path().join("ext.zip");
        let dest = tmp.path().join("out");
        make_zip(&zip_path)?;

        unzip_to(&zip_path, &dest)?;

        assert!(dest.join("manifest.json").exists());
        assert!(dest.join("icons/icon.png").exists());
        Ok(())
    }

    #[test]
    fn rewrites_dest_when_already_populated() -> Result<()> {
        let tmp = tempdir::TempDir::new("nobar")?;
        let zip_path = tmp.path().join("ext.zip");
        let dest = tmp.path().join("out");
        fs::create_dir_all(&dest)?;
        fs::write(dest.join("old.txt"), b"old")?;
        make_zip(&zip_path)?;

        unzip_to(&zip_path, &dest)?;

        assert!(!dest.join("old.txt").exists());
        assert!(dest.join("manifest.json").exists());
        Ok(())
    }
}
