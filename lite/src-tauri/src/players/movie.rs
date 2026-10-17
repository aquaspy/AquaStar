use std::path::PathBuf;

pub(super) struct Movie {
    source: MovieSource,
}

enum MovieSource {
    File(PathBuf),
    Https(String),
}

impl Movie {
    pub(super) fn file(path: PathBuf) -> Self {
        Self {
            source: MovieSource::File(path),
        }
    }

    pub(super) fn https(url: impl Into<String>) -> Self {
        Self {
            source: MovieSource::Https(url.into()),
        }
    }

    pub(super) fn player_arg(&self) -> String {
        match &self.source {
            MovieSource::File(path) => path.display().to_string(),
            MovieSource::Https(url) => url.clone(),
        }
    }
}
